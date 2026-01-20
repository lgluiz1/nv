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
            # 1. Filtramos apenas manifestos finalizados do motorista logado
            # Usamos prefetch_related com objetos específicos para otimizar a busca
            manifestos = (
                Manifesto.objects
                .filter(motorista__user=request.user, finalizado=True)
                .order_by('-data_finalizacao')
                .prefetch_related(
                    'notas_fiscais',
                    'notas_fiscais__historico',
                    'notas_fiscais__baixa_info__ocorrencia'
                )
            )

            dados = []
            for manifesto in manifestos:
                dados_notas = []
                # 2. notas_fiscais.all() aqui já está no cache do prefetch_related
                for nota in manifesto.notas_fiscais.all():
                    
                    # Pegamos a baixa específica deste registro de NotaFiscal
                    # Como nota e baixa_info estão ligados por FK, o .last() pega a última deste registro
                    baixa = nota.baixa_info.all().last() 

                    # Pegamos o histórico de rastreamento (TMS)
                    ultima_ocorrencia = nota.historico.all().order_by('-data_ocorrencia').first()

                    # Lógica de prioridade de Status
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
                            baixa.observacao if baixa and baixa.observacao 
                            else (ultima_ocorrencia.comentarios if ultima_ocorrencia else "Sem observações.")
                        ),
                        "foto_comprovante": baixa.comprovante_foto_url if baixa else None,
                        "recebedor": baixa.recebedor if baixa and baixa.recebedor else "Não informado",
                        "data_baixa": (
                            baixa.data_baixa.strftime('%d/%m/%Y %H:%M') if baixa 
                            else (ultima_ocorrencia.data_ocorrencia.strftime('%d/%m/%Y %H:%M') if ultima_ocorrencia else None)
                        )
                    })

                dados.append({
                    "numero": manifesto.numero_manifesto,
                    "qtd_nfe": len(dados_notas),
                    "data": (manifesto.data_finalizacao or manifesto.data_criacao).strftime('%d/%m/%Y'),
                    "km_final": str(manifesto.km_final) if manifesto.km_final else "N/A",
                    "notas": dados_notas
                })

            return Response(dados)

        except Exception as e:
            return Response({"erro": f"Erro ao carregar histórico: {str(e)}"}, status=500)