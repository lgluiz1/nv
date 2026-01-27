from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db.models import Q
import requests, json
from django.views.decorators.csrf import csrf_exempt
from manifesto.models import NotaFiscal, Manifesto
from django.shortcuts import get_object_or_404

TOKEN = "zyUq31Mq6gMcYGzV4zL7HTsdnS7pULjaQoxGbkPZ1cLDoxT3d-Xukw"
URL_TMS = "https://quickdelivery.eslcloud.com.br/api/analytics/reports/9873/data"


@csrf_exempt
@require_http_methods(["POST"])
def buscar_e_importar_nfe(request):
    data = json.loads(request.body)
    numero = data.get('numero')
    cnpj_emissor = data.get('cnpj_emissor')
    chave = data.get('chave')
    manifesto_id = data.get('manifesto_id') # Recebido apenas no momento de salvar

    # 1. BUSCA LOCAL PRIMEIRO
    if chave:
        nota_local = NotaFiscal.objects.filter(chave_acesso=chave).first()
    else:
        # Busca por número e tenta cruzar com o emissor se você tiver esse dado no banco
        nota_local = NotaFiscal.objects.filter(numero_nota=numero).first()

    if nota_local and not manifesto_id: # Se achou local e só está buscando dados
        return JsonResponse({
            "sucesso": True,
            "origem": "local",
            "dados": {
                "numero": nota_local.numero_nota,
                "chave": nota_local.chave_acesso,
                "destinatario": nota_local.destinatario,
                "endereco": nota_local.endereco_entrega
            }
        })

    # 2. BUSCA NO TMS (Caso não tenha achado local ou queira salvar)
    if not manifesto_id:
        payload = {
            "search": {
                "invoices": {
                    "number": int(numero) if numero else None,
                    "issue_date": "2024-01-01 - 2050-12-31" 
                }
            },
            "page": "1", "per": "100"
        }
        try:
            res = requests.get(URL_TMS, headers={"Authorization": f"Bearer {TOKEN}"}, data=json.dumps(payload), timeout=20)
            if res.status_code == 200:
                dados = res.json()
                for nf in dados:
                    # Filtro por Chave (se informada) ou por CNPJ Emissor
                    if (chave and nf.get('key') == chave) or (not chave and str(nf.get('issuer_document')).replace('.','').replace('-','') == cnpj_emissor):
                        return JsonResponse({
                            "sucesso": True, 
                            "origem": "tms", 
                            "dados": {
                                "numero": nf.get('number'),
                                "chave": nf.get('key'),
                                "destinatario": nf.get('receiver_name'),
                                "endereco": nf.get('receiver_address')
                            }
                        })
                return JsonResponse({"sucesso": False, "mensagem": "Nota não encontrada no TMS."}, status=404)
        except Exception as e:
            return JsonResponse({"sucesso": False, "mensagem": str(e)}, status=500)

    # 3. SALVAR NO MANIFESTO (Quando manifesto_id é enviado)
    else:
        manifesto = get_object_or_404(Manifesto, id=manifesto_id)
        # Lógica de criação no banco conforme seu Model
        nova_nota = NotaFiscal.objects.create(
            manifesto=manifesto,
            numero_nota=data.get('numero'),
            chave_acesso=data.get('chave'),
            destinatario=data.get('destinatario'),
            endereco_entrega=data.get('endereco'),
            status='PENDENTE'
        )
        return JsonResponse({"sucesso": True, "mensagem": "Nota vinculada com sucesso!"})
    
from django.http import JsonResponse
from manifesto.models import Manifesto

def listar_manifestos_select(request):
    # Buscamos os últimos 50 manifestos para não sobrecarregar o select
    manifestos = Manifesto.objects.exclude(status='CANCELADO').order_by('-data_criacao')[:50]
    
    dados = [
        {
            "id": m.id, 
            "numero": m.numero_manifesto, 
            "motorista": m.motorista.nome_completo if m.motorista else "Sem Motorista"
        } for m in manifestos
    ]
    
    return JsonResponse({"sucesso": True, "manifestos": dados})