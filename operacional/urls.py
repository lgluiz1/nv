# operacional/urls.py
from django.urls import path
from operacional.views import DashboardView, login_operacional_view, NotasFiscaisListView ,detalhes_nota_fiscal_view, ManifestoDetailView
app_name = 'operacional'

urlpatterns = [
    # Coloque o login na raiz ou em /login/
    path('login/', login_operacional_view, name='login_operacional'),
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('notas-fiscais/', NotasFiscaisListView.as_view(), name='notas_fiscais'),
    path('api/manifesto/detalhes-nota/<int:nota_id>/', detalhes_nota_fiscal_view, name='detalhes_nota_fiscal'),
    
    path('manifesto/', ManifestoDetailView.as_view(), name='manifesto_detalhes'),

]