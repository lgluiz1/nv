// manifesto.js

// ** CRÍTICO: Configure estas URLs com sua porta e rotas **
const BASE_API_URL = 'http://localhost:8099/api/'; 
const MANIFESTO_STATUS_ENDPOINT = BASE_API_URL + 'manifesto/status/';
const MANIFESTO_BUSCA_ENDPOINT = BASE_API_URL + 'manifesto/busca/';
const PWA_LOGIN_URL = 'http://localhost:8099/app/login/'; 

// --- GLOBAIS ---
let loadingModal; // Variável para o modal

document.addEventListener('DOMContentLoaded', () => {
    // Inicializa o objeto Modal do Bootstrap
    loadingModal = new bootstrap.Modal(document.getElementById('loadingModal'));
    checkManifestoStatus();
});


function getAuthHeaders() {
    const token = localStorage.getItem('accessToken');
    if (!token) { logout(); return null; }
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
    };
}

function logout() {
    localStorage.removeItem('accessToken');
    window.location.href = PWA_LOGIN_URL;
}


// --- FUNÇÕES DE RENDERIZAÇÃO ---

function renderSearchScreen(message = null, type = 'info') {
    const content = document.getElementById('app-content');
    let alertClass = type === 'error' ? 'alert-danger' : 'alert-info';
    
    content.innerHTML = `
        <div class="card shadow-sm p-4 mt-3">
            <h5 class="text-primary mb-3">Buscar Novo Manifesto</h5>
            <p class="text-muted">Nenhum manifesto ativo. Digite o número da viagem para iniciar a jornada.</p>

            ${message ? `<div class="alert ${alertClass} alert-dismissible fade show" role="alert">${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>` : ''}

            <form id="search-form" class="mt-3">
                <input type="number" id="manifesto-number" class="form-control mb-3" placeholder="Número do Manifesto (Ex: 55041)" required>
                <button type="submit" class="btn btn-primary w-100">Buscar e Iniciar</button>
            </form>
        </div>
        
        `;

    document.getElementById('search-form').addEventListener('submit', handleManifestoSearch);
}

function renderManifestoDetails(manifestoData) {
    const content = document.getElementById('app-content');
    const pendentes = manifestoData.notas_fiscais.filter(nf => nf.status === 'PENDENTE').length;
    const totalNFs = manifestoData.notas_fiscais.length;
    
    let nfList = '';
    manifestoData.notas_fiscais.forEach(nf => {
        const isPending = nf.status === 'PENDENTE';
        const statusColor = isPending ? 'warning' : 'success';
        
        nfList += `
            <div class="card card-nf shadow-sm mb-3 border-${statusColor}">
                <div class="card-body p-3">
                    <h6 class="card-title text-danger mb-1">
                        <i class="bi bi-file-earmark-text"></i> NFE: ${nf.numero_nota}
                    </h6>
                    <p class="mb-1">
                        <i class="bi bi-person"></i> Cliente: <strong>${nf.destinatario}</strong>
                    </p>
                    <p class="text-muted small mb-2">
                        <i class="bi bi-geo-alt"></i> ${nf.endereco_entrega}
                    </p>
                    <span class="badge bg-${statusColor} mb-2">${nf.status}</span>
                    
                    ${isPending 
                        ? `<button onclick="goToBaixaScreen(${nf.id})" class="btn btn-sm btn-success float-end">Baixar / Ocorrência</button>` 
                        : ''}
                </div>
            </div>
        `;
    });

    content.innerHTML = `
        <div class="card shadow mb-4 card-manifesto">
            <div class="header-status">
                <h4 class="mb-0">Manifesto: ${manifestoData.numero_manifesto}</h4>
            </div>
            <div class="card-body">
                <p class="card-text mb-1">Motorista: ${manifestoData.motorista.nome_completo}</p>
                <p class="card-text mb-1">Status: <span class="badge bg-danger">Aguardando</span></p>
                <p class="card-text mb-1">${totalNFs} Rotas.</p>
                <p class="card-text small text-muted">Pendentes: <strong>${pendentes}</strong></p>
            </div>
        </div>
        
        <h5 class="mb-3">Notas Fiscais</h5>
        <div class="nf-list">${nfList}</div>

        ${pendentes === totalNFs 
            ? `<button class="btn btn-success btn-lg w-100 mt-4" onclick="handleStartRoute()">Iniciar Transporte</button>` 
            : ''}

        ${pendentes === 0 && totalNFs > 0
            ? `
                <form id="finalizar-form" class="card p-3 mt-4 shadow-sm">
                    <h5 class="text-success">Finalizar Manifesto</h5>
                    <input type="number" id="km-final" class="form-control mb-2" placeholder="KM Final" required>
                    <button type="submit" class="btn btn-danger w-100">Finalizar Jornada</button>
                </form>
              `
            : ''}
        
        `;
    
    // REMOVIDO o listener do botão de logout
    if (pendentes === 0 && totalNFs > 0) {
        document.getElementById('finalizar-form').addEventListener('submit', handleManifestoFinalization);
    }
}

function goToBaixaScreen(nfId) {
    alert(`Redirecionando para a tela de baixa da NF ID: ${nfId}`);
}

// Lógica para Iniciar Rota (Apenas um placeholder de UX)
function handleStartRoute() {
    alert("Iniciando GPS e Jornada! Clique em 'Baixar / Ocorrência' para começar.");
}


// --- FUNÇÕES DE LÓGICA DE API ---

async function handleManifestoSearch(event) {
    event.preventDefault();
    const manifestoNumber = document.getElementById('manifesto-number').value.trim();
    
    // 1. Mostrar o Modal de Loading
    loadingModal.show();

    const headers = getAuthHeaders();
    if (!headers) { loadingModal.hide(); return; }

    try {
        // 2. Requisição SÍNCRONA
        const response = await fetch(MANIFESTO_BUSCA_ENDPOINT, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ numero_manifesto: manifestoNumber }) 
        });

        const data = await response.json();
        
        if (response.ok) {
            // SUCESSO: A Task processou e salvou no DB
            loadingModal.hide();
            // Recarrega o status, que agora deve encontrar o manifesto
            checkManifestoStatus(data.mensagem, 'success'); 
        } else {
            // ERRO: A Task falhou (400 Bad Request, ex: Documento não confere)
            loadingModal.hide();
            // Mostra o erro retornado pela Task Celery
            renderSearchScreen(data.mensagem || 'Erro desconhecido na busca.', 'error');
        }

    } catch (error) {
        // Erro de rede ou Timeout (500 Internal Server Error do Django)
        loadingModal.hide();
        renderSearchScreen(`Falha na comunicação: ${error.message}`, 'error');
    }
}


async function handleManifestoFinalization(event) {
    event.preventDefault();
    const kmFinal = document.getElementById('km-final').value.trim();
    if (!kmFinal) return;

    if (!confirm(`Confirmar KM Final ${kmFinal} e finalizar o manifesto?`)) return;

    const headers = getAuthHeaders();
    if (!headers) return;

    try {
        const response = await fetch(BASE_API_URL + 'manifesto/finalizar/', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ km_final: kmFinal })
        });

        const data = await response.json();
        
        if (response.ok) {
            alert(data.mensagem);
            checkManifestoStatus(); 
        } else {
            alert(`Erro ao finalizar: ${data.mensagem || 'Ocorreu um erro.'}`);
        }

    } catch (error) {
        console.error('Falha ao finalizar:', error);
        alert('Erro de conexão ao finalizar manifesto.');
    }
}


// --- FUNÇÃO DE INICIALIZAÇÃO E CHECAGEM DE STATUS ---

async function checkManifestoStatus(lastMessage = null, lastType = 'info') {
    const headers = getAuthHeaders();
    if (!headers) return; 

    try {
        const response = await fetch(MANIFESTO_STATUS_ENDPOINT, {
            method: 'GET',
            headers: headers
        });

        if (response.status === 401) {
            logout();
            return;
        }

        const data = await response.json();

        if (response.ok) {
            if (data.status_manifesto === 'LIVRE') {
                // Renderiza tela de Busca, passando a última mensagem da Task (se houver)
                renderSearchScreen(lastMessage, lastType);
            } else {
                // Renderiza tela de Detalhes do Manifesto
                renderManifestoDetails(data);
            }
        } else {
            throw new Error(data.mensagem || 'Erro desconhecido ao carregar status.');
        }

    } catch (error) {
        console.error("Falha na comunicação:", error);
        document.getElementById('app-content').innerHTML = `
            <p class="text-danger">Erro ao conectar com o servidor: ${error.message}.</p>
            <button onclick="logout()" class="btn btn-sm btn-outline-secondary">Tentar Logout</button>
        `;
    }
}