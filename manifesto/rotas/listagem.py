from rest_framework.views import APIView
from rest_framework.response import Response
from manifesto.models import NotaFiscal

class ListarNotasManifestoView(APIView):
    def get(self, request):
        numero = request.query_params.get('numero_manifesto')
        # Filtramos as notas do manifesto específico
        notas = NotaFiscal.objects.filter(manifesto__numero_manifesto=numero).prefetch_related('baixa_info')
        
        data = []
        for nf in notas:
            # 1. COMO É FOREIGN KEY AGORA: Pegamos a última baixa vinculada a esta nota
            # O .last() resolve o problema da lista e pega o evento mais recente
            baixa = nf.baixa_info.all().last() 
            
            data.append({
                'numero_nota': nf.numero_nota,
                'chave_acesso': nf.chave_acesso,
                'destinatario': nf.destinatario,
                'endereco_entrega': nf.endereco_entrega,
                'status': nf.status,
                'ja_baixada': baixa is not None, 
                'dados_baixa': {
                    'tipo': baixa.tipo,
                    # Verificação extra para evitar erro se a ocorrência for nula
                    'ocorrencia': baixa.ocorrencia.descricao if baixa.ocorrencia else "Não informada",
                    'recebedor': baixa.recebedor,
                    # Formatando a data com o fuso de Brasília que configuramos
                    'data': baixa.data_baixa.strftime('%d/%m/%Y %H:%M') if baixa.data_baixa else None,
                    'foto_url': baixa.comprovante_foto_url if baixa.comprovante_foto_url else None,
                    'lat': float(baixa.latitude) if baixa.latitude else None,
                    'lng': float(baixa.longitude) if baixa.longitude else None
                } if baixa else None
            })
            
        return Response(data)