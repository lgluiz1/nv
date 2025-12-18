# manifesto/rotas/baixa.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated  # 👈 IMPORTANTE
from rest_framework.parsers import MultiPartParser, FormParser
from manifesto.models import NotaFiscal, BaixaNF, Ocorrencia
from django.db import transaction
from manifesto.tasks import enviar_baixa_esl_task

class RegistrarBaixaView(APIView):
    # Somente usuários com token válido podem acessar
    permission_classes = [IsAuthenticated] 
    # Necessário para processar arquivos (fotos) e campos de texto ao mesmo tempo
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        chave_acesso = request.data.get('chave_acesso')
        codigo_tms = request.data.get('ocorrencia_codigo')
        
        try:
            with transaction.atomic():
                nf = NotaFiscal.objects.get(chave_acesso=chave_acesso)
                
                # O campo 'codigo_tms' deve ser uma string exata "1"
                ocorrencia = Ocorrencia.objects.get(codigo_tms=codigo_tms) 

                baixa, created = BaixaNF.objects.update_or_create(
                    nota_fiscal=nf,
                    defaults={
                        # Usa o 'tipo' que você definiu no modelo de Ocorrência
                        'tipo': 'ENTREGA' if ocorrencia.tipo == 'ENTREGA' else 'OCORRENCIA',
                        'ocorrencia': ocorrencia,
                        'comprovante_foto': request.FILES.get('foto'),
                        'recebedor': request.data.get('recebedor'),
                        'latitude': request.data.get('latitude'),
                        'longitude': request.data.get('longitude'),
                        'observacao': request.data.get('observacao'),
                    }
                )

                # 3. Atualiza o status da NF
                nf.status = 'BAIXADA' if baixa.tipo == 'ENTREGA' else 'OCORRENCIA'
                nf.save()
                enviar_baixa_esl_task.delay(baixa.id)
            return Response({'status': 'sucesso', 'mensagem': 'Baixa registrada!'})

        except Exception as e:
            # Imprime o erro no console do Docker para você debugar o "Bad Request"
            print(f"ERRO NA BAIXA: {str(e)}") 
            return Response({'erro': str(e)}, status=400)