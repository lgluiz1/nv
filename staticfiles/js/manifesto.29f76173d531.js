// =====================================================
// CONFIGURAÇÕES
// =====================================================
const API_BASE = window.location.hostname.includes('ngrok')
  ? 'https://1bdf6f7e1548.ngrok-free.app/api/'
  : 'http://localhost:8089/api/';

const ENDPOINTS = {
    busca: `${API_BASE}manifesto/busca/`,
    status: `${API_BASE}manifesto/status/`,
    iniciar: `${API_BASE}manifesto/iniciar/`
};

const LOGIN_URL = '/app/login/';

let loadingModal = null;
let pollingInterval = null;
let manifestoAtual = null;
let streamFull = null; // Variável global para o stream da câmera

// =====================================================
// INIT
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    initModals();
    verificarEstadoInicial(); 
});

async function verificarEstadoInicial() {
    const headers = getAuthHeaders();
    if (!headers) return;

    try {
        const response = await fetch(`${API_BASE}manifesto/verificar-ativo/`, { headers });
        const data = await response.json();

        if (data.tem_manifesto) {
            renderListaEntregas(data.numero_manifesto);
        } else {
            renderSearchScreen();
        }
    } catch (err) {
        console.error("Erro ao verificar estado:", err);
        renderSearchScreen();
    }
}

// =====================================================
// AUTH & MODAIS
// =====================================================
function initModals() {
    const loadingEl = document.getElementById('loadingModal');
    if (loadingEl) loadingModal = new bootstrap.Modal(loadingEl);
}

function getAuthHeaders() {
    const token = localStorage.getItem('accessToken');
    if (!token) { logout(); return null; }
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

function logout() {
    localStorage.removeItem('accessToken');
    window.location.href = LOGIN_URL;
}

// =====================================================
// TELAS (BUSCA / PREVIEW / LISTAGEM)
// =====================================================
function renderSearchScreen(message = null, type = 'info') {
    stopPolling();
    const content = document.getElementById('app-content');
    const alertHTML = message ? `<div class="alert alert-${type === 'error' ? 'danger' : 'info'}">${message}</div>` : '';

    content.innerHTML = `
        <div class="card shadow-sm p-4 mt-3">
            <h5 class="text-primary mb-3">Buscar Manifesto</h5>
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
    const headers = getAuthHeaders();
    if (!headers) return;

    manifestoAtual = numero;
    loadingModal?.show();

    try {
        await fetch(ENDPOINTS.busca, {
            method: 'POST',
            headers,
            body: JSON.stringify({ numero_manifesto: numero }),
        });
        startPolling();
    } catch (err) {
        loadingModal?.hide();
        renderSearchScreen('Erro de conexão', 'error');
    }
}

function startPolling() {
    stopPolling();
    pollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`${ENDPOINTS.status}?numero_manifesto=${manifestoAtual}`, { headers: getAuthHeaders() });
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
        <div class="card shadow-sm mt-3 p-3">
            <h5>Manifesto #${numeroManifesto}</h5>
            <button class="btn btn-primary w-100 mt-3" onclick="iniciarTransporte('${numeroManifesto}')">INICIAR TRANSPORTE</button>
        </div>
    `;
}

async function iniciarTransporte(numeroManifesto) {
    loadingModal?.show();
    try {
        const response = await fetch(ENDPOINTS.iniciar, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ numero_manifesto: numeroManifesto }),
        });
        if (response.ok) monitorarCriacaoNFs(numeroManifesto);
    } catch (err) { loadingModal?.hide(); }
}

function monitorarCriacaoNFs(numeroManifesto) {
    const interval = setInterval(async () => {
        const response = await fetch(`${ENDPOINTS.status}?numero_manifesto=${numeroManifesto}`, { headers: getAuthHeaders() });
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
        const response = await fetch(`${API_BASE}manifesto/notas/?numero_manifesto=${numeroManifesto}`, { headers: getAuthHeaders() });
        const notas = await response.json();
        console.log("Notas recebidas do servidor:", notas); // 👈 Verifique a chave_acesso aqui
        let htmlNotas = '';
    notas.forEach(nf => {
        // Se a chave for null, mostramos um aviso ou desabilitamos o botão
        const chaveValida = nf.chave_acesso && nf.chave_acesso !== "null" ? nf.chave_acesso : "";
        
        htmlNotas += `
            <div class="card mb-3 shadow-sm">
                <div class="card-body">
                    <h6>NF ${nf.numero_nota}</h6>
                    <p class="small text-muted">${nf.endereco_entrega}</p>
                    <button class="btn btn-primary w-100" 
                        ${!chaveValida ? 'disabled' : ''} 
                        onclick="abrirModalBaixa('${nf.numero_nota}', '${chaveValida}')">
                        ${chaveValida ? 'Dar Baixa' : 'Chave NF Ausente'}
                    </button>
                </div>
            </div>`;
    });
        content.innerHTML = `
    <div class="animate__animated animate__fadeIn pb-5"> <h5 class="mb-3 fw-bold text-secondary">Notas do Manifesto ${numeroManifesto}</h5>
        ${htmlNotas}
        <div style="height: 80px;"></div> </div>
`;
    } catch (err) { console.error(err); }
}

// =====================================================
// LÓGICA DA CÂMERA (TELA CHEIA)
// =====================================================

function abrirModalBaixa(numeroNota, chaveAcesso) {
    const tituloEl = document.getElementById('modal-titulo-nf');
    const inputChave = document.getElementById('hidden-chave-nf');

    if (!tituloEl || !inputChave) return;

    tituloEl.innerText = `Ocorrência NF-e ${numeroNota}`;
    inputChave.value = chaveAcesso;

    resetarInterfaceCamera();

    const modalBaixa = new bootstrap.Modal(document.getElementById('modalBaixa'));
    modalBaixa.show();
}

function resetarInterfaceCamera() {
    const canvas = document.getElementById('canvas-preview');
    const placeholder = document.getElementById('placeholder-camera');
    if (canvas) canvas.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
}

// ESTA FUNÇÃO SUBSTITUI A ANTIGA "ligarCamera"
async function ligarCameraFull() {
    const overlay = document.getElementById('full-screen-camera');
    const video = document.getElementById('video-full');

    try {
        streamFull = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" }, 
            audio: false 
        });
        video.srcObject = streamFull;
        overlay.style.display = 'block'; 
    } catch (err) {
        // Fallback para qualquer câmera se a traseira falhar (comum em PCs)
        try {
            streamFull = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = streamFull;
            overlay.style.display = 'block';
        } catch (err2) {
            alert("Erro ao acessar câmera: " + err2);
        }
    }
}

function capturarFotoFull() {
    const video = document.getElementById('video-full');
    const canvas = document.getElementById('canvas-preview');
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    canvas.style.display = 'block';
    document.getElementById('placeholder-camera').style.display = 'none';
    
    fecharCameraFull();
}

function fecharCameraFull() {
    if (streamFull) {
        streamFull.getTracks().forEach(track => track.stop());
    }
    document.getElementById('full-screen-camera').style.display = 'none';
}

// =====================================================
// SALVAR NO BACKEND
// =====================================================
async function salvarRegistro() {
    const cod = document.getElementById('select-ocorrencia').value;
    const recebedor = document.getElementById('input-recebedor').value;
    const canvas = document.getElementById('canvas-preview');
    const temFoto = (canvas.style.display === 'block');
    const chaveNF = document.getElementById('hidden-chave-nf').value;

    if ((cod === "1" || cod === "2") && !temFoto) {
        alert("A foto é obrigatória para este código!");
        return;
    }

    loadingModal?.show();
    const formData = new FormData();
    formData.append('ocorrencia_codigo', cod);
    formData.append('chave_acesso', chaveNF);
    formData.append('recebedor', recebedor);
    
    if (temFoto) {
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
        formData.append('foto', blob, `${chaveNF}.jpg`);
    }

    try {
        const response = await fetch(`${API_BASE}manifesto/registrar-baixa/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
            body: formData
        });
        if (response.ok) {
            alert("Sucesso!");
            location.reload();
        }
    } catch (err) { alert("Erro ao salvar."); }
    finally { loadingModal?.hide(); }
}

function getCoords() {
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            () => resolve(null), // Se der erro ou recusar, segue sem GPS
            { timeout: 5000 }
        );
    });
}

async function salvarRegistro() {
    const token = localStorage.getItem('accessToken');
    
    // Se não tiver token, nem tenta enviar e manda para o login
    if (!token) {
        alert("Sessão expirada. Por favor, faça login novamente.");
        window.location.href = '/app/login/';
        return;
    }

    const cod = document.getElementById('select-ocorrencia').value;
    const chaveNF = document.getElementById('hidden-chave-nf').value;
    const canvas = document.getElementById('canvas-preview');
    const temFoto = (canvas.style.display === 'block');

    loadingModal?.show();

    const formData = new FormData();
    formData.append('ocorrencia_codigo', cod);
    formData.append('chave_acesso', chaveNF);
    formData.append('recebedor', document.getElementById('input-recebedor').value || '');

    // GPS
    const coords = await getCoords();
    if (coords) {
        formData.append('latitude', coords.lat);
        formData.append('longitude', coords.lon);
    }

    // Foto
    if (temFoto) {
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
        formData.append('foto', blob, `${chaveNF}.jpg`);
    }

    try {
        const response = await fetch(`${API_BASE}manifesto/registrar-baixa/`, {
            method: 'POST',
            headers: {
                // AQUI ESTÁ A AUTENTICAÇÃO
                'Authorization': `Bearer ${token}` 
                // NOTA: Não coloque 'Content-Type': 'application/json' aqui!
            },
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            alert("Baixa realizada com sucesso!");
            location.reload();
        } else {
            // Se der erro 400 ou 401, o alerta mostrará o motivo
            alert("Erro: " + (data.erro || data.detail || "Falha no registro"));
        }
    } catch (err) {
        alert("Erro de conexão com o servidor.");
    } finally {
        loadingModal?.hide();
    }
}