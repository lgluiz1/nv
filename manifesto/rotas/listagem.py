from rest_framework.views import APIView
from rest_framework.response import Response
from manifesto.models import NotaFiscal

class ListarNotasManifestoView(APIView):
    def get(self, request):
        numero = request.query_params.get('numero_manifesto')
        notas = NotaFiscal.objects.filter(manifesto__numero_manifesto=numero)
        
        data = []
        for nf in notas:
            # Verifica se já existe uma baixa para esta nota
            baixa = getattr(nf, 'baixa_info', None) 
            
            data.append({
                'numero_nota': nf.numero_nota,
                'chave_acesso': nf.chave_acesso,
                'destinatario': nf.destinatario,
                'endereco_entrega': nf.endereco_entrega,
                'status': nf.status,
                'ja_baixada': baixa is not None, # Campo novo para o JS
                'dados_baixa': {
                    'tipo': baixa.tipo,
                    'ocorrencia': baixa.ocorrencia.descricao,
                    'recebedor': baixa.recebedor,
                    'data': baixa.data_baixa.strftime('%d/%m/%Y %H:%M'),
                    'foto_url': baixa.comprovante_foto.url if baixa.comprovante_foto else None,
                    'lat': float(baixa.latitude) if baixa.latitude else None,
                    'lng': float(baixa.longitude) if baixa.longitude else None
                } if baixa else None
            })
        return Response(data)