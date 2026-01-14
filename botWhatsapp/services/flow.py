from botWhatsapp.models import WhatsAppUser, Agente
from botWhatsapp.tasks import buscar_nfe_tms_task
from manifesto.tasks import enviar_baixa_esl_task
from manifesto.models import BaixaNF, NotaFiscal


def processar_mensagem(user, mensagem, midia=None):
    mensagem = mensagem.strip().lower() if mensagem else ""

    # =========================
    # USUÁRIO NOVO
    # =========================
    if user.estado == 'NOVO':
        user.estado = 'AGUARDANDO_CODIGO_AGENTE'
        user.save()
        return "👋 Olá!\nInforme seu código de agente:"

    # =========================
    # CÓDIGO DO AGENTE
    # =========================
    if user.estado == 'AGUARDANDO_CODIGO_AGENTE':
        try:
            user.agente = Agente.objects.get(codigo=mensagem)
            user.estado = 'AGUARDANDO_NUMERO_NFE'
            user.save()
            return "✅ Agente verificado!\nDigite o número da NF-e:"
        except Agente.DoesNotExist:
            return "❌ Código inválido.\nDigite novamente:"

    # =========================
    # NÚMERO NF-e
    # =========================
    if user.estado == 'AGUARDANDO_NUMERO_NFE':
        user.temp_nfe_numero = mensagem
        user.estado = 'AGUARDANDO_VALOR_NFE'
        user.save()
        return "Digite o valor da NF-e:"

    # =========================
    # VALOR NF-e
    # =========================
    if user.estado == 'AGUARDANDO_VALOR_NFE':
        try:
            user.temp_nfe_valor = float(mensagem.replace(",", "."))
        except ValueError:
            return "❌ Valor inválido. Digite novamente:"

        user.estado = 'PROCESSANDO_NFE'
        user.save()

        buscar_nfe_tms_task.delay(user.id)

        return "⏳ Buscando NF-e no sistema, aguarde..."

    # =========================
    # CONFIRMAÇÃO
    # =========================
    if user.estado == 'CONFIRMACAO_DADOS':
        if mensagem not in ['1', 'sim']:
            user.estado = 'AGUARDANDO_NUMERO_NFE'
            user.save()
            return "❌ Cancelado.\nDigite o número da NF-e novamente:"

        dados = user.temp_nfe_dados

        nota = NotaFiscal.objects.create(
            manifesto=user.agente.manifesto_atual,  # ajuste conforme seu sistema
            chave_acesso=dados["key"],
            numero_nota=dados["number"],
            destinatario=dados["ioe_rpt_name"],
            endereco_entrega=(
                f"{dados['ioe_rpt_mds_line_1']}, "
                f"{dados['ioe_rpt_mds_number']} - "
                f"{dados['ioe_rpt_mds_neighborhood']}"
            )
        )

        user.estado = 'AGUARDANDO_COMPROVANTE'
        user.save()

        return "📸 Envie a foto do comprovante de entrega:"

    # =========================
    # COMPROVANTE
    # =========================
    if user.estado == 'AGUARDANDO_COMPROVANTE':
        if not midia:
            return "❌ Envie a foto do comprovante."

        nota = NotaFiscal.objects.filter(
            numero_nota=user.temp_nfe_numero
        ).last()

        baixa = BaixaNF.objects.create(
            nota_fiscal=nota,
            tipo='ENTREGA',
            observacao='Baixa via WhatsApp Bot'
        )

        # 🔥 SALVA A IMAGEM NO MESMO STORAGE DO APP
        baixa.comprovante_foto.save(
            midia.name,
            midia,
            save=True
        )

        enviar_baixa_esl_task.delay(baixa.id)

        user.estado = 'AGUARDANDO_NUMERO_NFE'
        user.temp_nfe_dados = None
        user.save()

        return (
            "✅ Comprovante recebido!\n"
            "NF-e enviada para baixa.\n\n"
            "Digite o número da próxima NF-e:"
        )

