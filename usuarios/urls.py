# usuarios/urls.py
# Vem de path('auth/', include(('usuarios.urls', 'usuarios'), namespace='usuarios')),
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import PerfilMotoristaView
from .views import PerfilMotoristaView, CustomTokenRefreshView

urlpatterns = [
    # 1. Rota de Login: Recebe CPF (username) e Senha. Retorna Token.
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    
    # 2. Rota de Renovação: Usa o Refresh Token para obter um novo Access Token.
    #    Isso é o que mantém o motorista "sempre logado" sem digitar senha.
    path('token/refresh/', CustomTokenRefreshView.as_view(), name='token_refresh'),
    
    # 3. Rota de Validação/Perfil: Para o App confirmar quem é o usuário e buscar seus dados.
    path('perfil/', PerfilMotoristaView.as_view(), name='motorista_perfil'),
]