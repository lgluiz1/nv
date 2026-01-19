from django.shortcuts import redirect
from django.contrib import messages
from functools import wraps


def apenas_operacional(view_func):
    """
    Decorator para garantir que apenas usuários com o tipo_usuario 'OPERACIONAL'
    possam acessar determinadas views.
    """
    @wraps(view_func)
    def _wrapped_view(request, *args, **kwargs):
        # 1. Verifica se o usuário está logado
        if not request.user.is_authenticated:
            return redirect('login_operacional') # Redireciona para sua página de login

        # 2. Verifica se o perfil existe e se é do tipo OPERACIONAL
        # Usando o related_name 'motorista_perfil' que está no seu model
        try:
            if request.user.motorista_perfil.tipo_usuario == 'OPERACIONAL':
                return view_func(request, *args, **kwargs)
            else:
                # Se for MOTORISTA tentando acessar área administrativa
                messages.error(request, "Acesso negado. Esta área é restrita à equipe operacional.")
                return redirect('app_home') # Redireciona para o App do motorista
        except Exception:
            # Caso o usuário não tenha um perfil vinculado
            messages.error(request, "Usuário sem perfil operacional vinculado.")
            return redirect('login_operacional')

    return _wrapped_view