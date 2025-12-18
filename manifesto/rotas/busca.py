# manifesto/rotas/busca.py
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from manifesto.models import Manifesto, ManifestoBuscaLog
from manifesto.tasks import  buscar_manifesto_task
import requests
import json

# manifesto/rotas/busca.py

class BuscarManifestoView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        motorista = request.user.motorista_perfil
        numero = request.data.get('numero_manifesto')

        if not numero:
            return Response({'erro': 'Número do manifesto é obrigatório'}, status=400)

        log, _ = ManifestoBuscaLog.objects.update_or_create(
            numero_manifesto=numero,
            motorista=motorista,
            defaults={
                'status': 'AGUARDANDO',
                'mensagem_erro': None,
                'payload': None
            }
        )
        print( "Disparando task de busca de manifesto para preview..." )
        buscar_manifesto_task.delay(log.id)

        return Response({'status': 'AGUARDANDO'}, status=202)