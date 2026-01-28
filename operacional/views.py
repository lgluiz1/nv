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
from django.db.models.functions import ExtractHour
from usuarios.decorators import apenas_operacional
from django.utils import timezone
from datetime import timedelta
from django.db.models import Count, Q, Sum
from django.views.generic import ListView
from collections import defaultdict

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
        from collections import defaultdict

        baixas_hoje = BaixaNF.objects.filter(
            data_baixa__range=(hoje_inicio, hoje_fim)
        )

        contador_por_hora = defaultdict(int)

        for baixa in baixas_hoje:
            hora_local = timezone.localtime(baixa.data_baixa).hour
            contador_por_hora[hora_local] += 1

        horas_labels = [f"{h:02d}:00" for h in range(8, 21)]

        acumulado = 0
        valores_finais = []

        for h in range(8, 21):
            acumulado += contador_por_hora.get(h, 0)
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

import pytz
from datetime import datetime, time
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
        queryset = Manifesto.objects.select_related('motorista', 'filial').annotate(
            total_notas=Count('notas_fiscais'),
            notas_concluidas=Count(
                'notas_fiscais', 
                filter=Q(notas_fiscais__status__in=['BAIXADA', 'OCORRENCIA'])
            )
        ).order_by('-data_criacao')

        # Filtros
        filial_id = self.request.GET.get('filial')
        numero = self.request.GET.get('numero')
        motorista = self.request.GET.get('motorista')
        data_str = self.request.GET.get('data')

        if filial_id:
            queryset = queryset.filter(filial_id=filial_id)
        
        if numero:
            queryset = queryset.filter(numero_manifesto__icontains=numero)
        
        if motorista:
            queryset = queryset.filter(motorista__nome_completo__icontains=motorista)
        
        if data_str:
            try:
                # 1. Converte a string do input (YYYY-MM-DD) para objeto date
                data_foco = datetime.strptime(data_str.strip(), '%Y-%m-%d').date()
                
                # 2. Define o fuso horário de Brasília
                tz = pytz.timezone('America/Sao_Paulo')
                
                # 3. Cria o range: de 00:00:00 até 23:59:59 no horário de Brasília
                # O Django converterá isso para UTC automaticamente ao consultar o banco
                inicio_dia = tz.localize(datetime.combine(data_foco, time.min))
                fim_dia = tz.localize(datetime.combine(data_foco, time.max))
                
                # 4. Filtra pelo intervalo (muito mais seguro que __date)
                queryset = queryset.filter(data_criacao__range=(inicio_dia, fim_dia))
                
            except (ValueError, TypeError):
                pass

        return queryset
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Manter os valores dos filtros no contexto para o formulário não resetar
        context['filiais'] = Filial.objects.all().order_by('nome')
        context['titulo'] = "Monitoramento de Manifestos"
        context['usuario_nome'] = self.request.user.get_full_name() or self.request.user.username
        
        # Opcional: passa os filtros atuais para o template (útil para manter o estado dos inputs)
        context['filtro_data'] = self.request.GET.get('data', '')
        context['filtro_numero'] = self.request.GET.get('numero', '')
        
        return context
    
@login_required
def detalhes_manifesto_modal_view(request, manifesto_id):
    # Busca o manifesto e faz o prefetch das notas e baixas para ser rápido
    from manifesto.models import Manifesto, NotaFiscal
    from django.db.models import Count, Q
    from django.shortcuts import get_object_or_404

    manifesto = get_object_or_404(Manifesto, id=manifesto_id)
    notas = NotaFiscal.objects.filter(manifesto=manifesto)
    
    total_notas = notas.count()
    concluidas = notas.filter(status='BAIXADA').count()
    
    # Cálculo da percentagem com segurança para não dividir por zero
    progresso = (concluidas / total_notas * 100) if total_notas > 0 else 0
    
    context = {
        'manifesto': manifesto,
        'notas': notas,
        'total_notas': total_notas,
        'concluidas': concluidas,
        'progresso': int(progresso)
    }
    return render(request, 'desktop/parciais/detalhes_manifesto_modal.html', context)

@login_required
def editar_manifesto_modal_view(request, manifesto_id):
    from manifesto.models import Manifesto, Motorista, Filial
    
    manifesto = get_object_or_404(Manifesto, id=manifesto_id)
    motoristas = Motorista.objects.all().order_by('nome_completo')
    filiais = Filial.objects.all().order_by('nome')
    
    context = {
        'manifesto': manifesto,
        'motoristas': motoristas,
        'filiais': filiais,
    }
    return render(request, 'desktop/parciais/editar_manifesto_modal.html', context)

from django.views.decorators.http import require_POST

@login_required
@require_POST
def salvar_edicao_manifesto_view(request, manifesto_id):
    """
    Processa a atualização dos dados do manifesto via AJAX.
    Trava campos sensíveis e valida a integridade dos KMs.
    """
    manifesto = get_object_or_404(Manifesto, id=manifesto_id)
    
    try:
        # 1. Captura de dados do POST
        status_post = request.POST.get('status')
        filial_id = request.POST.get('filial')
        km_ini_raw = request.POST.get('km_inicial')
        km_fin_raw = request.POST.get('km_final')
        foi_finalizado = request.POST.get('finalizado') == 'on'

        # 2. Conversão e Validação de KMs
        # Substituímos vírgula por ponto para evitar erro de conversão
        km_inicial = float(km_ini_raw.replace(',', '.')) if km_ini_raw else 0.0
        km_final = float(km_fin_raw.replace(',', '.')) if km_fin_raw else 0.0

        if km_final > 0 and km_final < km_inicial:
            return JsonResponse({
                'success': False, 
                'message': f'Erro: KM Final ({km_final}) não pode ser menor que o Inicial ({km_inicial}).'
            }, status=400)

        # 3. Atualização dos campos permitidos
        manifesto.status = status_post
        manifesto.km_inicial = km_inicial if km_ini_raw else None
        manifesto.km_final = km_final if km_fin_raw else None
        
        if filial_id:
            manifesto.filial_id = filial_id

        # 4. Lógica de Status e Datas de Finalização
        # Se o checkbox de finalizar foi marcado agora
        if foi_finalizado and not manifesto.finalizado:
            manifesto.finalizado = True
            manifesto.data_finalizacao = timezone.now()
            manifesto.status = 'FINALIZADO'
        
        # Se o checkbox foi desmarcado (reabertura de manifesto)
        elif not foi_finalizado and manifesto.finalizado:
            manifesto.finalizado = False
            manifesto.data_finalizacao = None
            # Se estava FINALIZADO, volta para EM_TRANSPORTE ao reabrir
            if manifesto.status == 'FINALIZADO':
                manifesto.status = 'EM_TRANSPORTE'

        # 5. Salva no Banco de Dados
        manifesto.save()

        return JsonResponse({
            'success': True, 
            'message': 'Manifesto atualizado com sucesso!',
            'novo_status': manifesto.get_status_display()
        })

    except ValueError:
        return JsonResponse({
            'success': False, 
            'message': 'Erro: Os valores de KM devem ser números válidos.'
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False, 
            'message': f'Erro inesperado: {str(e)}'
        }, status=500)