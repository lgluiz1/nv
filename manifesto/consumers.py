
## consumers.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer


class MonitoramentoConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.group_name = "painel_monitoramento"
        print(">>> CONSUMER CONECTADO")
        # Entra no grupo do painel
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        # Sai do grupo ao fechar a página
        print(">>> CONSUMER DESCONECTADO")
        await self.channel_layer.group_discard(
            self.group_name,
            self.channel_name
        )

    # Este método recebe a mensagem do Signal (Python) e envia para o JS (Navegador)
    async def atualizar_painel(self, event):
        # Pegamos o que veio do Signal
        conteudo = event["data"]
        print(">>> EVENTO RECEBIDO NO CONSUMER")
        
        # Enviamos para o JS dentro de uma chave chamada 'dados'
        await self.send(text_data=json.dumps({
            "dados": conteudo
        }))