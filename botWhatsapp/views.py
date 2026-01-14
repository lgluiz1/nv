import json
import logging
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from botWhatsapp.models import WhatsAppUser
from botWhatsapp.services.whatsapp import enviar_whatsapp
from botWhatsapp.services.flow import processar_mensagem
import pprint

logger = logging.getLogger("botWhatsapp")

@csrf_exempt
def webhook_whatsapp(request):
    print("\n🚨 WEBHOOK ACESSADO 🚨")
    print("➡ Método:", request.method)

    if request.method != "POST":
        return JsonResponse({"ok": True})

    try:
        data = json.loads(request.body.decode("utf-8"))
        print("📦 JSON RECEBIDO:")
        pprint.pprint(data)
    except Exception as e:
        print("❌ ERRO AO LER JSON:", str(e))
        return JsonResponse({"error": "json inválido"}, status=400)

    # =====================================================
    # 🚫 PRODUÇÃO (DESATIVADO PARA TESTES)
    # =====================================================
    """
    if data.get("key", {}).get("fromMe") is True:
        print("🔁 Mensagem do próprio bot ignorada (produção)")
        return JsonResponse({"ok": True})
    """

    # =====================================================
    # 👥 IGNORA GRUPOS (PODE COMENTAR SE QUISER TESTAR)
    # =====================================================
    """
    if data.get("isGroup") is True:
        print("👥 Mensagem de grupo ignorada")
        return JsonResponse({"ok": True})
    """
    
    # =====================================================
    # 📞 DADOS PRINCIPAIS
    # =====================================================
    phone = data.get("jid")
    message_type = data.get("messageType")
    from_me = data.get("key", {}).get("fromMe", False)

    # =====================================================
    # 🔁 IGNORA MENSAGEM DO PRÓPRIO BOT (ANTI-LOOP)
    # =====================================================
    if from_me:
        print("🔁 Mensagem do próprio bot — não responder para evitar loop")
        return JsonResponse({"status": "ignored (fromMe)"}, status=200)

    # =====================================================
    # 💬 CONTEÚDO
    # =====================================================
    texto = None
    midia = None

    # =====================================================
    # 💬 TEXTO
    # =====================================================
    if message_type == "conversation":
        texto = data.get("message", {}).get("conversation")

    # =====================================================
    # 🖼️ IMAGEM
    # =====================================================
    elif message_type == "imageMessage":
        midia = data.get("message", {}).get("imageMessage", {}).get("url")

    print("📞 Usuário (jid):", phone)
    print("🤖 Mensagem enviada pelo bot?:", from_me)
    print("💬 Texto:", texto)
    print("🖼️ Mídia:", midia)

    # =====================================================
    # 👤 USUÁRIO WHATSAPP
    # =====================================================
    user, created = WhatsAppUser.objects.get_or_create(
        phone=phone,
        defaults={"estado": "NOVO"}
    )

    if created:
        print("🆕 Usuário criado:", phone)
    else:
        print("♻️ Usuário existente:", phone)

    # =====================================================
    # 🔄 PROCESSA FLUXO
    # =====================================================
    resposta = processar_mensagem(user, texto, midia)

    # =====================================================
    # 📤 RESPONDE (INCLUSIVE PARA ELE MESMO)
    # =====================================================
    if resposta:
        print("📤 Enviando resposta:", resposta)
        enviar_whatsapp(phone, resposta)

    print("✅ WEBHOOK FINALIZADO COM SUCESSO")
    return JsonResponse({"ok": True})
