// manifesto.js

// ** CRÍTICO: Configure estas URLs com sua porta e rotas **
const BASE_API_URL = 'http://localhost:8099/api/'; 
const MANIFESTO_STATUS_ENDPOINT = BASE_API_URL + 'manifesto/status/';
const MANIFESTO_BUSCA_ENDPOINT = BASE_API_URL + 'manifesto/busca/';
const PWA_FINALIZAR_ENDPOINT = BASE_API_URL + 'manifesto/finalizar/';
const PWA_LOGIN_URL = 'http://localhost:8099/app/login/'; 

// --- GLOBAIS ---
let loadingModal; // Modal de busca assíncrona
let kmFinalModal; // Modal de confirmação de KM Final

document.addEventListener('DOMContentLoaded', () => {
    // Inicializa os objetos Modal do Bootstrap
    loadingModal = new bootstrap.Modal(document.getElementById('loadingModal'));
    
    // Verifica se o elemento do modal KM Final existe antes de inicializar (precisa estar no HTML)
    const kmModalElement = document.getElementById('kmFinalModal');
    if (kmModalElement) {
        kmFinalModal = new bootstrap.Modal(kmModalElement);
        // Anexa o listener ao formulário dentro do modal
        kmModalElement.addEventListener('shown.bs.modal', function () {
            document.getElementById('finalizar-form-modal').addEventListener('submit', handleManifestoFinalization);
        });
    }

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
    
    // Status para controle de UX (pode ser AGUARDANDO_INICIO, EM_ROTA, PRONTO_PARA_FINALIZAR, etc. - Defina este campo no Serializador Django)
    const status_app = manifestoData.status_app || (pendentes === totalNFs ? 'AGUARDANDO_INICIO' : 'EM_ROTA'); 
    
    let nfList = '';
    
    // Monta a lista de NF-es APENAS se não estiver AGUARDANDO INÍCIO
    if (status_app !== 'AGUARDANDO_INICIO') {
        manifestoData.notas_fiscais.forEach(nf => {
            const isPending = nf.status === 'PENDENTE';
            
            // LÓGICA DE CORES: Verde (Baixada/Entregue), Vermelho/Laranja (Ocorrência/Problema), Amarelo (Pendente)
            let statusColor = 'warning'; 
            if (nf.status === 'BAIXADA') {
                statusColor = 'success'; // 🟢 Entregue / Baixada
            } else if (nf.status === 'OCORRÊNCIA') {
                statusColor = 'danger'; // 🔴 Ocorrência (finaliza a NF)
            }
            
            nfList += `
                <div class="card card-nf shadow-sm mb-3 border-${statusColor}">
                    <div class="card-body p-3">
                        <h6 class="card-title text-danger mb-1">
                            <i class="bi bi-file-earmark-text"></i> NFE: ${nf.numero_nota}
                        </h6>
                        <p class="mb-1">
                            <i class="bi bi-person"></i> Cliente: <strong>${nf.destinatario || 'N/A'}</strong>
                        </p>
                        <p class="text-muted small mb-2">
                            <i class="bi bi-geo-alt"></i> ${nf.endereco_entrega || 'Endereço não informado'}
                        </p>
                        <span class="badge bg-${statusColor} mb-2">${nf.status}</span>
                        
                        ${isPending 
                            ? `<button onclick="goToBaixaScreen(${nf.id})" class="btn btn-sm btn-success float-end">Baixar / Ocorrência</button>` 
                            : ''}
                    </div>
                </div>
            `;
        });
    }

    content.innerHTML = `
        <div class="card shadow mb-4 card-manifesto">
            <div class="header-status">
                <h4 class="mb-0">Manifesto: ${manifestoData.numero_manifesto}</h4>
            </div>
            <div class="card-body">
                <p class="card-text mb-1">Motorista: ${manifestoData.motorista.nome_completo}</p>
                <p class="card-text mb-1">Status: <span class="badge bg-danger">${manifestoData.status || 'Aguardando'}</span></p>
                <p class="card-text mb-1">Total de Notas: <strong>${totalNFs}</strong></p> 
                <p class="card-text small text-muted">Pendentes: <strong>${pendentes}</strong></p>
            </div>
        </div>

        ${status_app === 'AGUARDANDO_INICIO' && totalNFs > 0 ? 
            `<button class="btn btn-success btn-lg w-100 mt-4" onclick="handleStartRoute()">Iniciar Transporte</button>` 
            : ''}

        ${status_app !== 'AGUARDANDO_INICIO' ? 
            `
            <h5 class="mt-4 mb-3">Notas Fiscais (${pendentes} Pendentes)</h5>
            <div class="nf-list">${nfList}</div>
            `
            : ''
        }

        ${pendentes === 0 && totalNFs > 0 ? 
            `<button class="btn btn-danger btn-lg w-100 mt-4" data-bs-toggle="modal" data-bs-target="#kmFinalModal">Finalizar Rota</button>` 
            : ''}
    `;
}

function goToBaixaScreen(nfId) {
    window.nfSelecionada = nfId;

    const modal = new bootstrap.Modal(
        document.getElementById('ocorrenciaModal')
    );
    modal.show();
}

function handleStartRoute() {
    alert("Iniciando GPS e Jornada! As Notas Fiscais foram carregadas.");
    // Aqui você enviaria uma API POST para /api/manifesto/iniciar-rota/ para mudar o status_app no backend
    // Por enquanto, apenas recarrega para mostrar as NFs
    checkManifestoStatus(); 
}


// --- FUNÇÕES DE LÓGICA DE API ---

async function handleManifestoSearch(event) {
    event.preventDefault();
    const manifestoNumber = document.getElementById('manifesto-number').value.trim();
    
    loadingModal.show();

    const headers = getAuthHeaders();
    if (!headers) { loadingModal.hide(); return; }

    try {
        // Requisição SÍNCRONA
        const response = await fetch(MANIFESTO_BUSCA_ENDPOINT, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ numero_manifesto: manifestoNumber }) 
        });

        const data = await response.json();
        
        if (response.ok) {
            // SUCESSO: Task processou
            loadingModal.hide();
            // Recarrega o status, que agora deve encontrar o manifesto
            checkManifestoStatus(data.mensagem, 'success'); 
        } else {
            // ERRO: Task falhou (400 Bad Request, ex: Documento não confere)
            loadingModal.hide();
            renderSearchScreen(data.mensagem || 'Erro desconhecido na busca.', 'error');
        }

    } catch (error) {
        // Erro de rede ou Timeout (500)
        loadingModal.hide();
        renderSearchScreen(`Falha na comunicação: ${error.message}`, 'error');
    }
}


async function handleManifestoFinalization(event) {
    event.preventDefault();
    
    // Pega o valor do input DENTRO do modal
    const kmFinal = document.getElementById('km-final').value.trim(); 
    const finalizarMessage = document.getElementById('finalizar-message');

    if (!kmFinal) {
        finalizarMessage.textContent = 'A KM Final é obrigatória.';
        return;
    }

    const headers = getAuthHeaders();
    if (!headers) return;

    try {
        const response = await fetch(PWA_FINALIZAR_ENDPOINT, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ km_final: kmFinal })
        });

        const data = await response.json();
        
        if (response.ok) {
            if (kmFinalModal) kmFinalModal.hide(); 
            alert(data.mensagem);
            checkManifestoStatus(); // Volta para a tela de busca
        } else {
            // Erro retornado pelo backend (Ex: KM menor que KM Inicial)
            finalizarMessage.textContent = data.mensagem || 'Erro ao finalizar manifesto.';
        }

    } catch (error) {
        finalizarMessage.textContent = 'Erro de conexão ao finalizar manifesto.';
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
                // Renderiza tela de Busca
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

let fotoArquivo = null;

function abrirCamera() {
    document.getElementById('foto-ocorrencia').click();
}

document.getElementById('foto-ocorrencia').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    fotoArquivo = file;

    const reader = new FileReader();
    reader.onload = function () {
        document.getElementById('preview-img').src = reader.result;
        document.getElementById('preview-container').classList.remove('d-none');
    };
    reader.readAsDataURL(file);
});

function visualizarImagem() {
    const img = document.getElementById('preview-img').src;
    const w = window.open('');
    w.document.write(`<img src="${img}" style="width:100%">`);
}

function tirarOutraFoto() {
    fotoArquivo = null;
    document.getElementById('foto-ocorrencia').value = '';
    document.getElementById('preview-container').classList.add('d-none');
}