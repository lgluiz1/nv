// manifesto.js - Versão Fluxo Único Automatizado
// =====================================================
// CONFIGURAÇÕES E ESTADOS
// =====================================================
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
        
        // Listener para Câmera Nativa
        const inputCamera = document.getElementById('camera-nativa');
        if (inputCamera) {
            inputCamera.addEventListener('change', handleCameraNativa);
        }
    } else {
        window.location.href = LOGIN_URL;
    }
});

// =====================================================
// FLUXO DE BUSCA AUTOMATIZADO (MÃOS LIMPAS)
// =====================================================

async function handleManifestoSearch(event) {
    event.preventDefault();
    const numero = document.getElementById('manifesto-number').value.trim();
    if (!numero) return;

    manifestoAtual = numero;
    
    // Configura o modal para a primeira etapa: Validação
    const loadingText = document.getElementById('loadingMessage');
    if (loadingText) loadingText.innerText = "Buscando e validando manifesto...";
    
    loadingModal?.show();

    try {
        // Dispara a Task Única que faz as 3 etapas (Valida -> Captura -> Enriquece)
        const response = await authFetch(`${API_BASE}manifesto/busca/`, {
            method: 'POST',
            body: JSON.stringify({ numero_manifesto: numero }),
        });
        
        if (response.ok) {
            startPolling();
        } else {
            loadingModal?.hide();
            renderSearchScreen('Erro ao iniciar processamento.', 'error');
        }
    } catch (err) {
        loadingModal?.hide();
        renderSearchScreen('Erro de conexão.', 'error');
    }
}

function startPolling() {
    stopPolling();
    const loadingText = document.getElementById('loadingMessage'); // ID do seu HTML

    pollingInterval = setInterval(async () => {
        try {
            const response = await authFetch(`${API_BASE}manifesto/status/?numero_manifesto=${manifestoAtual}`);
            const data = await response.json();

            // Transição de Mensagem: CPF Validado, processando notas (Etapa 2 e 3 da Task)
            if (data.status === 'ENRIQUECENDO' || data.status === 'AGUARDANDO') {
                if (loadingText) loadingText.innerText = "Manifesto Aprovado! Processando notas...";
            }

            // Ciclo completo concluído
            if (data.status === 'PROCESSADO') {
                stopPolling();
                loadingModal?.hide();
                // Vai direto para a lista final, sem passar pelo preview
                renderListaEntregas(manifestoAtual);
            } 
            
            // Erro de Validação (Ex: CPF Divergente)
            else if (data.status === 'ERRO') {
                stopPolling();
                loadingModal?.hide();
                renderSearchScreen(data.mensagem_erro || 'Falha na validação do manifesto', 'error');
            }
        } catch (err) { 
            console.error("Erro no polling:", err);
            stopPolling(); 
        }
    }, 2000);
}

// =====================================================
// CÂMERA E PROCESSAMENTO DE IMAGEM
// =====================================================

function handleCameraNativa(event) {
    const file = event.target.files[0];
    if (!file) return;

    const canvas = document.getElementById('canvas-preview');
    const ctx = canvas.getContext('2d');
    const placeholder = document.getElementById('placeholder-camera');
    const btnAbrir = document.getElementById('label-camera');
    const btnNova = document.getElementById('btn-nova-foto');

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
            if (placeholder) placeholder.style.display = 'none';
            if (btnAbrir) btnAbrir.style.display = 'none';
            if (btnNova) btnNova.style.display = 'block';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// =====================================================
// SALVAR REGISTRO (BAIXA)
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
        // Alta qualidade para leitura pela ESL
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
    } catch (err) {
        alert("Erro de conexão.");
    } finally {
        loadingModal?.hide();
    }
}

// =====================================================
// AUXILIARES E RENDERIZAÇÃO
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

async function renderListaEntregas(numeroManifesto) {
    const content = document.getElementById('app-content');
    try {
        const response = await authFetch(`${API_BASE}manifesto/notas/?numero_manifesto=${numeroManifesto}`);
        const notas = await response.json();
        
        let htmlNotas = '';
        notas.forEach(nf => {
            const chaveValida = nf.chave_acesso && nf.chave_acesso !== "null" ? nf.chave_acesso : "";
            const baixada = nf.ja_baixada;
            
            htmlNotas += `
                <div class="card mb-3 shadow-sm border-start border-${baixada ? 'success' : 'primary'} border-4">
                    <div class="card-body">
                        <h6 class="fw-bold">NF ${nf.numero_nota}</h6>
                        <p class="small text-muted mb-2">${nf.destinatario}</p>
                        ${baixada ? 
                            `<button class="btn btn-sm btn-outline-success w-100" onclick='abrirModalDetalhes(${JSON.stringify(nf.dados_baixa)})'>Ver Detalhes</button>` :
                            `<button class="btn btn-sm btn-primary w-100" ${!chaveValida ? 'disabled' : ''} onclick="abrirModalBaixa('${nf.numero_nota}', '${chaveValida}')">Dar Baixa</button>`
                        }
                    </div>
                </div>`;
        });
        content.innerHTML = `<div class="pb-5"><h5 class="mb-3">Manifesto ${numeroManifesto}</h5>${htmlNotas}</div>`;
    } catch (err) { console.error(err); }
}

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