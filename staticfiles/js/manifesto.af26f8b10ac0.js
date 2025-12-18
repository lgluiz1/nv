// =====================================================
// CONFIGURAÇÕES
// =====================================================
const API_BASE = window.location.hostname.includes('ngrok')
  ? 'https://9ee00b85b0fc.ngrok-free.app/api/'
  : 'http://localhost:8089/api/';

const WS_BASE = window.location.hostname.includes('ngrok')
  ? 'wss://9ee00b85b0fc.ngrok-free.app'
  : 'ws://localhost:8099';

const ENDPOINTS = {
    busca: `${API_BASE}manifesto/busca/`,
    iniciar: `${API_BASE}manifesto/iniciar/`
};

const LOGIN_URL = '/app/login/';
const motoristaId = localStorage.getItem('motorista_id');

let loadingModal = null;
let ws = null;

// =====================================================
// INIT
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    initModals();
    initWebSocket();
    renderSearchScreen();
});

// =====================================================
// Modais
// =====================================================
function initModals() {
    const loadingEl = document.getElementById('loadingModal');
    if (loadingEl) loadingModal = new bootstrap.Modal(loadingEl);
}

// =====================================================
// Auth
// =====================================================
function getAuthHeaders() {
    const token = localStorage.getItem('accessToken');
    if (!token) {
        logout();
        return null;
    }
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };
}

function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('motorista_id');
    window.location.href = LOGIN_URL;
}


// =====================================================
// WebSocket
// =====================================================
function initWebSocket() {
    if (!motoristaId) {
        console.warn('Motorista ID não encontrado');
        logout();
        return;
    }

    if (ws) return; // evita duplicar conexão

    ws = new WebSocket(`${WS_BASE}/ws/manifesto/${motoristaId}/`);

    ws.onopen = () => {
        console.log('WebSocket conectado');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('WS DATA:', data);

        loadingModal?.hide();

        if (data.status === 'ERRO') {
            renderSearchScreen(data.mensagem, 'error');
            return;
        }

        if (data.status === 'PROCESSADO') {
            renderManifestoPreview(data.payload);
        }
    };

    ws.onerror = (event) => {
        console.error('WebSocket erro:', event);
        loadingModal?.hide();
        renderSearchScreen('Erro no WebSocket', 'error');
    };

    ws.onclose = () => {
        console.log('WebSocket fechado');
        ws = null;
    };
}

// =====================================================
// Tela de busca
// =====================================================
function renderSearchScreen(message = null, type = 'info') {
    const content = document.getElementById('app-content');

    const alertHTML = message
        ? `<div class="alert alert-${type === 'error' ? 'danger' : 'info'} alert-dismissible fade show">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>`
        : '';

    content.innerHTML = `
        <div class="card shadow-sm p-4 mt-3">
            <h5 class="text-primary mb-3">Buscar Manifesto</h5>
            <p class="text-muted">Digite o número do manifesto para iniciar.</p>
            ${alertHTML}
            <form id="search-form">
                <input type="number" id="manifesto-number" class="form-control mb-3" placeholder="Número do Manifesto" required />
                <button class="btn btn-primary w-100">Buscar</button>
            </form>
        </div>
    `;

    document.getElementById('search-form')
        .addEventListener('submit', handleManifestoSearch);
}

// =====================================================
// Buscar manifesto
// =====================================================
async function handleManifestoSearch(event) {
    event.preventDefault();

    const numero = document.getElementById('manifesto-number').value.trim();
    const headers = getAuthHeaders();
    if (!headers) return;

    loadingModal?.show();

    try {
        const response = await fetch(ENDPOINTS.busca, {
            method: 'POST',
            headers,
            body: JSON.stringify({ numero_manifesto: numero }),
        });

        if (!response.ok && response.status !== 202) {
            const data = await response.json();
            loadingModal?.hide();
            renderSearchScreen(data.erro || 'Erro ao buscar manifesto', 'error');
            return;
        }

        // ✅ NÃO abre WS aqui
        // backend vai responder via WS

    } catch (err) {
        loadingModal?.hide();
        renderSearchScreen('Erro de conexão com servidor', 'error');
    }
}



// =====================================================
// Preview do manifesto com botão Iniciar Transporte
// =====================================================
function renderManifestoPreview(payload) {
    const content = document.getElementById('app-content');
    const totalNotas = payload.length;

    let nfHTML = '';
    payload.forEach(nf => {
        nfHTML += `
            <div class="card mb-3">
                <div class="card-body">
                    <h6>NF ${nf[MAPA_JSON['NUMERO_NF']]}</h6>
                    <p>${nf[MAPA_JSON['NOME_CLIENTE']]}</p>
                </div>
            </div>
        `;
    });

    content.innerHTML = `
        <div class="card shadow-sm p-4 mt-3">
            <h5 class="text-primary mb-3">Manifesto ${payload[0][MAPA_JSON['NUMERO_MANIFESTO_EVT']]}</h5>
            <p>Total de notas: ${totalNotas}</p>
            <button class="btn btn-success w-100" id="btn-iniciar">Iniciar Transporte</button>
        </div>
        ${nfHTML}
    `;

    document.getElementById('btn-iniciar')
        .addEventListener('click', () => iniciarTransporte(payload));
}

// =====================================================
// Iniciar transporte → dispara processa_manifesto_dataexport
// =====================================================
async function iniciarTransporte(payload) {
    const headers = getAuthHeaders();
    if (!headers) return;

    const numeroManifesto = payload[0][MAPA_JSON['NUMERO_MANIFESTO_EVT']];
    loadingModal?.show();

    try {
        const response = await fetch(ENDPOINTS.iniciar, {
            method: 'POST',
            headers,
            body: JSON.stringify({ numero_manifesto: numeroManifesto }),
        });

        const data = await response.json();

        loadingModal?.hide();

        if (!response.ok) {
            renderSearchScreen(data.erro || 'Erro ao iniciar transporte', 'error');
            return;
        }

        alert('Transporte iniciado com sucesso!');
        renderSearchScreen(); // volta tela de busca para novos manifestos
    } catch (err) {
        loadingModal?.hide();
        renderSearchScreen('Erro de conexão ao iniciar transporte', 'error');
    }
}
