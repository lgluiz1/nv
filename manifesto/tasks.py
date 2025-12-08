# manifestos/tasks.py

from celery import shared_task
import requests
from django.conf import settings
from django.utils import timezone
from usuarios.models import Motorista
# CORREÇÃO CRÍTICA: O nome do módulo deve ser 'manifestos' (PLURAL)
from manifesto.models import Manifesto, NotaFiscal, HistoricoOcorrencia, Ocorrencia 
from django.db import IntegrityError, transaction
from collections import defaultdict
import json

# --- CONFIGURAÇÕES DA API TMS ---
TEMPLATE_ID = 2972
EMPRESA = "quickdelivery"
TOKEN = "zyUq31Mq6gMcYGzV4zL7HTsdnS7pULjaQoxGbkPZ1cLDoxT3d-Xukw" # SEU TOKEN REAL

URL_BASE_TMS = f"https://{EMPRESA}.eslcloud.com.br/api/analytics/reports/{TEMPLATE_ID}/data"
# --------------------------------------------


# Mapeamento das chaves JSON (AGORA CORRETO)
MAPA_JSON = {
    # NF E CHAVES GERAIS
    'CHAVE_ACESSO': 'mft_fis_fit_fis_ioe_key',
    'NUMERO_NF': 'mft_fis_fit_fis_ioe_number',
    'NUMERO_MANIFESTO_EVT': 'sequence_code',
    
    # DADOS DO MOTORISTA (PARA VALIDAÇÃO)
    'CPF_MOTORISTA_TMS': 'mft_mdr_iil_document',
    
    # DADOS DO CLIENTE / DESTINATÁRIO (CHAVES VINDAS DO JSON COMPLETO)
    'NOME_CLIENTE': 'mft_fis_fit_fis_ioe_rpt_name', 
    'ENDERECO_LOGRADOURO': 'mft_fis_fit_fis_ioe_rpt_mds_line_1', 
    'ENDERECO_NUMERO': 'mft_fis_fit_fis_ioe_rpt_mds_number',
    'ENDERECO_BAIRRO': 'mft_fis_fit_fis_ioe_rpt_mds_neighborhood',
    'ENDERECO_CEP': 'mft_fis_fit_fis_ioe_rpt_mds_postal_code',
    
    # DADOS DE OCORRÊNCIA/EVENTOS
    'CODIGO_OCORRENCIA_EVT': 'mft_fis_fit_fte_lce_f_e_ics_ore_code',
    'DATA_OCORRENCIA_EVT': 'mft_fis_fit_fte_lce_f_e_ics_occurrence_at',
    'COMENTARIOS_EVT': 'mft_fis_fit_fte_lce_f_e_ics_comments',
}


@shared_task
def processa_manifesto_dataexport(motorista_cpf, numero_manifesto): 
    """
    1. Busca os dados no Data Export do TMS via requests.get.
    2. Valida o motorista pelo documento.
    3. Consolida e salva o manifesto e o histórico.
    """
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {TOKEN}"
    }

    payload = {
        "search": {
            "manifests": {
                "sequence_code": int(numero_manifesto), 
                "service_date": "2024-01-01 - 2050-12-31" 
            }
        },
        "page": "1",
        "per": "100"
    }

    # --- 1. CHAMADA REAL AO TMS ---
    try:
        response = requests.get(URL_BASE_TMS, headers=headers, data=json.dumps(payload), timeout=30)
        response.raise_for_status()

        dados_manifesto_eventos = response.json()
        
    except requests.exceptions.RequestException as e:
        return {'status': 'erro', 'mensagem': f'Falha de comunicação com TMS: {e}'}
    except json.JSONDecodeError:
        return {'status': 'erro', 'mensagem': 'Resposta inválida (não-JSON) do servidor TMS.'}

    
    # --- 2. VALIDAÇÃO INICIAL ---
    
    if not dados_manifesto_eventos or not isinstance(dados_manifesto_eventos, list):
        return {'status': 'erro', 'mensagem': 'Nenhum dado encontrado para este manifesto no TMS.'}

    cpf_tms = str(dados_manifesto_eventos[0].get(MAPA_JSON['CPF_MOTORISTA_TMS']) or '').zfill(11)
    
    if cpf_tms != motorista_cpf:
        return {'status': 'erro', 'mensagem': 'Documento do motorista não confere com o CPF logado.'}

    
    # --- 3. CONSOLIDAÇÃO E SALVAMENTO ---
    
    try:
        motorista_obj = Motorista.objects.get(cpf=motorista_cpf)
    except Motorista.DoesNotExist:
        return {'status': 'erro', 'mensagem': 'Perfil de Motorista interno não encontrado.'}

    notas_consolidadas = defaultdict(
        lambda: {'eventos': [], 'dados_nf': None, 'ultima_ocorrencia': None, 'data_ultima_ocorrencia': timezone.datetime.min.replace(tzinfo=timezone.utc)}
    )

    try:
        with transaction.atomic():
            
            manifesto_ativo = Manifesto.objects.filter(motorista=motorista_obj, finalizado=False).first()

            if manifesto_ativo and manifesto_ativo.numero_manifesto != numero_manifesto:
                return {'status': 'erro', 'mensagem': f'Motorista já possui manifesto {manifesto_ativo.numero_manifesto} ativo.'}

            manifesto, created = Manifesto.objects.get_or_create(
                numero_manifesto=numero_manifesto,
                defaults={'motorista': motorista_obj, 'finalizado': False}
            )

            for evento in dados_manifesto_eventos:
                chave_acesso = evento.get(MAPA_JSON['CHAVE_ACESSO'])
                if not chave_acesso: continue

                # --- EXTRAÇÃO DO CLIENTE E ENDEREÇO CORRETOS ---
                logradouro = evento.get(MAPA_JSON['ENDERECO_LOGRADOURO']) or ''
                numero = evento.get(MAPA_JSON['ENDERECO_NUMERO']) or ''
                bairro = evento.get(MAPA_JSON['ENDERECO_BAIRRO']) or ''
                cep = evento.get(MAPA_JSON['ENDERECO_CEP']) or ''
                
                # Monta a string de Endereço (Ex: RUA DR MARIO VIANA, 653 | SANTA ROSA | CEP: 24241001)
                endereco_completo = f"{logradouro}, {numero}".strip().replace(" ,", ",")
                if bairro:
                    endereco_completo += f" | Bairro: {bairro}"
                if cep:
                    endereco_completo += f" | CEP: {cep}"
                # --- FIM EXTRAÇÃO ---

                # Salva dados gerais da NF (agora com Nome do Cliente e Endereço Completo)
                notas_consolidadas[chave_acesso]['dados_nf'] = {
                    'numero_nota': evento.get(MAPA_JSON['NUMERO_NF']),
                    'destinatario': evento.get(MAPA_JSON['NOME_CLIENTE'], 'Destinatário N/D'), 
                    'endereco_entrega': endereco_completo
                }

                # ... (Lógica de Eventos/Ocorrências) ...
                data_evt = evento.get(MAPA_JSON['DATA_OCORRENCIA_EVT'])
                if data_evt:
                    try:
                        data_ocorrencia = timezone.datetime.fromisoformat(data_evt)
                    except ValueError:
                        data_ocorrencia = timezone.now()

                    evento_historico = {
                        'codigo_tms': evento.get(MAPA_JSON['CODIGO_OCORRENCIA_EVT']),
                        'data_ocorrencia': data_ocorrencia,
                        'comentarios': evento.get(MAPA_JSON['COMENTARIOS_EVT']),
                        'manifesto_evento': evento.get(MAPA_JSON['NUMERO_MANIFESTO_EVT']),
                    }

                    notas_consolidadas[chave_acesso]['eventos'].append(evento_historico)

                    if data_ocorrencia > notas_consolidadas[chave_acesso]['data_ultima_ocorrencia']:
                        notas_consolidadas[chave_acesso]['data_ultima_ocorrencia'] = data_ocorrencia
                        notas_consolidadas[chave_acesso]['ultima_ocorrencia'] = evento.get(MAPA_JSON['CODIGO_OCORRENCIA_EVT'])
            
            # --- 4. SALVAMENTO FINAL NO BANCO ---
            for chave_acesso, dados in notas_consolidadas.items():
                nf_dados = dados['dados_nf']
                ultima_ocorrencia = dados['ultima_ocorrencia']

                status_inicial = 'PENDENTE'
                if ultima_ocorrencia in [1, 2]:
                    status_inicial = 'BAIXADA'

                nf, created_nf = NotaFiscal.objects.get_or_create(
                    manifesto=manifesto,
                    chave_acesso=chave_acesso,
                    defaults={**nf_dados, 'status': status_inicial}
                )

                for evento_data in dados['eventos']:
                    HistoricoOcorrencia.objects.update_or_create(
                        nota_fiscal=nf,
                        codigo_tms=str(evento_data['codigo_tms']),
                        data_ocorrencia=evento_data['data_ocorrencia'],
                        defaults={
                            'comentarios': evento_data['comentarios'],
                            'manifesto_evento': str(evento_data['manifesto_evento']),
                        }
                    )

            # SUCESSO GERAL
            return {
                'status': 'sucesso',
                'manifesto_id': manifesto.id,
                'mensagem': 'Manifesto e NFs vinculados com sucesso.'
            }

    # TRATAMENTO DE EXCEÇÕES DE DB e LOGICA
    except IntegrityError as e:
        return {
            'status': 'erro',
            'mensagem': f'Erro de integridade do banco de dados: {e}'
        }
    except Exception as e:
        return {
            'status': 'erro',
            'mensagem': f'Erro desconhecido ao processar manifesto: {e}'
        }


@shared_task
def envia_baixa_para_tms(chave_acesso_nf, tipo_baixa, codigo_ocorrencia=None, foto_url=None):
    """
    Task para enviar o comprovante/código de ocorrência final ao TMS.
    """
    # Implementação futura
    pass