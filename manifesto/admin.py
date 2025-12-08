from django.contrib import admin
from .models import Manifesto, NotaFiscal, Ocorrencia, BaixaNF, HistoricoOcorrencia

# Register your models here.

admin.site.register(Manifesto)
admin.site.register(NotaFiscal)
admin.site.register(Ocorrencia)
admin.site.register(BaixaNF)
admin.site.register(HistoricoOcorrencia)
