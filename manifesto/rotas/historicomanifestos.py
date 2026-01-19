from rest_framework import views
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication

from manifesto.models import Manifesto


class HistoricoManifestosView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            manifestos = (
                Manifesto.objects
                .filter(
                    motorista__user=request.user,
                    finalizado=True
                )
                .order_by('-data_finalizacao')
                .prefetch_related(
                    'notas_fiscais__historico',
                    'notas_fiscais__baixa_info__ocorrencia'
                )
            )

            dados = []

            for manifesto in manifestos:
                notas = manifesto.notas_fiscais.all()
                dados_notas = []

                for nota in notas:
                    # ✅ CORREÇÃO: Pegamos a última baixa vinculada a esta nota fiscal
                    # Como agora é ForeignKey, usamos .last() para pegar o registro mais recente
                    baixa = nota.baixa_info.all().last() 

                    ultima_ocorrencia = (
                        nota.historico
                        .order_by('-data_ocorrencia')
                        .first()
                    )

                    # Tipo da ocorrência
                    if baixa and baixa.ocorrencia:
                        tipo_ocorrencia = baixa.ocorrencia.descricao
                    elif ultima_ocorrencia:
                        tipo_ocorrencia = f"TMS: {ultima_ocorrencia.codigo_tms}"
                    else:
                        tipo_ocorrencia = "Entregue"

                    dados_notas.append({
                        "numero_nf": nota.numero_nota,
                        "status_nf": nota.status,
                        "tipo_ocorrencia": tipo_ocorrencia,
                        "descricao_detalhada": (
                            baixa.observacao
                            if baixa and baixa.observacao
                            else ultima_ocorrencia.comentarios
                            if ultima_ocorrencia and ultima_ocorrencia.comentarios
                            else "Sem observações."
                        ),
                        "foto_comprovante": (
                            baixa.comprovante_foto_url 
                            if baixa and baixa.comprovante_foto_url 
                            else None
                        ),  
                        "recebedor": (
                            baixa.recebedor
                            if baixa and baixa.recebedor
                            else "Não informado"
                        ),
                        "data_baixa": (
                            baixa.data_baixa.strftime('%d/%m/%Y %H:%M')
                            if baixa
                            else ultima_ocorrencia.data_ocorrencia.strftime('%d/%m/%Y %H:%M')
                            if ultima_ocorrencia and ultima_ocorrencia.data_ocorrencia
                            else None
                        )
                    })

                dados.append({
                    "numero": manifesto.numero_manifesto,
                    "qtd_nfe": notas.count(),
                    "data": (
                        manifesto.data_finalizacao.strftime('%d/%m/%Y')
                        if manifesto.data_finalizacao
                        else manifesto.data_criacao.strftime('%d/%m/%Y')
                    ),
                    "km_final": str(manifesto.km_final) if manifesto.km_final else "N/A",
                    "notas": dados_notas
                })

            return Response(dados)

        except Exception as e:
            return Response(
                {"erro": f"Erro ao carregar histórico: {str(e)}"},
                status=500
            )