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
from .tasks import buscar_manifesto_completo_task

class ManifestoFinalizacaoView(APIView):
    def post(self, request):
        km_final = request.data.get('km_final')
        # Recebe o número visual (ex: 56892) vindo do seu JS
        numero_mft = request.data.get('manifesto_id') 

        if not numero_mft:
            return Response({"mensagem": "Número do manifesto não fornecido."}, status=400)

        try:
            # Buscamos o manifesto pelo número visual
            manifesto = Manifesto.objects.get(numero_manifesto=str(numero_mft))
            
            if manifesto.finalizado:
                return Response({"mensagem": "Este manifesto já foi encerrado."}, status=400)

            # --- TRAVA DE SEGURANÇA: CONFERÊNCIA DE NOTAS PENDENTES ---
            # Verificamos se existe alguma nota deste manifesto que ainda não foi baixada
            notas_pendentes = NotaFiscal.objects.filter(
                manifesto=manifesto, 
                status='PENDENTE'
            ).count()

            if notas_pendentes > 0:
                return Response({
                    "mensagem": f"Não é possível finalizar. Existem {notas_pendentes} notas pendentes de baixa."
                }, status=400)
            # ---------------------------------------------------------

            # Se todas as notas foram baixadas (Sucesso ou Ocorrência), finaliza
            manifesto.km_final = km_final
            manifesto.finalizado = True
            manifesto.status = "FINALIZADO"
            manifesto.data_finalizacao = timezone.now()
            manifesto.save()

            return Response({"mensagem": "Sucesso!"}, status=200)

        except Manifesto.DoesNotExist:
            return Response({"mensagem": "Manifesto não encontrado."}, status=404)
        except Exception as e:
            return Response({"mensagem": f"Erro interno: {str(e)}"}, status=500)

class AtualizarManifestoView(views.APIView):
    # Reutiliza sua autenticação JWT
    
    def post(self, request):
        numero_manifesto = request.data.get('numero_manifesto')
        motorista = request.user.motorista_profile # Ajuste conforme seu modelo

        if not numero_manifesto:
            return Response({"erro": "Número do manifesto é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Criamos um log de busca marcado como 'ATUALIZACAO'
        log = ManifestoBuscaLog.objects.create(
            motorista=motorista,
            numero_manifesto=numero_manifesto,
            status='PENDENTE'
        )

        # 2. Chamamos a mesma Task que você já tem
        # Ela vai percorrer a API da ESL e adicionar o que estiver faltando
        buscar_manifesto_completo_task.delay(log.id)

        return Response({
            "mensagem": "Sincronização iniciada. As novas notas aparecerão em instantes.",
            "log_id": log.id
        }, status=status.HTTP_202_ACCEPTED)

class OcorrenciaListView(generics.ListAPIView):
    """
    GET: Lista de todos os códigos de ocorrência (Entrega/Problema) do TMS.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = OcorrenciaSerializer
    queryset = Ocorrencia.objects.all()