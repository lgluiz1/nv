async function abrirHistorico() {
    const modal = new bootstrap.Modal(document.getElementById('modalHistorico'));
    modal.show();
    
    const container = document.getElementById('historico-content');
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

    try {
        // USANDO O AUTHFETCH (Ele resolve o problema do JWT/User)
        const response = await authFetch(`${API_BASE}manifesto/historico/`);
        
        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.error || "Falha ao carregar histórico");
        }

        const manifestos = await response.json();

        if (!manifestos || manifestos.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-folder-x display-1 text-muted"></i>
                    <p class="mt-3">Nenhum manifesto finalizado encontrado.</p>
                </div>`;
            return;
        }

        let accordionHTML = `<div class="accordion accordion-flush" id="accordionManifestos">`;

        manifestos.forEach((m, index) => {
            accordionHTML += `
                <div class="accordion-item border shadow-sm mb-3" style="border-radius: 12px; overflow: hidden;">
                    <h2 class="accordion-header">
                        <button class="accordion-button collapsed p-3" type="button" data-bs-toggle="collapse" data-bs-target="#m-${index}">
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center me-3">
                                    <span class="fw-bold text-primary">Manifesto #${m.numero}</span>
                                    <span class="badge bg-success">Finalizado</span>
                                </div>
                                <div class="small text-muted mt-1">
                                    <i class="bi bi-box-seam"></i> ${m.qtd_notas} NF-es | <i class="bi bi-calendar3"></i> ${m.data}
                                </div>
                            </div>
                        </button>
                    </h2>
                    <div id="m-${index}" class="accordion-collapse collapse" data-bs-parent="#accordionManifestos">
                        <div class="accordion-body bg-light">
                            <div class="list-group list-group-flush shadow-sm rounded">
                                ${m.notas.map((nf, nfIndex) => `
                                    <div class="list-group-item">
                                        <div class="d-flex justify-content-between align-items-center">
                                            <span class="fw-bold small">NF ${nf.numero}</span>
                                            <span class="badge rounded-pill bg-info text-dark" style="font-size: 0.65rem;">${nf.ocorrencia_nome || 'Entregue'}</span>
                                        </div>
                                        
                                        <div class="mt-2 p-2 bg-white rounded border" style="font-size: 0.8rem;">
                                            <div class="text-muted"><i class="bi bi-person me-1"></i>Recebedor: ${nf.recebedor || 'Não informado'}</div>
                                            ${nf.foto ? `
                                                <button class="btn btn-sm btn-outline-primary mt-2 w-100" onclick="verFotoCanhoto('${nf.foto}')">
                                                    <i class="bi bi-camera me-1"></i> Ver Comprovante
                                                </button>
                                            ` : '<div class="text-danger mt-1 small"><i class="bi bi-x-circle me-1"></i>Sem foto cadastrada</div>'}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>`;
        });

        accordionHTML += `</div>`;
        container.innerHTML = accordionHTML;

    } catch (err) {
        container.innerHTML = `<div class="alert alert-danger">Erro ao carregar dados do servidor.</div>`;
        console.error(err);
    }
}

// Função para abrir a foto sem fechar o histórico
function verFotoCanhoto(url) {
    const modalImagem = new bootstrap.Modal(document.getElementById('modalDetalhes')); // Reaproveitando seu modal de detalhes
    document.getElementById('modal-detalhes-body').innerHTML = `<img src="${url}" class="img-fluid rounded shadow">`;
    modalImagem.show();
}