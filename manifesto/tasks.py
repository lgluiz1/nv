# manifestos/tasks.py

from celery import shared_task
import requests
from django.conf import settings
from django.utils import timezone
from usuarios.models import Motorista
from manifesto.models import Manifesto, NotaFiscal, HistoricoOcorrencia, Ocorrencia
from django.db import IntegrityError, transaction
from collections import defaultdict
import json


# Mapeamento das chaves JSON
MAPA_JSON = {
    'CHAVE_ACESSO': 'mft_fis_fit_fis_ioe_key',
    'NUMERO_NF': 'mft_fis_fit_fis_ioe_number',
    'CPF_MOTORISTA_TMS': 'mft_mdr_iil_document',
    'ENDERECO_LINHA1': 'mft_pfs_pck_pds_line_1',
    'ENDERECO_NUMERO': 'mft_pfs_pck_pds_number',
    'CODIGO_OCORRENCIA_EVT': 'mft_fis_fit_fte_lce_f_e_ics_ore_code',
    'DATA_OCORRENCIA_EVT': 'mft_fis_fit_fte_lce_f_e_ics_occurrence_at',
    'COMENTARIOS_EVT': 'mft_fis_fit_fte_lce_f_e_ics_comments',
    'NUMERO_MANIFESTO_EVT': 'sequence_code',
    'NOME_DESTINATARIO': 'mft_mdr_iil_name',
}


@shared_task
def processa_manifesto_dataexport(motorista_cpf, numero_manifesto, dados_json_export):
    """
    Processa o JSON de eventos do Data Export, valida e consolida os dados.
    """

    # Converter string JSON, se necessário
    if isinstance(dados_json_export, str):
        dados_manifesto_eventos = json.loads(dados_json_export)
    else:
        dados_manifesto_eventos = dados_json_export

    if not dados_manifesto_eventos:
        return {'status': 'erro', 'mensagem': 'Nenhum dado encontrado para este manifesto.'}

    # 1. Validação do Motorista (pega do primeiro registro)
    cpf_tms = str(dados_manifesto_eventos[0].get(MAPA_JSON['CPF_MOTORISTA_TMS'])).zfill(11)

    if cpf_tms != motorista_cpf:
        return {
            'status': 'erro',
            'mensagem': 'Manifesto não pertence ao CPF logado. Contate a equipe operacional.'
        }

    try:
        motorista_obj = Motorista.objects.get(cpf=motorista_cpf)
    except Motorista.DoesNotExist:
        return {'status': 'erro', 'mensagem': 'Perfil de Motorista interno não encontrado.'}

    # 2. Consolidador de notas
    notas_consolidadas = defaultdict(
        lambda: {
            'eventos': [],
            'dados_nf': None,
            'ultima_ocorrencia': None,
            'data_ultima_ocorrencia': timezone.datetime.min.replace(tzinfo=timezone.utc)
        }
    )

    # INÍCIO DO TRY GLOBAL
    try:
        with transaction.atomic():

            # 3. Verifica manifesto ativo
            manifesto_ativo = Manifesto.objects.filter(
                motorista=motorista_obj, finalizado=False
            ).first()

            if manifesto_ativo and manifesto_ativo.numero_manifesto != numero_manifesto:
                return {
                    'status': 'erro',
                    'mensagem': f'Motorista já possui manifesto {manifesto_ativo.numero_manifesto} ativo.'
                }

            # 4. Cria/recupera o manifesto
            manifesto, created = Manifesto.objects.get_or_create(
                numero_manifesto=numero_manifesto,
                defaults={'motorista': motorista_obj, 'finalizado': False}
            )

            # 5. Agrupamento dos eventos
            for evento in dados_manifesto_eventos:

                chave_acesso = evento.get(MAPA_JSON['CHAVE_ACESSO'])
                if not chave_acesso:
                    continue

                # Salva dados gerais da NF
                notas_consolidadas[chave_acesso]['dados_nf'] = {
                    'numero_nota': evento.get(MAPA_JSON['NUMERO_NF']),
                    'destinatario': evento.get(MAPA_JSON['NOME_DESTINATARIO'], 'Destinatário Não Informado'),
                    'endereco_entrega': f"{evento.get(MAPA_JSON['ENDERECO_LINHA1'], '')} {evento.get(MAPA_JSON['ENDERECO_NUMERO'], '')}"
                }

                # Conversão da data do evento
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

                    # Atualizar evento mais recente
                    if data_ocorrencia > notas_consolidadas[chave_acesso]['data_ultima_ocorrencia']:
                        notas_consolidadas[chave_acesso]['data_ultima_ocorrencia'] = data_ocorrencia
                        notas_consolidadas[chave_acesso]['ultima_ocorrencia'] = evento.get(MAPA_JSON['CODIGO_OCORRENCIA_EVT'])

            # 6. Processar cada NF consolidada
            for chave_acesso, dados in notas_consolidadas.items():

                nf_dados = dados['dados_nf']
                ultima_ocorrencia = dados['ultima_ocorrencia']

                # Definição do status inicial
                status_inicial = 'PENDENTE'
                if ultima_ocorrencia in [1, 2]:
                    status_inicial = 'BAIXADA'

                # Criar/atualizar NF
                nf, created_nf = NotaFiscal.objects.get_or_create(
                    manifesto=manifesto,
                    chave_acesso=chave_acesso,
                    defaults={**nf_dados, 'status': status_inicial}
                )

                # 7. Salvar histórico
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
