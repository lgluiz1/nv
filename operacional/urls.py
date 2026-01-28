# operacional/urls.py
from django.urls import path
from operacional.views import DashboardView, login_operacional_view, NotasFiscaisListView ,detalhes_nota_fiscal_view, ManifestosMonitoramentoView
from operacional.rotas import buscar_e_importar_nfe, listar_manifestos_select, sincronizar_nota_tms_view
app_name = 'operacional'


urlpatterns = [
    # Coloque o login na raiz ou em /login/
    path('login/', login_operacional_view, name='login_operacional'),
    path('dashboard/', DashboardView.as_view(), name='dashboard'),

    path('notas-fiscais/', NotasFiscaisListView.as_view(), name='notas_fiscais'),
    path('api/manifesto/detalhes-nota/<int:nota_id>/', detalhes_nota_fiscal_view, name='detalhes_nota_fiscal'),
    path('api/manifesto/buscar-importar/', buscar_e_importar_nfe, name='buscar_e_importar_nfe'),
    path('manifesto/', ManifestosMonitoramentoView.as_view(), name='manifesto_detalhes'),
    path('api/manifesto/sincronizar-nota/<int:nota_id>/', sincronizar_nota_tms_view, name='sincronizar_nota_tms'),
    path('api/manifesto/listar-para-select/', listar_manifestos_select, name='listar_manifestos_select'),

]