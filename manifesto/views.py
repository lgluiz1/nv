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
    def post(self, request):
        km_final = request.data.get('km_final')
        manifesto_id = request.data.get('manifesto_id') # Recebe o ID do JS

        if not manifesto_id:
            return Response({"mensagem": "ID do manifesto não fornecido."}, status=400)

        try:
            # Agora buscamos pelo ID exato
            manifesto = Manifesto.objects.get(id=manifesto_id)
            
            # Validação extra: garantir que não está finalizado
            if manifesto.finalizado:
                return Response({"mensagem": "Este manifesto já foi encerrado."}, status=400)

            manifesto.km_final = km_final
            manifesto.finalizado = True
            manifesto.save()

            return Response({"mensagem": "Sucesso!"}, status=200)

        except Manifesto.DoesNotExist:
            return Response({"mensagem": "Manifesto não encontrado."}, status=404)

class OcorrenciaListView(generics.ListAPIView):
    """
    GET: Lista de todos os códigos de ocorrência (Entrega/Problema) do TMS.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = OcorrenciaSerializer
    queryset = Ocorrencia.objects.all()