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

const TEMA_OPERACAO = {
    'TRANSFERENCIA': { icon: 'bi-box-arrow-right', color: 'primary', label: 'Registrar Chegada', code: '98' },
    'DESPACHO':      { icon: 'bi-airplane', color: 'info', label: 'Confirmar Despacho', code: '50' },
    'RETIRADA':      { icon: 'bi-box-arrow-in-left', color: 'warning', label: 'Confirmar Retirada', code: '51' },
    'ENTREGA':       { icon: 'bi-truck', color: 'primary', label: 'Dar Baixa', code: '1' }
};

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
                    <span id="contador-notas" class="badge bg-primary px-3 py-2">Sincronizando com ESL...</span>
                </div>
            </div>

            <div id="area-lista-dinamica">
                <div class="text-center py-5">
                    <div class="spinner-border text-primary mb-3" role="status"></div>
                    <p class="text-muted">Preparando sua rota...</p>
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
        const areaDinamica = document.getElementById('area-lista-dinamica');
        const contador = document.getElementById('contador-notas');
        
        if (areaDinamica && notas.length > 0) {
            // 1. INJEÇÃO DA BUSCA (Se não existir) - MANTIDO ORIGINAL
            if (!document.getElementById('input-busca-nfe')) {
                areaDinamica.innerHTML = `
                    <div class="search-box mb-4 animate__animated animate__fadeInDown">
                        <div class="input-group shadow-sm position-relative" style="border-radius: 15px; overflow: hidden;">
                            <span class="input-group-text bg-white border-0">
                                <i class="bi bi-search text-muted"></i>
                            </span>
                            <input type="text" id="input-busca-nfe" class="form-control border-0 p-3" 
                                   placeholder="Filtrar por Número ou Chave..." oninput="filtrarNotasOffline(); toggleClearButton();">
                            <button type="button" id="btn-limpar-busca" class="btn btn-white border-0 text-danger d-none" onclick="limparBusca()">
                                <i class="bi bi-x-circle-fill" style="font-size: 1.3rem;"></i>
                            </button>
                            <button class="btn btn-white border-0 text-primary" onclick="abrirScanner()">
                                <i class="bi bi-camera-fill" style="font-size: 1.5rem;"></i>
                            </button>
                        </div>
                        <input type="file" id="leitor-nfe-camera" accept="image/*" capture="environment" style="display: none" onchange="lerCodigoBarra(this)">
                    </div>
                    <div id="container-baixa-coletiva"></div>
                    <div id="lista-notas-container"></div>
                    <div id="lista-notas-concluidas" class="mt-4 pt-3 border-top d-none">
                        <div class="d-flex align-items-center mb-3 text-success opacity-75">
                            <i class="bi bi-check-all fs-4 me-2"></i>
                            <h6 class="mb-0 fw-bold text-uppercase">Itens Concluídos</h6>
                        </div>
                        <div id="container-concluidos-cards" class="opacity-50"></div>
                    </div>
                `;
            }

            const containerNotas = document.getElementById('lista-notas-container');
            const containerConcluidos = document.getElementById('container-concluidos-cards');
            const secaoConcluidos = document.getElementById('lista-notas-concluidas');
            const containerColetiva = document.getElementById('container-baixa-coletiva');
            
            const TEMA_OPERACAO = {
                'TRANSFERENCIA': { icon: 'bi-box-arrow-right', color: 'primary', label: 'Registrar Chegada', code: '98' },
                'DESPACHO':      { icon: 'bi-airplane', color: 'info', label: 'Confirmar Despacho', code: '50' },
                'RETIRADA':      { icon: 'bi-box-arrow-in-left', color: 'warning', label: 'Confirmar Retirada', code: '51' },
                'ENTREGA':       { icon: 'bi-truck', color: 'success', label: 'Dar Baixa', code: '1' }
            };

            const grupos = { 'TRANSFERENCIA': [], 'DESPACHO': [], 'RETIRADA': [], 'ENTREGA': [] };
            let htmlConcluidos = '';
            let totalFinalizadas = 0;

            // 2. SEPARAÇÃO DAS NOTAS (Pendentes por Grupo vs Concluídas Única)
            notas.forEach(nf => {
                const tipo = nf.tipo_operacao || 'ENTREGA';
                const baixada = nf.ja_baixada;
                const config = TEMA_OPERACAO[tipo] || TEMA_OPERACAO['ENTREGA'];

                if (baixada) {
                    totalFinalizadas++;
                    // Gera o card para a seção de concluídos (sem botão de ação)
                    htmlConcluidos += gerarCardHTML(nf, config, true);
                } else {
                    // Adiciona ao grupo para as seções de trabalho
                    if (grupos[tipo]) grupos[tipo].push(nf);
                    else grupos['ENTREGA'].push(nf);
                }
            });

            // 3. RENDERIZAÇÃO DAS NOTAS PENDENTES (AGRUPADAS)
            let htmlPendentes = '';
            Object.keys(grupos).forEach(tipo => {
                if (grupos[tipo].length > 0) {
                    const config = TEMA_OPERACAO[tipo];
                    htmlPendentes += `<div class="group-divider mb-2 mt-3 small fw-bold text-muted text-uppercase" style="background: #e9ecef; padding: 5px 10px; border-radius: 5px;">
                                        <i class="bi ${config.icon} me-1"></i> ${tipo} (${grupos[tipo].length})
                                      </div>`;

                    grupos[tipo].forEach(nf => {
                        htmlPendentes += gerarCardHTML(nf, config, false);
                    });
                }
            });

            containerNotas.innerHTML = htmlPendentes;

            // 4. EXIBIÇÃO DOS CONCLUÍDOS
            if (totalFinalizadas > 0) {
                containerConcluidos.innerHTML = htmlConcluidos;
                secaoConcluidos.classList.remove('d-none');
            } else {
                secaoConcluidos.classList.add('d-none');
            }

            // --- RESTANTE DA LÓGICA ORIGINAL (BAIXA COLETIVA, CONTADORES, REFRESH, KM FINAL) ---
            const transfPendentes = grupos['TRANSFERENCIA'].filter(n => !n.ja_baixada);
            if (transfPendentes.length > 0 && containerColetiva) {
                containerColetiva.innerHTML = `<div class="card bg-primary text-white mb-4 shadow-sm border-0 animate__animated animate__pulse"><div class="card-body d-flex justify-content-between align-items-center"><div><small class="fw-bold opacity-75">OPERAÇÃO FILIAL</small><h6 class="mb-0">Chegada de ${transfPendentes.length} Notas</h6></div><button class="btn btn-light btn-sm fw-bold text-primary px-3" onclick="registrarChegadaColetiva('${numeroManifesto}')">BAIXAR TUDO</button></div></div>`;
            } else if (containerColetiva) { containerColetiva.innerHTML = ''; }

            if (contador) {
                let htmlContadores = `<div class="d-flex gap-2"><span class="badge bg-secondary p-2">${notas.length} Notas no Manifesto</span>`;
                if (totalFinalizadas > 0) htmlContadores += `<span class="badge bg-success p-2 animate__animated animate__bounceIn"><i class="bi bi-check2-circle"></i> ${totalFinalizadas} Finalizadas</span>`;
                if (notas.length > 0 && totalFinalizadas === notas.length) {
                    const modalKM = new bootstrap.Modal(document.getElementById('kmFinalModal'));
                    setTimeout(() => { modalKM.show(); }, 800);
                }
                htmlContadores += `</div>`;
                contador.innerHTML = htmlContadores;
            }

            filtrarNotasOffline();
        }
    } catch (err) { console.error("Erro na atualização viva:", err); }
}

// FUNÇÃO AUXILIAR PARA GERAR O CARD (EVITA DUPLICAR CÓDIGO)
function gerarCardHTML(nf, config, baixada) {
    const cor = baixada ? 'success' : config.color;
    const icone = baixada ? 'bi-check-circle-fill' : config.icon;
    const chave = nf.chave_acesso || '';
    const numero = nf.numero_nota || '';
    const tipo = nf.tipo_operacao || 'ENTREGA';

    return `
        <div class="card mb-3 shadow-sm border-start border-${cor} border-4 animate__animated ${baixada ? '' : 'animate__fadeInUp'}" data-chave="${chave}">
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-start">
                    <h6 class="fw-bold mb-1">📝NF ${numero}</h6>
                    <span><i class="bi ${icone} text-${cor}" style="font-size: 1.2rem;"></i></span>
                </div>
                <p class="small text-muted mb-1">👤 ${nf.destinatario}</p>
                <p class="small text-muted mb-2" style="font-size: 0.75rem;"><i class="bi bi-geo-alt"></i> ${nf.endereco_entrega}</p>
                ${!baixada ? `
                    <button class="btn btn-sm btn-${config.color} w-100 fw-bold" 
                        onclick="${
                            tipo === 'ENTREGA' 
                            ? `abrirModalBaixa('${numero}', '${chave}', '${tipo}')` 
                            : tipo === 'TRANSFERENCIA'
                            ? `confirmarTransferenciaIndividual('${numero}', '${chave}')`
                            : `abrirModalPerguntaOperacional('${numero}', '${chave}', '${tipo}')`
                        }">
                        ${config.label}
                    </button>
                ` : `
                    <button class="btn btn-sm btn-outline-success w-100" 
                        onclick='abrirModalDetalhes(${JSON.stringify(nf.dados_baixa)})'>
                        Ver Detalhes
                    </button>
                `}
            </div>
        </div>`;
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
    const inputNumero = document.getElementById('hidden-numero-nf');
    const numeroNF = inputNumero ? inputNumero.value : '';

    // Elementos Nota Retida
    const isRetida = document.getElementById('check-nota-retida').checked;
    const inputObs = document.getElementById('input-observacao').value;

    const cod = selectOcorrencia.value;
    const chaveNF = inputChave.value;
    const temFoto = (canvas.style.display === 'block');
    const mID = manifestoAtual || localStorage.getItem('manifesto_ativo');

    // --- NOVA LÓGICA DE VALIDAÇÃO ---
    if (isRetida) {
        if (inputObs.trim().length < 5) {
            alert("Obrigatório descrever o motivo da Nota Retida.");
            return;
        }
    } else {
        // Validação original de Foto (apenas se NÃO for retida)
        if ((cod === "1" || cod === "2") && !temFoto) {
            alert("A foto é obrigatória para este código de ocorrência!");
            return;
        }
    }

    // 3. Interface: Fecha modal de preenchimento e abre modal de progresso
    const modalBaixaEl = document.getElementById('modalBaixa');
    const modalBaixaInstance = bootstrap.Modal.getInstance(modalBaixaEl);
    if (modalBaixaInstance) modalBaixaInstance.hide();

    atualizarStatusUI('loading', 'Enviando Registro...', 'Aguarde, estamos salvando os dados.');
    statusModal.show();

    // 4. Preparação dos Dados (FormData)
    const formData = new FormData();
    formData.append('ocorrencia_codigo', cod);
    formData.append('chave_acesso', chaveNF);
    formData.append('numero_nota', numeroNF);
    formData.append('manifesto_id', mID);
    formData.append('recebedor', inputRecebedor.value || '');
    
    // Dados da Retenção
    formData.append('nota_retida', isRetida);
    formData.append('observacao_retida', inputObs);

    // 5. Captura de Coordenadas GPS
    try {
        const coords = await getCoords(); 
        if (coords) {
            formData.append('latitude', coords.lat);
            formData.append('longitude', coords.lon);
        }
    } catch (gpsErr) {
        console.warn("Não foi possível obter GPS:", gpsErr);
    }

    // 6. Conversão do Canvas para Imagem (Blob) - Apenas se não for retida e tiver foto
    if (!isRetida && temFoto) {
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
        formData.append('foto', blob, `mft_${mID}_${chaveNF}.jpg`);
    }

    // 7. Envio para o Backend
    try {
        const response = await authFetch(`${API_BASE}manifesto/registrar-baixa/`, {
            method: 'POST',
            body: formData 
        });

        const data = await response.json();

        if (response.ok) {
            atualizarStatusUI('success', '✅ Registro Cadastrado!', 'A baixa foi realizada com sucesso no sistema.');
            setTimeout(() => {
                location.reload();
            }, 2000);
        } else {
            if (data.status_integracao === 'erro_tms') {
                atualizarStatusUI('warning', '⚠️ Salvo com Alerta', `O canhoto foi salvo no App, mas houve um erro na ESL: ${data.erro}`);
            } else {
                atualizarStatusUI('error', '❌ Falha no Registro', data.erro || 'Erro interno no servidor.');
            }
            configurarBotaoWhats(data.erro, chaveNF);
        }
    } catch (err) {
        atualizarStatusUI('error', '📡 Erro de Conexão', 'Não foi possível falar com o servidor.');
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

function abrirModalBaixa(numeroNota, chaveAcesso, tipo) {
    const tituloEl = document.getElementById('modal-titulo-nf');
    const inputChave = document.getElementById('hidden-chave-nf');
    const inputNumero = document.getElementById('hidden-numero-nf');
    const selectOc = document.getElementById('select-ocorrencia');
    const cameraSection = document.querySelector('.camera-container');
    const cameraLabel = document.getElementById('label-camera');
    const btnNovaFoto = document.getElementById('btn-nova-foto');
    
    // Elementos da Modificação de Nota Retida
    const checkRetida = document.getElementById('check-nota-retida');
    const campoObs = document.getElementById('campo-observacao');
    const inputObs = document.getElementById('input-observacao');

    tituloEl.innerText = `📝 ${tipo} - NF ${numeroNota}`;
    
    // Alimenta os campos que o salvarRegistro() vai ler
    inputChave.value = (chaveAcesso && chaveAcesso !== 'null') ? chaveAcesso : '';
    if (inputNumero) inputNumero.value = numeroNota || ''; 

    // Reset padrão ao abrir
    document.getElementById('canvas-preview').style.display = 'none';
    document.getElementById('placeholder-camera').style.display = 'block';
    
    // Reset dos campos de Nota Retida
    if (checkRetida) {
        checkRetida.checked = false;
        campoObs.style.display = 'none';
        inputObs.value = '';

        // Lógica de monitoramento do Switch
        checkRetida.onchange = function() {
            if (this.checked) {
                // Se marcar retida: esconde câmera e mostra texto
                cameraSection.style.display = 'none';
                cameraLabel.style.display = 'none';
                btnNovaFoto.style.display = 'none';
                campoObs.style.display = 'block';
            } else {
                // Se desmarcar: volta ao estado original baseado no tipo
                if (tipo === 'ENTREGA') {
                    cameraSection.style.display = 'block';
                    cameraLabel.style.display = 'block';
                }
                campoObs.style.display = 'none';
            }
        };
    }

    // REGRA DE OURO: Se não for ENTREGA, esconde a câmera e pré-seleciona o código
    if (tipo !== 'ENTREGA') {
        cameraSection.style.display = 'none';
        cameraLabel.style.display = 'none';
        btnNovaFoto.style.display = 'none';
        if (TEMA_OPERACAO[tipo]) selectOc.value = TEMA_OPERACAO[tipo].code;
    } else {
        cameraSection.style.display = 'block';
        cameraLabel.style.display = 'block';
        selectOc.value = '1'; 
    }

    new bootstrap.Modal(document.getElementById('modalBaixa')).show();
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
    const modalElement = document.getElementById('modalSincronismo');
    const modalSinc = new bootstrap.Modal(modalElement);
    
    // Elementos internos do modal
    const elStatus = document.getElementById('modal-sinc-status');
    const elTitulo = document.getElementById('modal-sinc-titulo');
    const elMensagem = document.getElementById('modal-sinc-mensagem');
    const elProgresso = document.getElementById('modal-sinc-progresso');
    const elBtnFechar = document.getElementById('modal-sinc-btn-fechar');

    // Resetar modal para estado inicial (Carregando)
    elStatus.innerHTML = '<div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;"></div>';
    elTitulo.innerText = "Sincronizando Notas";
    elMensagem.innerText = "Estamos buscando novas notas no sistema da ESL. Por favor, aguarde alguns instantes.";
    elProgresso.classList.remove('d-none');
    elBtnFechar.classList.add('d-none');

    modalSinc.show();

    try {
        // Importante: use o authFetch para garantir que o Token seja enviado!
        const response = await authFetch(`${API_BASE}manifesto/sincronizar/`, {
            method: 'POST',
            body: JSON.stringify({ numero_manifesto: numeroManifesto })
        });

        if (response && response.ok) {
            // Sucesso
            setTimeout(() => {
                elStatus.innerHTML = '<i class="bi bi-check-circle-fill text-success" style="font-size: 3rem;"></i>';
                elTitulo.innerText = "Sucesso!";
                elMensagem.innerText = "Notas sincronizadas. A página será atualizada.";
                elProgresso.classList.add('d-none');
                
                setTimeout(() => {
                    modalSinc.hide();
                    window.location.reload();
                }, 2000);
            }, 5000); // Aguarda um pouco para a task começar
        } else {
            // Erro de Resposta (401, 404, 500...)
            throw new Error(response.status === 401 ? "Sessão expirada. Faça login novamente." : "Falha na comunicação com o servidor.");
        }
    } catch (error) {
        // Exibe o erro dentro do Modal em vez de Alert
        elStatus.innerHTML = '<i class="bi bi-exclamation-triangle-fill text-danger" style="font-size: 3rem;"></i>';
        elTitulo.innerText = "Erro na Sincronização";
        elMensagem.innerHTML = `<span class="text-danger">${error.message}</span>`;
        elProgresso.classList.add('d-none');
        elBtnFechar.classList.remove('d-none'); // Deixa o motorista fechar o modal
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
        <div class="mb-2 small"><strong>📅 Data:</strong> ${dados.data}</div>
        <div class="mb-2 small"><strong>👤 Recebedor:</strong> ${dados.recebedor || 'Não informado'}</div>
        <div class="mb-3 small">
            <strong>📝 Ocorrência:</strong> 
            <span class="badge bg-primary text-white">
                ${dados.ocorrencia || 'Não informada'}
            </span>
        </div>
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

// 1. FILTRAGEM COM SANITIZAÇÃO (Apenas números)
function beep() {
    const audio = new Audio(
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAA/////w=="
    );
    audio.play().catch(() => {});
}
function filtrarNotasOffline() {
    const input = document.getElementById('input-busca-nfe');
    // REMOVE TUDO QUE NÃO É NÚMERO AO DIGITAR
    const termo = input.value.replace(/\D/g, ''); 
    input.value = termo; // Atualiza o campo visualmente apenas com números

    const cards = document.querySelectorAll('#lista-notas-container .card');
    cards.forEach(card => {
        const textoCard = card.innerText.replace(/\D/g, ''); // Limpa o texto do card para comparar
        const chave = card.getAttribute('data-chave') || "";

        if (textoCard.includes(termo) || chave.includes(termo)) {
            card.style.display = "block";
        } else {
            card.style.display = "none";
        }
    });
}

// 2. SCANNER EM TEMPO REAL (Usando ZXing)
let codeReader = null;
let lendo = false;

function abrirScanner() {
    const modalEl = document.getElementById('scannerModal');
    const modal = new bootstrap.Modal(modalEl);

    lendo = false;
    modal.show();

    modalEl.addEventListener('shown.bs.modal', async () => {
        try {
            codeReader = new ZXing.BrowserMultiFormatReader();

            await codeReader.decodeFromConstraints(
                {
                    video: {
                        facingMode: { ideal: "environment" },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    }
                },
                document.getElementById('video-scanner'),
                (result, err) => {
                    if (result && !lendo) {
                        lendo = true;

                        const codigo = result.text.replace(/\D/g, '');
                        console.log("Código lido:", codigo);

                        // 1️⃣ Preenche campo de busca
                        const campoBusca = document.getElementById('input-busca-nfe');
                        campoBusca.value = codigo;
                        toggleClearButton();
                        filtrarNotasOffline();

                        // 2️⃣ Filtra a lista
                        filtrarNotasOffline();

                        // 3️⃣ Feedback
                        beep();
                        if (navigator.vibrate) navigator.vibrate(150);

                        // 4️⃣ Fecha scanner e modal
                        pararScanner();
                        modal.hide();
                    }
                }
            );

        } catch (err) {
            alert("Erro ao acessar a câmera: " + err);
            console.error(err);
        }
    }, { once: true });
}

function pararScanner() {
    if (codeReader) {
        codeReader.reset(); // libera a câmera
        codeReader = null;
    }
}


async function lerCodigoBarra(input) {
    if (!input.files || !input.files[0]) return;

    const btnCamera = input.parentElement.querySelector('button');
    const iconeOriginal = btnCamera.innerHTML;
    btnCamera.innerHTML = '<div class="spinner-border spinner-border-sm text-primary"></div>';

    let imageUrl = null;

    try {
        const codeReader = new ZXing.BrowserMultiFormatReader();
        imageUrl = URL.createObjectURL(input.files[0]);

        const result = await codeReader.decodeFromImageUrl(imageUrl);

        const codigo = result.text.replace(/\D/g, '');
        console.log("Código lido (imagem):", codigo);

        // 1️⃣ Preenche campo de busca
        const campoBusca = document.getElementById('input-busca-nfe');
        campoBusca.value = codigo;
        toggleClearButton();
        filtrarNotasOffline();

        // 2️⃣ Filtra lista
        filtrarNotasOffline();

        // 3️⃣ Feedback
        beep();
        if (navigator.vibrate) navigator.vibrate(150);

    } catch (err) {
        alert("Não foi possível ler o código de barras. Tente aproximar mais a câmera ou digitar a NF.");
        console.error("Erro leitura imagem:", err);
    } finally {
        btnCamera.innerHTML = iconeOriginal;
        if (imageUrl) URL.revokeObjectURL(imageUrl);
    }
}
function toggleClearButton() {
    const input = document.getElementById('input-busca-nfe');
    const btn = document.getElementById('btn-limpar-busca');

    if (!input || !btn) return;

    if (input.value.trim().length > 0) {
        btn.classList.remove('d-none');
    } else {
        btn.classList.add('d-none');
    }
}

function limparBusca() {
    const input = document.getElementById('input-busca-nfe');
    if (!input) return;

    input.value = "";
    input.focus();

    toggleClearButton();
    filtrarNotasOffline();
}

// Função para registrar a chegada de todas as transferências de uma vez
async function registrarChegadaColetiva(manifestoId) {
    // 1. Criamos o modal de confirmação dinâmico (Para evitar o 'confirm' do navegador)
    const modalConfirmHTML = `
    <div class="modal fade" id="modalConfirmMassa" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0 shadow-lg" style="border-radius: 20px;">
                <div class="modal-body text-center p-4">
                    <div class="mb-3">
                        <i class="bi bi-exclamation-circle-fill text-primary" style="font-size: 3.5rem;"></i>
                    </div>
                    <h5 class="fw-bold">Chegada na Filial</h5>
                    <p class="text-muted">Deseja registrar a chegada de <b>TODAS</b> as notas de transferência deste manifesto?</p>
                    
                    <div class="d-grid gap-2 mt-4">
                        <button class="btn btn-primary btn-lg fw-bold" id="btn-confirmar-massa">
                            SIM, REGISTRAR TUDO
                        </button>
                        <button class="btn btn-light" data-bs-dismiss="modal">CANCELAR</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalConfirmHTML);
    const mConfirm = new bootstrap.Modal(document.getElementById('modalConfirmMassa'));
    mConfirm.show();

    // 2. Ação ao clicar em confirmar no modal
    document.getElementById('btn-confirmar-massa').onclick = async () => {
        mConfirm.hide(); // Fecha o modal de pergunta
        
        // Abre o modal de status (Carregando)
        statusModal.show();
        atualizarStatusUI('loading', 'Processando Lote...', 'Enfileirando notas para integração com ESL.');

        try {
            const response = await authFetch(`${API_BASE}manifesto/baixa-operacional/`, {
                method: 'POST',
                body: JSON.stringify({
                    tipo_operacao: 'TRANSFERENCIA',
                    manifesto_id: manifestoId, // 👈 Corrigido para usar o parâmetro da função
                    chave_acesso: null,        // Indica ao backend que é o lote todo
                    is_completo: true
                })
            });

            if (response.ok) {
                atualizarStatusUI('success', '✅ Registro Concluído', 'A fila de chegada foi processada com sucesso.');
                // Recarrega após 2 segundos para atualizar a lista no PWA
                setTimeout(() => location.reload(), 2000);
            } else {
                const erroData = await response.json();
                atualizarStatusUI('error', '❌ Falha na Operação', erroData.erro || 'Erro ao processar lote.');
            }
        } catch (e) {
            atualizarStatusUI('error', '📡 Erro de Rede', 'Verifique sua conexão com a internet.');
        }
    };

    // Remove o HTML do modal do site ao fechar para não dar conflito depois
    document.getElementById('modalConfirmMassa').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

// Função para abrir o modal de pergunta operacional (Despacho ou Retirada)

function abrirModalPerguntaOperacional(numeroNota, chave, tipo) {
    const titulo = tipo === 'DESPACHO' ? "Confirmar Despacho" : "Confirmar Retirada";
    const pergunta = tipo === 'DESPACHO' ? "O embarque foi completo?" : "A retirada foi completa?";
    
    // Injeta o HTML do modal dinamicamente no body
    const modalHtml = `
    <div class="modal fade" id="modalOperacional" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content shadow-lg border-0" style="border-radius: 20px;">
                <div class="modal-body text-center p-4">
                    <div class="mb-3">
                        <i class="bi bi-question-circle-fill text-warning" style="font-size: 3.5rem;"></i>
                    </div>
                    <h5 class="fw-bold">${titulo}</h5>
                    <p class="text-muted">NF: ${numeroNota}</p>
                    <p class="mb-4">${pergunta}</p>
                    
                    <div class="d-grid gap-2">
                        <button class="btn btn-success btn-lg fw-bold" onclick="executarBaixaOp('${chave}', '${tipo}', true)">
                            SIM (Completo)
                        </button>
                        <button class="btn btn-outline-danger" onclick="executarBaixaOp('${chave}', '${tipo}', false)">
                            NÃO (Parcial)
                        </button>
                        <button class="btn btn-link text-muted" data-bs-dismiss="modal">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const m = new bootstrap.Modal(document.getElementById('modalOperacional'));
    m.show();

    // Limpa o HTML do modal ao fechar para não poluir o DOM
    document.getElementById('modalOperacional').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

async function executarBaixaOp(chave, tipo, isCompleto) {
    const modalEl = document.getElementById('modalOperacional');
    bootstrap.Modal.getInstance(modalEl).hide();

    atualizarStatusUI('loading', 'Processando...', 'Sincronizando com a fila do sistema.');
    statusModal.show();

    try {
        const response = await authFetch(`${API_BASE}manifesto/baixa-operacional/`, {
            method: 'POST',
            body: JSON.stringify({
                tipo_operacao: tipo,
                chave_acesso: chave,
                manifesto_id: manifestoAtual,
                is_completo: isCompleto
            })
        });

        if (response.ok) {
            atualizarStatusUI('success', '✅ Sucesso!', 'Ocorrência enviada para processamento.');
            setTimeout(() => location.reload(), 2000);
        } else {
            atualizarStatusUI('error', '❌ Falha', 'Erro ao registrar ocorrência.');
        }
    } catch (err) {
        atualizarStatusUI('error', '📡 Erro de Conexão', 'Verifique sua internet.');
    }
}

// Função para transferência unitária (Nota por Nota)
async function confirmarTransferenciaIndividual(numeroNota, chave) {
    const confirmar = await new Promise(resolve => {
        // Usando um modal de confirmação limpo em vez de alert
        const modalConfirmHTML = `
        <div class="modal fade" id="modalConfirmTransf" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content border-0 shadow" style="border-radius: 15px;">
                    <div class="modal-body text-center p-4">
                        <i class="bi bi-info-circle text-primary" style="font-size: 3rem;"></i>
                        <h5 class="fw-bold mt-3">Registrar Chegada</h5>
                        <p class="text-muted">Deseja confirmar a chegada da NF ${numeroNota} na filial?</p>
                        <div class="d-grid gap-2 mt-4">
                            <button class="btn btn-primary fw-bold" id="btn-ok-transf">CONFIRMAR</button>
                            <button class="btn btn-light" data-bs-dismiss="modal">CANCELAR</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalConfirmHTML);
        const m = new bootstrap.Modal(document.getElementById('modalConfirmTransf'));
        m.show();
        
        document.getElementById('btn-ok-transf').onclick = () => { m.hide(); resolve(true); };
        document.getElementById('modalConfirmTransf').addEventListener('hidden.bs.modal', function(){ this.remove(); resolve(false); });
    });

    if (confirmar) {
        // Chama a mesma lógica de execução enviando is_completo=true (pois 098 é fixo)
        executarBaixaOp(chave, 'TRANSFERENCIA', true);
    }
}