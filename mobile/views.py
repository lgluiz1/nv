# mobile/views.py

from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken
from usuarios.models import Motorista
from manifesto.models import Ocorrencia

# Rota para a tela de Login (Acesso público)
@never_cache
def login_view(request):
    """Serve a página de login para o PWA."""
    # O caminho do template é relativo à sua pasta 'templates'
    return render(request, 'aplicativo/login_motorista/login.html')


# Rota para a tela principal do PWA (Requer autenticação)
#@login_required 
def app_view(request):
    # Ocorrências de sucesso (Entrega)
    sucesso = Ocorrencia.objects.filter(codigo_tms__in=['1', '2']).order_by('codigo_tms')
    
    # Ocorrências de problema (Não Entrega) - Excluímos a 1 e 2
    problemas = Ocorrencia.objects.exclude(codigo_tms__in=['1', '2']).order_by('codigo_tms')

    # Cia aera e rodoviaria
    cias = Ocorrencia.objects.filter(codigo_tms__in=['50', '51']).order_by('codigo_tms')
    
    return render(request, 'aplicativo/manifesto.html', {
        'sucesso': sucesso,
        'problemas': problemas,
        'cia': cias
    })
# Nota: A autenticação (login_required) aqui é apenas para evitar que 
# a página seja vista. A verdadeira segurança da aplicação está nas 
# Views da API, que requerem o token JWT.