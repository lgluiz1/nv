# manifestos/models.py

from django.db import models
from usuarios.models import Motorista
from django.utils import timezone


#MANIFESTOBUSCALOG SAO ARMAZENADOS TODOS OS PEDIDOS DE BUSCA DE MANIFESTO REALIZADOS PELO MOTORISTA, CASO ELE NAO INICIE VIAGEM A OUTRA VEZ Q ELE BUSCA NUMERO DO MANIFESTO ESSA TABELA DEVER SER ATUALIZADA COM O NOVO PEDIDO DE BUSCA
class ManifestoBuscaLog(models.Model):
    STATUS_CHOICES = (
        ('AGUARDANDO', 'Aguardando'),
        ('PRONTO_PREVIEW', 'Pronto para Preview'),
        ('PROCESSADO', 'Processado'),
        ('ERRO', 'Erro'),
    )

    numero_manifesto = models.CharField(max_length=50)
    motorista = models.ForeignKey(Motorista, on_delete=models.CASCADE)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='AGUARDANDO'
    )

    mensagem_erro = models.TextField(blank=True, null=True)

    # ✅ AGORA CORRETO
    payload = models.JSONField(blank=True, null=True)

    criado_em = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Busca {self.numero_manifesto} - {self.motorista.nome_completo} - {self.status}"

    class Meta:
        verbose_name = "Busca de Manifesto"
        verbose_name_plural = "Buscas de Manifestos"
        unique_together = ('numero_manifesto', 'motorista')

# 1. Códigos de Ocorrência do TMS
class Ocorrencia(models.Model):
    """
    Tabela para mapear todos os códigos de retorno (Entrega, Coleta, Problema) exigidos pelo TMS.
    """
    codigo_tms = models.CharField(max_length=10, unique=True, verbose_name="Código TMS") 
    descricao = models.CharField(max_length=255)
    
    TIPO_CHOICES = [
        ('ENTREGA', 'Entrega/Coleta (Sucesso)'),
        ('PROBLEMA', 'Problema (Rejeição/Não Realizada)'),
    ]
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES, default='PROBLEMA')

    def __str__(self):
        return f"[{self.codigo_tms}] {self.descricao}"
    
    class Meta:
        verbose_name = "Código de Ocorrência"
        verbose_name_plural = "Códigos de Ocorrências"


# 2. Manifesto de Carga
class Manifesto(models.Model):
    STATUS_CHOICES = [
        ('EM_TRANSPORTE', 'Em Transporte'),
        ('FINALIZADO', 'Finalizado'),
        ('CANCELADO', 'Cancelado'),
    ]

    numero_manifesto = models.CharField(
        max_length=50,
        unique=True,
        verbose_name="Número do Manifesto"
    )

    motorista = models.ForeignKey(
        Motorista,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='manifestos',
        verbose_name="Motorista"
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='EM_TRANSPORTE'
    )

    km_inicial = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    km_final = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    finalizado = models.BooleanField(default=False)

    data_criacao = models.DateTimeField(auto_now_add=True)
    data_finalizacao = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Manifesto {self.numero_manifesto}"

    class Meta:
        verbose_name = "Manifesto"
        verbose_name_plural = "Manifestos"
        constraints = [
            models.UniqueConstraint(
                fields=['motorista'],
                condition=models.Q(status='EM_TRANSPORTE'),
                name='um_manifesto_em_transporte_por_motorista'
            )
        ]

# 3. Notas Fiscais (Itens do Manifesto)
class NotaFiscal(models.Model):
    """
    Representa uma NF-e dentro de um manifesto. A NF-e pode se repetir em outros manifestos.
    """
    manifesto = models.ForeignKey(Manifesto, on_delete=models.CASCADE, related_name='notas_fiscais')
    
    # Chave de acesso e Número não são únicos globalmente, mas são únicos DENTRO DESTE MANIFESTO
    chave_acesso = models.CharField(max_length=44, null=True, unique=True, blank=True, verbose_name="Chave de Acesso") 
    numero_nota = models.CharField(max_length=20, verbose_name="Número NF")
    
    destinatario = models.CharField(max_length=255, verbose_name="Destinatário")
    endereco_entrega = models.CharField(max_length=255, verbose_name="Endereço de Entrega")
    
    STATUS_CHOICES = [
        ('PENDENTE', 'Pendente'),
        ('BAIXADA', 'Baixada/Entregue'),
        ('OCORRENCIA', 'Ocorrência Registrada'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDENTE')

    def __str__(self):
        return f"NF {self.numero_nota} ({self.manifesto.numero_manifesto})"
    
    class Meta:
        verbose_name = "Nota Fiscal"
        verbose_name_plural = "Notas Fiscais"
        # RESTRIÇÃO CHAVE: Garante que a NF-e não seja duplicada no mesmo manifesto
        indexes = [models.Index(fields=['chave_acesso'])]


# 4. Histórico de Ocorrências (Rastreamento)
class HistoricoOcorrencia(models.Model):
    """
    Armazena CADA evento de rastreamento recebido do Data Export para uma Nota Fiscal.
    Usado para determinar a última ocorrência (data mais recente).
    """
    nota_fiscal = models.ForeignKey(NotaFiscal, on_delete=models.CASCADE, related_name='historico')
    
    codigo_tms = models.CharField(max_length=10, verbose_name="Código Ocorrência TMS")
    data_ocorrencia = models.DateTimeField(null=True, blank=True)
    
    comentarios = models.TextField(null=True, blank=True)
    manifesto_evento = models.CharField(max_length=50, verbose_name="Cód. do Manifesto do Evento")

    def __str__(self):
        return f"NF {self.nota_fiscal.numero_nota}: Código {self.codigo_tms} em {self.data_ocorrencia}"

    class Meta:
        verbose_name = "Histórico de Ocorrência"
        verbose_name_plural = "Históricos de Ocorrências"
        # Garante a unicidade do evento (NF + Cód + Data)
        unique_together = ('nota_fiscal', 'codigo_tms', 'data_ocorrencia') 
        indexes = [models.Index(fields=['data_ocorrencia'])]


# 5. Registro de Baixa (Comprovante final de entrega ou ocorrência)
class BaixaNF(models.Model):
    """
    Registra a foto do canhoto ou o código da ocorrência FINAL enviado pelo motorista.
    """
    nota_fiscal = models.OneToOneField(NotaFiscal, on_delete=models.CASCADE, related_name='baixa_info')
    
    TIPO_CHOICES = [
        ('ENTREGA', 'Entrega/Coleta'),
        ('OCORRENCIA', 'Ocorrência'),
    ]
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES)
    
    comprovante_foto = models.ImageField(upload_to='comprovantes/', null=True, blank=True)
    comprovante_foto_url = models.CharField(max_length=500, null=True, blank=True)
    
    # Vincula o código de ocorrência do TMS (o que o motorista escolheu no app)
    ocorrencia = models.ForeignKey(Ocorrencia, on_delete=models.SET_NULL, null=True, blank=True)
  
    recebedor = models.CharField(max_length=100, null=True, blank=True)
    documento_recebedor = models.CharField(max_length=20, null=True, blank=True)
    observacao = models.TextField(blank=True, null=True)
    data_baixa = models.DateTimeField(auto_now_add=True)
    processado_tms = models.BooleanField(default=False, verbose_name="Integrado com ESL")
    data_integracao = models.DateTimeField(null=True, blank=True)
    log_erro_tms = models.TextField(null=True, blank=True, verbose_name="Log de Erro ESL")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    integrado_tms = models.BooleanField(default=False, null=True, blank=True, verbose_name="Integrado ESL")
    

    def __str__(self):
        return f"Baixa de {self.nota_fiscal.numero_nota} ({self.tipo})"
    
    class Meta:
        verbose_name = "Nota Fiscal Baixada"
        verbose_name_plural = "Notas Fiscais Baixadas"