from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from rest_framework.authtoken.models import Token

from manifesto.models import WebhookEventoManifestoESL


@api_view(['GET', 'POST'])
@authentication_classes([])            # 👈 REMOVE auth padrão
@permission_classes([AllowAny])        # 👈 PERMITE GET público
def webhook_tms_esl(request):

    # 📘 DOCUMENTAÇÃO (GET SEM TOKEN)
    if request.method == "GET":
        return Response({
            "descricao": "Webhook TMS ESL - Manifesto",
            "endpoint": "/api/manifesto/webhook/tms-esl/",
            "metodo": "POST",
            "headers_obrigatorios": {
                "Authorization": "Token SEU_TOKEN_AQUI",
                "Content-Type": "application/json"
            },
            "exemplo_payload": {
                "tipo": "COLETA | ENTREGA | DESPACHO | TRANSFERENCIA",
                "manifesto": 123456,
                "evento": "PICK_CREATED | MANIFEST_STARTED | MANIFEST_CLOSED",
                "origem": "ESL",
                "referencias": {
                    "pick_id": 987,
                    "cte": "123456789",
                    "nfe": "35123456789012345678901234567890123456789012"
                },
                "data": {
                    "status": "CRIADO",
                    "data_evento": "2026-01-30T10:22:00Z",
                    "usuario": "sistema"
                }
            }
        })

    # 🔐 VALIDA TOKEN MANUALMENTE NO POST
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Token "):
        return Response(
            {"detail": "Token não informado"},
            status=status.HTTP_401_UNAUTHORIZED
        )

    token_key = auth.replace("Token ", "")
    if not Token.objects.filter(key=token_key).exists():
        return Response(
            {"detail": "Token inválido"},
            status=status.HTTP_401_UNAUTHORIZED
        )

    # 📩 RECEBE WEBHOOK
    numero_manifesto = request.data.get("manifesto_numero")    
    payload = request.data

    WebhookEventoManifestoESL.objects.create(
        tipo=payload.get("tipo", "desconhecido"),
        numero_manifesto=numero_manifesto,
        payload=payload
    )

    return Response({"ok": True}, status=201)
