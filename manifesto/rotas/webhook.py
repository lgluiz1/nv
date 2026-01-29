from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

@api_view(['POST'])
@authentication_classes([TokenAuthentication]) # Valida o Token
@permission_classes([IsAuthenticated])       # Só entra se estiver autenticado
def webhook_tms_esl(request):
    # O Django já validou o Token. Aqui você recebe os dados.
    dados = request.data
    
    # Exemplo: Processar baixa vinda do TMS
    numero_nf = dados.get('numero_nota')
    status = dados.get('status')
    
    print(f"Recebido webhook para nota {numero_nf} com status {status}")
    
    return Response({"status": "recebido", "mensagem": "Processado com sucesso"}, status=200)