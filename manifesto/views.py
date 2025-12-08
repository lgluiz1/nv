# manifestos/views.py

from rest_framework import views, status, generics
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.shortcuts import get_object_or_404
from .models import Manifesto, NotaFiscal, Ocorrencia, BaixaNF
from .tasks import processa_manifesto_dataexport, envia_baixa_para_tms
from usuarios.models import Motorista
from .serializers import (
    ManifestoBuscaSerializer, ManifestoSerializer, 
    BaixaNFCreateSerializer, OcorrenciaSerializer
)

class ManifestoBuscaView(views.APIView):
    """
    GET: Retorna o manifesto ativo do motorista.
    POST: Inicia a busca de um novo manifesto via Data Export (Celery Task).
    """
    permission_classes = [IsAuthenticated]
    
    # Rota GET: /api/manifesto/status/
    def get(self, request):
        motorista = request.user.motorista_perfil
        try:
            # Busca o manifesto que NÃO ESTÁ FINALIZADO
            manifesto = Manifesto.objects.select_related('motorista').get(motorista=motorista, finalizado=False)
            serializer = ManifestoSerializer(manifesto)
            
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Manifesto.DoesNotExist:
            return Response({
                'mensagem': 'Nenhum manifesto ativo. Pronto para buscar um novo.',
                'status_manifesto': 'LIVRE'
            }, status=status.HTTP_200_OK)

    # Rota POST: /api/manifesto/busca/
    # Rota POST: /api/manifesto/busca/
    def post(self, request):
        serializer = ManifestoBuscaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        numero_manifesto = serializer.validated_data['numero_manifesto']
        motorista = request.user.motorista_perfil

        # 1. Prevenção de manifesto ativo (mantida)
        if Manifesto.objects.filter(motorista=motorista, finalizado=False).exists():
             return Response({
                'mensagem': 'Você já possui um manifesto ativo. Finalize-o antes de buscar um novo.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # 2. Chamada SÍNCRONA da Task Celery (Bloqueia o Gunicorn por até 10s, mas garante o resultado)
        try:
            # Chama a Task via apply_async e força o retorno com .get()
            result = processa_manifesto_dataexport.apply_async(
                args=[motorista.cpf, numero_manifesto]
            )
            # Espera até 10 segundos para o Celery terminar e retornar o resultado
            task_result = result.get(timeout=10) 
            
            # Se a Task retornou um status de ERRO (como "Documento não confere")
            if task_result.get('status') == 'erro':
                return Response(
                    {'mensagem': task_result['mensagem']}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Se a Task retornou SUCESSO (Status 200 OK)
            return Response(
                {'mensagem': task_result['mensagem']}, 
                status=status.HTTP_200_OK
            )

        except Exception as e:
            # Timeout do Celery, erro de rede, etc.
            return Response(
                {'mensagem': f'Erro ao processar manifesto (Timeout ou Falha Interna): {e}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class BaixaNFView(views.APIView):
    """
    POST: Registra a baixa (entrega ou ocorrência) de uma Nota Fiscal.
    """
    permission_classes = [IsAuthenticated]

    # Rota POST: /api/nf/<int:pk>/baixa/
    def post(self, request, pk):
        # O pk é o ID interno da NotaFiscal no nosso BD
        try:
            nf = NotaFiscal.objects.get(pk=pk, manifesto__motorista=request.user.motorista_perfil, status='PENDENTE')
        except NotaFiscal.DoesNotExist:
            return Response({'mensagem': 'Nota Fiscal não encontrada, não pertence ao seu manifesto ou já foi baixada.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = BaixaNFCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        
        ocorrencia_obj = None
        codigo_ocorrencia = data.get('codigo_ocorrencia')

        # Lógica de Ocorrência (Validação do código TMS)
        try:
            ocorrencia_obj = get_object_or_404(Ocorrencia, codigo_tms=codigo_ocorrencia)
        except:
             return Response({'mensagem': 'Código de ocorrência inválido ou inexistente.'}, status=status.HTTP_400_BAD_REQUEST)

        # Atualiza status da NF
        nf.status = 'OCORRENCIA' if ocorrencia_obj.tipo == 'PROBLEMA' else 'BAIXADA'
        
        # Salva o registro de baixa no DB
        baixa = BaixaNF.objects.create(
            nota_fiscal=nf,
            tipo=data['tipo'],
            comprovante_foto=data.get('comprovante_foto'),
            ocorrencia=ocorrencia_obj,
            observacao=data.get('observacao')
        )
        nf.save()
        
        # Dispara a Task Celery para comunicação com o TMS
        foto_url = baixa.comprovante_foto.url if baixa.comprovante_foto else None
        
        envia_baixa_para_tms.delay(
            chave_acesso_nf=nf.chave_acesso,
            tipo_baixa=data['tipo'],
            codigo_ocorrencia=codigo_ocorrencia,
            foto_url=foto_url
        )
        
        return Response({'mensagem': 'Baixa registrada. Enviando dados ao TMS de forma assíncrona.'}, status=status.HTTP_202_ACCEPTED)


class ManifestoFinalizacaoView(views.APIView):
    """
    POST: Finaliza o manifesto ativo, requerendo o KM final.
    """
    permission_classes = [IsAuthenticated]
    
    # Rota POST: /api/manifesto/finalizar/
    def post(self, request):
        km_final = request.data.get('km_final')
        motorista = request.user.motorista_perfil
        
        if not km_final or not str(km_final).isdigit():
            return Response({'mensagem': 'O KM final é obrigatório e deve ser numérico.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            manifesto = Manifesto.objects.get(motorista=motorista, finalizado=False)
            
            # Checa se todas as NFs foram resolvidas
            if manifesto.notas_fiscais.filter(status='PENDENTE').exists():
                 return Response({
                    'mensagem': 'Ainda há notas pendentes neste manifesto. Complete todas as baixas.'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Finaliza o manifesto
            manifesto.km_final = km_final
            manifesto.finalizado = True
            manifesto.data_finalizacao = timezone.now()
            manifesto.save()
            
            # TO DO: Disparar Task Celery para enviar a finalização do manifesto para o TMS
            
            return Response({'mensagem': 'Manifesto finalizado com sucesso!'}, status=status.HTTP_200_OK)

        except Manifesto.DoesNotExist:
            return Response({'mensagem': 'Nenhum manifesto ativo para finalizar.'}, status=status.HTTP_404_NOT_FOUND)


class OcorrenciaListView(generics.ListAPIView):
    """
    GET: Lista de todos os códigos de ocorrência (Entrega/Problema) do TMS.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = OcorrenciaSerializer
    queryset = Ocorrencia.objects.all()