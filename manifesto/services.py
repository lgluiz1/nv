from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

channel_layer = get_channel_layer()

def enviar_painel(manifesto):
    total = manifesto.notas_fiscais.count()

    baixadas = manifesto.notas_fiscais.filter(
        status__in=['BAIXADA', 'OCORRENCIA']
    ).count()

    porcentagem = int((baixadas / total) * 100) if total else 0
    total_notas = total

    remover = manifesto.status != 'EM_TRANSPORTE'
    print("WS ENVIANDO -> TOTAL:", total, "BAIXADAS:", baixadas)
    
    async_to_sync(channel_layer.group_send)(
        "painel_monitoramento",
        {
            "type": "atualizar_painel",
            "data": {
                "manifesto_id": str(manifesto.numero_manifesto),
                "baixadas": baixadas,
                "porcentagem": porcentagem,
                "motorista_nome": manifesto.motorista.nome_completo,
                "remover": remover,
                "total": total_notas, 
            }
        }
    )
