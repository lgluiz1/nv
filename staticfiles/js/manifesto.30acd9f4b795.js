// manifesto.js - VERSÃO FINAL REVISADA E OTIMIZADA
// =====================================================
// CONFIGURAÇÕES E ESTADO GLOBAL
// =====================================================
const ENDPOINTS = {
    busca: `${API_BASE}manifesto/busca/`,
    status: `${API_BASE}manifesto/status/`,
};

const LOGIN_URL = '/app/login/';
let loadingModal = null;
let pollingInterval = null;
let manifestoAtual = null;
let jaMudouDeTela = false;

// =====================================================
// INICIALIZAÇÃO (INIT)
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    initModals();

    const authenticated = await initAuth();
    if (authenticated) {
        atualizarDadosHeader();
        verificarEstadoInicial();

        const inputCamera = document.getElementById('camera-nativa');
        if (inputCamera) {
            inputCamera.addEventListener('change', handleCameraNativa);
        }
    } else {
        window.location.href = LOGIN_URL;
    }
});

// =====================================================
// FLUXO DE BUSCA E MONITORAMENTO (POLLING VIVO)
// =====================================================

async function handleManifestoSearch(event) {
    event.preventDefault();
    const numero = document.getElementById('manifesto-number').value.trim();
    if (!numero) return;

    manifestoAtual = numero;

    const loadingText = document.getElementById('loadingMessage');
    if (loadingText) loadingText.innerText = "Validando acesso e motorista...";
    
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
            renderSearchScreen('Manifesto não encontrado ou erro no servidor.', 'error');
        }
    } catch (err) {
        loadingModal?.hide();
        renderSearchScreen('Erro de conexão com o servidor.', 'error');
    }
}

function startPolling() {
    stopPolling();
    jaMudouDeTela = false; 

    pollingInterval = setInterval(async () => {
        try {
            const response = await authFetch(`${API_BASE}manifesto/status/?numero_manifesto=${manifestoAtual}`);
            
            // PROTEÇÃO 401: Ignora ciclo se o token estiver renovando
            if (!response || response.status === 401) {
                console.warn("Autenticação em renovação...");
                return; 
            }

            const data = await response.json();

            // 1. ESTADO DE CARREGAMENTO: Notas aparecendo uma a uma
            if (data.status === 'ENRIQUECENDO' || data.status === 'AGUARDANDO' || data.status === 'PROCESSANDO') {
                if (!jaMudouDeTela) {
                    jaMudouDeTela = true;
                    loadingModal?.hide(); 
                    renderEstruturaLista(manifestoAtual);
                } else {
                    atualizarListaViva(manifestoAtual);
                }
            }

            // 2. ESTADO FINAL: Carga concluída (5 a 50 notas)
            if (data.status === 'PROCESSADO') {
                stopPolling();
                await atualizarListaViva(manifestoAtual); 
                
                const contador = document.getElementById('contador-notas');
                if (contador) {
                    contador.className = "badge bg-success animate__animated animate__bounceIn";
                    contador.innerText = "✅ Carga Completa";
                }

                // Finaliza e recarrega para estabilizar banco local
                setTimeout(() => { window.location.reload(); }, 1500);
            } 
            else if (data.status === 'ERRO') {
                stopPolling();
                loadingModal?.hide();
                renderSearchScreen(data.mensagem_erro || 'Erro no processamento', 'error');
            }
        } catch (err) { 
            console.error("Erro no ciclo de polling:", err); 
        }
    }, 3000);
}

// =====================================================
// RENDERIZAÇÃO DINÂMICA (INCREMENTAL)
// =====================================================

function renderEstruturaLista(numeroManifesto) {
    const content = document.getElementById('app-content');
    if (!content) return;

    content.innerHTML = `
        <div class="container pb-5 animate__animated animate__fadeIn">
            <div class="text-center mb-4">
                <h5 class="fw-bold text-secondary mb-1">Manifesto #${numeroManifesto}</h5>
                <div id="progresso-container" class="mt-2">
                    <span id="contador-notas" class="badge bg-primary px-3 py-2">Buscando as NF-es...</span>
                </div>
            </div>
            
            <div id="lista-notas-container">
                <div class="text-center py-5">
                    <div class="spinner-border text-primary mb-3" role="status"></div>
                    <p class="text-muted">Conectando à ESL e preparando sua rota...</p>
                </div>
            </div>
        </div>
    `;
    atualizarListaViva(numeroManifesto);
}

async function atualizarListaViva(numeroManifesto) {
    try {
        const response = await authFetch(`${API_BASE}manifesto/notas/?numero_manifesto=${numeroManifesto}`);
        if (!response || response.status !== 200) return;

        const notas = await response.json();
        const container = document.getElementById('lista-notas-container');
        const contador = document.getElementById('contador-notas');

        if (container && notas.length > 0) {
            let htmlNotas = '';
            notas.forEach(nf => {
                const baixada = nf.ja_baixada;
                htmlNotas += `
                    <div class="card mb-3 shadow-sm border-start border-${baixada ? 'success' : 'primary'} border-4 animate__animated animate__fadeInUp">
                        <div class="card-body p-3">
                            <div class="d-flex justify-content-between align-items-start">
                                <h6 class="fw-bold mb-1">NF ${nf.numero_nota}</h6>
                                ${baixada ? '<span class="badge bg-success">OK</span>' : ''}
                            </div>
                            <p class="small text-muted mb-1">${nf.destinatario}</p>
                            <p class="small text-muted mb-2" style="font-size: 0.75rem;"><i class="bi bi-geo-alt"></i> ${nf.endereco_entrega}</p>
                            ${!baixada ? 
                                `<button class="btn btn-sm btn-primary w-100" onclick="abrirModalBaixa('${nf.numero_nota}', '${nf.chave_acesso}')">Dar Baixa</button>` :
                                `<button class="btn btn-sm btn-outline-success w-100" onclick='abrirModalDetalhes(${JSON.stringify(nf.dados_baixa)})'>Ver Detalhes</button>`
                            }
                        </div>
                    </div>`;
            });
            container.innerHTML = htmlNotas;
            if (contador) contador.innerText = `${notas.length} notas carregadas`;
        }
    } catch (err) { console.error("Erro na atualização viva:", err); }
}

// =====================================================
// FUNÇÕES DE INTERFACE (MODALS E SEARCH)
// =====================================================

function renderSearchScreen(message = null, type = 'info') {
    stopPolling();
    const content = document.getElementById('app-content');
    const alertHTML = message ? `<div class="alert alert-${type === 'error' ? 'danger' : 'info'} animate__animated animate__shakeX">${message}</div>` : '';

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

async function verificarEstadoInicial() {
    try {
        const response = await authFetch(`${API_BASE}manifesto/verificar-ativo/`);
        if (!response || !response.ok) return;
        const data = await response.json();
        if (data.tem_manifesto) {
            renderListaEntregasFinal(data.numero_manifesto);
        } else {
            renderSearchScreen();
        }
    } catch (err) { renderSearchScreen(); }
}

async function renderListaEntregasFinal(numeroManifesto) {
    // Mesma lógica do renderEstruturaLista, mas usada para carregamento inicial (Estado Ativo)
    renderEstruturaLista(numeroManifesto);
}

// =====================================================
// BAIXAS, CÂMERA E GEOLOCALIZAÇÃO
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
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
        formData.append('foto', blob, `${chaveNF}.jpg`);
    }

    try {
        const response = await authFetch(`${API_BASE}manifesto/registrar-baixa/`, {
            method: 'POST',
            body: formData
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

function handleCameraNativa(event) {
    const file = event.target.files[0];
    if (!file) return;

    const canvas = document.getElementById('canvas-preview');
    const ctx = canvas.getContext('2d');
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const larguraDesejada = 1600; 
            const escala = larguraDesejada / img.width;
            canvas.width = larguraDesejada;
            canvas.height = img.height * escala;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.style.display = 'block';
            document.getElementById('placeholder-camera').style.display = 'none';
            document.getElementById('label-camera').style.display = 'none';
            document.getElementById('btn-nova-foto').style.display = 'block';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function abrirModalBaixa(numeroNota, chaveAcesso) {
    const tituloEl = document.getElementById('modal-titulo-nf');
    const inputChave = document.getElementById('hidden-chave-nf');
    if (!tituloEl || !inputChave) return;

    tituloEl.innerText = `Ocorrência NF-e ${numeroNota}`;
    inputChave.value = chaveAcesso;
    
    // Reset da Câmera
    const canvas = document.getElementById('canvas-preview');
    if (canvas) canvas.style.display = 'none';
    document.getElementById('placeholder-camera').style.display = 'block';
    document.getElementById('label-camera').style.display = 'block';
    document.getElementById('btn-nova-foto').style.display = 'none';

    const mBaixa = new bootstrap.Modal(document.getElementById('modalBaixa'));
    mBaixa.show();
}

// =====================================================
// UTILITÁRIOS FINAIS
// =====================================================

function stopPolling() {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
}

function initModals() {
    const loadingEl = document.getElementById('loadingModal');
    if (loadingEl) loadingModal = new bootstrap.Modal(loadingEl, { backdrop: 'static', keyboard: false });
}

function getCoords() {
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            () => resolve(null),
            { timeout: 5000, enableHighAccuracy: true }
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