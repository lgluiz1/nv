from rest_framework import views, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from manifesto.models import ManifestoBuscaLog
from manifesto.tasks import buscar_manifesto_completo_task
from usuarios.models import Motorista  # Importação necessária para a busca

class SincronizarManifestoView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        numero_manifesto = request.data.get('numero_manifesto')
        
        if not numero_manifesto:
            return Response({"erro": "Número do manifesto é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # 1. Busca o motorista associado ao usuário logado de forma segura
            try:
                motorista = Motorista.objects.get(user=request.user)
            except Motorista.DoesNotExist:
                return Response({"erro": "Perfil de motorista não encontrado para este usuário."}, status=403)

            # 2. Buscamos o Log existente ou criamos um novo
            # O status 'AGUARDANDO' é o que sua Task espera para começar
            log, created = ManifestoBuscaLog.objects.update_or_create(
                numero_manifesto=numero_manifesto,
                motorista=motorista,
                defaults={'status': 'AGUARDANDO', 'mensagem_erro': None}
            )

            # 3. Disparamos a Task no Celery
            buscar_manifesto_completo_task.delay(log.id)

            return Response({
                "mensagem": "Sincronização iniciada. Verifique as notas em alguns instantes.",
                "status": log.status
            }, status=status.HTTP_202_ACCEPTED)

        except Exception as e:
            return Response({"erro": f"Falha ao iniciar sincronização: {str(e)}"}, status=500)