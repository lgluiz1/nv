// manifesto.js completo e atualizado
// =====================================================
// CONFIGURAÇÕES
// =====================================================
const LOGIN_URL = '/app/login/';

let loadingModal = null;
let pollingInterval = null;
let manifestoAtual = null;

// =====================================================
// INIT
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    initModals();

    const authenticated = await initAuth();
    if (authenticated) {
        atualizarDadosHeader();
        verificarEstadoInicial();
        
        // Listener para a câmera nativa
        const inputCamera = document.getElementById('camera-nativa');
        if (inputCamera) {
            inputCamera.addEventListener('change', handleCameraNativa);
        }
    } else {
        window.location.href = LOGIN_URL;
    }
});

// =====================================================
// CÂMERA NATIVA E PREVIEW (MELHORIA DE QUALIDADE)
// =====================================================

/**
 * Processa a foto tirada pelo app nativo e desenha no canvas
 */
function handleCameraNativa(event) {
    const file = event.target.files[0];
    if (!file) return;

    const canvas = document.getElementById('canvas-preview');
    const ctx = canvas.getContext('2d');
    const placeholder = document.getElementById('placeholder-camera');
    const btnAbrir = document.getElementById('label-camera');
    const btnNova = document.getElementById('btn-nova-foto');

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // Redimensionamento para garantir nitidez sem travar o upload
            const larguraDesejada = 1600; 
            const escala = larguraDesejada / img.width;
            canvas.width = larguraDesejada;
            canvas.height = img.height * escala;

            // Desenha a foto no canvas que será usado pelo salvarRegistro()
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Atualiza a interface do modal
            canvas.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
            if (btnAbrir) btnAbrir.style.display = 'none';
            if (btnNova) btnNova.style.display = 'block';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// =====================================================
// SALVAR NO BACKEND
// =====================================================
async function salvarRegistro() {
    const cod = document.getElementById('select-ocorrencia').value;
    const chaveNF = document.getElementById('hidden-chave-nf').value;
    const canvas = document.getElementById('canvas-preview');
    const temFoto = (canvas.style.display === 'block');

    // Validação de obrigatoriedade de foto (ajuste os IDs conforme sua lógica TMS)
    if ((cod === "1" || cod === "2") && !temFoto) {
        alert("A foto é obrigatória para este código!");
        return;
    }

    loadingModal?.show();

    const formData = new FormData();
    formData.append('ocorrencia_codigo', cod);
    formData.append('chave_acesso', chaveNF);
    formData.append('recebedor', document.getElementById('input-recebedor').value || '');

    const coords = await getCoords();
    if (coords) {
        formData.append('latitude', coords.lat);
        formData.append('longitude', coords.lon);
    }

    if (temFoto) {
        // Converte o canvas para Blob com alta qualidade para a ESL ler o canhoto
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
        formData.append('foto', blob, `${chaveNF}.jpg`);
    }

    try {
        const response = await authFetch(`${API_BASE}manifesto/registrar-baixa/`, {
            method: 'POST',
            body: formData,
            headers: {} // Deixe vazio para o navegador definir o Content-Type do FormData
        });

        if (response.ok) {
            alert("Baixa realizada com sucesso!");
            location.reload();
        } else {
            const data = await response.json();
            alert("Erro: " + (data.erro || data.detail || "Falha no registro"));
        }
    } catch (err) {
        alert("Erro de conexão.");
    } finally {
        loadingModal?.hide();
    }
}

// =====================================================
// TELAS E LOGÍSTICA (SEM ALTERAÇÕES)
// =====================================================

async function verificarEstadoInicial() {
    try {
        const response = await authFetch(`${API_BASE}manifesto/verificar-ativo//`);
        if (!response || !response.ok) return;
        const data = await response.json();
        if (data.tem_manifesto) {
            renderListaEntregas(data.numero_manifesto);
        } else {
            renderSearchScreen();
        }
    } catch (err) { logout(); }
}

function renderSearchScreen(message = null, type = 'info') {
    stopPolling();
    const content = document.getElementById('app-content');
    const alertHTML = message ? `<div class="alert alert-${type === 'error' ? 'danger' : 'info'}">${message}</div>` : '';
    content.innerHTML = `
        <div class="card shadow-sm p-4 mt-3">
            <h5 class="text-primary mb-3 text-center">Buscar Manifesto</h5>
            ${alertHTML}
            <form id="search-form">
                <input type="number" id="manifesto-number" class="form-control mb-3" placeholder="Número do Manifesto" required />
                <button class="btn btn-primary w-100">Buscar</button>
            </form>
        </div>
    `;
    document.getElementById('search-form').addEventListener('submit', handleManifestoSearch);
}

async function handleManifestoSearch(event) {
    event.preventDefault();
    const numero = document.getElementById('manifesto-number').value.trim();
    manifestoAtual = numero;
    loadingModal?.show();
    try {
        const response = await authFetch(`${API_BASE}manifesto/busca/`, {
            method: 'POST',
            body: JSON.stringify({ numero_manifesto: numero }),
        });
        if (response.ok) startPolling();
        else {
            loadingModal?.hide();
            renderSearchScreen('Manifesto não encontrado', 'error');
        }
    } catch (err) { loadingModal?.hide(); }
}

function startPolling() {
    stopPolling();
    pollingInterval = setInterval(async () => {
        try {
            const response = await authFetch(`${API_BASE}manifesto/status/?numero_manifesto=${manifestoAtual}`);
            const data = await response.json();
            if (data.status === 'PROCESSADO') {
                stopPolling();
                loadingModal?.hide();
                renderManifestoPreview(data.payload);
            }
        } catch (err) { stopPolling(); }
    }, 2000);
}

function stopPolling() {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
}

function renderManifestoPreview(payload) {
    const content = document.getElementById('app-content');
    const numeroManifesto = payload[0].sequence_code;
    content.innerHTML = `
        <div class="card shadow-sm mt-3 p-3 text-center">
            <h5 class="text-primary">Manifesto #${numeroManifesto}</h5>
            <button class="btn btn-primary btn-lg w-100 mt-3" onclick="iniciarTransporte('${numeroManifesto}')">
                <i class="bi bi-play-fill"></i> INICIAR TRANSPORTE
            </button>
        </div>
    `;
}

async function iniciarTransporte(numeroManifesto) {
    loadingModal?.show();
    try {
        const response = await authFetch(`${API_BASE}manifesto/iniciar/`, {
            method: 'POST',
            body: JSON.stringify({ numero_manifesto: numeroManifesto }),
        });
        if (response.ok) monitorarCriacaoNFs(numeroManifesto);
    } catch (err) { loadingModal?.hide(); }
}

function monitorarCriacaoNFs(numeroManifesto) {
    const interval = setInterval(async () => {
        const response = await authFetch(`${API_BASE}manifesto/status/?numero_manifesto=${numeroManifesto}`);
        const data = await response.json();
        if (data.status === 'PROCESSADO') {
            clearInterval(interval);
            loadingModal?.hide();
            renderListaEntregas(numeroManifesto);
        }
    }, 2000);
}

async function renderListaEntregas(numeroManifesto) {
    const content = document.getElementById('app-content');
    try {
        const response = await authFetch(`${API_BASE}manifesto/notas/?numero_manifesto=${numeroManifesto}`);
        const notas = await response.json();
        let htmlNotas = '';
        notas.forEach(nf => {
            const chaveValida = nf.chave_acesso && nf.chave_acesso !== "null" ? nf.chave_acesso : "";
            htmlNotas += `
                <div class="card mb-3 shadow-sm border-start border-${nf.ja_baixada ? 'success' : 'primary'} border-4">
                    <div class="card-body">
                        <h6 class="fw-bold">NF ${nf.numero_nota}</h6>
                        <p class="small text-muted mb-2">${nf.destinatario}</p>
                        ${nf.ja_baixada ? 
                            `<button class="btn btn-sm btn-outline-success w-100" onclick='abrirModalDetalhes(${JSON.stringify(nf.dados_baixa)})'>Ver Detalhes</button>` :
                            `<button class="btn btn-sm btn-primary w-100" ${!chaveValida ? 'disabled' : ''} onclick="abrirModalBaixa('${nf.numero_nota}', '${chaveValida}')">Dar Baixa</button>`
                        }
                    </div>
                </div>`;
        });
        content.innerHTML = `<div class="pb-5"><h5 class="mb-3">Manifesto ${numeroManifesto}</h5>${htmlNotas}</div>`;
    } catch (err) { console.error(err); }
}

function abrirModalBaixa(numeroNota, chaveAcesso) {
    document.getElementById('modal-titulo-nf').innerText = `Ocorrência NF-e ${numeroNota}`;
    document.getElementById('hidden-chave-nf').value = chaveAcesso;
    
    // Reseta interface da câmera
    document.getElementById('canvas-preview').style.display = 'none';
    document.getElementById('placeholder-camera').style.display = 'block';
    document.getElementById('label-camera').style.display = 'block';
    document.getElementById('btn-nova-foto').style.display = 'none';

    new bootstrap.Modal(document.getElementById('modalBaixa')).show();
}

function getCoords() {
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            () => resolve(null),
            { timeout: 5000 }
        );
    });
}

function initModals() {
    const loadingEl = document.getElementById('loadingModal');
    if (loadingEl) loadingModal = new bootstrap.Modal(loadingEl);
}

async function atualizarDadosHeader() {
    try {
        const res = await authFetch(`${AUTH_BASE}perfil/`);
        const data = await res.json();
        if (data?.nome) document.getElementById('header-nome-motorista').textContent = data.nome.split(' ')[0];
    } catch (e) {}
}

function abrirModalDetalhes(dados) {
    const container = document.getElementById('modal-detalhes-body');
    container.innerHTML = `
        <div class="mb-3 border-bottom pb-2">
            <span class="badge ${dados.tipo === 'ENTREGA' ? 'bg-success' : 'bg-warning'}">${dados.ocorrencia}</span>
        </div>
        <div class="mb-2"><strong>Data:</strong> ${dados.data}</div>
        <div class="mb-3"><strong>Recebedor:</strong> ${dados.recebedor || 'Não informado'}</div>
        ${dados.foto_url ? `<img src="${dados.foto_url}" class="img-fluid rounded shadow-sm w-100 mb-3">` : ''}
    `;
    new bootstrap.Modal(document.getElementById('modalDetalhes')).show();
}