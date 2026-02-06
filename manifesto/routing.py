from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # O correto para Channels é .as_asgi()
    re_path(r'ws/painel-logistico/$', consumers.MonitoramentoConsumer.as_asgi()),
]