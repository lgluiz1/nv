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
            "exemplo_payload": "siga o exemplo abaixo",
            "exemplo":
            {
            "manifesto_numero": 777888,"obrigatorio": True,
            "tipo": "Tipo Manifesto","obrigatorio": True,
            "dados": {
                "manifesto_id": "id interna do tms manifesto",
                "manifesto_numero": 777888,
                "manifesto_data_emissao": "2025-08-23",
                "filial_origem": "Filial A",
                "previsao_saida": "2025-08-25T12:00:00Z",
                "previsao_entrega": "2025-08-30",
                "observacoes_operacionais": "",
                "manifesto_tipo": [
                {"tipo": "C(coleta), E(entrega), T(tranferencia), D(despacho)"}
                ],
                "qtd_volumes": 10,
                "qtd_destinos": 5,
                "qtd_notas": 15,
                "peso_total": 1500.75,
                "peso_taxado": 1600,
                "valor_total": 25000.50,

                "notas": [
                {"numero_nota": 123456789, 
                "serie_nota": 1, 
                "chave_nota": "12345678901234567890123456789012345678901234", 
                "data_emissao_nota": "2025-08-20",
                "sla": "2025-08-22",
                "tipo": "E(entrega), T(tranferencia), D(despacho)",
                "cte_numero": "Numero_CTE",
                "cte_key": "Chave CTe",
                "minuta": "numero da minuta se ouver",
                "emissor_documento": "emissor_documento",
                "destinatario_nome" : "destinatario_nome",
                "destinatario_doc": "destinatario_doc",
                "destinatario_numero": "10",
                "destinatario_rua": "Rua do Destinatario",
                "destinatario_cep": "00000-000",
                "destinatario_bairro": "bairro do destinatario",
                "destinatario_municipio": "municipio do destinatario",
                "destinatario_estado": "rj"
                }
                ],
                "coleta": [
                {"numero_coleta": 123456789,
                "solicitante_usuario": "João Silva",
                "data_solicitacao": "2025-08-20",
                "hora_solicitacao": "12:55",
                "local_coleta": "empresa onde sera coleta ",
                "rua": "Endereço da coleta ",
                "numero": "numero Local de coleta",
                "cidade": "cidade Local de coleta",
                "cep": "cep local de coleta",
                "municipio": "municipio local de coleta",
                "telefone": "numero telefone local de coleta"     
                }
                ],
                "motorista": [
                {"nome": "nome motorista",
                "cpf": "cpf motorista"         
                }
                ]
                
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
