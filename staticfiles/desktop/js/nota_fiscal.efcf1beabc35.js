let dadosNotaEncontrada = null;

function alternarCamposBusca() {
    const tipo = document.getElementById('tipoBusca').value;
    document.getElementById('campoChave').style.display = tipo === 'chave' ? 'block' : 'none';
    document.getElementById('camposNumero').style.display = tipo === 'numero' ? 'block' : 'none';
}

function buscarNfeNoBackend() {
    const tipo = document.getElementById('tipoBusca').value;
    const btn = document.getElementById('btnBuscarNfe');
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Buscando...';
    btn.disabled = true;

    const payload = {
        chave: document.getElementById('importChave').value.replace(/\D/g, ''),
        numero: document.getElementById('importNumero').value.replace(/\D/g, ''),
        cnpj_emissor: document.getElementById('importCnpj').value.replace(/\D/g, '')
    };

    fetch('/api/manifesto/buscar-importar/', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-CSRFToken': '{{ csrf_token }}'},
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(data => {
        if (data.sucesso) {
            dadosNotaEncontrada = data.dados;
            document.getElementById('resDest').innerText = data.dados.destinatario;
            document.getElementById('resEnd').innerText = data.dados.endereco;
            document.getElementById('resultadoBusca').style.display = 'block';
            document.getElementById('btnSalvarNfe').style.display = 'block';
            btn.style.display = 'none';
            carregarManifestosNoSelect(); // Função para popular o select de manifestos
        } else {
            alert(data.mensagem || "Nota não encontrada.");
        }
    })
    .finally(() => {
        btn.innerHTML = '<i class="bi bi-search"></i> Buscar Nota';
        btn.disabled = false;
    });
}

function salvarNfeNoManifesto() {
    const manifestoId = document.getElementById('selectManifesto').value;
    if (!manifestoId) {
        alert("Você deve selecionar um manifesto!");
        return;
    }

    const payload = { ...dadosNotaEncontrada, manifesto_id: manifestoId };

    fetch('/api/manifesto/buscar-importar/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        // Certifique-se de que o Django renderizou o CSRF Token no seu HTML
        'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value 
    },
    body: JSON.stringify(payload)
})
    .then(r => r.json())
    .then(data => {
        alert(data.mensagem);
        location.reload();
    });
}