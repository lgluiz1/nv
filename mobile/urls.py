# mobile/urls.py

from django.urls import path
from . import views

urlpatterns = [
    # Rota raiz do PWA (pode ser / ou /app/)
    path('', views.app_view, name='app_home'), 
    
    # Rota específica de Login
    path('login/', views.login_view, name='app_login'),
    path('api/v1/save-webpush/', views.save_webpush_token, name='save_webpush_custom'),
    
    # Outras rotas do PWA podem ser adicionadas aqui
]