from django.db import models

class WhatsAppUser(models.Model):
    phone = models.CharField(max_length=50, unique=True)
    agente = models.ForeignKey(
        'Agente',
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )
    estado = models.CharField(max_length=50, default='NOVO')
    criado_em = models.DateTimeField(auto_now_add=True)
    temp_nfe_numero = models.CharField(max_length=20, null=True, blank=True)
    temp_nfe_valor = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    temp_nfe_dados = models.JSONField(null=True, blank=True)  # retorno da API

    def __str__(self):
        return self.phone


class Agente(models.Model):
    codigo = models.CharField(max_length=20, unique=True)
    nome = models.CharField(max_length=100)

    def __str__(self):
        return f"{self.codigo} - {self.nome}"
