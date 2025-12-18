// =====================================================
// CONFIGURAÇÕES
// =====================================================
const BASE_API_URL = 'http://localhost:8099/api/';
const ENDPOINTS = {
    status: `${BASE_API_URL}manifesto/status/`,
    busca: `${BASE_API_URL}manifesto/busca/`,
    iniciar: `${BASE_API_URL}manifesto/iniciar/`,
};
const LOGIN_URL = 'http://localhost:8099/app/login/';

// =====================================================
// VARIÁVEIS GLOBAIS
// =====================================================
let loadingModal = null;
let kmFinalModal = null;
let pollInterval = null;

// =====================================================
// INIT
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    initModals();
    checkManifestoStatus(); // Verifica se existe manifesto real
});

function initModals() {
    const loadingEl = document.getElementById('loadingModal');
    if (loadingEl) loadingModal = new bootstrap.Modal(loadingEl);

    const kmEl = document.getElementById('kmFinalModal');
    if (kmEl) {
        kmFinalModal = new bootstrap.Modal(kmEl);
    }
}

// =====================================================
// AUTH
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
// BUSCA DE MANIFESTO
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
        const data = await response.json();
        loadingModal?.hide();

        if (!response.ok) {
            renderSearchScreen(data.erro || 'Erro ao buscar manifesto', 'error');
            return;
        }

        // Mostra preview do manifesto
        renderManifestoPreview({ numero_manifesto: numero, total_notas: 0 });
    } catch (err) {
        loadingModal?.hide();
        renderSearchScreen('Erro de conexão com servidor', 'error');
    }
}

// =====================================================
// RENDERIZAÇÃO
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

    document
        .getElementById('search-form')
        .addEventListener('submit', handleManifestoSearch);
}

function renderManifestoPreview(data) {
    const content = document.getElementById('app-content');

    content.innerHTML = `
        <div class="card shadow-sm p-4 mt-3">
            <h5 class="text-primary mb-3">Manifesto ${data.numero_manifesto}</h5>
            <p>Total de Notas: ${data.total_notas || 0}</p>
            <button class="btn btn-danger w-100" id="iniciar-transporte-btn">Iniciar Transporte</button>
        </div>
    `;

    document
        .getElementById('iniciar-transporte-btn')
        .addEventListener('click', () => iniciarTransporte(data.numero_manifesto));
}

function renderManifestoDetails(data) {
    const content = document.getElementById('app-content');

    const pendentes = data.notas_fiscais.filter(n => n.status === 'PENDENTE').length;
    const total = data.notas_fiscais.length;

    let nfHTML = '';
    data.notas_fiscais.forEach(nf => {
        let color = 'warning';
        if (nf.status === 'BAIXADA') color = 'success';
        if (nf.status === 'OCORRENCIA') color = 'danger';
        nfHTML += `
            <div class="card mb-3 border-${color}">
                <div class="card-body">
                    <h6 class="text-danger">NF ${nf.numero_nota}</h6>
                    <p class="mb-1"><strong>${nf.destinatario || 'N/A'}</strong></p>
                    <span class="badge bg-${color}">${nf.status}</span>
                </div>
            </div>
        `;
    });

    content.innerHTML = `
        <div class="card shadow mb-4">
            <div class="card-body">
                <h4>Manifesto ${data.numero_manifesto}</h4>
                <p>Status: <span class="badge bg-danger">${data.status}</span></p>
                <p>Total de Notas: ${total}</p>
                <p>Pendentes: ${pendentes}</p>
            </div>
        </div>
        ${nfHTML}
    `;
}

// =====================================================
// INICIAR TRANSPORTE
// =====================================================
async function iniciarTransporte(numero_manifesto) {
    const headers = getAuthHeaders();
    if (!headers) return;

    loadingModal?.show();

    try {
        const response = await fetch(ENDPOINTS.iniciar, {
            method: 'POST',
            headers,
            body: JSON.stringify({ numero_manifesto }),
        });
        const data = await response.json();

        loadingModal?.hide();

        if (!response.ok) {
            alert(data.erro || 'Erro ao iniciar transporte');
            return;
        }

        alert('Transporte iniciado! Manifesto está sendo processado.');

        // Polling para atualizar status
        startPollingStatus();
    } catch {
        loadingModal?.hide();
        alert('Erro de conexão ao iniciar transporte');
    }
}

// =====================================================
// STATUS / POLLING
// =====================================================
async function checkManifestoStatus() {
    const headers = getAuthHeaders();
    if (!headers) return;

    try {
        const response = await fetch(ENDPOINTS.status, { method: 'GET', headers });
        if (response.status === 401) {
            logout();
            return;
        }
        const data = await response.json();

        if (data.status_manifesto === 'LIVRE') {
            renderSearchScreen();
        } else {
            renderManifestoDetails(data);
        }
    } catch {
        renderSearchScreen('Erro ao conectar com servidor', 'error');
    }
}

function startPollingStatus() {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
        const headers = getAuthHeaders();
        if (!headers) return;

        const response = await fetch(ENDPOINTS.status, { method: 'GET', headers });
        const data = await response.json();

        if (data.status_manifesto === 'LIVRE') {
            clearInterval(pollInterval);
            renderSearchScreen();
        } else {
            renderManifestoDetails(data);
        }
    }, 3000); // a cada 3 segundos
}
