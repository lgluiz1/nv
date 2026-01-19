from django.shortcuts import render
from django.http import JsonResponse
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login
from usuarios.models import Motorista
from manifesto.models import Manifesto, Ocorrencia , NotaFiscal , BaixaNF , ManifestoBuscaLog, HistoricoOcorrencia
import json
from django.views.generic import TemplateView
from django.utils.decorators import method_decorator
from django.contrib.auth.decorators import login_required
from usuarios.decorators import apenas_operacional
from django.utils import timezone
from datetime import timedelta
from django.db.models import Count, Q, Sum


def login_operacional_view(request):
    if request.method == 'GET':
        return render(request, 'desktop/login.html')

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            cpf = data.get('cpf', '').replace('.', '').replace('-', '')
            senha = data.get('senha')
            acao = data.get('acao') # 'verificar' ou 'cadastrar' ou 'login'

            try:
                perfil = Motorista.objects.get(cpf=cpf)
            except Motorista.DoesNotExist:
                return JsonResponse({'status': 'erro', 'message': 'CPF não registrado. Entre em contato com o time de cadastro.'}, status=404)

            # 1. Verifica se é OPERACIONAL
            if perfil.tipo_usuario != 'OPERACIONAL':
                return JsonResponse({'status': 'erro', 'message': 'Este acesso é restrito ao time operacional.'}, status=403)

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
        context['usuario_nome'] = self.request.user.get_full_name() or self.request.user.username
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