// manifesto.js
// =====================================================
// CONFIGURAÇÕES
// =====================================================
//const API_BASE = window.location.hostname.includes('ngrok')
//    ? 'https://1bdf6f7e1548.ngrok-free.app/api/'
//    : 'http://localhost:8089/api/';

const ENDPOINTS = {
    busca: `${API_BASE}manifesto/busca/`,
    status: `${API_BASE}manifesto/status/`,
    iniciar: `${API_BASE}manifesto/iniciar/`
};

const LOGIN_URL = '/app/login/';

let loadingModal = null;
let pollingInterval = null;
let manifestoAtual = null;
let streamFull = null;

// =====================================================
// INIT
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    initModals();

    const authenticated = await initAuth();
if (authenticated) {
    atualizarDadosHeader();
    verificarEstadoInicial();
} else {
    window.location.href = LOGIN_URL;
}
});

/**
 * Verifica se já existe um manifesto em transporte.
 * Agora utiliza authFetch para garantir renovação de token automática.
 */
async function verificarEstadoInicial() {
    try {
        // Usamos authFetch para lidar com o erro 401 automaticamente
        const response = await authFetch(`${API_BASE}manifesto/verificar-ativo/`);
        
        // Se a resposta não for ok e o authFetch não deslogou (ex: erro 500), manda pro login
        if (!response || !response.ok) {
    console.warn("Falha ao verificar manifesto ativo");
    return;
}

        const data = await response.json();

        if (data.tem_manifesto) {
            renderListaEntregas(data.numero_manifesto);
        } else {
            renderSearchScreen();
        }
    } catch (err) {
        console.error("Erro crítico ao verificar estado:", err);
        logout(); // Em caso de erro de rede persistente ou token inválido
    }
}

// =====================================================
// MODAIS E AUXILIARES
// =====================================================
function initModals() {
    const loadingEl = document.getElementById('loadingModal');
    if (loadingEl) loadingModal = new bootstrap.Modal(loadingEl);
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
    
    manifestoAtual = numero;
    loadingModal?.show();

    try {
        const response = await authFetch(ENDPOINTS.busca, {
            method: 'POST',
            body: JSON.stringify({ numero_manifesto: numero }),
        });
        
        if (response.ok) {
            startPolling();
        } else {
            loadingModal?.hide();
            renderSearchScreen('Manifesto não encontrado ou erro na busca', 'error');
        }
    } catch (err) {
        loadingModal?.hide();
        renderSearchScreen('Erro de conexão', 'error');
    }
}

function startPolling() {
    stopPolling();
    pollingInterval = setInterval(async () => {
        try {
            const response = await authFetch(`${ENDPOINTS.status}?numero_manifesto=${manifestoAtual}`);
            const data = await response.json();

            // Mudança aqui: Se estiver processado, avança para o preview
            if (data.status === 'PROCESSADO') {
                stopPolling();
                loadingModal?.hide();
                
                // Se não houver payload (busca inicial), passamos um objeto vazio
                // para que a função de renderização use o manifestoAtual
                renderManifestoPreview(data.payload || [{ sequence_code: manifestoAtual }]);
            }
        } catch (err) { 
            console.error("Erro no polling:", err);
            stopPolling(); 
        }
    }, 2000);
}

function stopPolling() {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
}

function renderManifestoPreview(payload) {
    const content = document.getElementById('app-content');
    
    // Pega o número do payload ou da variável global caso o payload seja nulo
    const numeroManifesto = (payload && payload[0]) ? payload[0].sequence_code : manifestoAtual;
    
    content.innerHTML = `
        <div class="card shadow-sm mt-3 p-3 text-center">
            <h5 class="text-primary">Manifesto #${numeroManifesto}</h5>
            <p class="text-muted small">Clique abaixo para iniciar a rota.</p>
            <button class="btn btn-primary btn-lg w-100 mt-3" onclick="iniciarTransporte('${numeroManifesto}')">
                <i class="bi bi-play-fill"></i> INICIAR TRANSPORTE
            </button>
        </div>
    `;
}

async function iniciarTransporte(numeroManifesto) {
    loadingModal?.show();
    try {
        const response = await authFetch(ENDPOINTS.iniciar, {
            method: 'POST',
            body: JSON.stringify({ numero_manifesto: numeroManifesto }),
        });
        if (response.ok) monitorarCriacaoNFs(numeroManifesto);
    } catch (err) { loadingModal?.hide(); }
}

function monitorarCriacaoNFs(numeroManifesto) {
    const interval = setInterval(async () => {
        const response = await authFetch(`${ENDPOINTS.status}?numero_manifesto=${numeroManifesto}`);
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
            let cardHtml = "";
            const chaveValida = nf.chave_acesso && nf.chave_acesso !== "null" ? nf.chave_acesso : "";
            
            if (nf.ja_baixada) {
                cardHtml = `
                    <div class="card mb-3 shadow-sm border-start border-success border-4 bg-light animate__animated animate__fadeIn">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <h6 class="fw-bold mb-0 text-success">NF ${nf.numero_nota}</h6>
                                <span class="badge bg-success">CONCLUÍDO</span>
                            </div>
                            <p class="small text-muted mb-2">${nf.destinatario}</p>
                            <button class="btn btn-sm btn-outline-success w-100" 
                                    onclick='abrirModalDetalhes(${JSON.stringify(nf.dados_baixa)})'>
                                <i class="bi bi-eye"></i> Ver Detalhes da Baixa
                            </button>
                        </div>
                    </div>`;
            } else {
                cardHtml = `
                    <div class="card mb-3 shadow-sm border-start border-primary border-4 animate__animated animate__fadeIn">
                        <div class="card-body">
                            <h6 class="fw-bold">NF ${nf.numero_nota}</h6>
                            <p class="small text-muted mb-1">${nf.destinatario}</p>
                            <p class="small text-muted mb-3"><i class="bi bi-geo-alt"></i> ${nf.endereco_entrega}</p>
                            <button class="btn btn-sm btn-primary w-100" 
                                    ${!chaveValida ? 'disabled' : ''} 
                                    onclick="abrirModalBaixa('${nf.numero_nota}', '${chaveValida}')">
                                ${chaveValida ? 'Dar Baixa' : 'Chave NF Ausente'}
                            </button>
                        </div>
                    </div>`;
            }
            htmlNotas += cardHtml;
        });

        content.innerHTML = `
            <div class="pb-5"> 
                <h5 class="mb-3 fw-bold text-secondary">Notas do Manifesto ${numeroManifesto}</h5>
                ${htmlNotas}
                <div style="height: 80px;"></div> 
            </div>
        `;
    } catch (err) { 
        console.error("Erro ao renderizar lista:", err); 
    }
}

// =====================================================
// CÂMERA E GEOLOCALIZAÇÃO
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

async function ligarCameraFull() {
    const overlay = document.getElementById('full-screen-camera');
    const video = document.getElementById('video-full');
    
    const constraints = {
        video: {
            facingMode: "environment",
            // Força a resolução Full HD para leitura nítida de textos
            width: { min: 1280, ideal: 1920 }, 
            height: { min: 720, ideal: 1080 },
            // Tenta focar continuamente (se suportado pelo hardware)
            focusMode: "continuous" 
        },
        audio: false
    };

    try {
        streamFull = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = streamFull;
        overlay.style.display = 'block'; 
        
        // Pequeno truque: força o foco após 1 segundo
        const track = streamFull.getVideoTracks()[0];
        const capabilities = track.getCapabilities();
        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        }
    } catch (err) {
        // Fallback simples se o HD falhar
        streamFull = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = streamFull;
        overlay.style.display = 'block';
    }
}

function capturarFotoFull() {
    const video = document.getElementById('video-full');
    const canvas = document.getElementById('canvas-preview');
    const ctx = canvas.getContext('2d');

    // Sincroniza o tamanho do canvas com a resolução real do vídeo capturado
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Desativa a suavização para manter as bordas das letras nítidas
    ctx.imageSmoothingEnabled = false;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Converte para Blob com qualidade alta (0.8 é o sweet spot para HD)
    canvas.toBlob((blob) => {
        fotoArquivoParaUpload = blob; // Variável que seu FormData vai usar
    }, 'image/jpeg', 0.85);

    canvas.style.display = 'block';
    document.getElementById('placeholder-camera').style.display = 'none';
    fecharCameraFull();
}

function fecharCameraFull() {
    if (streamFull) streamFull.getTracks().forEach(track => track.stop());
    document.getElementById('full-screen-camera').style.display = 'none';
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

// =====================================================
// SALVAR NO BACKEND (MUITO IMPORTANTE)
// =====================================================
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
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
        formData.append('foto', blob, `${chaveNF}.jpg`);
    }

    try {
        // Usamos authFetch com headers vazios para suportar FormData corretamente
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
            alert("Erro: " + (data.erro || data.detail || "Falha no registro"));
        }
    } catch (err) {
        alert("Erro de conexão.");
    } finally {
        loadingModal?.hide();
    }
}

// =====================================================
// VISUALIZAÇÃO DE DETALHES
// =====================================================
function abrirModalDetalhes(dados) {
    const container = document.getElementById('modal-detalhes-body');
    if (!container) return;

    container.innerHTML = `
        <div class="mb-3 border-bottom pb-2">
            <small class="text-muted d-block">Status</small>
            <span class="badge ${dados.tipo === 'ENTREGA' ? 'bg-success' : 'bg-warning'} fs-6">
                ${dados.tipo} - ${dados.ocorrencia}
            </span>
        </div>
        <div class="mb-2 small"><strong>Data:</strong> ${dados.data}</div>
        <div class="mb-3 small"><strong>Recebedor:</strong> ${dados.recebedor || 'Não informado'}</div>
        ${dados.foto_url ? `<img src="${dados.foto_url}" class="img-fluid rounded border shadow-sm w-100 mb-3" style="max-height: 250px; object-fit: cover;">` : ''}
        ${dados.lat && dados.lng ? `<a href="https://www.google.com/maps?q=${dados.lat},${dados.lng}" target="_blank" class="btn btn-sm btn-outline-primary w-100"><i class="bi bi-geo-alt"></i> Ver Mapa</a>` : ''}
    `;

    const modal = new bootstrap.Modal(document.getElementById('modalDetalhes'));
    modal.show();
}

async function atualizarDadosHeader() {
    try {
        const res = await authFetch(`${AUTH_BASE}perfil/`); // Sua rota de perfil
        const data = await res.json();
        
        if (data && data.nome) {
            document.getElementById('header-nome-motorista').textContent = data.nome.split(' ')[0]; // Pega o primeiro nome
        }
    } catch (e) {
        console.error("Não foi possível atualizar o nome no header");
    }
}