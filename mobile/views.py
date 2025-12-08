# mobile/views.py

from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache

# Rota para a tela de Login (Acesso público)
@never_cache
def login_view(request):
    """Serve a página de login para o PWA."""
    # O caminho do template é relativo à sua pasta 'templates'
    return render(request, 'aplicativo/login_motorista/login.html')


# Rota para a tela principal do PWA (Requer autenticação)
#@login_required 
@never_cache
def app_view(request):
    """Serve a página principal do PWA (Manifesto, Baixa, etc.)."""
    return render(request, 'aplicativo/manifesto.html')

# Nota: A autenticação (login_required) aqui é apenas para evitar que 
# a página seja vista. A verdadeira segurança da aplicação está nas 
# Views da API, que requerem o token JWT.