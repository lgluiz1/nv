from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static # Necessário para arquivos de mídia

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include(('usuarios.urls', 'usuarios'), namespace='usuarios')),
    path('api/', include(('manifesto.urls', 'manifesto'), namespace='manifesto')),
    path('app/', include(('mobile.urls', 'manifesto'), namespace='mobile')),
]

# Configuração para servir arquivos de mídia (Fotos de comprovantes) em ambiente de desenvolvimento
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)