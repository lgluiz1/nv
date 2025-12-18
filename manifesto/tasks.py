from celery import shared_task
import requests
import json
import logging
from django.db import transaction
from django.utils import timezone
from django.conf import settings
from usuarios.models import Motorista
from manifesto.models import Manifesto, NotaFiscal, ManifestoBuscaLog , BaixaNF


logger = logging.getLogger(__name__)
# Configurações centralizadas
MAPA_JSON = {
    'CHAVE_ACESSO': 'mft_fis_fit_fis_ioe_key',
    'NUMERO_NF': 'mft_fis_fit_fis_ioe_number',
    'NUMERO_MANIFESTO_EVT': 'sequence_code',
    'CPF_MOTORISTA_TMS': 'mft_mdr_iil_document',
    'NOME_CLIENTE': 'mft_fis_fit_fis_ioe_rpt_name', 
    'ENDERECO_LOGRADOURO': 'mft_fis_fit_fis_ioe_rpt_mds_line_1', 
    'ENDERECO_NUMERO': 'mft_fis_fit_fis_ioe_rpt_mds_number',
    'ENDERECO_BAIRRO': 'mft_fis_fit_fis_ioe_rpt_mds_neighborhood',
    'ENDERECO_CEP': 'mft_fis_fit_fis_ioe_rpt_mds_postal_code',
}

def requisicao_tms(numero_manifesto):
    TOKEN = "zyUq31Mq6gMcYGzV4zL7HTsdnS7pULjaQoxGbkPZ1cLDoxT3d-Xukw"
    URL = f"https://quickdelivery.eslcloud.com.br/api/analytics/reports/2972/data"
    
    payload = {
        "search": {
            "manifests": {
                "sequence_code": int(numero_manifesto),
                "service_date": "2024-01-01 - 2050-12-31"
            }
        },
        "page": "1", "per": "500"
    }
    
    response = requests.get(URL, headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}, data=json.dumps(payload), timeout=40)
    response.raise_for_status()
    return response.json()

@shared_task(bind=True)
def buscar_manifesto_task(self, log_id):
    try:
        log = ManifestoBuscaLog.objects.select_related('motorista').get(id=log_id)
        dados = requisicao_tms(log.numero_manifesto)

        if not dados:
            log.status, log.mensagem_erro = 'ERRO', 'Manifesto não encontrado'
            log.save()
            return

        # Validação de CPF (Jonatan Roberto Lopes de Faria no seu exemplo)
        cpf_tms = str(dados[0].get(MAPA_JSON['CPF_MOTORISTA_TMS'], '')).strip()
        motorista_cpf = str(log.motorista.cpf).strip().replace('.', '').replace('-', '')

        if cpf_tms != motorista_cpf:
            log.status = 'ERRO'
            log.mensagem_erro = f"Manifesto pertence ao documento {cpf_tms}"
            log.save()
            return

        # Sucesso
        log.payload = dados
        log.status = 'PROCESSADO'
        log.mensagem_erro = None
        log.save()

    except Exception as e:
        log.status, log.mensagem_erro = 'ERRO', str(e)
        log.save()

@shared_task
def processar_notas_fiscais_task(manifesto_id, log_id):
    try:
        manifesto = Manifesto.objects.get(id=manifesto_id)
        log = ManifestoBuscaLog.objects.get(id=log_id)
        
        with transaction.atomic():
            for item in log.payload:
                chave = item.get('mft_fis_fit_fis_ioe_key')
                # Model NotaFiscal garante unicidade por (manifesto, chave_acesso)
                NotaFiscal.objects.get_or_create(
                    manifesto=manifesto,
                    chave_acesso=chave,
                    defaults={
                        'numero_nota': item.get('mft_fis_fit_fis_ioe_number'),
                        'destinatario': item.get('mft_fis_fit_fis_ioe_rpt_name'),
                        'endereco_entrega': f"{item.get('mft_fis_fit_fis_ioe_rpt_mds_line_1')}, {item.get('mft_fis_fit_fis_ioe_rpt_mds_number')}",
                        'status': 'PENDENTE'
                    }
                )
            
            # Muda status do LOG para PROCESSADO para o polling do JS parar e mostrar a lista
            log.status = 'PROCESSADO'
            log.save(update_fields=['status'])
            
    except Exception as e:
        log.status, log.mensagem_erro = 'ERRO', str(e)
        log.save()




# manifestos/tasks.py
# manifesto/tasks.py
import requests
from celery import shared_task
from django.utils import timezone

@shared_task(bind=True, max_retries=5)
def enviar_baixa_esl_task(self, baixa_id):
    """
    Task unificada: Busca dados, monta URL completa e envia para ESL.
    """
    from .models import BaixaNF
    
    TOKEN = "jziCXNF8xTasaEGJGxysrTFXtDRUmdobh9HCGHiwmEzaENWLiaddLA"
    URL_ESL = "https://quickdelivery.eslcloud.com.br/api/invoice_occurrences"
    BASE_NGROK = "https://1bdf6f7e1548.ngrok-free.app" # Substitua pelo seu domínio fixo se tiver
    
    try:
        # 1. Busca os dados com as relações (evita múltiplas consultas ao banco)
        baixa = BaixaNF.objects.select_related(
            'nota_fiscal', 
            'ocorrencia', 
            'nota_fiscal__manifesto__motorista'
        ).get(id=baixa_id)
        
        nf = baixa.nota_fiscal
        motorista = nf.manifesto.motorista.nome_completo # Campo correto conforme seu model

        # 2. Monta a URL completa da foto (essencial para a ESL baixar)
        url_foto = f"{BASE_NGROK}{baixa.comprovante_foto.url}" if baixa.comprovante_foto else ""
        
        # 3. Monta o payload exatamente como a documentação pede
        payload = {
            "invoice_occurrence": {
                "receiver": baixa.recebedor or "Nao identificado",
                "document_number": baixa.documento_recebedor or "",
                "comments": f"Baixa via App - Motorista: {motorista}. Obs: {baixa.observacao or ''}",
                "occurrence_at": baixa.data_baixa.strftime('%Y-%m-%dT%H:%M:%S.000-03:00'),
                "occurrence": {
                    "code": int(baixa.ocorrencia.codigo_tms) if baixa.ocorrencia else 1
                },
                "invoice": {
                    "key": nf.chave_acesso,
                    "delivery_receipt_url": url_foto
                },
                "manifest": {
                    "id": nf.manifesto.numero_manifesto
                }
            }
        }

        # 4. Envio para a ESL
        headers = {
            'Content-Type': 'application/json', 
            'Authorization': f'Bearer {TOKEN}',
            'ngrok-skip-browser-warning': 'true' # Tenta pular aviso do ngrok
        }
        
        response = requests.post(URL_ESL, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        
        # 5. Sucesso: Atualiza o registro no banco
        baixa.processado_tms = True
        baixa.data_integracao = timezone.now()
        baixa.log_erro_tms = "Sucesso: Integrado com ESL"
        baixa.save()

    except BaixaNF.DoesNotExist:
        return f"Erro: Baixa {baixa_id} não encontrada."

    except requests.exceptions.RequestException as exc:
        # Erro de rede ou API: Salva o log e agenda nova tentativa
        msg_erro = f"Erro API ESL: {str(exc)}"
        if exc.response is not None:
            msg_erro = f"Erro {exc.response.status_code}: {exc.response.text}"
        
        baixa.log_erro_tms = msg_erro[:500]
        baixa.save()
        
        # Tenta novamente em 2 minutos (máximo 5 vezes)
        raise self.retry(exc=exc, countdown=120)