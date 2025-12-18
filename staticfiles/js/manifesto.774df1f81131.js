// =====================================================
// CONFIGURAÇÕES
// =====================================================
const API_BASE = window.location.hostname.includes('ngrok')
  ? 'https://9ee00b85b0fc.ngrok-free.app/api/'
  : 'http://localhost:8089/api/';

const ENDPOINTS = {
    busca: `${API_BASE}manifesto/busca/`,
    status: `${API_BASE}manifesto/status/`, // 👈 CERTO
    iniciar: `${API_BASE}manifesto/iniciar/`
};

const LOGIN_URL = '/app/login/';

let loadingModal = null;
let pollingInterval = null;
let manifestoAtual = null;

// =====================================================
// INIT
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    initModals();
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
    window.location.href = LOGIN_URL;
}

// =====================================================
// Tela de busca
// =====================================================
function renderSearchScreen(message = null, type = 'info') {
    stopPolling();

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
                <input type="number" id="manifesto-number" class="form-control mb-3"
                       placeholder="Número do Manifesto" required />
                <button class="btn btn-primary w-100">Buscar</button>
            </form>
        </div>
    `;

    document
        .getElementById('search-form')
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

    manifestoAtual = numero;
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

        // 🔁 inicia polling
        startPolling();

    } catch (err) {
        loadingModal?.hide();
        renderSearchScreen('Erro de conexão com servidor', 'error');
    }
}

// =====================================================
// POLLING
// =====================================================
// =====================================================
// POLLING
// =====================================================
function startPolling() {
    stopPolling();

    pollingInterval = setInterval(async () => {
        const headers = getAuthHeaders();
        if (!headers) return;

        try {
            const response = await fetch(
                `${ENDPOINTS.status}?numero_manifesto=${manifestoAtual}`,
                { headers }
            );

            const data = await response.json();

            if (data.status === 'ERRO') {
                stopPolling();
                loadingModal?.hide();
                renderSearchScreen(data.mensagem_erro || 'Erro no manifesto', 'error');
            }

            if (data.status === 'PROCESSADO' && data.payload) {
                stopPolling();
                loadingModal?.hide();
                renderManifestoPreview(data.payload);
            }

        } catch (err) {
            stopPolling();
            loadingModal?.hide();
            renderSearchScreen('Erro ao consultar status do manifesto', 'error');
        }

    }, 2000); // ⏱ a cada 2s
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

// =====================================================
// Preview do manifesto
// =====================================================
function renderManifestoPreview(payload) {
    const content = document.getElementById('app-content');
    
    // Cálculos para o Resumo
    const numeroManifesto = payload[0]['sequence_code'];
    const totalNfs = payload.length;
    
    // Soma o valor total das notas (ajuste 'valor_nf' para a chave correta do seu JSON)
    const valorTotal = payload.reduce((acc, nf) => {
        return acc + (parseFloat(nf['mft_fis_fit_fis_ioe_value']) || 0);
    }, 0);

    content.innerHTML = `
        <div class="card shadow-sm border-0 mt-3">
            <div class="card-body">
                <h4 class="text-primary fw-bold">Manifesto ${numeroManifesto}</h4>
                <hr>
                <div class="row text-center mb-4">
                    <div class="col">
                        <small class="text-muted d-block">Total NF-e</small>
                        <span class="fs-4 fw-bold">${totalNfs}</span>
                    </div>
                    <div class="col">
                        <small class="text-muted d-block">Valor Total</small>
                        <span class="fs-4 fw-bold text-success">
                            R$ ${valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                        </span>
                    </div>
                </div>
                
                <button class="btn btn-primary btn-lg w-100 shadow-sm" id="btn-iniciar">
                    <i class="bi bi-truck me-2"></i> INICIAR TRANSPORTE
                </button>
            </div>
        </div>
    `;

    document.getElementById('btn-iniciar').addEventListener('click', () => {
        iniciarTransporte(numeroManifesto);
    });
}
// =====================================================
// Iniciar transporte
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
        renderSearchScreen();

    } catch (err) {
        loadingModal?.hide();
        renderSearchScreen('Erro de conexão ao iniciar transporte', 'error');
    }
}
