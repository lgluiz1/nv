from celery import shared_task
import requests
import json

@shared_task(bind=True, max_retries=3)
def buscar_nfe_tms_task(self, numero_nfe):
    template_id = 9873
    empresa = "quickdelivery"
    token = "zyUq31Mq6gMcYGzV4zL7HTsdnS7pULjaQoxGbkPZ1cLDoxT3d-Xukw"

    url = f"https://{empresa}.eslcloud.com.br/api/analytics/reports/{template_id}/data"

    payload = {
        "search": {
            "invoices": {
                "number": numero_nfe,
                "issue_date": "2000-01-01 - 2050-12-31"
            }
        },
        "page": "1",
        "per": "100"
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.request(
            "GET",
            url,
            headers=headers,
            data=json.dumps(payload),
            timeout=30
        )
        response.raise_for_status()

        data = response.json()

        # ESL geralmente retorna lista direta
        return data if isinstance(data, list) else []

    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
