let dadosTemporariosNfe = null;

// Função para gerenciar qual "tela" do modal aparece
function showStep(stepName) {
    const steps = ['busca', 'loading', 'resultado', 'sucesso'];
    steps.forEach(s => document.getElementById(`step-${s}`).style.display = 'none');
    document.getElementById(`step-${stepName}`).style.display = 'block';
}

function processarBuscaNfe() {
    const numero = document.getElementById('importNumero').value.replace(/\D/g, '');
    const cnpj = document.getElementById('importCnpj').value.replace(/\D/g, '');

    if (!numero || !cnpj) {
        alert("Por favor, preencha número e CNPJ.");
        return;
    }

    // Inicia o charme do Loading
    showStep('loading');
    document.getElementById('loading-text').innerText = "Consultando TMS...";

    fetch('/api/manifesto/buscar-importar/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': '{{ csrf_token }}'
        },
        body: JSON.stringify({ numero: numero, cnpj_emissor: cnpj })
    })
    .then(r => r.json())
    .then(data => {
        if (data.sucesso) {
            // Preenche os dados detalhados no modal
            dadosTemporariosNfe = data.dados;
            document.getElementById('resNfe').innerText = data.dados.numero;
            document.getElementById('resEmissor').innerText = cnpj;
            document.getElementById('resDest').innerText = data.dados.destinatario;
            document.getElementById('resEnd').innerText = data.dados.endereco;
            document.getElementById('resChave').innerText = data.dados.chave;

            // Simula um pequeno delay para o motorista sentir o "processamento" e vai para resultado
            setTimeout(() => {
                showStep('resultado');
                carregarManifestosNoSelect(); // Função que você já deve ter para popular os manifestos
            }, 800);
        } else {
            alert(data.mensagem || "Nota não encontrada.");
            showStep('busca');
        }
    })
    .catch(err => {
        alert("Erro na conexão.");
        showStep('busca');
    });
}

function processarInclusaoFinal() {
    const manifestoId = document.getElementById('selectManifesto').value;
    if (!manifestoId) {
        alert("Selecione um manifesto!");
        return;
    }

    showStep('loading');
    document.getElementById('loading-text').innerText = "Vinculando Nota...";

    const payload = { ...dadosTemporariosNfe, manifesto_id: manifestoId };

    fetch('/api/manifesto/buscar-importar/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': '{{ csrf_token }}'
        },
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(data => {
        if (data.sucesso) {
            showStep('sucesso');
            // Recarrega a lista de notas atrás do modal após 2 segundos ou ao fechar
            setTimeout(() => { location.reload(); }, 2500);
        } else {
            alert("Erro ao salvar.");
            showStep('resultado');
        }
    });
}

function voltarParaBusca() {
    showStep('busca');
}