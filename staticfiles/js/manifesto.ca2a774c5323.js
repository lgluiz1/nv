// =====================================================
// CONFIGURAÇÕES GERAIS
// =====================================================
const BASE_API_URL = 'http://localhost:8099/api/';

const ENDPOINTS = {
    status: `${BASE_API_URL}manifesto/status/`,
    busca: `${BASE_API_URL}manifesto/busca/`,
    finalizar: `${BASE_API_URL}manifesto/finalizar/`,
};

const LOGIN_URL = 'http://localhost:8099/app/login/';

// =====================================================
// VARIÁVEIS GLOBAIS
// =====================================================
let loadingModal = null;
let kmFinalModal = null;
let fotoArquivo = null;

// =====================================================
// INIT
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    initModals();
    checkManifestoStatus();
});

function initModals() {
    const loadingEl = document.getElementById('loadingModal');
    if (loadingEl) loadingModal = new bootstrap.Modal(loadingEl);

    const kmEl = document.getElementById('kmFinalModal');
    if (kmEl) {
        kmFinalModal = new bootstrap.Modal(kmEl);
        kmEl.addEventListener('shown.bs.modal', () => {
            document
                .getElementById('finalizar-form-modal')
                ?.addEventListener('submit', handleManifestoFinalization);
        });
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
// RENDERIZAÇÃO
// =====================================================
function renderSearchScreen(message = null, type = 'info') {
    const content = document.getElementById('app-content');

    const alertHTML = message
        ? `
        <div class="alert alert-${type === 'error' ? 'danger' : 'info'} alert-dismissible fade show">
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
                <input
                    type="number"
                    id="manifesto-number"
                    class="form-control mb-3"
                    placeholder="Número do Manifesto"
                    required
                />
                <button class="btn btn-primary w-100">Buscar</button>
            </form>
        </div>
    `;

    document
        .getElementById('search-form')
        .addEventListener('submit', handleManifestoSearch);
}

function renderManifestoDetails(data) {
    const content = document.getElementById('app-content');

    const pendentes = data.notas_fiscais.filter(n => n.status === 'PENDENTE').length;
    const total = data.notas_fiscais.length;

    let nfHTML = '';

    data.notas_fiscais.forEach(nf => {
        let color = 'warning';
        if (nf.status === 'BAIXADA') color = 'success';
        if (nf.status === 'OCORRÊNCIA') color = 'danger';

        nfHTML += `
            <div class="card mb-3 border-${color}">
                <div class="card-body">
                    <h6 class="text-danger">NF ${nf.numero_nota}</h6>
                    <p class="mb-1"><strong>${nf.destinatario || 'N/A'}</strong></p>
                    <span class="badge bg-${color}">${nf.status}</span>

                    ${
                        nf.status === 'PENDENTE'
                            ? `<button class="btn btn-sm btn-success float-end" onclick="goToBaixaScreen(${nf.id})">Baixar</button>`
                            : ''
                    }
                </div>
            </div>
        `;
    });

    content.innerHTML = `
        <div class="card shadow mb-4">
            <div class="card-body">
                <h4>Manifesto ${data.numero_manifesto}</h4>
                <p>Motorista: ${data.motorista.nome_completo}</p>
                <p>Status: <span class="badge bg-danger">${data.status}</span></p>
                <p>Total de Notas: ${total}</p>
                <p>Pendentes: ${pendentes}</p>
            </div>
        </div>

        ${pendentes === 0 && total > 0
            ? `<button class="btn btn-danger w-100" data-bs-toggle="modal" data-bs-target="#kmFinalModal">Finalizar Rota</button>`
            : nfHTML}
    `;
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
        await fetch(ENDPOINTS.busca, {
            method: 'POST',
            headers,
            body: JSON.stringify({ numero_manifesto: numero }),
        });

        // Inicia polling do preview
        const interval = setInterval(async () => {
            const res = await fetch(ENDPOINTS.status, { method: 'GET', headers });
            const data = await res.json();

            if (data.status_manifesto === 'AGUARDANDO') {
                loadingModal?.hide();

                // Renderiza preview básico
                renderManifestoPreview(data);
                clearInterval(interval);
            }
        }, 1000);
    } catch {
        loadingModal?.hide();
        renderSearchScreen('Erro de conexão', 'error');
    }
}

function renderManifestoPreview(data) {
    const content = document.getElementById('app-content');
    content.innerHTML = `
        <div class="card shadow p-4 mt-3">
            <h5>Manifesto ${data.numero_manifesto}</h5>
            <p>Total de NF: ${data.total_notas}</p>
            <button class="btn btn-primary w-100" onclick="iniciarTransporte('${data.numero_manifesto}')">
                Iniciar Transporte
            </button>
        </div>
    `;
}

function iniciarTransporte(numero_manifesto) {
    const headers = getAuthHeaders();
    fetch(ENDPOINTS.finalizar, { // ou outro endpoint para iniciar transporte
        method: 'POST',
        headers,
        body: JSON.stringify({ numero_manifesto }),
    }).then(() => {
        alert('Transporte iniciado! Processando manifesto...');
        checkManifestoStatus(); // atualiza tela
    });
}

// =====================================================
// FINALIZAR MANIFESTO
// =====================================================
async function handleManifestoFinalization(event) {
    event.preventDefault();

    const km = document.getElementById('km-final').value;
    const msg = document.getElementById('finalizar-message');

    if (!km) {
        msg.textContent = 'Informe a KM final';
        return;
    }

    const headers = getAuthHeaders();
    if (!headers) return;

    try {
        const response = await fetch(ENDPOINTS.finalizar, {
            method: 'POST',
            headers,
            body: JSON.stringify({ km_final: km }),
        });

        const data = await response.json();

        if (!response.ok) {
            msg.textContent = data.erro || 'Erro ao finalizar';
            return;
        }

        kmFinalModal?.hide();
        alert('Manifesto finalizado com sucesso!');
        checkManifestoStatus();
    } catch {
        msg.textContent = 'Erro de conexão';
    }
}

// =====================================================
// STATUS DO MANIFESTO
// =====================================================
async function checkManifestoStatus(message = null, type = 'info') {
    const headers = getAuthHeaders();
    if (!headers) return;

    try {
        const response = await fetch(ENDPOINTS.status, { method: 'GET', headers });
        const data = await response.json();

        if (data.status_manifesto === 'LIVRE') {
            renderSearchScreen(message, type);
        } else if (data.status_manifesto === 'AGUARDANDO') {
            // Mostra preview do manifesto mesmo que o usuário tenha saído / atualizado página
            renderManifestoPreview(data);
        } else if (data.status_manifesto === 'ATIVO') {
            renderManifestoDetails(data);
        }
    } catch {
        renderSearchScreen('Erro de conexão com servidor', 'error');
    }
}

// =====================================================
// OCORRÊNCIA / FOTO
// =====================================================
function abrirCamera() {
    document.getElementById('foto-ocorrencia').click();
}

document.getElementById('foto-ocorrencia')?.addEventListener('change', e => {
    fotoArquivo = e.target.files[0];
    if (!fotoArquivo) return;

    const reader = new FileReader();
    reader.onload = () => {
        document.getElementById('preview-img').src = reader.result;
        document.getElementById('preview-container').classList.remove('d-none');
    };
    reader.readAsDataURL(fotoArquivo);
});
