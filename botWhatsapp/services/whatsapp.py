# Funções para enviar mensagens via WhatsApp

import requests
from django.conf import settings
from botWhatsapp.models import WhatsAppUser, Agente
import http.client, json

def enviar_whatsapp(phone, mensagem):
    token = "MVKaIrTlo56"
    instancia = "megacode-MVKaIrTlo56"


    conn = http.client.HTTPSConnection("apinocode02.megaapi.com.br")
    payload = json.dumps({
    "messageData": {
        "to": f"{phone}@s.whatsapp.net",
        "text": f"{mensagem}"
    }
    })
    headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
    }
    conn.request("POST", f"/rest/sendMessage/{instancia}/text", payload, headers)
    res = conn.getresponse()
    data = res.read()

    # Opcional: imprimir a resposta para depuração se necessário
    if res.status != 200:
        print(f"Erro ao enviar mensagem: {res.status} - {data.decode('utf-8')}")