# botWhatsapp/services/media.py

import requests
from django.core.files.base import ContentFile
from django.conf import settings


def baixar_midia_whatsapp(media_id):
    url = f"{settings.MEGA_API_BASE_URL}/rest/getMedia/{settings.MEGA_API_INSTANCE}/{media_id}"

    headers = {
        "Authorization": f"Bearer {settings.MEGA_API_TOKEN}"
    }

    response = requests.get(url, headers=headers)
    response.raise_for_status()

    return ContentFile(
        response.content,
        name=f"{media_id}.jpg"
    )
