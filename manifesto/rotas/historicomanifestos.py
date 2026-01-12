from rest_framework import views
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from manifesto.models import Manifesto, NotaFiscal

class HistoricoManifestosView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            # Filtra manifestos finalizados do motorista logado
            historico = Manifesto.objects.filter(
                motorista=request.user, 
                finalizado=True
            ).order_by('-data_finalizacao')
            
            dados = []
            for m in historico:
                # Busca as notas fiscais vinculadas
                notas = NotaFiscal.objects.filter(manifesto=m)
                
                dados_notas = []
                for n in notas:
                    # Tenta pegar as informações da tabela BaixaNF
                    baixa = getattr(n, 'baixa_info', None)
                    
                    dados_notas.append({
                        "numero_nf": n.numero_nota,
                        # Pega a descrição da ocorrência vinculada à baixa
                        "tipo_ocorrencia": baixa.ocorrencia.descricao if baixa and baixa.ocorrencia else "Entregue",
                        "descricao_detalhada": baixa.observacao if baixa and baixa.observacao else "Entrega realizada com sucesso.",
                        # O campo correto no seu model é 'comprovante_foto'
                        "foto_comprovante": baixa.comprovante_foto.url if baixa and baixa.comprovante_foto else None,
                        "recebedor": baixa.recebedor if baixa else "Não informado"
                    })

                dados.append({
                    "numero": m.numero_manifesto,
                    "qtd_nfe": notas.count(),
                    "data": m.data_finalizacao.strftime('%d/%m/%Y') if m.data_finalizacao else m.data_criacao.strftime('%d/%m/%Y'),
                    "notas": dados_notas
                })
            return Response(dados)
        except Exception as e:
            # Importante para debugar na VPS
            print(f"Erro no Histórico: {str(e)}")
            return Response({"erro": "Erro ao processar histórico"}, status=500)