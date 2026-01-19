# operacional/urls.py
from django.urls import path
from operacional.views import DashboardView, login_operacional_view

app_name = 'operacional'

urlpatterns = [
    # Coloque o login na raiz ou em /login/
    path('login/', login_operacional_view, name='login_operacional'),
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
]