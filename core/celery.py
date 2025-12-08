# core/celery.py

import os
from celery import Celery

# Define o projeto de configurações como 'core.settings'
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

# Nomeia a aplicação Celery como 'core'
app = Celery('core')

# Carrega a configuração do Celery a partir do settings.py (prefixo 'CELERY_').
app.config_from_object('django.conf:settings', namespace='CELERY')

# Descobre tarefas automaticamente nas apps instaladas
app.autodiscover_tasks()