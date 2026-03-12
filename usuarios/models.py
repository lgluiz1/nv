# usuarios/models.py

from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver

# 1. Modelo Motorista (Perfil Estendido)
class Motorista(models.Model):
    """
    Armazena os dados específicos do Motorista e se vincula ao usuário de login.
    O CPF é usado como chave de autenticação (username do User).
    """
    # Relacionamento One-to-One: garante que cada User tenha no máximo um perfil Motorista
    user = models.OneToOneField(
        User, 
        on_delete=models.CASCADE, 
        related_name='motorista_perfil',
        verbose_name="Conta de Usuário",
        null=True,
        blank=True
    )
    
    # Campo CRÍTICO: Armazena o CPF (sem pontuação)
    cpf = models.CharField(max_length=11, unique=True, verbose_name="CPF")
    
    nome_completo = models.CharField(max_length=255, verbose_name="Nome Completo")
    cnh_numero = models.CharField(max_length=20, blank=True, null=True, verbose_name="Número da CNH")
    
    TIPO_USUARIO_CHOICES = [
        ('MOTORISTA', 'Motorista'),
        ('OPERACIONAL', 'Operacional'),
        # Você pode adicionar outros tipos, como ADMIN, aqui
    ]
    tipo_usuario = models.CharField(
        max_length=15, 
        choices=TIPO_USUARIO_CHOICES, 
        default='MOTORISTA',
        verbose_name="Tipo de Usuário"
    )
    
    # Campo para armazenar foto de perfil, se necessário
    foto_perfil = models.ImageField(
        upload_to='motoristas/fotos/', 
        blank=True, 
        null=True, 
        verbose_name="Foto de Perfil"
    )

    # NOVO: Status em tempo real persistente
    ultima_bateria = models.IntegerField(null=True, blank=True, verbose_name="Última Bateria (%)")
    ultimo_acesso = models.DateTimeField(null=True, blank=True, verbose_name="Último Acesso")
    ultima_rede = models.CharField(max_length=20, null=True, blank=True, verbose_name="Tipo de Rede")
    ultima_lat = models.FloatField(null=True, blank=True, verbose_name="Última Latitude")
    ultima_lng = models.FloatField(null=True, blank=True, verbose_name="Última Longitude")

    # NOVO: Vínculo do usuário com a Filial (Para filtro operacional automatizado)
    filial = models.ForeignKey(
        'Filial',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='usuarios_vinculados',
        verbose_name="Filial de Vínculo"
    )

    def __str__(self):
        return self.nome_completo

    class Meta:
        verbose_name = "Motorista"
        verbose_name_plural = "Motoristas"


# 2. Sinal (Signal) para Criação Automática do Perfil


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    """
    Salva o perfil Motorista sempre que o objeto User associado for salvo.
    """
    try:
        instance.motorista_perfil.save()
    except Motorista.DoesNotExist:
        # Ignora se o perfil ainda não existir (será criado pelo signal 'create_user_profile')
        pass

# Criaçao modelo de filial
class Filial(models.Model):
    nome = models.CharField(max_length=100)
    id_filial_tms = models.CharField(max_length=50, blank=True, null=True)

    def __str__(self):
        return self.nome