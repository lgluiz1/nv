// manifesto.js - VERSÃO FINAL REVISADA E OTIMIZADA
// =====================================================
// CONFIGURAÇÕES E ESTADO GLOBAL
// =====================================================
const DB_NAME = 'FrotaDB';
const DB_VERSION = 1;

const ENDPOINTS = {
    busca: `${API_BASE}manifesto/busca/`,
    status: `${API_BASE}manifesto/status/`,
};

const LOGIN_URL = '/app/login/';
let loadingModal = null;
let pollingInterval = null;
let manifestoAtual = null;
let jaMudouDeTela = false;

function abrirDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            // Loja para guardar as notas baixadas pendentes
            if (!db.objectStoreNames.contains('baixas_pendentes')) {
                db.createObjectStore('baixas_pendentes', { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
const TEMA_OPERACAO = {
    'TRANSFERENCIA': { icon: 'bi-box-arrow-right', color: 'primary', label: 'Registrar Chegada', code: '98' },
    'DESPACHO':      { icon: 'bi-airplane', color: 'info', label: 'Confirmar Despacho', code: '50' },
    'RETIRADA':      { icon: 'bi-box-arrow-in-left', color: 'warning', label: 'Confirmar Retirada', code: '51' },
    'ENTREGA':       { icon: 'bi-truck', color: 'primary', label: 'Dar Baixa', code: '1' }
};
// =====================================================
// SINCRONIZAÇÃO AUTOMÁTICA (VIGIA)
// =====================================================
async function sincronizarBaixasPendentes() {
    const db = await abrirDB();
    const transaction = db.transaction('baixas_pendentes', 'readonly');
    const store = transaction.objectStore('baixas_pendentes');
    
    const pendentes = await new Promise(res => {
        const req = store.getAll();
        req.onsuccess = () => res(req.result);
    });

    if (pendentes.length === 0) {
        atualizarIconeNuvem(); // Garante que fica verde se estiver vazio
        return;
    }

    console.log(`🔄 Tentando sincronizar ${pendentes.length} notas...`);

    for (const item of pendentes) {
        const formData = new FormData();
        
        // Reconstrói exatamente o que o Django espera
        for (const key in item.campos) {
            // Se o valor for null ou undefined, enviamos "0.00" para evitar o erro 400 de decimal
            let valor = item.campos[key];
            if ((key === 'latitude' || key === 'longitude') && (valor === null || valor === undefined)) {
                valor = "0.000000";
            }
            formData.append(key, valor || '');
        }
        
        formData.append('chave_acesso', item.chaveNF);
        formData.append('numero_nota', item.numeroNF);
        formData.append('manifesto_id', item.mID);
        
        if (item.foto) {
            formData.append('foto', item.foto, `mft_${item.mID}_${item.chaveNF}.jpg`);
        }

        try {
            const response = await authFetch(`${API_BASE}manifesto/registrar-baixa/`, {
                method: 'POST',
                body: formData 
            });

            if (response.ok) {
                // SUCESSO: Remove do IndexedDB
                const delTrans = db.transaction('baixas_pendentes', 'readwrite');
                await delTrans.objectStore('baixas_pendentes').delete(item.id);
                console.log(`✅ Nota ${item.numeroNF} sincronizada!`);
                await atualizarIconeNuvem();
            } 
            else if (response.status === 400) {
                // ERRO DE DADOS (Bad Request): 
                // Provavelmente o erro de "null" ou campos faltando. 
                // Removemos para não travar o loop, pois o servidor nunca aceitará esse dado como está.
                console.error(`❌ Erro 400 na nota ${item.numeroNF}: Dados rejeitados pelo servidor.`);
                const delTrans = db.transaction('baixas_pendentes', 'readwrite');
                await delTrans.objectStore('baixas_pendentes').delete(item.id);
            } 
            else {
                // ERRO 500 ou outros: Servidor caiu ou banco fora. 
                // Mantemos no DB para tentar na próxima sincronização.
                console.warn(`⚠️ Servidor respondeu ${response.status} para nota ${item.numeroNF}. Mantendo na fila.`);
            }
        } catch (err) {
            // FALHA DE CONEXÃO: Internet caiu no meio do processo.
            console.warn("📡 Falha de rede durante a sincronização. Parando ciclo.");
            break; // Sai do loop para economizar processamento, tenta quando a rede estabilizar
        }
    }
    
    // Atualiza a nuvem no final do processo
    await atualizarIconeNuvem();
}

// Chame a atualização da nuvem assim que salvar no catch do salvarRegistro
// catch (err) { ... store.add(objOffline); atualizarIconeNuvem(); ... }

window.addEventListener('online', sincronizarBaixasPendentes);
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


// Tenta sincronizar toda vez que o app detecta que a internet voltou
window.addEventListener('online', sincronizarBaixasPendentes);

//
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

async function renderEstruturaLista(numeroManifesto) {
    const content = document.getElementById('app-content');
    if (!content) return;

    // 1. Tenta pegar as notas que já estavam no cache para mostrar IMEDIATAMENTE
    const notasCache = localStorage.getItem(`cache_notas_${numeroManifesto}`);
    
    content.innerHTML = `
        <div class="container pb-5 animate__animated animate__fadeIn">
            <div class="text-center mb-4">
                <h5 class="fw-bold text-secondary mb-1">Manifesto #${numeroManifesto}</h5>
                <div id="progresso-container" class="mt-2">
                    <span id="contador-notas" class="badge bg-primary px-3 py-2">Sincronizando...</span>
                </div>
            </div>

            <div id="area-lista-dinamica">
                ${notasCache ? '' : `
                    <div class="skeleton-card"></div>
                    <div class="skeleton-card"></div>
                `}
            </div>
        </div>
    `;

    // Se tem cache, já renderiza ele enquanto o servidor não responde
    if (notasCache) {
        document.getElementById('area-lista-dinamica').innerHTML = JSON.parse(notasCache).html;
    }

    // 2. Dispara as consultas ao servidor em PARALELO (Muito mais rápido)
    // Em vez de esperar o status para depois buscar notas, faz os dois de uma vez
    Promise.all([
        authFetch(`${API_BASE}manifesto/status/?numero_manifesto=${numeroManifesto}`),
        atualizarListaViva(numeroManifesto) 
    ]).then(async ([resStatus]) => {
        const statusData = await resStatus.json();
        // Se o status disser que encerrou, aí sim a gente limpa a tela
        if (statusData.status === 'FINALIZADO') {
            localStorage.removeItem(`cache_notas_${numeroManifesto}`);
            window.location.reload();
        }
    });
}

// =====================================================
// FLUXO DE BUSCA E MONITORAMENTO (POLLING VIVO)
// =====================================================
async function atualizarListaViva(numeroManifesto) {
    try {
        const response = await authFetch(`${API_BASE}manifesto/notas/?numero_manifesto=${numeroManifesto}`);
        if (!response || response.status !== 200) return;

        const notas = await response.json();
        const areaDinamica = document.getElementById('area-lista-dinamica');
        const contador = document.getElementById('contador-notas');

        // 1. BUSCA NOTAS NO LIMBO (INDEXEDDB)
        const db = await abrirDB();
        const transPendentes = db.transaction('baixas_pendentes', 'readonly');
        const storePendentes = transPendentes.objectStore('baixas_pendentes');
        const notasNoLimbo = await new Promise(res => {
            const req = storePendentes.getAll();
            req.onsuccess = () => res(req.result.map(n => n.chaveNF)); 
        });

        // --- 2. LOGICA DA SINCRONIZAÇÃO (FEEDBACK VISUAL) ---
        if (contador) {
            contador.innerHTML = `<span class="badge bg-primary px-4 py-2 animate__animated animate__fadeIn">Sincronizando...</span>`;
        }

        // --- 3. ANÁLISE DE MUDANÇA (SILENT REFRESH) ---
        const cacheDadosRaw = localStorage.getItem(`cache_dados_puros_${numeroManifesto}`);
        const novosDadosJSON = JSON.stringify(notas);

        // VARIÁVEIS DE APOIO PARA OS GRUPOS E CONTADORES
        const TEMA_OPERACAO = {
            'TRANSFERENCIA': { icon: 'bi-box-arrow-right', color: 'primary', label: 'Registrar Chegada', code: '98' },
            'DESPACHO':      { icon: 'bi-airplane', color: 'info', label: 'Confirmar Despacho', code: '50' },
            'RETIRADA':      { icon: 'bi-box-arrow-in-left', color: 'warning', label: 'Confirmar Retirada', code: '51' },
            'ENTREGA':       { icon: 'bi-truck', color: 'success', label: 'Dar Baixa', code: '1' }
        };

        const grupos = { 'TRANSFERENCIA': [], 'DESPACHO': [], 'RETIRADA': [], 'ENTREGA': [] };
        let totalFinalizadas = 0;
        let htmlConcluidos = '';

        // PROCESSA OS DADOS PARA SABER OS CONTADORES (MESMO QUE NÃO MUDE A TELA)
        notas.forEach(nf => {
            const tipo = nf.tipo_operacao || 'ENTREGA';
            if (nf.ja_baixada) {
                totalFinalizadas++;
                const config = TEMA_OPERACAO[tipo] || TEMA_OPERACAO['ENTREGA'];
                htmlConcluidos += gerarCardHTML(nf, config, true, false);
            } else {
                if (grupos[tipo]) grupos[tipo].push(nf);
                else grupos['ENTREGA'].push(nf);
            }
        });

        // SE NÃO MUDOU NADA, APENAS ATUALIZA OS CONTADORES E SAI
        if (cacheDadosRaw === novosDadosJSON) {
            console.log("ℹ️ Sem alterações. Atualizando apenas contadores.");
            setTimeout(() => {
                atualizarVisualContadores(contador, notas, totalFinalizadas);
            }, 800);
            return;
        }

        // --- 4. SE HOUVE MUDANÇA, REDESENHA A TELA ---
        if (areaDinamica && notas.length > 0) {
            // INJEÇÃO DA BUSCA (MANTIDO ORIGINAL)
            if (!document.getElementById('input-busca-nfe')) {
                areaDinamica.innerHTML = `
                    <div class="search-box mb-4">
                        <div class="input-group shadow-sm position-relative" style="border-radius: 15px; overflow: hidden;">
                            <span class="input-group-text bg-white border-0"><i class="bi bi-search text-muted"></i></span>
                            <input type="text" id="input-busca-nfe" class="form-control border-0 p-3" placeholder="Filtrar por Número ou Chave..." oninput="filtrarNotasOffline(); toggleClearButton();">
                        </div>
                    </div>
                    <div id="container-baixa-coletiva"></div>
                    <div id="lista-notas-container"></div>
                    <div id="lista-notas-concluidas" class="mt-4 pt-3 border-top d-none">
                        <div class="d-flex align-items-center mb-3 text-success opacity-75">
                            <i class="bi bi-check-all fs-4 me-2"></i><h6 class="mb-0 fw-bold text-uppercase">Itens Concluídos</h6>
                        </div>
                        <div id="container-concluidos-cards" class="opacity-50"></div>
                    </div>
                `;
            }

            const containerNotas = document.getElementById('lista-notas-container');
            const containerConcluidos = document.getElementById('container-concluidos-cards');
            const secaoConcluidos = document.getElementById('lista-notas-concluidas');
            const containerColetiva = document.getElementById('container-baixa-coletiva');

            // MONTA O HTML DAS PENDENTES
            let htmlPendentes = '';
            Object.keys(grupos).forEach(tipo => {
                if (grupos[tipo].length > 0) {
                    const config = TEMA_OPERACAO[tipo];
                    htmlPendentes += `<div class="group-divider mb-2 mt-3 small fw-bold text-muted text-uppercase" style="background: #e9ecef; padding: 5px 10px; border-radius: 5px;">
                                        <i class="bi ${config.icon} me-1"></i> ${tipo} (${grupos[tipo].length})
                                      </div>`;
                    grupos[tipo].forEach(nf => {
                        const estaSincronizando = notasNoLimbo.includes(nf.chave_acesso);
                        htmlPendentes += gerarCardHTML(nf, config, false, estaSincronizando);
                    });
                }
            });

            containerNotas.innerHTML = htmlPendentes;

            if (totalFinalizadas > 0) {
                containerConcluidos.innerHTML = htmlConcluidos;
                secaoConcluidos.classList.remove('d-none');
            } else {
                secaoConcluidos.classList.add('d-none');
            }

            // BAIXA COLETIVA
            const transfPendentes = grupos['TRANSFERENCIA'].filter(n => !n.ja_baixada);
            if (transfPendentes.length > 0 && containerColetiva) {
                containerColetiva.innerHTML = `<div class="card bg-primary text-white mb-4 shadow-sm border-0"><div class="card-body d-flex justify-content-between align-items-center"><div><small class="fw-bold opacity-75">OPERAÇÃO FILIAL</small><h6 class="mb-0">Chegada de ${transfPendentes.length} Notas</h6></div><button class="btn btn-light btn-sm fw-bold text-primary px-3" onclick="registrarChegadaColetiva('${numeroManifesto}')">BAIXAR TUDO</button></div></div>`;
            } else if (containerColetiva) { containerColetiva.innerHTML = ''; }

            // FINALIZAÇÃO: ATUALIZA CONTADORES E CACHE
            atualizarVisualContadores(contador, notas, totalFinalizadas);
            filtrarNotasOffline();

            localStorage.setItem(`cache_notas_${numeroManifesto}`, JSON.stringify({
                html: areaDinamica.innerHTML,
                timestamp: new Date().getTime()
            }));
            localStorage.setItem(`cache_dados_puros_${numeroManifesto}`, novosDadosJSON);
        }
    } catch (err) { console.error("Erro na atualização viva:", err); }
}

// FUNÇÃO SIMPLES SÓ PARA OS BADGES DE CIMA
function atualizarVisualContadores(contador, notas, totalFinalizadas) {
    if (!contador) return;
    let html = `<div class="d-flex gap-2 justify-content-center">
                    <span class="badge bg-secondary p-2">${notas.length} Notas no Manifesto</span>`;
    if (totalFinalizadas > 0) {
        html += `<span class="badge bg-success p-2 animate__animated animate__bounceIn">
                    <i class="bi bi-check2-circle"></i> ${totalFinalizadas} Finalizadas</span>`;
    }
    html += `</div>`;
    contador.innerHTML = html;

    // Se tudo foi entregue, mostra o modal do KM
    if (notas.length > 0 && totalFinalizadas === notas.length) {
        const modalKM = new bootstrap.Modal(document.getElementById('kmFinalModal'));
        setTimeout(() => { modalKM.show(); }, 800);
    }
}
// =====================================================
// FUNÇÃO AUXILIAR PARA GERAR O CARD (EVITA DUPLICAR CÓDIGO)
// =====================================================
function gerarCardHTML(nf, config, baixada, sincronizando = false) {
    // Se estiver sincronizando, usamos o amarelo (warning), se baixada verde (success), senão a cor da config
    const cor = sincronizando ? 'warning' : (baixada ? 'success' : config.color);
    const icone = sincronizando ? 'bi-cloud-arrow-up' : (baixada ? 'bi-check-circle-fill' : config.icon);
    
    const chave = nf.chave_acesso || '';
    const numero = nf.numero_nota || '';
    const tipo = nf.tipo_operacao || 'ENTREGA';

    // Classe especial para o card que está subindo
    const classeSincronizando = sincronizando ? 'opacity-75 shadow-none border-dashed' : '';

    return `
        <div class="card mb-3 shadow-sm border-start border-${cor} border-4 animate__animated ${baixada || sincronizando ? '' : 'animate__fadeInUp'} ${classeSincronizando}" 
        id="card-nf-${numero}"
        data-chave="${chave}"
        data-numero="${numero}">
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-start">
                    <h6 class="fw-bold mb-1">📝NF ${numero}</h6>
                    <span>
                        <i class="bi ${icone} text-${cor} ${sincronizando ? 'animate__animated animate__flash animate__infinite' : ''}" 
                           style="font-size: 1.2rem;"></i>
                    </span>
                </div>
                <p class="small text-muted mb-1">👤 ${nf.destinatario}</p>
                <p class="small text-muted mb-2" style="font-size: 0.75rem;"><i class="bi bi-geo-alt"></i> ${nf.endereco_entrega}</p>
                
                ${sincronizando ? `
                    <div class="alert alert-warning py-1 px-2 mb-0 d-flex align-items-center justify-content-center" style="font-size: 0.8rem;">
                        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                        <span class="fw-bold text-uppercase">Sincronizando...</span>
                    </div>
                ` : !baixada ? `
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

// =====================================================
// VERIFICAÇÃO DE ESTADO INICIAL (MANIFESTO ATIVO) - OTIMIZADO
// =====================================================
async function verificarEstadoInicial() {
    // 1. Tenta recuperar o que já temos salvo no celular
    const mID_salvo = localStorage.getItem('manifesto_ativo');
    
    // 2. CARREGAMENTO INSTANTÂNEO (UX Otimista)
    if (mID_salvo) {
        console.log("⚡ Iniciando com dados locais para velocidade máxima...");
        manifestoAtual = mID_salvo;
        
        // Renderiza a estrutura básica e tenta injetar o HTML das notas que salvamos antes
        renderListaEntregasFinal(mID_salvo);
        
        const cache = localStorage.getItem(`cache_notas_${mID_salvo}`);
        if (cache) {
            const areaDinamica = document.getElementById('area-lista-dinamica');
            if (areaDinamica) {
                areaDinamica.innerHTML = JSON.parse(cache).html;
                console.log("✅ Notas carregadas do cache em 0.1s");
            }
        }
    }

    // 3. VERIFICAÇÃO EM SEGUNDO PLANO (Background Check)
    try {
        const response = await authFetch(`${API_BASE}manifesto/verificar-ativo/`);
        
        if (!response || !response.ok) return;
        const data = await response.json();
        
        if (data.tem_manifesto) {
            // Se o manifesto mudou ou é novo
            manifestoAtual = data.numero_manifesto;
            localStorage.setItem('manifesto_ativo', data.numero_manifesto);

            const el = document.getElementById('manifesto-id-display');
            if (el) el.innerText = data.numero_manifesto;

            // Atualiza a lista com dados frescos do servidor sem travar a tela
            atualizarListaViva(data.numero_manifesto);
        } else {
            // Se o servidor disser que não há mais manifesto, limpa tudo
            console.log("ℹ️ Nenhum manifesto ativo no servidor.");
            localStorage.removeItem('manifesto_ativo');
            if(mID_salvo) localStorage.removeItem(`cache_notas_${mID_salvo}`);
            renderSearchScreen();
        }
    } catch (err) { 
        // Se o banco de dados der erro ou a net cair, o motorista continua vendo o cache
        console.warn("📡 Falha na verificação de status. Mantendo modo offline.");
        if (!mID_salvo) renderSearchScreen(); 
    }
}
async function renderListaEntregasFinal(numeroManifesto) {
    // Mesma lógica do renderEstruturaLista, mas usada para carregamento inicial (Estado Ativo)
    renderEstruturaLista(numeroManifesto);
}



// =====================================================
// ATUALIZA CONTATO DE ENTREGAS SEM RELOAD
// =====================================================
function atualizarContadorVisual() {
    const contadorContainer = document.getElementById('contador-notas');
    if (!contadorContainer) return;

    // Procura o badge de "Finalizadas"
    let badgeSucesso = contadorContainer.querySelector('.bg-success');

    if (badgeSucesso) {
        // Se já existe, pega o número atual, soma 1 e atualiza o texto
        let texto = badgeSucesso.innerText;
        let numeroAtual = parseInt(texto.replace(/\D/g, '')) || 0;
        let novoNumero = numeroAtual + 1;
        
        badgeSucesso.innerHTML = `<i class="bi bi-check2-circle"></i> ${novoNumero} Finalizadas`;
        badgeSucesso.classList.add('animate__bounceIn'); // Dá um pulinho
        
        // Remove a animação depois para poder repetir na próxima
        setTimeout(() => badgeSucesso.classList.remove('animate__bounceIn'), 1000);
    } else {
        // Se for a primeira nota do dia, cria o badge do zero
        const novoBadge = `<span class="badge bg-success p-2 animate__bounceIn"><i class="bi bi-check2-circle"></i> 1 Finalizadas</span>`;
        contadorContainer.innerHTML += novoBadge;
    }
}

// =====================================================
// FUNÇÃO PARA VER SE O MANIFESTO ESTÁ COMPLETO E FINALIZAR
// =====================================================
function verificarFimDoManifesto() {
    const container = document.getElementById('lista-notas-container');
    const notasRestantes = container.querySelectorAll('.card');

    // Se não houver mais cards visíveis na seção de pendentes
    if (notasRestantes.length === 0) {
        const modalKM = new bootstrap.Modal(document.getElementById('kmFinalModal'));
        setTimeout(() => { modalKM.show(); }, 800);
    }
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

    const isRetida = document.getElementById('check-nota-retida').checked;
    const inputObs = document.getElementById('input-observacao').value;

    const cod = selectOcorrencia.value;
    const chaveNF = inputChave.value;
    const temFoto = (canvas.dataset.temFoto === "true");
    const mID = manifestoAtual || localStorage.getItem('manifesto_ativo');

    // --- NOVA LÓGICA DE VALIDAÇÃO ---
    if (isRetida) {
        if (inputObs.trim().length < 5) {
            alert("Obrigatório descrever o motivo da Nota Retida.");
            return;
        }
    } else {
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
    formData.append('nota_retida', isRetida);
    formData.append('observacao_retida', inputObs);

    // 5. Captura de Coordenadas GPS
    try {
        const coords = await getCoords(); 
        if (coords && coords.lat && coords.lon) {
            formData.append('latitude', coords.lat);
            formData.append('longitude', coords.lon);
        } else {
            // Se o GPS falhar, enviamos 0 para não dar erro de "null" no Django
            formData.append('latitude', "0.000000");
            formData.append('longitude', "0.000000");
        }
    } catch (gpsErr) {
        console.warn("GPS falhou, enviando zerado para evitar erro 400");
        formData.append('latitude', "0.000000");
        formData.append('longitude', "0.000000");
    }

    // 6. Conversão do Canvas para Imagem (Blob)
    let fotoBlob = null;
    if (!isRetida && temFoto) {
        fotoBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.70));
        formData.append('foto', fotoBlob, `mft_${mID}_${chaveNF}.jpg`);
    }

    // 7. Envio para o Backend com CONTINGÊNCIA OFFLINE
    try {
        const response = await authFetch(`${API_BASE}manifesto/registrar-baixa/`, {
            method: 'POST',
            body: formData 
        });

        // =====================================================
        // AJUSTE PARA ERRO 500: Se o servidor falhar (ex: banco fora),
        // nós "jogamos" o erro para o CATCH para salvar offline.
        // =====================================================
        if (!response.ok && response.status >= 500) {
            throw new Error("Erro Crítico no Servidor");
        }

        const data = await response.json();

        if (response.ok) {
            atualizarStatusUI('success', '✅ Registro Cadastrado!', 'A baixa foi realizada com sucesso.');
            processarSumiçoNota(numeroNF);
        } else {
            // Se o servidor retornar erro controlado (ex: 400 - Validação)
            if (data.status_integracao === 'erro_tms') {
                atualizarStatusUI('warning', '⚠️ Salvo com Alerta', `O canhoto foi salvo no App, mas houve um erro na ESL: ${data.erro}`);
            } else {
                atualizarStatusUI('error', '❌ Falha no Registro', data.erro || 'Erro interno no servidor.');
            }
            configurarBotaoWhats(data.erro, chaveNF);
        }
    } catch (err) {
        // --- MÁGICA DO MODO OFFLINE (Disparado por falta de net OU Erro 500) ---
        console.warn("Falha detectada. Salvando no banco de dados interno...");

        try {
            const db = await abrirDB();
            const transaction = db.transaction('baixas_pendentes', 'readwrite');
            const store = transaction.objectStore('baixas_pendentes');

            const objOffline = {
                id: Date.now().toString(),
                numeroNF: numeroNF,
                chaveNF: chaveNF,
                mID: mID,
                campos: {
                    ocorrencia_codigo: cod,
                    recebedor: inputRecebedor.value || '',
                    nota_retida: isRetida,
                    observacao_retida: inputObs,
                    latitude: formData.get('latitude'),
                    longitude: formData.get('longitude')
                },
                foto: fotoBlob 
            };

            store.add(objOffline);
            
            // Atualiza a nuvem para Amarelo na hora
            await atualizarIconeNuvem(); 

            atualizarStatusUI('warning', '📡 Modo Offline Ativado', 'O sinal oscilou. Sua baixa foi guardada no celular e será enviada assim que o sinal voltar.');
            
            processarSumiçoNota(numeroNF);

        } catch (dbErr) {
            console.error("Erro crítico ao salvar no DB interno:", dbErr);
            atualizarStatusUI('error', '❌ Erro de Sistema', 'Não foi possível salvar offline.');
        }
    }
}
// Função auxiliar para não repetir código de remover nota
function processarSumiçoNota(numeroNF) {
    const cardParaRemover = document.getElementById(`card-nf-${numeroNF}`);
    if (cardParaRemover) {
        cardParaRemover.classList.add('animate__fadeOutRight');
        setTimeout(() => {
            cardParaRemover.remove();
            atualizarContadorVisual();
            verificarFimDoManifesto();
        }, 500);
    }
    setTimeout(() => {
        statusModal.hide();
    }, 2000);
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
        const url = `https://wa.me/5521980064787?text=${encodeURIComponent(msg)}`;
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
            // Mantemos a alta resolução (1600px) para o faturamento
            const larguraDesejada = 1600;
            const escala = larguraDesejada / img.width;
            canvas.width = larguraDesejada;
            canvas.height = img.height * escala;

            // Desenha no canvas (isso acontece na memória "interna")
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // --- MUDANÇA AQUI: NÃO MOSTRAMOS O CANVAS ---
            canvas.style.display = 'none'; 
            // Criamos uma marcação interna para o salvarRegistro saber que tem foto
            canvas.dataset.temFoto = "true"; 

            // Atualiza a interface de forma LEVE (apenas ícone e texto)
            const placeholder = document.getElementById('placeholder-camera');
            const icone = document.getElementById('icone-camera');
            const texto = document.getElementById('texto-status-foto');

            if (icone) {
                icone.className = "bi bi-check-circle-fill text-success";
                icone.style.fontSize = "3rem";
            }
            if (texto) {
                texto.innerText = "Foto capturada com sucesso!";
                texto.className = "text-success fw-bold mt-2";
            }

            // Troca os botões
            document.getElementById('label-camera').style.display = 'none';
            document.getElementById('btn-nova-foto').style.display = 'block';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
// =========================================================================
// Abre o modal de baixa com os dados da nota e configurações específicas
// =========================================================================
function abrirModalBaixa(numeroNota, chaveAcesso, tipo) {
    const tituloEl = document.getElementById('modal-titulo-nf');
    const inputChave = document.getElementById('hidden-chave-nf');
    const inputNumero = document.getElementById('hidden-numero-nf');
    const selectOc = document.getElementById('select-ocorrencia');
    const cameraSection = document.querySelector('.camera-container');
    const cameraLabel = document.getElementById('label-camera');
    const btnNovaFoto = document.getElementById('btn-nova-foto');
    const canvas = document.getElementById('canvas-preview');
    
    // Elementos da Modificação de Nota Retida
    const checkRetida = document.getElementById('check-nota-retida');
    const campoObs = document.getElementById('campo-observacao');
    const inputObs = document.getElementById('input-observacao');

    // =====================================================
    // 1. LIMPEZA TOTAL (RESET) - PARA NÃO REAPROVEITAR DADOS
    // =====================================================
    if (inputObs) inputObs.value = '';
    document.getElementById('input-recebedor').value = '';
    
    // Reset da Câmera e Canvas
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Limpa o desenho anterior
    canvas.dataset.temFoto = "false"; // Reseta validador
    canvas.style.display = 'none';

    // Reset Visual do Placeholder (Volta a ser cinza e sem check)
    const icone = document.getElementById('icone-camera');
    const texto = document.getElementById('texto-status-foto');
    if (icone) {
        icone.className = "bi bi-camera text-secondary";
        icone.style.fontSize = "1.8rem";
    }
    if (texto) {
        texto.innerText = "Nenhuma foto capturada";
        texto.className = "text-muted small fw-bold mb-0";
    }

    // Reset dos Botões
    cameraLabel.style.display = 'block';
    btnNovaFoto.style.display = 'none';

    // =====================================================
    // 2. CONFIGURAÇÃO DO MODAL COM OS NOVOS DADOS
    // =====================================================
    tituloEl.innerText = `📝 ${tipo} - NF ${numeroNota}`;
    inputChave.value = (chaveAcesso && chaveAcesso !== 'null') ? chaveAcesso : '';
    if (inputNumero) inputNumero.value = numeroNota || ''; 

    document.getElementById('placeholder-camera').style.display = 'block';
    
    // Reset dos campos de Nota Retida
    if (checkRetida) {
        checkRetida.checked = false;
        campoObs.style.display = 'none';

        checkRetida.onchange = function() {
            if (this.checked) {
                cameraSection.style.display = 'none';
                cameraLabel.style.display = 'none';
                btnNovaFoto.style.display = 'none';
                campoObs.style.display = 'block';
            } else {
                if (tipo === 'ENTREGA') {
                    cameraSection.style.display = 'block';
                    cameraLabel.style.display = 'block';
                }
                campoObs.style.display = 'none';
            }
        };
    }

    // REGRA DE OURO
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
// =============================================================================
// Função para atualizar o ícone de nuvem no header com base nas baixas pendentes
// =============================================================================
async function atualizarIconeNuvem() {
    try {
        const db = await abrirDB();
        const transaction = db.transaction('baixas_pendentes', 'readonly');
        const store = transaction.objectStore('baixas_pendentes');
        
        const request = store.count(); 
        
        request.onsuccess = function() {
            const totalPendentes = request.result;
            const container = document.getElementById('nuvem-status');
            if (!container) return;

            if (totalPendentes > 0) {
                // Nuvem AMARELA: Notas presas no celular
                // animate__pulse faz ela ficar "batendo" como um coração
                container.innerHTML = `
                    <div class="position-relative animate__animated animate__pulse animate__infinite">
                        <i class="bi bi-cloud-arrow-up-fill text-warning" style="font-size: 1.8rem;" title="Notas pendentes"></i>
                        <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" 
                              style="font-size: 0.7rem; min-width: 20px; border: 2px solid white;">
                            ${totalPendentes}
                        </span>
                    </div>`;
            } else {
                // Nuvem VERDE: Tudo sincronizado com o servidor
                // animate__bounceIn faz ela dar um "pulo" quando termina de enviar
                container.innerHTML = `
                    <div class="animate__animated animate__bounceIn">
                        <i class="bi bi-cloud-check-fill text-success" style="font-size: 1.8rem;" title="Tudo sincronizado"></i>
                    </div>`;
                
                // Remove a animação após 2 segundos para ficar estática e limpa
                setTimeout(() => {
                    const el = container.querySelector('.animate__animated');
                    if (el) el.classList.remove('animate__animated', 'animate__bounceIn');
                }, 2000);
            }
        };
    } catch (err) {
        console.error("Erro ao atualizar ícone da nuvem:", err);
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
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        atualizarIconeNuvem();
        // Tenta sincronizar automaticamente caso o motorista tenha acabado de abrir com net
        sincronizarBaixasPendentes(); 
    }, 1500); 
});

// 1. Escuta quando o navegador avisa que a internet VOLTOU
window.addEventListener('online', () => {
    console.log("📡 Sinal de rede detectado! Iniciando sincronização...");
    
    // Damos 3 segundos para a conexão estabilizar antes de tentar subir
    setTimeout(() => {
        sincronizarBaixasPendentes();
    }, 3000);
});

// 2. Escuta quando a internet CAIU (para atualizar o ícone na hora)
window.addEventListener('offline', () => {
    console.log("🚫 O dispositivo ficou offline.");
    atualizarIconeNuvem();
});

setInterval(() => {
    if (navigator.onLine) {
        console.log("⏰ Verificação periódica de notas pendentes...");
        sincronizarBaixasPendentes();
    }
}, 5 * 60 * 1000); // 5 minutos em milissegundos