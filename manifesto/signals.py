
from django.db.models.signals import post_save
from django.dispatch import receiver
from manifesto.models import BaixaNF
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

@receiver(post_save, sender=BaixaNF)
def atualizar_painel_monitoramento(sender, instance, created, **kwargs):
    if created:
        nf = instance.nota_fiscal
        manifesto = nf.manifesto
        
        # Contagem total (NF-e + Minutas)
        total_notas = manifesto.notas_fiscais.count()
        notas_baixadas = manifesto.notas_fiscais.filter(status__in=['BAIXADA', 'OCORRENCIA']).count()
        
        # Descrição do evento
        descricao_evento = instance.ocorrencia.descricao if instance.ocorrencia else "Baixa realizada"
        
        # Cálculo da porcentagem de conclusão do manifesto
        porcentagem = int((notas_baixadas / total_notas) * 100) if total_notas > 0 else 0
        
        # Identificador do documento (Chave ou Número)
        documento_identificador = nf.chave_acesso if nf.chave_acesso else f"Minuta {nf.numero_nota}"

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "painel_monitoramento",
            {
                "type": "atualizar_painel",
                "data": {
                    "manifesto_id": manifesto.numero_manifesto,
                    "porcentagem": porcentagem,
                    "baixadas": notas_baixadas,
                    "status": manifesto.status,
                    "lat": float(instance.latitude) if instance.latitude else None,
                    "lng": float(instance.longitude) if instance.longitude else None,
                    "motorista_id": manifesto.motorista.id,
                    "motorista_nome": manifesto.motorista.nome_completo if manifesto.motorista else "Não identificado",
                    "ultimo_evento": descricao_evento,
                    "documento": documento_identificador, # Mostra qual nota/minuta foi
                    "foto_url": instance.comprovante_foto_url, # Para o painel abrir a foto direto
                    "hora_baixa": instance.data_baixa.strftime('%H:%M:%S')
                }
            }
        )