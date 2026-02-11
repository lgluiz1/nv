const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
const ws_url = ws_scheme + "://" + window.location.host + "/ws/painel-logistico/";

let socket;

function conectarWebSocket() {
    socket = new WebSocket(ws_url);

    socket.onopen = function() {
        console.log("WS conectado");
        const status = document.getElementById('status-ws');
        status.classList.replace('bg-danger', 'bg-success');
        status.innerHTML = '<i class="fas fa-circle me-2 animate-pulse"></i>CONECTADO';
    };

    socket.onmessage = function(e) {
    const data = JSON.parse(e.data);
    const mID = data.dados.manifesto_id;
    console.log("WS recebeu dados para manifesto:", mID, data.dados);
    const grid = document.getElementById("grid-monitoramento");
    let card = document.getElementById(`card-mft-${mID}`);

    // 🔴 REMOVER MANIFESTO FINALIZADO
    if (data.dados.remover === true) {
        if (card) {
            card.classList.add("fade-out");
            setTimeout(() => card.remove(), 600);
        }
        return;
    }

    // Se o card NÃO existe → cria
    if (!card) {
        console.log("Novo manifesto detectado:", mID);

        const total = data.dados.total || 0;
        const baixadas = data.dados.baixadas || 0;
        const percent = data.dados.porcentagem || 0;
        const motorista = data.dados.motorista_nome || "Motorista";

        const novoCard = `
        <div class="col-12 col-md-6 col-lg-4 col-xl-3" id="card-mft-${mID}">
            <div class="card h-100 border-0 shadow-sm position-relative overflow-hidden card-update-flash" style="border-radius: 15px;">
                
                <div class="progress position-absolute top-0 start-0 w-100" style="height: 4px;">
                    <div id="progress-bar-${mID}" class="progress-bar bg-primary" style="width: ${percent}%"></div>
                </div>

                <div class="card-body pt-4">
                    <div class="d-flex align-items-center mb-3">
                        <div class="flex-shrink-0">
                            <div class="bg-soft-primary p-3 rounded-circle">
                                <i class="fas fa-truck-moving text-primary"></i>
                            </div>
                        </div>
                        <div class="ms-3">
                            <h6 class="mb-0 fw-bold">${motorista}</h6>
                            <small class="text-muted">Manifesto: #${mID}</small>
                        </div>
                    </div>

                    <div class="row text-center bg-light rounded-3 py-2 g-0">
                        <div class="col-6 border-end">
                            <small class="text-muted d-block">Total</small>
                            <span class="fw-bold" id="total-${mID}">${total}</span>
                        </div>
                        <div class="col-6">
                            <small class="text-muted d-block">Baixadas</small>
                            <span class="fw-bold text-success" id="baixadas-${mID}">${baixadas}</span>
                        </div>
                    </div>

                    <div class="mt-3 d-flex justify-content-between align-items-center">
                        <div class="text-primary fw-bold fs-5">
                            <span id="percent-${mID}">${percent}</span>%
                        </div>
                        <button class="btn btn-sm btn-outline-dark rounded-pill">
                            <i class="fas fa-map-marker-alt me-1"></i>Rastrear
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;

        grid.insertAdjacentHTML("afterbegin", novoCard);

        // 🔹 Atualizar referência do card após criar
        card = document.getElementById(`card-mft-${mID}`);
    }

    // 🔹 Atualizar valores, se os elementos existirem
    const progressBar = document.getElementById(`progress-bar-${mID}`);
    const textBaixadas = document.getElementById(`baixadas-${mID}`);
    const textPercent = document.getElementById(`percent-${mID}`);
    const textTotal = document.getElementById(`total-${mID}`);

    if (textTotal) textTotal.innerText = data.dados.total || 0;
    if (progressBar) progressBar.style.width = (data.dados.porcentagem || 0) + '%';
    if (textBaixadas) textBaixadas.innerText = data.dados.baixadas || 0;
    if (textPercent) textPercent.innerText = data.dados.porcentagem || 0;

    // 🔹 Flash visual ao atualizar card
    if (card && card.firstElementChild) {
        card.firstElementChild.classList.add('card-update-flash');
        setTimeout(() => {
            card.firstElementChild.classList.remove('card-update-flash');
        }, 1000);
    }
};
    socket.onclose = function() {
        console.log("WS desconectado. Reconectando em 5s...");

        const status = document.getElementById('status-ws');
        status.classList.replace('bg-success', 'bg-danger');
        status.innerHTML = '<i class="fas fa-exclamation-triangle me-2"></i>DESCONECTADO';

        setTimeout(conectarWebSocket, 5000);
    };

    socket.onerror = function(error) {
        console.error("Erro WS:", error);
    };
}

conectarWebSocket();