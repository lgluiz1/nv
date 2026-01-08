# manifestos/views.py
from rest_framework.views import APIView
from .tasks import buscar_manifesto_task
from rest_framework import views, status, generics
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.shortcuts import get_object_or_404
from .models import Manifesto, NotaFiscal, Ocorrencia, BaixaNF, ManifestoBuscaLog
from .tasks import buscar_manifesto_task, envia_baixa_para_tms
from django.db import transaction
from usuarios.models import Motorista
from .serializers import (
    ManifestoBuscaSerializer, ManifestoSerializer, 
    BaixaNFCreateSerializer, OcorrenciaSerializer
)

class BuscarManifestoView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        numero = request.data.get('numero_manifesto')
        motorista = request.user.motorista_perfil

        if not numero:
            return Response(
                {'erro': 'Número do manifesto é obrigatório'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 🚫 Bloqueia se já existir manifesto ativo
        if Manifesto.objects.filter(
            motorista=motorista,
            finalizado=False
        ).exists():
            return Response(
                {'erro': 'Você já possui um manifesto ativo'},
                status=status.HTTP_409_CONFLICT
            )

        # 🚀 Dispara a task REAL que busca e processa no TMS
        buscar_manifesto_task.delay(
            motorista_cpf=motorista.cpf,
            numero_manifesto=numero
        )

        return Response(
            {
                'status': 'PROCESSANDO',
                'mensagem': 'Manifesto em processamento. Aguarde.'
            },
            status=status.HTTP_202_ACCEPTED
        )

class BaixaNFView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        # 1. Busca pela PK conforme o roteamento atual
        try:
            # DICA: Se você mudar o front para enviar a CHAVE, troque pk=pk por chave_acesso=pk
            nf = NotaFiscal.objects.get(pk=pk, status='PENDENTE')
        except NotaFiscal.DoesNotExist:
            return Response({'erro': 'Nota Fiscal não encontrada ou já baixada.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = BaixaNFCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        
        # 2. Validação da Ocorrência
        try:
            ocorrencia_obj = Ocorrencia.objects.get(codigo_tms=data.get('codigo_ocorrencia'))
        except Ocorrencia.DoesNotExist:
             return Response({'erro': 'Código de ocorrência inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        # 3. Salva no Banco local (O que importa para o motorista)
        with transaction.atomic():
            nf.status = 'OCORRENCIA' if ocorrencia_obj.tipo == 'PROBLEMA' else 'BAIXADA'
            nf.save()
            
            baixa = BaixaNF.objects.create(
                nota_fiscal=nf,
                tipo='OCORRENCIA' if ocorrencia_obj.tipo == 'PROBLEMA' else 'ENTREGA',
                comprovante_foto=request.FILES.get('foto'), # Ajustado para o nome que o JS envia
                ocorrencia=ocorrencia_obj,
                recebedor=request.data.get('recebedor'),
                latitude=request.data.get('latitude'),
                longitude=request.data.get('longitude')
            )

        # 4. Dispara a Task (Aqui o erro de integração não trava o motorista)
        envia_baixa_para_tms.delay(baixa.id)
        
        # Retornamos sucesso para o App. O motorista verá o "✅ Registro Cadastrado"
        return Response({
            'mensagem': 'Sucesso! Registro salvo.',
            'status_integracao': 'pendente' # O App sabe que foi salvo localmente
        }, status=status.HTTP_201_CREATED)
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