from django.shortcuts import render
from django.contrib.auth.decorators import login_required # Import correto para funções
from django.utils import timezone
from manifesto.models import Manifesto, NotaFiscal
from django.db.models import Count, Q

@login_required(login_url='/login/') # Garante que só acessa se estiver logado
def painel_monitoramento(request):
    hoje = timezone.now().date()
    
    # Buscamos manifestos de hoje (Ativos)
    # Note que usei 'notas_fiscais' que deve ser o related_name no seu model
    manifestos = Manifesto.objects.filter(
        status='EM_TRANSPORTE' 
    ).select_related('motorista', 'filial').annotate(
        total_nfe=Count('notas_fiscais'),
        baixadas=Count('notas_fiscais', filter=Q(notas_fiscais__status__in=['BAIXADA', 'OCORRENCIA']))
    ).order_by('filial', 'motorista__user__first_name')

    context = {
        'manifestos': manifestos,
        'hoje': hoje,
        'titulo': 'Painel de Monitoramento',
        'usuario_nome': request.user.get_full_name() or request.user.username,
    }
    return render(request, 'desktop/paginas/painel/monitoramento.html', context)