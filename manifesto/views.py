# manifestos/views.py
from rest_framework.views import APIView
from rest_framework import views, status, generics
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.shortcuts import get_object_or_404
from .models import Manifesto, NotaFiscal, Ocorrencia, BaixaNF, ManifestoBuscaLog
from django.db import transaction
from usuarios.models import Motorista
from .serializers import (
    ManifestoBuscaSerializer, ManifestoSerializer, 
    BaixaNFCreateSerializer, OcorrenciaSerializer
)


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
            manifesto.status = 'FINALIZADO'
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