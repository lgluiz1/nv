// manifesto.js - VERSÃO UNIFICADA E CORRIGIDA
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
        // Resolve o problema do travamento na tela de busca
        await verificarEstadoInicial();
        
        // Configura o listener da câmera nativa globalmente
        const inputCamera = document.getElementById('camera-nativa');
        if (inputCamera) {
            inputCamera.addEventListener('change', handleCameraNativa);
        }
    } else {
        window.location.href = LOGIN_URL;
    }
});

/**
 * Decide se mostra a lista de entregas ou a tela de busca.
 * Corrige o loop infinito do "Verificando status..."
 */
async function verificarEstadoInicial() {
    try {
        const response = await authFetch(`${API_BASE}manifesto/verificar-ativo/`);
        
        if (!response || !response.ok) {
            renderSearchScreen();
            return;
        }

        const data = await response.json();

        if (data.tem_manifesto && data.numero_manifesto) {
            renderListaEntregas(data.numero_manifesto);
        } else {
            renderSearchScreen();
        }
    } catch (err) {
        console.error("Erro ao verificar estado:", err);
        renderSearchScreen(); 
    }
}

// =====================================================
// RENDERIZAÇÃO DE TELAS
// =====================================================

function renderSearchScreen(message = null, type = 'info') {
    stopPolling();
    const content = document.getElementById('app-content');
    if (!content) return;

    const alertHTML = message ? `<div class="alert alert-${type === 'error' ? 'danger' : 'info'}">${message}</div>` : '';

    // Renderiza o formulário de busca e limpa spinners residuais
    content.innerHTML = `
        <div class="card shadow-sm p-4 mt-3 animate__animated animate__fadeIn">
            <h5 class="text-primary mb-3 text-center">Buscar Manifesto</h5>
            ${alertHTML}
            <form id="search-form">
                <div class="mb-3">
                    <input type="number" id="manifesto-number" class="form-control form-control-lg text-center" 
                           placeholder="Número do Manifesto" required inputmode="numeric">
                </div>
                <button type="submit" class="btn btn-primary btn-lg w-100">
                    <i class="bi bi-search"></i> Buscar Manifesto
                </button>
            </form>
        </div>
    `;

    const form = document.getElementById('search-form');
    if (form) {
        form.addEventListener('submit', handleManifestoSearch);
    }
}

// =====================================================
// CÂMERA NATIVA E PREVIEW
// =====================================================

/**
 * Processa a foto tirada pelo app nativo e desenha no canvas para o preview nítido
 */
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
            // Resolução Full HD para garantir que a ESL leia o comprovante
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
// SALVAR NO BACKEND
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
        // Envia imagem em alta qualidade para evitar que a ESL a ignore
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
            alert("Erro: " + (data.erro || data.detail || "Falha no registro"));
        }
    } catch (err) {
        alert("Erro de conexão.");
    } finally {
        loadingModal?.hide();
    }
}

// =====================================================
// LISTAGEM E DETALHES
// =====================================================

async function renderListaEntregas(numeroManifesto) {
    const content = document.getElementById('app-content');
    try {
        const response = await authFetch(`${API_BASE}manifesto/notas/?numero_manifesto=${numeroManifesto}`);
        const notas = await response.json();
        
        let htmlNotas = '';
        notas.forEach(nf => {
            const chaveValida = nf.chave_acesso && nf.chave_acesso !== "null" ? nf.chave_acesso : "";
            htmlNotas += `
                <div class="card mb-3 shadow-sm border-start border-${nf.ja_baixada ? 'success' : 'primary'} border-4">
                    <div class="card-body">
                        <h6 class="fw-bold">NF ${nf.numero_nota}</h6>
                        <p class="small text-muted mb-2">${nf.destinatario}</p>
                        ${nf.ja_baixada ? 
                            `<button class="btn btn-sm btn-outline-success w-100" onclick='abrirModalDetalhes(${JSON.stringify(nf.dados_baixa)})'>Ver Detalhes</button>` :
                            `<button class="btn btn-sm btn-primary w-100" ${!chaveValida ? 'disabled' : ''} onclick="abrirModalBaixa('${nf.numero_nota}', '${chaveValida}')">Dar Baixa</button>`
                        }
                    </div>
                </div>`;
        });
        content.innerHTML = `<div class="pb-5"><h5 class="mb-3">Manifesto ${numeroManifesto}</h5>${htmlNotas}</div>`;
    } catch (err) { console.error(err); }
}

function abrirModalBaixa(numeroNota, chaveAcesso) {
    document.getElementById('modal-titulo-nf').innerText = `Ocorrência NF-e ${numeroNota}`;
    document.getElementById('hidden-chave-nf').value = chaveAcesso;
    
    // Reseta estado do modal
    document.getElementById('canvas-preview').style.display = 'none';
    document.getElementById('placeholder-camera').style.display = 'block';
    document.getElementById('label-camera').style.display = 'block';
    document.getElementById('btn-nova-foto').style.display = 'none';

    new bootstrap.Modal(document.getElementById('modalBaixa')).show();
}

// =====================================================
// AUXILIARES GERAIS
// =====================================================

async function handleManifestoSearch(event) {
    event.preventDefault();
    const numero = document.getElementById('manifesto-number').value.trim();
    if (!numero) return;

    manifestoAtual = numero;
    loadingModal?.show();

    try {
        const response = await authFetch(`${API_BASE}manifesto/busca/`, {
            method: 'POST',
            body: JSON.stringify({ numero_manifesto: numero }),
        });
        
        if (response.ok) startPolling();
        else {
            loadingModal?.hide();
            renderSearchScreen('Manifesto não encontrado.', 'error');
        }
    } catch (err) { loadingModal?.hide(); }
}

function startPolling() {
    stopPolling();
    pollingInterval = setInterval(async () => {
        try {
            const response = await authFetch(`${API_BASE}manifesto/status/?numero_manifesto=${manifestoAtual}`);
            const data = await response.json();
            if (data.status === 'PROCESSADO') {
                stopPolling();
                loadingModal?.hide();
                renderManifestoPreview(data.payload);
            }
        } catch (err) { stopPolling(); }
    }, 2000);
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

// Adicione isto ao final do manifesto.js
async function atualizarDadosHeader() {
    try {
        // Busca os dados do perfil do motorista logado
        const res = await authFetch(`${AUTH_BASE}perfil/`); 
        
        if (res && res.ok) {
            const data = await res.json();
            if (data && data.nome) {
                // Atualiza o texto no HTML (certifique-se que o ID existe no seu header)
                const nomeHeader = document.getElementById('header-nome-motorista');
                if (nomeHeader) {
                    nomeHeader.textContent = data.nome.split(' ')[0]; // Exibe apenas o primeiro nome
                }
            }
        }
    } catch (e) {
        console.warn("Não foi possível atualizar o nome no header:", e);
    }
}