# manifesto/rotas/baixa.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from manifesto.models import NotaFiscal, BaixaNF, Ocorrencia
from django.db import transaction
from manifesto.tasks import enviar_baixa_esl_task, enviar_baixa_minuta_task
from ftplib import FTP
from io import BytesIO
from django.conf import settings # Importe para usar as chaves do settings

def upload_via_ftp(imagem_bytes, nome_arquivo):
    try:
        from django.conf import settings
        from ftplib import FTP
        from io import BytesIO

        ftp = FTP(settings.FTP_HOST)
        ftp.login(user=settings.FTP_USER, passwd=settings.FTP_PASS)
        
        # CAMINHO AJUSTADO conforme seu print/link:
        caminho_ftp = 'domains/st63136.ispot.cc/public_html/uploads/comprovantes-quickdelivery'
        
        try:
            ftp.cwd(caminho_ftp)
        except:
            # Caso o caminho acima não funcione de primeira, tenta o caminho curto
            # (Alguns servidores FTP já logam direto na public_html)
            ftp.cwd('public_html/uploads/comprovantes-quickdelivery')

        ftp.storbinary(f"STOR {nome_arquivo}", BytesIO(imagem_bytes))
        ftp.quit()

        return f"{settings.FTP_BASE_URL}{nome_arquivo}"
    except Exception as e:
        print(f"Erro no Upload FTP: {e}")
        return None

class RegistrarBaixaView(APIView):
    permission_classes = [IsAuthenticated] 
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        chave_acesso = request.data.get('chave_acesso')
        numero_nota = request.data.get('numero_nota') # 👈 Pegamos o número para caso de Minuta
        codigo_tms = request.data.get('ocorrencia_codigo')
        foto_arquivo = request.FILES.get('foto')
        numero_mft = request.data.get('manifest_id') 
        
        try:
            with transaction.atomic():
                # --- BUSCA INTELIGENTE (HÍBRIDA) ---
                filtros = {}
                
                # Se tem chave, busca pela chave. Se não, busca pelo número (Minuta)
                if chave_acesso and chave_acesso != "null" and chave_acesso != "":
                    filtros['chave_acesso'] = chave_acesso
                else:
                    filtros['numero_nota'] = numero_nota

                # Vincula ao manifesto correto
                if numero_mft:
                    filtros['manifesto__numero_manifesto'] = str(numero_mft)
                else:
                    filtros['manifesto__motorista__user'] = request.user
                    filtros['manifesto__status'] = 'EM_TRANSPORTE'

                # Tenta encontrar a nota ou minuta
                nf = NotaFiscal.objects.get(**filtros)

                ocorrencia = Ocorrencia.objects.get(codigo_tms=codigo_tms) 

                # --- LÓGICA DE UPLOAD ---
                url_final_foto = None
                if foto_arquivo:
                    # Nome único para evitar sobreposição (ID da nota + identificador visual)
                    id_foto = chave_acesso if nf.chave_acesso else f"minuta_{nf.numero_nota}"
                    nome_arquivo = f"{nf.id}_{id_foto}.jpg"
                    url_final_foto = upload_via_ftp(foto_arquivo.read(), nome_arquivo)

                # --- REGISTRO DA BAIXA ---
                baixa, created = BaixaNF.objects.update_or_create(
                    nota_fiscal=nf,
                    defaults={
                        'tipo': 'ENTREGA' if ocorrencia.tipo == 'ENTREGA' else 'OCORRENCIA',
                        'ocorrencia': ocorrencia,
                        'comprovante_foto_url': url_final_foto, 
                        'recebedor': request.data.get('recebedor'),
                        'latitude': request.data.get('latitude'),
                        'longitude': request.data.get('longitude'),
                        'observacao': request.data.get('observacao'),
                    }
                )

                nf.status = 'BAIXADA' if baixa.tipo == 'ENTREGA' else 'OCORRENCIA'
                nf.save()
                
                # --- DISPARO DA TASK CORRETA (O CÉREBRO) ---
                if nf.chave_acesso:
                    # Se for NF-e normal, usa o endpoint de chaves
                    #enviar_baixa_esl_task.delay(baixa.id)
                    msg_log = "NF-e enviada para Task padrão."
                else:
                    # Se for Minuta (sem chave), usa o endpoint de fretes (v1/freights)
                    #enviar_baixa_minuta_task.delay(baixa.id)
                    msg_log = "Minuta enviada para Task de Fretes."
                
                print(f"BAIXA REGISTRADA: {msg_log}")

            return Response({'status': 'sucesso', 'mensagem': 'Baixa registrada e integração iniciada!'})

        except NotaFiscal.DoesNotExist:
            id_err = chave_acesso if chave_acesso else numero_nota
            return Response({'erro': f'Documento {id_err} não encontrado no manifesto {numero_mft}.'}, status=404)
        except Exception as e:
            print(f"ERRO NA BAIXA: {str(e)}") 
            return Response({'erro': str(e)}, status=400)


from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from manifesto.models import NotaFiscal, BaixaNF, Ocorrencia
from django.db import transaction
from manifesto.tasks import enviar_baixa_esl_task
import json

class RegistrarBaixaOperacionalView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data
        
        # LOG DE DEBUG: Essencial para ver no Docker o que o JS está mandando
        print(f"--- INICIO BAIXA OPERACIONAL ---")
        print(f"Dados recebidos: {data}")

        tipo_acao = data.get('tipo_operacao')  # TRANSFERENCIA, DESPACHO, RETIRADA
        numero_mft = data.get('manifesto_id')
        chave_acesso = data.get('chave_acesso')
        
        # Tratamento para booleano (JS envia 'true'/'false' como string às vezes)
        is_completo_raw = data.get('is_completo', True)
        is_completo = str(is_completo_raw).lower() == 'true'

        # 1. VALIDAÇÃO DE CAMPOS OBRIGATÓRIOS
        if not tipo_acao or not numero_mft:
            return Response({
                'erro': 'Os campos tipo_operacao e manifesto_id são obrigatórios.'
            }, status=400)

        # 2. MAPEAMENTO DE CÓDIGOS TMS
        MAPA_CODIGOS = {
            'TRANSFERENCIA': '098',
            'DESPACHO': '050' if is_completo else '055',
            'RETIRADA': '051' if is_completo else '056',
        }

        codigo_tms = MAPA_CODIGOS.get(tipo_acao)
        if not codigo_tms:
            return Response({'erro': f'Operação {tipo_acao} inválida.'}, status=400)

        try:
            ocorrencia_obj = Ocorrencia.objects.get(codigo_tms=codigo_tms)
        except Ocorrencia.DoesNotExist:
            print(f"ERRO: Código TMS {codigo_tms} não encontrado no banco de dados.")
            return Response({
                'erro': f'Código TMS {codigo_tms} não cadastrado para {tipo_acao}.'
            }, status=400)

        # 3. FILTRAGEM DAS NOTAS ALVO
        # Usamos numero_manifesto para a busca (fictício que o motorista usa)
        try:
            if tipo_acao == 'TRANSFERENCIA' and not chave_acesso:
                notas_alvo = NotaFiscal.objects.filter(
                    manifesto__numero_manifesto=str(numero_mft),
                    tipo_operacao='TRANSFERENCIA'
                ).exclude(status='BAIXADA')
            else:
                notas_alvo = NotaFiscal.objects.filter(
                    chave_acesso=chave_acesso, 
                    manifesto__numero_manifesto=str(numero_mft)
                )

            if not notas_alvo.exists():
                return Response({
                    'erro': f'Nenhuma nota pendente encontrada para o manifesto {numero_mft}.'
                }, status=404)

            contador = 0
            with transaction.atomic():
                for nf in notas_alvo:
                    # Criamos a baixa (o manifesto_id_tms será pego pela TASK via model)
                    baixa = BaixaNF.objects.create(
                        nota_fiscal=nf,
                        tipo='OCORRENCIA',
                        ocorrencia=ocorrencia_obj,
                        recebedor="FILIAL DESTINO" if tipo_acao == 'TRANSFERENCIA' else "CIA TRANSPORTADORA",
                        processado_tms=False,
                        integrado_tms=False
                    )
                    
                    # Atualiza status da nota
                    nf.status = 'BAIXADA'
                    nf.save()

                    # 4. FILA COM DELAY (Countdown para não sobrecarregar o TMS)
                    # O segredo: contador * 2 segundos entre cada nota
                    delay = contador * 2
                    enviar_baixa_esl_task.apply_async(args=[baixa.id], countdown=delay)
                    
                    contador += 1

            print(f"SUCESSO: {contador} notas processadas.")
            return Response({
                'status': 'sucesso', 
                'mensagem': f'{contador} notas enviadas para integração com TMS.'
            })

        except Exception as e:
            print(f"ERRO CRÍTICO NA VIEW: {str(e)}")
            return Response({'erro': f'Erro interno: {str(e)}'}, status=500)