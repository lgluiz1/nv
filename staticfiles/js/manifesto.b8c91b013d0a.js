// manifesto.js - VERSÃO UNIFICADA E AUTOMATIZADA
// =====================================================
// CONFIGURAÇÕES
// =====================================================
const ENDPOINTS = {
    busca: `${API_BASE}manifesto/busca/`,
    status: `${API_BASE}manifesto/status/`,
    iniciar: `${API_BASE}manifesto/iniciar/`
};

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

        // Listener para o input da Câmera Nativa
        const inputCamera = document.getElementById('camera-nativa');
        if (inputCamera) {
            inputCamera.addEventListener('change', handleCameraNativa);
        }
    } else {
        window.location.href = LOGIN_URL;
    }
});

/**
 * CÂMERA NATIVA: Processa a foto tirada pelo celular e desenha no canvas
 */
function handleCameraNativa(event) {
    const file = event.target.files[0];
    if (!file) return;

    const canvas = document.getElementById('canvas-preview');
    const ctx = canvas.getContext('2d');
    const placeholder = document.getElementById('placeholder-camera');
    const labelCamera = document.getElementById('label-camera');
    const btnNovaFoto = document.getElementById('btn-nova-foto');

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // Alta resolução para leitura nítida pela ESL
            const larguraDesejada = 1600; 
            const escala = larguraDesejada / img.width;
            canvas.width = larguraDesejada;
            canvas.height = img.height * escala;

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            canvas.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
            if (labelCamera) labelCamera.style.display = 'none';
            if (btnNovaFoto) btnNovaFoto.style.display = 'block';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// =====================================================
// FLUXO DE BUSCA E PROCESSAMENTO (AUTOMATIZADO)
// =====================================================

async function handleManifestoSearch(event) {
    event.preventDefault();
    const numero = document.getElementById('manifesto-number').value.trim();
    manifestoAtual = numero;

    // Proteção contra o erro null:
    const loadingText = document.getElementById('loadingMessage');
    if (loadingText) {
        loadingText.innerText = "Validando seu acesso...";
    }
    
    loadingModal?.show();

    try {
        const response = await authFetch(ENDPOINTS.busca, {
            method: 'POST',
            body: JSON.stringify({ numero_manifesto: numero }),
        });
        
        if (response.ok) {
            // Inicia o polling que vai monitorar a transição
            startPolling();
        } else {
            loadingModal?.hide();
            renderSearchScreen('Erro ao iniciar busca.', 'error');
        }
    } catch (err) {
        loadingModal?.hide();
        renderSearchScreen('Erro de conexão.', 'error');
    }
}

function startPolling() {
    stopPolling();
    let jaMudouDeTela = false;

    pollingInterval = setInterval(async () => {
        try {
            const response = await authFetch(`${ENDPOINTS.status}?numero_manifesto=${manifestoAtual}`);
            const data = await response.json();

            // CASO: Aprovado, mas notas ainda sendo processadas
            if (data.status === 'ENRIQUECENDO' || data.status === 'PROCESSANDO') {
                if (!jaMudouDeTela) {
                    jaMudouDeTela = true;
                    loadingModal?.hide();
                    renderListaEntregas(manifestoAtual); // Vai para a tela de notas IMEDIATAMENTE
                } else {
                    // Se já estiver na tela de notas, apenas atualiza a lista sem piscar
                    atualizarListaSemLimpar(manifestoAtual);
                }
            }

            // CASO: Tudo finalizado
            if (data.status === 'PROCESSADO') {
                stopPolling();
                atualizarListaSemLimpar(manifestoAtual); // Carga final
            } 
            
            else if (data.status === 'ERRO') {
                stopPolling();
                loadingModal?.hide();
                renderSearchScreen(data.mensagem_erro, 'error');
            }
        } catch (err) { console.error("Erro no polling:", err); }
    }, 3000);
}

/**
 * Nova função para atualizar a lista sem apagar o que já está na tela
 */
async function atualizarListaSemLimpar(numeroManifesto) {
    try {
        const response = await authFetch(`${API_BASE}manifesto/notas/?numero_manifesto=${numeroManifesto}`);
        const notas = await response.json();
        
        const content = document.getElementById('app-content');
        // Se houver notas novas, renderiza. O motorista verá a lista crescendo.
        if (notas.length > 0) {
            renderListaEntregasHTML(numeroManifesto, notas);
        }
    } catch (err) { console.error("Erro na atualização incremental", err); }
}

// =====================================================
// RENDERIZAÇÃO E ESTADOS
// =====================================================

async function verificarEstadoInicial() {
    try {
        const response = await authFetch(`${API_BASE}manifesto/verificar-ativo/`);
        if (!response || !response.ok) return;
        const data = await response.json();
        if (data.tem_manifesto) {
            renderListaEntregas(data.numero_manifesto);
        } else {
            renderSearchScreen();
        }
    } catch (err) { renderSearchScreen(); }
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

async function renderListaEntregas(numeroManifesto) {
    const content = document.getElementById('app-content');
    try {
        const response = await authFetch(`${API_BASE}manifesto/notas/?numero_manifesto=${numeroManifesto}`);
        const notas = await response.json();
        
        let htmlNotas = '';
    notas.forEach(nf => {
        const baixada = nf.ja_baixada;
        htmlNotas += `
            <div class="card mb-3 shadow-sm border-start border-${baixada ? 'success' : 'primary'} border-4 animate__animated animate__fadeInUp">
                <div class="card-body">
                    <h6 class="fw-bold">NF ${nf.numero_nota}</h6>
                    <p class="small text-muted mb-1">${nf.destinatario}</p>
                    <p class="small text-muted mb-0"><i class="bi bi-geo-alt"></i> ${nf.endereco_entrega}</p>
                </div>
            </div>`;
    });

    content.innerHTML = `
        <div class="container pb-5">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="fw-bold text-secondary mb-0">Manifesto ${numeroManifesto}</h5>
                <span class="badge bg-primary">${notas.length} notas carregadas</span>
            </div>
            ${htmlNotas}
            <div class="text-center py-3 ${notas.length < 14 ? '' : 'd-none'}">
                <div class="spinner-border spinner-border-sm text-primary"></div>
                <small class="ms-2 text-muted">Buscando mais notas na ESL...</small>
            </div>
            <div style="height: 100px;"></div>
        </div>
    `;
} catch (err) { console.error("Erro ao renderizar lista:", err); }
}

// =====================================================
// REGISTRO DE BAIXA E SALVAMENTO
// =====================================================

function abrirModalBaixa(numeroNota, chaveAcesso) {
    const tituloEl = document.getElementById('modal-titulo-nf');
    const inputChave = document.getElementById('hidden-chave-nf');
    if (!tituloEl || !inputChave) return;

    tituloEl.innerText = `Ocorrência NF-e ${numeroNota}`;
    inputChave.value = chaveAcesso;
    
    // Reseta interface da câmera nativa
    const canvas = document.getElementById('canvas-preview');
    const placeholder = document.getElementById('placeholder-camera');
    const labelCamera = document.getElementById('label-camera');
    const btnNovaFoto = document.getElementById('btn-nova-foto');
    
    if (canvas) canvas.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    if (labelCamera) labelCamera.style.display = 'block';
    if (btnNovaFoto) btnNovaFoto.style.display = 'none';

    const modalBaixa = new bootstrap.Modal(document.getElementById('modalBaixa'));
    modalBaixa.show();
}

async function salvarRegistro() {
    const cod = document.getElementById('select-ocorrencia').value;
    const chaveNF = document.getElementById('hidden-chave-nf').value;
    const canvas = document.getElementById('canvas-preview');
    const temFoto = (canvas.style.display === 'block');

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
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
        formData.append('foto', blob, `${chaveNF}.jpg`);
    }

    try {
        const response = await authFetch(`${API_BASE}manifesto/registrar-baixa/`, {
            method: 'POST',
            body: formData,
            headers: {} 
        });

        if (response.ok) {
            alert("Baixa realizada com sucesso!");
            location.reload();
        } else {
            const data = await response.json();
            alert("Erro: " + (data.erro || "Falha no registro"));
        }
    } catch (err) { alert("Erro de conexão."); }
    finally { loadingModal?.hide(); }
}

// =====================================================
// UTILITÁRIOS FINAIS
// =====================================================

function stopPolling() {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
}

function initModals() {
    const loadingEl = document.getElementById('loadingModal');
    if (loadingEl) loadingModal = new bootstrap.Modal(loadingEl);
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

function abrirModalDetalhes(dados) {
    const container = document.getElementById('modal-detalhes-body');
    if (!container) return;
    container.innerHTML = `
        <div class="mb-2 small"><strong>Data:</strong> ${dados.data}</div>
        <div class="mb-3 small"><strong>Recebedor:</strong> ${dados.recebedor || 'Não informado'}</div>
        ${dados.foto_url ? `<img src="${dados.foto_url}" class="img-fluid rounded border shadow-sm w-100 mb-3">` : ''}
    `;
    new bootstrap.Modal(document.getElementById('modalDetalhes')).show();
}

async function atualizarDadosHeader() {
    try {
        const res = await authFetch(`${AUTH_BASE}perfil/`);
        const data = await res.json();
        if (data && data.nome) document.getElementById('header-nome-motorista').textContent = data.nome.split(' ')[0];
    } catch (e) { console.error("Erro no header"); }
}