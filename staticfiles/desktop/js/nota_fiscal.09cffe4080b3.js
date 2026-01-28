// Controle Global do Modal de Importação
let dadosTemporariosNfe = null;

/**
 * Gerencia a visibilidade das etapas dentro do modal
 * @param {string} stepName - 'busca', 'loading', 'resultado', 'sucesso'
 */
function showStep(stepName) {
    const steps = ['busca', 'loading', 'resultado', 'sucesso'];
    steps.forEach(s => {
        const el = document.getElementById(`step-${s}`);
        if (el) el.style.display = 'none';
    });
    
    const target = document.getElementById(`step-${stepName}`);
    if (target) {
        target.style.display = 'block';
        // Adiciona uma pequena animação de entrada
        target.classList.add('animate__animated', 'animate__fadeIn');
    }
}

/**
 * Primeira Etapa: Busca no Backend (Local -> TMS)
 */
function processarBuscaNfe() {
    const numero = document.getElementById('importNumero').value.replace(/\D/g, '');
    const cnpj = document.getElementById('importCnpj').value.replace(/\D/g, '');

    if (!numero || !cnpj) {
        alert("⚠️ Por favor, preencha o número da nota e o CNPJ do emissor.");
        return;
    }

    // Ativa o Loading "Charme"
    showStep('loading');
    document.getElementById('loading-text').innerText = "Consultando TMS ESL...";

    fetch('/api/manifesto/buscar-importar/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
        },
        body: JSON.stringify({ numero: numero, cnpj_emissor: cnpj })
    })
    .then(r => {
        if (!r.ok) throw new Error("Nota não localizada ou erro na API.");
        return r.json();
    })
    .then(data => {
        if (data.sucesso) {
            dadosTemporariosNfe = data.dados;
            
            // Preenche os dados no resumo do resultado
            document.getElementById('resNfe').innerText = data.dados.numero;
            document.getElementById('resEmissor').innerText = cnpj;
            document.getElementById('resDest').innerText = data.dados.destinatario;
            document.getElementById('resEnd').innerText = data.dados.endereco;
            document.getElementById('resChave').innerText = data.dados.chave;

            // Pequena pausa para o usuário perceber a transição
            setTimeout(() => {
                showStep('resultado');
                carregarManifestosNoSelect(); // Certifique-se de que esta função existe
            }, 800);
        } else {
            alert(data.mensagem || "Nota não encontrada.");
            showStep('busca');
        }
    })
    .catch(err => {
        alert("❌ Erro: " + err.message);
        showStep('busca');
    });
}

/**
 * Segunda Etapa: Salvar o vínculo no banco
 */
function processarInclusaoFinal() {
    const manifestoId = document.getElementById('selectManifesto').value;
    if (!manifestoId) {
        alert("📌 Você deve selecionar um manifesto para vincular esta nota.");
        return;
    }

    showStep('loading');
    document.getElementById('loading-text').innerText = "Vinculando à Rota...";

    const payload = { 
        ...dadosTemporariosNfe, 
        manifesto_id: manifestoId 
    };

    fetch('/api/manifesto/buscar-importar/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
        },
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(data => {
        if (data.sucesso) {
            showStep('sucesso');
            // Recarrega a página após o sucesso para mostrar a nota na tabela principal
            setTimeout(() => { location.reload(); }, 2000);
        } else {
            alert("Erro ao processar vínculo.");
            showStep('resultado');
        }
    });
}

function voltarParaBusca() {
    showStep('busca');
}