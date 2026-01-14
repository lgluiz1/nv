"""
Django settings for core project.
"""

from pathlib import Path
import os
from dotenv import load_dotenv
from datetime import timedelta

# Build paths inside the project like this: BASE_DIR / 'subdir'.
# BASE_DIR aponta para o diretório raiz do projeto (BackendAPP/)
BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / '.env')

# Quick-start development settings - unsuitable for production
SECRET_KEY = os.getenv('SECRET_KEY', 'default-safe-key-if-not-in-env')
DEBUG = os.getenv('DEBUG', 'True') == 'True'
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '127.0.0.1,localhost,0.0.0.0,').split(',')

CSRF_TRUSTED_ORIGINS = [
    'https://d7dbeee3bc3a.ngrok-free.app',
]

# Application definition

INSTALLED_APPS = [
    "unfold",  # 👈 Deve ser o primeiro da lista
    "unfold.contrib.filters",  # Opcional: Filtros avançados
    "unfold.contrib.forms",  
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    
    # Terceiros
    'rest_framework',
    'rest_framework_simplejwt', # Adicionado para JWT
    'rest_framework_simplejwt.token_blacklist',
    'django_celery_beat',
    'corsheaders',
    'channels',
    'pwa',
    
    # Nossas Apps
    'usuarios',
    'manifesto',   # CORREÇÃO: Deve ser 'manifestos' (plural)
    'mobile',
]
# Configurar Redis como channel layer
# settings.py ou celery.py
CELERY_BROKER_URL = 'redis://redis:6379/0'

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [('redis', 6379)],
        },
    },
}

# (Deve ser a URL da sua página HTML de login)
LOGIN_URL = '/app/login/'
# URL para onde o Django deve REDIRECIONAR o usuário APÓS o login bem-sucedido
# (Não é estritamente necessário para a API, mas bom para evitar redirecionamentos embutidos)
LOGIN_REDIRECT_URL = '/app/'

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
CORS_ALLOW_CREDENTIALS = True

# Configuração para servir arquivos de mídia (Fotos de comprovantes) em ambiente de desenvolvimento
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'


# Database
"""DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME'),
        'USER': os.getenv('DB_USER'),
        'PASSWORD': os.getenv('DB_PASSWORD'),
        'HOST': os.getenv('DB_HOST'),
        'PORT': os.getenv('DB_PORT'),
    }
}"""

# MySQL Database Configuration
# Interserver MySQL Settings
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'st63136_entregas_quickdelivery',
        'USER': 'st63136_quickdelivery',
        'PASSWORD': 'Qu1ck.2026',
        'HOST': 'st63136.ispot.cc',  # 👈 DEVE SER O DOMÍNIO OU IP DA INTERSERVER
        'PORT': '3306',              # 👈 GARANTA QUE A PORTA ESTÁ DEFINIDA
        'OPTIONS': {
            'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
            'charset': 'utf8mb4',
        },
    }
}

# O HOST geralmente é o próprio domínio ou o IP do servidor iSpot
FTP_HOST = "st63136.ispot.cc"  

# As credenciais que você forneceu
FTP_USER = "st63136"
FTP_PASS = "xh3!B8Wp"

# A URL base onde as imagens ficarão visíveis na internet
# Ajuste o caminho final conforme a pasta que você criar no FTP
# settings.py
FTP_HOST = "st63136.ispot.cc"
FTP_USER = "st63136"
FTP_PASS = "xh3!B8Wp"

# URL pública para o motorista visualizar no histórico depois
FTP_BASE_URL = "https://st63136.ispot.cc/uploads/comprovantes-quickdelivery/"


# Password validation
AUTH_PASSWORD_VALIDATORS = [
    # ... (validações padrão)
]


# Internationalization
LANGUAGE_CODE = 'pt-br'
TIME_ZONE = os.getenv('TIME_ZONE', 'America/Sao_Paulo')
USE_I18N = True
USE_TZ = True


# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'

# CORREÇÃO CRÍTICA: Diretório onde o collectstatic vai copiar todos os arquivos
STATIC_ROOT = BASE_DIR / 'staticfiles' 
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
STATICFILES_DIRS = [
    BASE_DIR / 'static',
    # Caso precise de arquivos estáticos globais
]


# Configuração de Arquivos de Mídia (Uploads de usuário: fotos de comprovantes)
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'


# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# --- Configurações de Celery ---
CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL')
CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE


# --- Configurações Django REST Framework ---
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        # Usa JWT como método primário de autenticação
        'rest_framework_simplejwt.authentication.JWTAuthentication', 
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        # Exige autenticação por padrão (pode ser sobrescrito nas Views)
        'rest_framework.permissions.IsAuthenticated',
    )
}


# --- Configurações JWT (JSON Web Token) ---
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),

    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,

    'AUTH_HEADER_TYPES': ('Bearer',),
}

# Configurações do PWA
PWA_APP_NAME = 'Transportadora App'
PWA_APP_DESCRIPTION = "Aplicativo para gestão de entregas e manifestos"
PWA_APP_THEME_COLOR = '#0d6efd' # Cor azul do seu app
PWA_APP_BACKGROUND_COLOR = '#ffffff'
PWA_APP_DISPLAY = 'standalone'
PWA_APP_SCOPE = '/'
PWA_APP_ORIENTATION = 'portrait'
PWA_APP_START_URL = '/app/' # Página inicial do motorista
PWA_APP_STATUS_BAR_COLOR = 'default'

# Ícones (você precisará criar essas imagens na sua pasta static)
PWA_APP_ICONS = [
    {
        'src': '/static/images/icon-160x160.png',
        'sizes': '160x160'
    },
    {
        'src': '/static/images/icon-512x512.png',
        'sizes': '512x512'
    }
]

PWA_SERVICE_WORKER_PATH = 'static/js/serviceworker.js'

UNFOLD = {
    "SITE_TITLE": "Transportadora App",
    "SITE_HEADER": "Painel Logístico",
    "COLORS": {
        "primary": {
            "50": "250 252 255",
            "100": "240 247 255",
            "500": "13 110 253", # Seu azul padrão
            "900": "10 30 100",
        },
    },
    "SIDEBAR": {
        "show_search": True,
        "show_all_applications": True,
    }
}

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

# Garante que o Django gere URLs estáticas com HTTPS quando necessário
if not DEBUG: # Ou remova o 'if' se quiser testar no ngrok agora
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True