# core/urls/auth.py
from django.urls import path
from usuarios.views_login.auth_views import (
    VerificarCPFView,
    PrimeiroAcessoView,
    MeView
)
from rest_framework_simplejwt.views import TokenObtainPairView  # JWT view

urlpatterns = [
    path('verificar-cpf/', VerificarCPFView.as_view(), name='verificar-cpf'),
    path('primeiro-acesso/', PrimeiroAcessoView.as_view(), name='primeiro-acesso'),
    path('login/', TokenObtainPairView.as_view(), name='login'),  # Aqui está sua URL de login
    path('me/', MeView.as_view(), name='me'),
]
