from django.contrib import admin

# Register your models here.
from .models import WhatsAppUser, Agente

admin.site.register(WhatsAppUser)
admin.site.register(Agente)
