from django.db.models.signals import post_save
from django.dispatch import receiver
from manifesto.models import BaixaNF
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


@receiver(post_save, sender=BaixaNF)
def atualizar_painel_monitoramento(sender, instance, created, **kwargs):
    if created:
        manifesto = instance.nota_fiscal.manifesto
        total_notas = manifesto.notas_fiscais.count()
        notas_baixadas = manifesto.notas_fiscais.filter(status__in=['BAIXADA', 'OCORRENCIA']).count()
        # Pegamos a descrição de forma segura
        descricao_evento = instance.ocorrencia.descricao if instance.ocorrencia else "Baixa realizada"
        # Cálculo da porcentagem
        porcentagem = int((notas_baixadas / total_notas) * 100) if total_notas > 0 else 0
        
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "painel_monitoramento",
            {
                "type": "atualizar_painel",
                "data": {
                    "manifesto_id": manifesto.numero_manifesto,
                    "porcentagem": porcentagem,
                    "status": manifesto.status,
                    "lat": float(instance.latitude) if instance.latitude else None,
                    "lng": float(instance.longitude) if instance.longitude else None,
                    "motorista_id": manifesto.motorista.id,
                    "ultimo_evento": descricao_evento
                }
            }
        )