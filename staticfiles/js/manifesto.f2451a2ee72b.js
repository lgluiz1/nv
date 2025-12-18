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
    verificarEstadoInicial(); // <--- Nova função
});
async function verificarEstadoInicial() {
    const headers = getAuthHeaders();
    if (!headers) return;

    try {
        const response = await fetch(`${API_BASE}manifesto/verificar-ativo/`, { headers });
        const data = await response.json();

        if (data.tem_manifesto) {
            // Se já tem um aberto, pula a busca e vai direto para as 15 notas
            renderListaEntregas(data.numero_manifesto);
        } else {
            // Se não tem nada, mostra a tela de busca normal
            renderSearchScreen();
        }
    } catch (err) {
        console.error("Erro ao verificar estado:", err);
        renderSearchScreen(); // Fallback para busca
    }
}
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
    
    // 1. Identificar Notas Únicas
    const notasUnicas = [...new Set(payload.map(item => item.mft_fis_fit_fis_ioe_number))];
    const totalNfs = notasUnicas.length;
    
    // 2. Pegar informações gerais (do primeiro item)
    const numeroManifesto = payload[0].sequence_code;
    const valorFreteTotal = payload[0].manifest_freights_total;

    content.innerHTML = `
        <div class="card shadow-sm border-0 mt-3 animate__animated animate__fadeIn">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h5 class="text-primary fw-bold mb-0">Manifesto #${numeroManifesto}</h5>
                    <span class="badge bg-primary-subtle text-primary">Preview</span>
                </div>
                
                <div class="row g-2 mb-4">
                    <div class="col-6">
                        <div class="p-3 border rounded bg-light">
                            <small class="text-muted d-block">Total NF-e</small>
                            <span class="h4 fw-bold">${totalNfs}</span>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="p-3 border rounded bg-light">
                            <small class="text-muted d-block">Valor Frete</small>
                            <span class="h4 fw-bold text-success">R$ ${valorFreteTotal}</span>
                        </div>
                    </div>
                </div>

                <button class="btn btn-primary btn-lg w-100 mb-2 shadow-sm" id="btn-iniciar">
                    <i class="bi bi-play-fill me-1"></i> INICIAR TRANSPORTE
                </button>
                <button class="btn btn-outline-secondary btn-sm w-100" onclick="renderSearchScreen()">
                    Cancelar
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
async function iniciarTransporte(numeroManifesto) {
    // 1. Prepara o Modal de Loading
    const loadingTexto = document.querySelector('#loadingModal .modal-body p');
    if (loadingTexto) loadingTexto.innerText = "Iniciando Manifesto...";
    loadingModal?.show();

    const headers = getAuthHeaders();

    try {
        const response = await fetch(ENDPOINTS.iniciar, {
            method: 'POST',
            headers,
            body: JSON.stringify({ numero_manifesto: numeroManifesto }),
        });

        if (response.ok) {
            // 2. Reinicia o Polling para esperar a Task de criação de NFs terminar
            monitorarCriacaoNFs(numeroManifesto);
        } else {
            const data = await response.json();
            throw new Error(data.erro || 'Erro ao iniciar');
        }
    } catch (err) {
        loadingModal?.hide();
        alert(err.message);
    }
}

function monitorarCriacaoNFs(numeroManifesto) {
    const interval = setInterval(async () => {
        const response = await fetch(`${ENDPOINTS.status}?numero_manifesto=${numeroManifesto}`, { 
            headers: getAuthHeaders() 
        });
        const data = await response.json();

        // Quando a task termina e o log vira PROCESSADO
        if (data.status === 'PROCESSADO') {
            clearInterval(interval);
            loadingModal?.hide();
            
            // 3. Chama a próxima tela: A listagem de entregas
            renderListaEntregas(numeroManifesto);
        } else if (data.status === 'ERRO') {
            clearInterval(interval);
            loadingModal?.hide();
            alert("Erro no processamento: " + data.mensagem_erro);
        }
    }, 2000);
}
// =====================================================
// Renderizar lista de entregas
// =====================================================
async function renderListaEntregas(numeroManifesto) {
    const content = document.getElementById('app-content');
    const headers = getAuthHeaders();

    try {
        // Busca as 15 notas que vimos no Django Admin
        const response = await fetch(`${API_BASE}manifesto/notas/?numero_manifesto=${numeroManifesto}`, { headers });
        const notas = await response.json();

        let htmlNotas = '';
        
        // O SEGREDO: O loop que percorre todas as notas
        notas.forEach(nf => {
            htmlNotas += `
                <div class="card shadow-sm mb-3 border-start border-primary border-4">
                    <div class="card-body py-2">
                        <div class="d-flex justify-content-between">
                            <span class="badge bg-secondary mb-2">NF ${nf.numero_nota}</span>
                            <span class="text-primary fw-bold">${nf.status}</span>
                        </div>
                        <h6 class="mb-1 fw-bold">${nf.destinatario}</h6>
                        <small class="text-muted d-block">${nf.endereco_entrega}</small>
                        <button class="btn btn-sm btn-outline-primary w-100 mt-2" 
                                onclick="abrirModalBaixa('${nf.numero_nota}')">
                            Dar Baixa
                        </button>
                    </div>
                </div>
            `;
        });

        content.innerHTML = `
            <div class="animate__animated animate__fadeIn">
                <h5 class="fw-bold text-secondary mb-3">Notas do Manifesto ${numeroManifesto}</h5>
                ${htmlNotas}
            </div>
        `;

    } catch (err) {
        console.error("Erro ao listar notas:", err);
    }
}

// =====================================================
// Modal de Baixa com Foto
// =====================================================

let streamAtual = null;

async function ligarCamera() {
    try {
        // Esconder placeholder e botões antigos
        document.getElementById('placeholder-camera').style.display = 'none';
        document.getElementById('canvas-preview').style.display = 'none';
        document.getElementById('btn-nova-foto').style.display = 'none';
        document.getElementById('btn-abrir-camera').style.display = 'none';

        // Tentar capturar apenas a câmara traseira
        streamAtual = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: { exact: "environment" } }, 
            audio: false 
        }).catch(() => {
            // Fallback para qualquer câmara se a traseira exata falhar
            return navigator.mediaDevices.getUserMedia({ video: true });
        });

        const video = document.getElementById('video-camera');
        video.srcObject = streamAtual;
        video.style.display = 'block';
        document.getElementById('btn-capturar').style.display = 'block';
    } catch (err) {
        alert("Não foi possível aceder à câmara. Verifique as permissões.");
        console.error(err);
    }
}

function tirarFoto() {
    const video = document.getElementById('video-camera');
    const canvas = document.getElementById('canvas-preview');
    const ctx = canvas.getContext('2d');
    
    // Ajustar o tamanho do canvas para o tamanho do vídeo
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    // Parar os sensores da câmara
    if (streamAtual) {
        streamAtual.getTracks().forEach(track => track.stop());
    }
    
    video.style.display = 'none';
    canvas.style.display = 'block';
    document.getElementById('btn-capturar').style.display = 'none';
    document.getElementById('btn-nova-foto').style.display = 'block';
}

async function salvarRegistro() {
    const cod = document.getElementById('select-ocorrencia').value;
    const recebedor = document.getElementById('input-recebedor').value;
    const canvas = document.getElementById('canvas-preview');
    const temFoto = (canvas.style.display === 'block');
    const chaveNF = document.getElementById('hidden-chave-nf').value;

    // REGRA: Códigos 1 e 2 EXIGEM foto
    if ((cod === "1" || cod === "2") && !temFoto) {
        alert("Para 'Entrega Realizada', a foto do comprovante é obrigatória!");
        return;
    }

    // REGRA: Código 1 exige nome do recebedor
    if (cod === "1" && !recebedor) {
        alert("Por favor, informe o nome de quem recebeu a mercadoria.");
        return;
    }

    loadingModal.show();

    const formData = new FormData();
    formData.append('ocorrencia_codigo', cod);
    formData.append('chave_acesso', chaveNF);
    formData.append('recebedor', recebedor);
    
    if (temFoto) {
        // Converter o canvas para Blob (JPG)
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        formData.append('foto', blob, `comprovante_${chaveNF}.jpg`);
    }

    try {
        const response = await fetch(`${API_BASE}manifesto/registrar-baixa/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            alert("Ocorrência registada e enviada para o TMS!");
            location.reload(); 
        } else {
            alert("Erro: " + data.erro);
        }
    } catch (err) {
        alert("Erro de conexão ao servidor.");
    } finally {
        loadingModal.hide();
    }
}