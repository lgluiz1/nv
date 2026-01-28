from django.shortcuts import render, redirect
from django.db import transaction
from django.http import JsonResponse
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login
from usuarios.models import Motorista , Filial
from manifesto.models import Manifesto, Ocorrencia , NotaFiscal , BaixaNF , ManifestoBuscaLog, HistoricoOcorrencia
import json
from django.views.generic import TemplateView
from django.utils.decorators import method_decorator
from django.contrib.auth.decorators import login_required
from usuarios.decorators import apenas_operacional
from django.utils import timezone
from datetime import timedelta
from django.db.models import Count, Q, Sum
from django.views.generic import ListView

def login_operacional_view(request):
    # ✅ NOVO: Se o usuário já estiver logado e for OPERACIONAL, manda direto pro dashboard
    if request.method == 'GET':
        if request.user.is_authenticated:
            try:
                # Verifica se o perfil vinculado ao usuário é OPERACIONAL
                if request.user.motorista_perfil.tipo_usuario == 'OPERACIONAL':
                    return redirect('/dashboard/') 
            except Exception:
                # Se não tiver perfil ou for motorista, deixa carregar o login 
                # (ou você pode dar logout para limpar a sessão do motorista aqui)
                pass
        return render(request, 'desktop/login.html')

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            cpf = data.get('cpf', '').replace('.', '').replace('-', '')
            senha = data.get('senha')
            acao = data.get('acao') 

            try:
                # Busca o perfil pelo CPF
                perfil = Motorista.objects.get(cpf=cpf)
            except Motorista.DoesNotExist:
                return JsonResponse({'status': 'erro', 'message': 'CPF não registrado.'}, status=404)

            # 1. Verifica se é OPERACIONAL (Segurança extra)
            if perfil.tipo_usuario != 'OPERACIONAL':
                return JsonResponse({'status': 'erro', 'message': 'Acesso restrito ao operacional.'}, status=403)

            # 2. Lógica de Verificação Inicial
            if acao == 'verificar':
                if not perfil.user or not perfil.user.has_usable_password():
                    return JsonResponse({'status': 'novo_usuario', 'nome': perfil.nome_completo})
                else:
                    return JsonResponse({'status': 'usuario_registrado', 'nome': perfil.nome_completo})

            # 3. Lógica de Cadastro de Senha
            if acao == 'cadastrar':
                if not perfil.user:
                    user = User.objects.create_user(username=cpf, password=senha)
                    perfil.user = user
                    perfil.save()
                else:
                    perfil.user.set_password(senha)
                    perfil.user.save()
                
                login(request, perfil.user)
                return JsonResponse({'status': 'sucesso', 'url': '/dashboard/'})

            # 4. Lógica de Login Comum
            if acao == 'login':
                user = authenticate(request, username=cpf, password=senha)
                if user:
                    login(request, user)
                    return JsonResponse({'status': 'sucesso', 'url': '/dashboard/'})
                else:
                    return JsonResponse({'status': 'erro', 'message': 'Senha incorreta.'}, status=401)

        except Exception as e:
            return JsonResponse({'status': 'erro', 'message': str(e)}, status=500)


@method_decorator(login_required, name='dispatch')
@method_decorator(apenas_operacional, name='dispatch')
class DashboardView(TemplateView):
    template_name = 'desktop/paginas/dashboard.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        hoje_inicio = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        hoje_fim = hoje_inicio + timedelta(days=1)

        # Pega nome e foto do usuario logado
        context['usuario_nome'] = self.request.user.get_full_name() or self.request.user.last_name or self.request.user.username
        context['usuario_foto'] = ''
        try:
            perfil = Motorista.objects.get(user=self.request.user)
            if perfil.foto_perfil:
                context['usuario_foto'] = perfil.foto_perfil.url
        except Motorista.DoesNotExist:
            pass

        # --- 1. CARDS DE RESUMO ---
        # Filtramos manifestos do dia para basear as notas
        manifestos_do_dia = Manifesto.objects.filter(data_criacao__range=(hoje_inicio, hoje_fim))
        notas_do_dia = NotaFiscal.objects.filter(manifesto__in=manifestos_do_dia)

        context['mfts_ativos'] = Manifesto.objects.filter(status='EM_TRANSPORTE').count()
        context['total_notas'] = notas_do_dia.filter(status='BAIXADA').count()
        context['notas_ocorrencia'] = notas_do_dia.filter(status='OCORRENCIA').count()
        # Pega todas as notas em transporte junto com as que foram baixadas e com ocorrencias 
        


        # --- 2. TOP PERFORMANCE (MOTORISTAS REAIS) ---
        # Pegamos motoristas que tiveram notas baixadas hoje
        top_motoristas = (
            Motorista.objects.filter(manifestos__in=manifestos_do_dia)
            .annotate(
                total=Count('manifestos__notas_fiscais'),
                entregues=Count('manifestos__notas_fiscais', filter=Q(manifestos__notas_fiscais__status__in=['BAIXADA', 'OCORRENCIA'])),
            )
            .filter(total__gt=0)
            .order_by('-entregues')[:5] # Top 5
        )

        # Calculamos o percentual para cada um
        for m in top_motoristas:
            m.percentual = int((m.entregues / m.total) * 100) if m.total > 0 else 0
            m.ultimo_mft = m.manifestos.filter(data_criacao__range=(hoje_inicio, hoje_fim)).last()

        context['top_motoristas'] = top_motoristas

        # --- 3. DADOS DO GRÁFICO (ENTREGAS POR HORA) ---
        # Agrupamos as baixas de hoje por hora
        baixas_hoje = (
            BaixaNF.objects.filter(data_baixa__range=(hoje_inicio, hoje_fim))
            .extra(select={'hora': "HOUR(data_baixa)"})
            .values('hora')
            .annotate(qtd=Count('id'))
            .order_by('hora')
        )

        # Preparamos listas para o Chart.js
        # Criamos um range de 08:00 às 20:00 para o gráfico não ficar vazio
        horas_labels = [f"{h:02d}:00" for h in range(8, 21)]
        valores_dict = {f"{b['hora']:02d}:00": b['qtd'] for b in baixas_hoje}
        
        # Acumulamos os valores para criar a linha ascendente igual ao seu print
        acumulado = 0
        valores_finais = []
        for h in horas_labels:
            acumulado += valores_dict.get(h, 0)
            valores_finais.append(acumulado)

        context['grafico_labels'] = json.dumps(horas_labels)
        context['grafico_valores'] = json.dumps(valores_finais)
        
        context['titulo'] = "Painel de Controle Operacional"
        context['usuario_nome'] = self.request.user.get_full_name() or self.request.user.username
        return context



@method_decorator(login_required, name='dispatch')
@method_decorator(apenas_operacional, name='dispatch')
class NotasFiscaisListView(TemplateView):
    template_name = 'desktop/paginas/notas_fiscais.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # Inicia a query com todos os registros otimizados
        queryset = NotaFiscal.objects.select_related(
            'manifesto', 'manifesto__motorista'
        ).prefetch_related(
            'baixa_info', 'baixa_info__ocorrencia'
        ).order_by('-manifesto__data_criacao')

        

        # --- LÓGICA DE FILTROS ---
        q = self.request.GET.get('q') # Busca Geral (NF ou Chave)
        motorista = self.request.GET.get('motorista')
        manifesto = self.request.GET.get('manifesto')
        integrado = self.request.GET.get('integrado')
        data_inicio = self.request.GET.get('data_inicio')

        if q:
            queryset = queryset.filter(
                Q(numero_nota__icontains=q) | Q(chave_acesso__icontains=q)
            )
        
        if motorista:
            queryset = queryset.filter(manifesto__motorista__nome_completo__icontains=motorista)
            
        if manifesto:
            queryset = queryset.filter(manifesto__numero_manifesto__icontains=manifesto)

        if integrado:
            is_integrado = integrado == 'sim'
            queryset = queryset.filter(baixa_info__integrado_tms=is_integrado)

        if data_inicio:
            queryset = queryset.filter(manifesto__data_criacao__date=data_inicio)

        context['notas'] = queryset[:100] # Limitamos a 100 para performance
        context['titulo'] = "Gestão de Notas Fiscais"
        context['usuario_nome'] = self.request.user.get_full_name() or self.request.user.username
        return context

from django.shortcuts import render, get_object_or_404
from manifesto.models import NotaFiscal

# Use os decoradores diretamente na função, sem o method_decorator
@login_required(login_url='/login/')
@apenas_operacional
def detalhes_nota_fiscal_view(request, nota_id):
    # 1. Busca a nota de referência para descobrir a chave de acesso
    nota_clicada = get_object_or_404(NotaFiscal, id=nota_id)
    
    # 2. Busca TODAS as ocorrências dessa mesma nota no sistema todo pela chave
    historico_completo = NotaFiscal.objects.filter(
        chave_acesso=nota_clicada.chave_acesso
    ).select_related(
        'manifesto', 
        'manifesto__motorista'
    ).prefetch_related(
        'baixa_info',           # Traz as informações de baixa/entrega
        'baixa_info__ocorrencia' # Traz a descrição da ocorrência
    ).order_by('-manifesto__data_criacao') # Da mais recente para a mais antiga

    context = {
        'nota_principal': nota_clicada,
        'historico': historico_completo,
    }
    
    # Retorna apenas o fragmento HTML para o modal
    return render(request, 'desktop/parciais/detalhes_nota_modal.html', context)


# Pagina Manifesto 
@method_decorator(login_required(login_url='/login/'), name='dispatch')
@method_decorator(apenas_operacional, name='dispatch')
class ManifestosMonitoramentoView(ListView):
    model = Manifesto
    template_name = 'desktop/paginas/manifesto.html'
    context_object_name = 'manifestos'
    paginate_by = 20

    def get_queryset(self):
        # Otimização: traz motorista e conta as notas em uma única query
        queryset = Manifesto.objects.select_related('motorista').annotate(
            total_notas=Count('notas_fiscais'),
            notas_concluidas=Count('notas_fiscais', filter=Q(notas_fiscais__status__in=['BAIXADA', 'OCORRENCIA']))
        ).order_by('-data_criacao')

        # Filtros
        filial_id = self.request.GET.get('filial')
        numero = self.request.GET.get('numero')
        motorista = self.request.GET.get('motorista')
        data = self.request.GET.get('data')

        if filial_id:
            queryset = queryset.filter(filial_id=filial_id)
        if numero:
            queryset = queryset.filter(numero_manifesto__icontains=numero)
        if motorista:
            queryset = queryset.filter(motorista__nome_completo__icontains=motorista)
        if data:
            queryset = queryset.filter(data_criacao__date=data)

        return queryset
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Enviamos a lista de filiais para o select do filtro
        context['filiais'] = Filial.objects.all() 
        # Titulo pagina 
        context['titulo'] = "Monitoramento de Manifestos"
        # Nome do usuario logado
        context['usuario_nome'] = self.request.user.get_full_name() or self.request.user.username
        return context