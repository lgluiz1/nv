from celery import shared_task
import requests
import json
import logging
from django.db import transaction
from django.utils import timezone
from django.conf import settings
from usuarios.models import Motorista
from manifesto.models import Manifesto, NotaFiscal, ManifestoBuscaLog , BaixaNF
from operacional.tasks import enviar_email_erro_tms_task

import time # Necessário para respeitar os 2 segundos


logger = logging.getLogger(__name__)
# Configurações centralizadas
MAPA_JSON = {
    'CPF_MOTORISTA_TMS': 'mft_mft_driver_document_number',
    # Adicione outros mapeamentos conforme necessário
}

def validar_motorista_request(numero_manifesto):
    """Retorna o CPF do motorista vinculado ao manifesto no Endpoint 1"""
    TOKEN = "zyUq31Mq6gMcYGzV4zL7HTsdnS7pULjaQoxGbkPZ1cLDoxT3d-Xukw"
    URL = f"https://quickdelivery.eslcloud.com.br/api/analytics/reports/2972/data"
    payload = {
        "search": {
            "manifests": {
                "sequence_code": int(numero_manifesto),
                "service_date": "2024-01-01 - 2050-12-31"
            }
        },
        "page": "1", "per": "50"
    }
    response = requests.get(URL, headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}, data=json.dumps(payload), timeout=20)
    response.raise_for_status()
    dados = response.json()
    if dados and len(dados) > 0:
        # Pega o documento do primeiro item da lista
        return str(dados[0].get('mft_mdr_iil_document', '')).strip()
    return None

def capturar_notas_unicas(manifesto_id):
    """Percorre a paginação da ESL e filtra as chaves únicas de NF-e"""
    TOKEN = "jziCXNF8xTasaEGJGxysrTFXtDRUmdobh9HCGHiwmEzaENWLiaddLA"
    url = f"https://quickdelivery.eslcloud.com.br/api/invoice_occurrences"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    
    notas_unicas = {}
    next_id = None

    while True:
        params = {"manifest_id": manifesto_id, "per": 50}
        if next_id:
            params["after_id"] = next_id

        try:
            response = requests.get(url, headers=headers, params=params, timeout=30)
            response.raise_for_status()
            data_json = response.json()
            
            records = data_json.get('data', [])
            if not records:
                break

            for item in records:
                invoice = item.get('invoice', {})
                chave = invoice.get('key')
                if chave:
                    # Armazena apenas uma entrada por chave de acesso
                    notas_unicas[chave] = {
                        'numero': invoice.get('number'),
                        'chave': chave
                    }

            # Lógica de Paginação baseada no seu JSON
            paging = data_json.get('paging', {})
            next_id = paging.get('next_id')
            
            if not next_id or next_id >= paging.get('last_id', 0):
                # Se não houver next_id ou se já chegamos no last_id, encerra o loop
                break
                
            time.sleep(2) # Respeita o limite da API da transportadora

        except Exception as e:
            logger.error(f"Erro ao paginar notas: {e}")
            break

    return list(notas_unicas.values())

def enriquecer_dados_api(chave_nfe, numero_nfe):
    """Busca detalhes (Nome, Endereço) de uma nota específica"""
    TOKEN = "zyUq31Mq6gMcYGzV4zL7HTsdnS7pULjaQoxGbkPZ1cLDoxT3d-Xukw"
    URL = f"https://quickdelivery.eslcloud.com.br/api/analytics/reports/9873/data"
    
    payload = {
        "search": {
            "invoices": {
                "number": int(numero_nfe),
                "issue_date": "2024-01-01 - 2050-12-31" 
            }
        },
        "page": "1", "per": "100"
    }
    
    try:
        response = requests.get(URL, headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}, data=json.dumps(payload), timeout=30)
        if response.status_code == 200:
            dados = response.json()
            for nf in dados:
                if nf.get('key') == chave_nfe:
                    return nf
    except Exception as e:
        logger.error(f"Erro na API de enriquecimento para nota {numero_nfe}: {e}")
    return None

# =====================================================
# TASK MUDA STATUS MANIFESTO PARA EM TRANSPORTE NO TMS
# =====================================================
@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def iniciar_transporte_manifesto_tms_task(self, numero_manifesto):
    TOKEN = "jziCXNF8xTasaEGJGxysrTFXtDRUmdobh9HCGHiwmEzaENWLiaddLA"
    URL = "https://quickdelivery.eslcloud.com.br/graphql"

    HEADERS = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {TOKEN}"
    }

    """
    - Busca manifesto no banco local
    - Calcula km inicial pelo último manifesto finalizado
    - Inicia transporte no TMS
    - Atualiza manifesto local
    """

    try:
        # -----------------------------------
        # 1️⃣ Buscar manifesto local
        # -----------------------------------
        manifesto = Manifesto.objects.select_related("motorista").get(
            numero_manifesto=numero_manifesto
        )

        if not manifesto.motorista:
            raise Exception("Manifesto sem motorista vinculado")

        # -----------------------------------
        # 2️⃣ Buscar último manifesto FINALIZADO
        # -----------------------------------
        ultimo_manifesto = (
            Manifesto.objects
            .filter(
                motorista=manifesto.motorista,
                status="FINALIZADO",
                km_final__isnull=False
            )
            .order_by("-data_finalizacao")
            .first()
        )

        if not ultimo_manifesto:
            raise Exception("Motorista não possui manifesto finalizado anterior")

        km_inicial = ultimo_manifesto.km_final

        # -----------------------------------
        # 3️⃣ Chamar TMS
        # -----------------------------------
        payload = {
            "query": """
            mutation ($id: ID!, $params: ManifestStartTransportInput!) {
              manifestStartTransport(id: $id, params: $params) {
                success
                errors
              }
            }
            """,
            "variables": {
                "id": manifesto.numero_manifesto,  # ID do TMS
                "params": {
                    "km": float(km_inicial)
                }
            }
        }

        response = requests.post(URL, headers=HEADERS, json=payload, timeout=30)
        response.raise_for_status()

        result = response.json()["data"]["manifestStartTransport"]

        if not result["success"]:
            raise Exception(result["errors"])

        # -----------------------------------
        # 4️⃣ Atualizar manifesto local
        # -----------------------------------
        with transaction.atomic():
            manifesto.km_inicial = km_inicial
            manifesto.status = "EM_TRANSPORTE"
            manifesto.save(update_fields=["km_inicial", "status"])

        return {
            "success": True,
            "numero_manifesto": manifesto.numero_manifesto,
            "km_inicial": km_inicial
        }

    except Exception as exc:
        raise self.retry(exc=exc)

# =====================================================
# TASK PRINCIPAL DO CELERY
# =====================================================

@shared_task(bind=True, max_retries=3)
def buscar_manifesto_completo_task(self, log_id):
    from manifesto.models import Manifesto, NotaFiscal, ManifestoBuscaLog # Certifique-se de importar Filial
    from usuarios.models import Filial
    import requests
    import json
    import time

    try:
        log = ManifestoBuscaLog.objects.select_related('motorista').get(id=log_id)
        numero_visual = log.numero_manifesto
        motorista = log.motorista
        token_geral = "zyUq31Mq6gMcYGzV4zL7HTsdnS7pULjaQoxGbkPZ1cLDoxT3d-Xukw"
        headers_geral = {"Content-Type": "application/json", "Authorization": f"Bearer {token_geral}"}

        # --- ETAPA 1: VALIDAR MOTORISTA E PEGAR ID INTERNO ---
        url_valida = "https://quickdelivery.eslcloud.com.br/api/analytics/reports/2972/data"
        payload_busca = {
            "search": {
                "manifests": {
                    "sequence_code": int(numero_visual),
                    "service_date": "2024-01-01 - 2050-12-31"
                }
            },
            "page": "1", "per": "10"
        }
        
        res_valida = requests.get(url_valida, headers=headers_geral, data=json.dumps(payload_busca), timeout=30)
        dados_mft = res_valida.json()
        
        if not dados_mft:
            log.status, log.mensagem_erro = 'ERRO', "Manifesto não encontrado."
            log.save(); return

        # Dados do primeiro registro retornado
        info_tms = dados_mft[0]

        # Validação de CPF
        cpf_tms = str(info_tms.get('mft_mdr_iil_document', '')).strip()
        if cpf_tms != str(motorista.cpf).replace('.','').replace('-',''):
            log.status, log.mensagem_erro = 'ERRO', "Manifesto não pertence ao seu CPF."
            log.save(); return

        # --- NOVO: LÓGICA DE FILIAL ---
        nome_filial_tms = info_tms.get('mft_crn_psn_nickname', 'MATRIZ').strip().upper()
        
        # Busca a filial pelo nome, se não existir, cria
        filial_obj, created = Filial.objects.get_or_create(
            nome=nome_filial_tms
        )
        if created:
            logger.info(f"🏢 Nova Filial cadastrada: {nome_filial_tms}")

        # Criar/Recuperar Manifesto Local (Incluindo a Filial)
        manifesto_obj, _ = Manifesto.objects.update_or_create(
            numero_manifesto=numero_visual,
            defaults={
                'motorista': motorista, 
                'filial': filial_obj, # Vinculando a Filial aqui
                'status': 'EM_TRANSPORTE'
            }
        )
        
        id_interno_esl = info_tms.get('id') or numero_visual
        log.status = 'ENRIQUECENDO'
        log.save()

        # --- ETAPA 2: CAPTURAR LISTA DE NOTAS ---
        # (Mantém sua lógica de notas...)
        token_notas = "jziCXNF8xTasaEGJGxysrTFXtDRUmdobh9HCGHiwmEzaENWLiaddLA"
        url_notas = "https://quickdelivery.eslcloud.com.br/api/invoice_occurrences"
        
        params_notas = {"manifest_id": str(id_interno_esl), "per": 20}
        start_cursor = None
        notas_unicas_dict = {}

        while True:
            if start_cursor:
                params_notas["start"] = start_cursor
            else:
                params_notas.pop("start", None)

            res_n = requests.get(url_notas, headers={"Authorization": f"Bearer {token_notas}"}, params=params_notas, timeout=30)
            if res_n.status_code != 200: break

            data_n = res_n.json()
            registros = data_n.get("data", [])
            paging = data_n.get("paging", {})

            for item in registros:
                invoice = item.get("invoice")
                if invoice and invoice.get("key"):
                    notas_unicas_dict[invoice["key"]] = invoice["number"]

            if paging.get("next_id") is None: break
            start_cursor = paging["next_id"]
            time.sleep(2.3)

        # --- ETAPA 3: ENRIQUECIMENTO NOTA A NOTA ---
        # (Mantém sua lógica de enriquecimento...)
        total_processadas = 0
        for chave, numero in notas_unicas_dict.items():
            try:
                time.sleep(2.1)
                detalhes = buscar_detalhes_esl_interno(chave, numero, token_geral)
                
                destinatario = "DADOS NÃO REPASSADOS PELA ESL"
                endereco = "CONSULTE O DOCUMENTO FÍSICO"
                
                if detalhes:
                    nome_det = detalhes.get('ioe_rpt_name')
                    if nome_det: destinatario = str(nome_det).upper()
                    
                    rua = detalhes.get('ioe_rpt_mds_line_1', '')
                    num = detalhes.get('ioe_rpt_mds_number', '')
                    if rua:
                        endereco = f"{rua} {num}".strip().upper()

                with transaction.atomic():
                    nota_no_manifesto = NotaFiscal.objects.filter(
                        manifesto=manifesto_obj, 
                        chave_acesso=chave
                    ).first()
                    
                    status_final = nota_no_manifesto.status if nota_no_manifesto else 'PENDENTE'

                    NotaFiscal.objects.update_or_create(
                        manifesto=manifesto_obj,
                        chave_acesso=chave,
                        defaults={
                            'numero_nota': str(numero),
                            'destinatario': destinatario,
                            'endereco_entrega': endereco,
                            'status': status_final
                        }
                    )
                
                total_processadas += 1
            except Exception as e:
                logger.warning(f"⚠️ Erro nota {numero}: {e}")
                continue

        log.status = 'PROCESSADO'
        log.save()
        return f"Manifesto {numero_visual} finalizado com {total_processadas} notas na filial {nome_filial_tms}."

    except Exception as e:
        logger.error(f"🔴 Erro crítico: {str(e)}")
        log.status, log.mensagem_erro = 'ERRO', str(e)
        log.save()
        raise self.retry(exc=e, countdown=60)
    
def buscar_detalhes_esl_interno(chave, numero, token):
    """Auxiliar para buscar endereço no Endpoint 3"""
    url = "https://quickdelivery.eslcloud.com.br/api/analytics/reports/9873/data"
    payload = {
        "search": {
            "invoices": {
                "issue_date": "2024-01-01 - 2050-12-31",
                "number": int(numero)
            }
        }
    }
    try:
        r = requests.get(url, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, data=json.dumps(payload), timeout=30)
        if r.status_code == 200:
            for nf in r.json():
                if nf.get('key') == chave: return nf
    except: pass
    return None




from celery import shared_task

@shared_task(bind=True, max_retries=2)
def enviar_baixa_esl_task(self, baixa_id):
    """
    Task ESL com retry controlado:
    - Máx 3 tentativas (1 + 2 retries)
    - Intervalo fixo de 1 minuto
    - E-mail de erro SOMENTE na falha final
    """

    from .models import BaixaNF
    from django.utils import timezone
    from datetime import timezone as dt_timezone
    import requests

    TOKEN = "jziCXNF8xTasaEGJGxysrTFXtDRUmdobh9HCGHiwmEzaENWLiaddLA"
    URL_ESL = "https://quickdelivery.eslcloud.com.br/api/invoice_occurrences"

    try:
        baixa = BaixaNF.objects.select_related(
            'nota_fiscal',
            'ocorrencia',
            'nota_fiscal__manifesto__motorista'
        ).get(id=baixa_id)

        nf = baixa.nota_fiscal
        motorista = nf.manifesto.motorista.nome_completo
        url_foto = baixa.comprovante_foto_url or ""
        codigo_ocorrencia = int(baixa.ocorrencia.codigo_tms) if baixa.ocorrencia else 1

        # Data exatamente como registrada (UTC)
        data_utc = baixa.data_baixa.astimezone(dt_timezone.utc)
        data_ocorrencia_str = data_utc.strftime('%Y-%m-%dT%H:%M:%S.000Z')

        # Lógica de envio de foto
        if codigo_ocorrencia in [1, 2]:
            invoice_data = {
                "key": nf.chave_acesso,
                "delivery_receipt_url": url_foto
            }
            freight_data = {}
        else:
            invoice_data = {
                "key": nf.chave_acesso,
                "delivery_receipt_url": ""
            }
            freight_data = {
                "delivery_receipt_url": url_foto
            } if url_foto else {}

        payload = {
            "invoice_occurrence": {
                "receiver": baixa.recebedor or "Nao identificado",
                "document_number": baixa.documento_recebedor or "",
                "comments": f"Baixa via App - Motorista: {motorista}. Obs: {baixa.observacao or ''}",
                "occurrence_at": data_ocorrencia_str,
                "occurrence": {
                    "code": codigo_ocorrencia
                },
                "invoice": invoice_data,
                "manifest": {
                    "id": nf.manifesto.numero_manifesto
                }
            }
        }

        if freight_data:
            payload["invoice_occurrence"]["freight"] = freight_data

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TOKEN}"
        }

        response = requests.post(
            URL_ESL,
            json=payload,
            headers=headers,
            timeout=30
        )
        response.raise_for_status()

        # ✅ SUCESSO
        baixa.processado_tms = True
        baixa.integrado_tms = True
        baixa.data_integracao = timezone.now()
        baixa.log_erro_tms = "Sucesso: Integrado com ESL"
        baixa.save()

    except BaixaNF.DoesNotExist:
        return f"Baixa {baixa_id} não encontrada"

    except requests.exceptions.HTTPError as exc:
        status = exc.response.status_code if exc.response else None
        msg_erro = f"Erro {status}: {exc.response.text if exc.response else str(exc)}"

        baixa.log_erro_tms = msg_erro[:500]
        baixa.integrado_tms = False
        baixa.save()

        # ❌ NÃO RETRYA erro de validação (4xx)
        if status and 400 <= status < 500:
            enviar_email_erro_tms_task.delay(baixa_id, msg_erro)
            raise

        # 🔁 Retry apenas para 5xx
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=60)

        enviar_email_erro_tms_task.delay(baixa_id, msg_erro)
        return f"Falha definitiva ESL (422): {msg_erro}"
