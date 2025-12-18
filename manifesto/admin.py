from django.contrib import admin
from django.utils.html import format_html
from unfold.admin import ModelAdmin
from .models import (
    Manifesto, NotaFiscal, Ocorrencia, BaixaNF, 
    HistoricoOcorrencia, ManifestoBuscaLog
)

@admin.register(Manifesto)
class ManifestoAdmin(ModelAdmin):
    # 'veiculo' foi removido pois não existe no seu model Manifesto
    list_display = ("numero_manifesto", "motorista", "status", "data_criacao")
    list_filter = ("status", "finalizado")
    search_fields = ("numero_manifesto", "motorista__nome_completo")

@admin.register(NotaFiscal)
class NotaFiscalAdmin(ModelAdmin):
    list_display = ("numero_nota", "manifesto", "destinatario", "status")
    search_fields = ("numero_nota", "chave_acesso", "destinatario")
    list_filter = ("status",)

@admin.register(Ocorrencia)
class OcorrenciaAdmin(ModelAdmin):
    # Alterado de 'codigo' para 'codigo_tms' conforme seu model
    list_display = ("codigo_tms", "descricao", "tipo")
    search_fields = ("codigo_tms", "descricao")
    list_filter = ("tipo",)

@admin.register(HistoricoOcorrencia)
class HistoricoOcorrenciaAdmin(ModelAdmin):
    # Alterado para os campos existentes no model
    list_display = ("nota_fiscal", "codigo_tms", "data_ocorrencia", "manifesto_evento")
    list_filter = ("data_ocorrencia",)

@admin.register(ManifestoBuscaLog)
class ManifestoBuscaLogAdmin(ModelAdmin):
    # Ajustado para os campos reais: 'criado_em' e 'status'
    list_display = ("numero_manifesto", "motorista", "status", "criado_em")
    list_filter = ("status", "criado_em")
    search_fields = ("numero_manifesto", "motorista__nome_completo")

@admin.register(BaixaNF)
class BaixaNFAdmin(ModelAdmin):
    list_display = ("get_nf", "tipo", "status_integracao", "data_baixa", "ver_mapa")
    list_filter = ("processado_tms", "tipo", "data_baixa")
    readonly_fields = ("data_integracao", "log_erro_tms", "data_baixa")
    
    actions = ["forcar_reintegracao"]

    def status_integracao(self, obj):
        if obj.processado_tms:
            return format_html('<span style="color: #10b981; font-weight: bold;">✅ Integrado</span>')
        if obj.log_erro_tms:
            return format_html('<span style="color: #ef4444; font-weight: bold;" title="{}">❌ Erro</span>', obj.log_erro_tms)
        return format_html('<span style="color: #f59e0b; font-weight: bold;">⏳ Aguardando</span>')
    status_integracao.short_description = "Status ESL"

    def get_nf(self, obj):
        return f"NF {obj.nota_fiscal.numero_nota}"
    get_nf.short_description = "Nota Fiscal"

    def ver_mapa(self, obj):
        if obj.latitude and obj.longitude:
            url = f"https://www.google.com/maps?q={obj.latitude},{obj.longitude}"
            return format_html('<a href="{}" target="_blank">📍 Ver Local</a>', url)
        return "-"
    ver_mapa.short_description = "Mapa"

    def forcar_reintegracao(self, request, queryset):
        from .tasks import task_preparar_integracao_esl
        for baixa in queryset:
            task_preparar_integracao_esl.delay(baixa.id)
        self.message_user(request, "Integração disparada para os itens selecionados.")
    forcar_reintegracao.short_description = "Re-enviar para TMS ESL"