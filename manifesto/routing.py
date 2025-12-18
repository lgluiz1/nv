from django.urls import re_path
from .consumers import ManifestoConsumer

websocket_urlpatterns = [
    re_path(r'ws/manifesto/(?P<motorista_id>\d+)/$', ManifestoConsumer.as_asgi()),
]
