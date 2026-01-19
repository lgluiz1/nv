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
        forcarUpdatePWA();
        atualizarDadosHeader();
        verificarEstadoInicial();
        // CHAME DIRETAMENTE AQUI (sem o addEventListener)
        carregarDadosCabecalho();

        const inputCamera = document.getElementById('camera-nativa');
        if (inputCamera) {
            inputCamera.addEventListener('change', handleCameraNativa);
        }
        // =====================================================
        // FLUXO DE FINALIZAÇÃO DE MANIFESTO
        // =====================================================
        document.getElementById('finalizar-form-modal').addEventListener('submit', async (e) => {
            e.preventDefault();

            const kmFinal = document.getElementById('km-final').value;
            const msgDiv = document.getElementById('finalizar-message');
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const modalBody = document.querySelector('#kmFinalModal .modal-body');
            

            const manifestoId = localStorage.getItem('manifesto_ativo') || 
                        manifestoAtual || 
                        document.getElementById('manifesto-id-display')?.innerText;
            console.log("Tentando finalizar o Manifesto ID:", manifestoId);

    if (!manifestoId) {
        document.getElementById('finalizar-message').innerText = "Erro: Número do manifesto não identificado. Recarregue a página.";
        return;
    }

            if (!kmFinal) {
                msgDiv.innerText = "Por favor, insira a quilometragem.";
                return;
            }

            // Desabilita o botão
            submitBtn.disabled = true;
            submitBtn.innerText = "Finalizando...";

            try {
                const response = await authFetch(`${API_BASE}manifesto/finalizar/`, {
                    method: 'POST',
                    body: JSON.stringify({
                        km_final: kmFinal,
                        manifesto_id: manifestoId // Enviando o ID específico
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    // SUCESSO: Transforma o conteúdo do modal
                    modalBody.innerHTML = `
                <div class="text-center p-4 animate__animated animate__zoomIn">
                    <i class="bi bi-check-circle-fill text-success" style="font-size: 4rem;"></i>
                    <h4 class="mt-3 fw-bold">Obrigado!</h4>
                    <p class="text-muted">Manifesto finalizado com sucesso.</p>
                    <div class="badge bg-light text-dark border p-2">Sincronizando com o sistema...</div>
                </div>
            `;

                    // Aguarda 3 segundos para o motorista ver a mensagem e recarrega
                    setTimeout(() => {
                        localStorage.removeItem('manifesto_ativo');
                        window.location.reload();
                    }, 3000);

                } else {
                    // Erro vindo da View
                    msgDiv.innerText = data.mensagem || "Erro ao finalizar.";
                    submitBtn.disabled = false;
                    submitBtn.innerText = "Confirmar e Finalizar";
                }
            } catch (err) {
                console.error("Erro no fechamento:", err);
                msgDiv.innerText = "Falha na conexão com o servidor.";
                submitBtn.disabled = false;
                submitBtn.innerText = "Confirmar e Finalizar";
            }
        });
    } else {
        window.location.href = LOGIN_URL;
    }
});
// =====================================================
// Forçar a atualização do Service Worker e limpar cache
// =====================================================
function forcarUpdatePWA() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let registration of registrations) {
                // 1. Pede para o Service Worker buscar atualizações no servidor
                registration.update();

                // 2. Se houver um novo esperando, ele força a ativação
                if (registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
            }
        });
    }
}

// Escuta a mudança de controle (quando o SW novo assume) e dá o REFRESH
navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log("Novo Service Worker assumiu. Recarregando...");
    window.location.reload(true); // O 'true' força o reload do servidor
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
            localStorage.setItem('manifesto_ativo', numero);
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
                    contador.innerText = "✅ Sincronização Concluída";
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
        
        // Elemento para o botão de refresh (vamos criar um se não existir)
        let btnRefresh = document.getElementById('btn-refresh-container');

        if (container && notas.length > 0) {
            let htmlNotas = '';
            let totalFinalizadas = 0;

            notas.forEach(nf => {
                const baixada = nf.ja_baixada;
                if (baixada) totalFinalizadas++;

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

            // --- BOTÃO DE REFRESH PROFISSIONAL (FAB) ---
            // Só aparece se a lista for carregada
            if (!btnRefresh) {
                btnRefresh = document.createElement('div');
                btnRefresh.id = 'btn-refresh-container';
                // Estilo para ficar flutuando no canto inferior
                btnRefresh.innerHTML = `
                    <button onclick="iniciarSincronismo('${numeroManifesto}')" 
                            class="btn btn-primary shadow-lg animate__animated animate__bounceIn" 
                            style="position: fixed; bottom: 80px; right: 20px; width: 60px; height: 60px; border-radius: 50%; z-index: 1050; display: flex; align-items: center; justify-content: center;">
                        <i class="bi bi-arrow-clockwise fs-3"></i>
                    </button>
                `;
                document.body.appendChild(btnRefresh);
            }

            // --- LÓGICA DE CONTADORES DINÂMICOS ---
            if (contador) {
                let htmlContadores = `
                    <div class="d-flex gap-2">
                        <span class="badge bg-secondary p-2">${notas.length} Notas no Manifesto</span>
                `;

                if (totalFinalizadas > 0) {
                    htmlContadores += `
                        <span class="badge bg-success p-2 animate__animated animate__bounceIn">
                            <i class="bi bi-check2-circle"></i> ${totalFinalizadas} Finalizadas
                        </span>
                    `;
                }
                
                // ... (seu código de KM Final permanece igual)
                if (notas.length > 0 && totalFinalizadas === notas.length) {
                    const modalKM = new bootstrap.Modal(document.getElementById('kmFinalModal'));
                    setTimeout(() => { modalKM.show(); }, 800);
                }

                htmlContadores += `</div>`;
                contador.innerHTML = htmlContadores;
            }
        }
    } catch (err) { console.error("Erro na atualização viva:", err); }
}
// =====================================================
// FUNÇÕES DE INTERFACE (MODALS E SEARCH)
// =====================================================

function renderSearchScreen(message = null, type = 'info') {
    stopPolling();
    const content = document.getElementById('app-content');
    const alertHTML = message ? `<div class="alert alert-${type === 'error' ? 'danger' : 'info'} animate__animated animate__shakeX w-100 mb-3">${message}</div>` : '';

    content.innerHTML = `
        <div class="search-container-card animate__animated animate__fadeIn">
            <div class="card shadow border-0 p-4" style="border-radius: 20px;">
                <div class="text-center mb-4">
                    <i class="bi bi-truck text-primary" style="font-size: 2.5rem;"></i>
                    <h5 class="fw-bold mt-2">Buscar Manifesto</h5>
                    <p class="text-muted small">Digite o número para carregar as notas</p>
                </div>

                ${alertHTML}

                <form id="search-form">
                    <div class="form-floating mb-3">
                        <input type="number" id="manifesto-number" class="form-control" placeholder="00000" required>
                        <label for="manifesto-number">Número do Manifesto</label>
                    </div>
                    <button class="btn btn-primary btn-lg w-100 shadow-sm fw-bold" style="border-radius: 12px;">
                        CARREGAR ROTA
                    </button>
                </form>
            </div>
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
            // --- AQUI ESTÁ A CHAVE ---
            manifestoAtual = data.numero_manifesto; // Salva na variável global
            localStorage.setItem('manifesto_ativo', data.numero_manifesto);
            
            // Garante que o span no HTML tenha o ID para a função de finalizar não dar erro
            const el = document.getElementById('manifesto-id-display');
            if (el) el.innerText = data.numero_manifesto;

            renderListaEntregasFinal(data.numero_manifesto);
        } else {
            renderSearchScreen();
        }
    } catch (err) { 
        renderSearchScreen(); 
    }
}
async function renderListaEntregasFinal(numeroManifesto) {
    // Mesma lógica do renderEstruturaLista, mas usada para carregamento inicial (Estado Ativo)
    renderEstruturaLista(numeroManifesto);
}

// =====================================================
// BAIXAS, CÂMERA E GEOLOCALIZAÇÃO
// =====================================================

// Certifique-se de que o statusModal foi inicializado no topo do seu arquivo JS
const statusModal = new bootstrap.Modal(document.getElementById('statusModal'));

async function salvarRegistro() {
    // 1. Coleta de elementos do DOM
    const selectOcorrencia = document.getElementById('select-ocorrencia');
    const inputRecebedor = document.getElementById('input-recebedor');
    const inputChave = document.getElementById('hidden-chave-nf');
    const canvas = document.getElementById('canvas-preview');

    const cod = selectOcorrencia.value;
    const chaveNF = inputChave.value;
    const temFoto = (canvas.style.display === 'block');

    // 2. Validação de Foto Obrigatória (Códigos 1 e 2 geralmente são 'Entregue')
    if ((cod === "1" || cod === "2") && !temFoto) {
        alert("A foto é obrigatória para este código de ocorrência!");
        return;
    }

    // 3. Interface: Fecha modal de preenchimento e abre modal de progresso
    const modalBaixaEl = document.getElementById('modalBaixa');
    const modalBaixaInstance = bootstrap.Modal.getInstance(modalBaixaEl);
    if (modalBaixaInstance) modalBaixaInstance.hide();

    // Reseta o Modal de Status para o estado de carregamento
    atualizarStatusUI('loading', 'Enviando Registro...', 'Aguarde, estamos salvando os dados e a foto.');
    statusModal.show();

    // 4. Preparação dos Dados (FormData)
    const formData = new FormData();
    formData.append('ocorrencia_codigo', cod);
    formData.append('chave_acesso', chaveNF);
    formData.append('recebedor', inputRecebedor.value || '');

    // 5. Captura de Coordenadas GPS
    try {
        const coords = await getCoords(); // Função que você já possui
        if (coords) {
            formData.append('latitude', coords.lat);
            formData.append('longitude', coords.lon);
        }
    } catch (gpsErr) {
        console.warn("Não foi possível obter GPS:", gpsErr);
        // Prossegue mesmo sem GPS para não travar a entrega
    }

    // 6. Conversão do Canvas para Imagem (Blob)
    if (temFoto) {
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
        formData.append('foto', blob, `${chaveNF}.jpg`);
    }

    // 7. Envio para o Backend
    try {
        const response = await authFetch(`${API_BASE}manifesto/registrar-baixa/`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            // SUCESSO TOTAL: Mostra ícone verde e recarrega após 2 segundos
            atualizarStatusUI('success', '✅ Registro Cadastrado!', 'A baixa foi realizada com sucesso no sistema.');
            setTimeout(() => {
                location.reload();
            }, 2000);

        } else {
            // ERRO RETORNADO PELO SERVIDOR (Ex: Erro de integração com ESL)
            if (data.status_integracao === 'erro_tms') {
                atualizarStatusUI('warning', '⚠️ Salvo com Alerta', `O canhoto foi salvo no App, mas houve um erro na ESL: ${data.erro}`);
            } else {
                atualizarStatusUI('error', '❌ Falha no Registro', data.erro || 'Erro interno no servidor.');
            }
            configurarBotaoWhats(data.erro, chaveNF);
        }

    } catch (err) {
        // ERRO DE REDE (Internet do motorista caiu, VPS offline)
        atualizarStatusUI('error', '📡 Erro de Conexão', 'Não foi possível falar com o servidor. Verifique seu sinal de internet.');
        configurarBotaoWhats("Erro de conexão/rede no momento da baixa", chaveNF);
    }
}

/**
 * Função Auxiliar para atualizar a interface do Modal de Status
 */
function atualizarStatusUI(tipo, titulo, mensagem) {
    const iconDiv = document.getElementById('status-icon');
    const titleEl = document.getElementById('status-title');
    const msgEl = document.getElementById('status-message');
    const footerDiv = document.getElementById('status-footer');

    titleEl.innerText = titulo;
    msgEl.innerText = mensagem;

    if (tipo === 'loading') {
        iconDiv.innerHTML = '<div class="spinner-border text-primary" style="width: 3rem; height: 3rem;"></div>';
        footerDiv.style.display = 'none';
    } else {
        footerDiv.style.display = 'block';
        if (tipo === 'success') iconDiv.innerHTML = '<span style="font-size: 5rem;">✅</span>';
        if (tipo === 'error') iconDiv.innerHTML = '<span style="font-size: 5rem;">❌</span>';
        if (tipo === 'warning') iconDiv.innerHTML = '<span style="font-size: 5rem;">⚠️</span>';
    }
}

/**
 * Configura o botão de suporte do WhatsApp caso ocorra um erro
 */
function configurarBotaoWhats(erroMsg, chave) {
    const btn = document.getElementById('btn-reportar');
    if (!btn) return;

    btn.style.display = 'block';
    btn.onclick = () => {
        const msg = `Olá! Tive um problema ao registrar a baixa.\nErro: ${erroMsg}\nChave: ${chave}`;
        const url = `https://wa.me/55SEUNUMERO?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    };
}


//// FUNÇÕES AUXILIARES DE CÂMERA NATIVA E MODAIS ////

function handleCameraNativa(event) {
    const file = event.target.files[0];
    if (!file) return;

    const canvas = document.getElementById('canvas-preview');
    const ctx = canvas.getContext('2d');
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
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
async function carregarDadosCabecalho() {
    try {
        const response = await authFetch(`${API_BASE}motorista/perfil/`);

        if (response && response.ok) {
            const dados = await response.json();
            console.log("Dados do perfil carregados:", dados);

            // 1. Atualiza a foto se existir
            const avatarContainer = document.querySelector('.avatar-circle');
            if (dados.foto_url && avatarContainer) {
                avatarContainer.innerHTML = `<img src="${dados.foto_url}" alt="Foto" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
            }

            // 2. Opcional: Se você tiver um campo de nome no header, pode atualizar aqui também
            const nomeExibicao = document.getElementById('nome-motorista');
            if (nomeExibicao) nomeExibicao.innerText = dados.nome;

        } else {
            console.log("Não foi possível carregar os dados do perfil ou motorista anônimo.");
        }
    } catch (error) {
        console.error("Erro ao buscar dados do motorista:", error);
    }
}
async function iniciarSincronismo(numeroManifesto) {
    // 1. Abre o modal
    const modalElement = document.getElementById('modalSincronismo');
    const modalSinc = new bootstrap.Modal(modalElement);
    modalSinc.show();

    try {
        // 2. Chama a View que dispara a Task
        const response = await fetch('/api/manifesto/sincronizar/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            },
            body: JSON.stringify({ numero_manifesto: numeroManifesto })
        });

        if (response.ok) {
            // 3. Aguarda 10 segundos (tempo médio para a Task processar algumas notas novas)
            setTimeout(() => {
                modalSinc.hide();
                window.location.reload(); // Recarrega para mostrar as novas notas
            }, 10000);
        } else {
            throw new Error('Falha na comunicação com o servidor');
        }
    } catch (error) {
        modalSinc.hide();
        alert('Erro ao sincronizar: ' + error.message);
    }
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