# manifesto/urls.py
from django.urls import path
from manifesto.rotas.busca import BuscarManifestoView
from manifesto.rotas.status import StatusBuscaManifestoView
from manifesto.rotas.iniciar_transporte import IniciarTransporteView
from manifesto.rotas.init import AppInitView
from manifesto.rotas.preview import StatusPreviewManifestoView
from manifesto.rotas.listagem import ListarNotasManifestoView
from manifesto.rotas.verificacao import VerificarManifestoAtivoView
from manifesto.rotas.baixa import RegistrarBaixaView
from manifesto.rotas.motorista_perfil import perfil_motorista
from manifesto.views import ManifestoFinalizacaoView

urlpatterns = [
    path('manifesto/busca/', BuscarManifestoView.as_view()),
    path('manifesto/status/', StatusBuscaManifestoView.as_view()),
    path('manifesto/iniciar/', IniciarTransporteView.as_view()),
    path('app/init/', AppInitView.as_view()),
    path('manifesto/preview/', StatusPreviewManifestoView.as_view()),
    path('manifesto/notas/', ListarNotasManifestoView.as_view()),
    path('manifesto/verificar-ativo/', VerificarManifestoAtivoView.as_view()),
    path('manifesto/registrar-baixa/', RegistrarBaixaView.as_view()),
    path('motorista/perfil/', perfil_motorista, name='motorista_perfil'),
    path('manifesto/finalizar/', ManifestoFinalizacaoView.as_view()),

]
