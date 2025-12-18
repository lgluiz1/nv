# manifesto/rotas/iniciar_transporte.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from manifesto.models import Manifesto, ManifestoBuscaLog
from manifesto.tasks import processar_notas_fiscais_task

class IniciarTransporteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        motorista = request.user.motorista_perfil
        numero = request.data.get('numero_manifesto')

        # 1. VALIDAÇÃO DE REGRA DE NEGÓCIO
        # Verifica se o motorista já tem um transporte ativo
        if Manifesto.objects.filter(motorista=motorista, status='EM_TRANSPORTE').exists():
            return Response({
                'erro': 'Você já possui um manifesto em transporte aberto. Finalize-o antes de iniciar outro.'
            }, status=400)

        # 2. BUSCA O LOG COM O PAYLOAD
        log = ManifestoBuscaLog.objects.filter(
            numero_manifesto=numero, 
            motorista=motorista
        ).first()

        if not log or not log.payload:
            return Response({'erro': 'Dados do manifesto não encontrados no log de busca.'}, status=404)

        try:
            with transaction.atomic():
                # 3. CRIAÇÃO DO MANIFESTO
                # Usamos apenas create para garantir que estamos criando um novo registro oficial
                manifesto = Manifesto.objects.create(
                    numero_manifesto=numero,
                    motorista=motorista,
                    status='EM_TRANSPORTE'
                )
                
                # 4. ATUALIZA STATUS DO LOG PARA O FRONTEND SABER QUE ESTÁ PROCESSANDO
                log.status = 'AGUARDANDO' 
                log.save(update_fields=['status'])

                # 5. DISPARA TASK PARA CRIAR AS NOTAS FISCAIS
                processar_notas_fiscais_task.delay(manifesto.id, log.id)

            return Response({'status': 'sucesso', 'manifesto_id': manifesto.id})

        except Exception as e:
            # Captura erros de banco e retorna como JSON, evitando o erro 500 HTML
            return Response({'erro': f'Erro interno: {str(e)}'}, status=500)