# manifestos/urls.py

from django.urls import path
from .views import (
    ManifestoBuscaView, BaixaNFView, 
    ManifestoFinalizacaoView, OcorrenciaListView
)

urlpatterns = [
    # Rotas de Manifesto e Status
    path('manifesto/status/', ManifestoBuscaView.as_view(), name='manifesto_status'),
    path('manifesto/busca/', ManifestoBuscaView.as_view(), name='manifesto_busca'),
    path('manifesto/finalizar/', ManifestoFinalizacaoView.as_view(), name='manifesto_finalizar'),
    
    # Rota de Baixa (pk é o ID interno da NotaFiscal)
    path('nf/<int:pk>/baixa/', BaixaNFView.as_view(), name='nf_baixa'),
    
    # Lista de Códigos de Ocorrência (para o PWA popular o modal)
    path('ocorrencias/', OcorrenciaListView.as_view(), name='ocorrencia_list'),
]