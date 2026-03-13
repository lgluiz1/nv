from celery import shared_task
import requests
import json

@shared_task(bind=True, max_retries=3)
def buscar_nfe_tms_task(self, numero_nfe):
    from configuracao.utils import get_config
    config = get_config()

    url = f"https://{config.dominio_esl}/api/analytics/reports/{config.report_busca_nfe}/data"

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
        "Authorization": f"Bearer {config.token_analytics}"
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
