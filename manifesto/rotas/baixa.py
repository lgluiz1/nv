# manifesto/rotas/baixa.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from manifesto.models import NotaFiscal, BaixaNF, Ocorrencia
from django.db import transaction
from manifesto.tasks import enviar_baixa_esl_task
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
        codigo_tms = request.data.get('ocorrencia_codigo')
        foto_arquivo = request.FILES.get('foto')
        
        try:
            with transaction.atomic():
                nf = NotaFiscal.objects.get(chave_acesso=chave_acesso)
                ocorrencia = Ocorrencia.objects.get(codigo_tms=codigo_tms) 

                # --- LÓGICA DE UPLOAD EXTERNO ---
                url_final_foto = None
                if foto_arquivo:
                    # Geramos um nome único baseado na chave de acesso
                    nome_arquivo = f"{chave_acesso}.jpg"
                    # Lemos os bytes do arquivo enviado
                    url_final_foto = upload_via_ftp(foto_arquivo.read(), nome_arquivo)
                # --------------------------------

                baixa, created = BaixaNF.objects.update_or_create(
                    nota_fiscal=nf,
                    defaults={
                        'tipo': 'ENTREGA' if ocorrencia.tipo == 'ENTREGA' else 'OCORRENCIA',
                        'ocorrencia': ocorrencia,
                        # Agora salvamos a STRING da URL, não o arquivo
                        'comprovante_foto_url': url_final_foto, 
                        'recebedor': request.data.get('recebedor'),
                        'latitude': request.data.get('latitude'),
                        'longitude': request.data.get('longitude'),
                        'observacao': request.data.get('observacao'),
                    }
                )

                nf.status = 'BAIXADA' if baixa.tipo == 'ENTREGA' else 'OCORRENCIA'
                nf.save()
                
                # Envia para a fila do Celery para integrar com o ESL
                enviar_baixa_esl_task.delay(baixa.id)

            return Response({'status': 'sucesso', 'mensagem': 'Baixa registrada e foto enviada!'})

        except Exception as e:
            print(f"ERRO NA BAIXA: {str(e)}") 
            return Response({'erro': str(e)}, status=400)