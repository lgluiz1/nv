// manifesto.js

// ** CRÍTICO: Configure estas URLs com sua porta e rotas **
const BASE_API_URL = 'http://localhost:8099/api/'; 
const MANIFESTO_STATUS_ENDPOINT = BASE_API_URL + 'manifesto/status/';
const MANIFESTO_BUSCA_ENDPOINT = BASE_API_URL + 'manifesto/busca/';
const PWA_LOGIN_URL = 'http://localhost:8099/app/login/'; 

// --- FUNÇÕES GERAIS ---

function getAuthHeaders() {
    const token = localStorage.getItem('accessToken');
    if (!token) {
        logout();
        return null;
    }
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
    };
}

function logout() {
    localStorage.removeItem('accessToken');
    window.location.href = PWA_LOGIN_URL;
}

// --- FUNÇÕES DE RENDERIZAÇÃO ---

function renderSearchScreen() {
    const content = document.getElementById('app-content');
    content.innerHTML = `
        <h2>Buscar Novo Manifesto</h2>
        <p>Motorista está livre. Digite o número do manifesto para iniciar a jornada.</p>
        
        <form id="search-form">
            <input type="number" id="manifesto-number" placeholder="Número do Manifesto" required 
                   style="padding: 10px; width: 80%; margin-bottom: 10px;">
            <button type="submit" style="background-color: #007bff;">Buscar e Iniciar</button>
            <div id="search-message" style="margin-top: 10px;"></div>
        </form>
        
        <button id="logout-button" style="margin-top: 30px; background-color: #dc3545;">Sair (Logout)</button>
    `;

    document.getElementById('logout-button').addEventListener('click', logout);
    document.getElementById('search-form').addEventListener('submit', handleManifestoSearch);
}

function renderManifestoDetails(manifestoData) {
    const content = document.getElementById('app-content');
    
    // Contagem de notas pendentes
    const pendentes = manifestoData.notas_fiscais.filter(nf => nf.status === 'PENDENTE').length;

    let nfList = '';
    manifestoData.notas_fiscais.forEach(nf => {
        const isPending = nf.status === 'PENDENTE';
        nfList += `
            <li style="border: 1px solid ${isPending ? 'orange' : 'green'}; margin: 10px; padding: 10px; border-radius: 5px;">
                <strong>NF: ${nf.numero_nota}</strong> (${nf.chave_acesso ? nf.chave_acesso.slice(-6) : 'N/A'})
                <br>Destino: ${nf.destinatario}
                <br>Status: <strong>${nf.status}</strong>
                ${isPending 
                    ? `<button onclick="goToBaixaScreen(${nf.id})" style="margin-left: 15px; background-color: #28a745;">Realizar Baixa</button>` 
                    : ''}
            </li>
        `;
    });

    content.innerHTML = `
        <h2>Manifesto Ativo: ${manifestoData.numero_manifesto}</h2>
        <p>Motorista: ${manifestoData.motorista.nome_completo}</p>
        <p>Notas Pendentes: <strong style="color: ${pendentes > 0 ? 'red' : 'green'};">${pendentes} de ${manifestoData.notas_fiscais.length}</strong></p>
        
        <ul style="list-style: none; padding: 0;">${nfList}</ul>
        
        ${pendentes === 0 
            ? `
                <form id="finalizar-form" style="margin-top: 20px;">
                    <h3>Finalizar Manifesto</h3>
                    <input type="number" id="km-final" placeholder="KM Final" required style="padding: 10px; margin-bottom: 10px;">
                    <button type="submit" style="background-color: #dc3545;">Finalizar Jornada</button>
                </form>
              `
            : ''}
        
        <button id="logout-button" style="margin-top: 30px; background-color: #6c757d;">Sair (Logout)</button>
    `;
    
    document.getElementById('logout-button').addEventListener('click', logout);
    if (pendentes === 0) {
        document.getElementById('finalizar-form').addEventListener('submit', handleManifestoFinalization);
    }
}

// Simulação da tela de baixa (Você desenvolverá esta tela em 'baixa.html')
function goToBaixaScreen(nfId) {
    alert(`Redirecionando para a tela de baixa da NF ID: ${nfId}`);
    // Futuramente: window.location.href = PWA_BASE_URL + 'baixa.html?nf=' + nfId;
}

// --- FUNÇÕES DE LÓGICA DE API ---

async function handleManifestoSearch(event) {
    event.preventDefault();
    const manifestoNumber = document.getElementById('manifesto-number').value.trim();
    const searchMessage = document.getElementById('search-message');
    searchMessage.textContent = 'Buscando manifesto... (Pode demorar)';

    const headers = getAuthHeaders();
    if (!headers) return;

    try {
        const response = await fetch(MANIFESTO_BUSCA_ENDPOINT, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ numero_manifesto: manifestoNumber }) // Envia o número do manifesto
        });

        const data = await response.json();
        
        if (response.ok) {
            // Se a busca foi disparada com sucesso (status 202 ACCEPTED)
            searchMessage.textContent = `Busca disparada! ${data.mensagem}. Atualizando em 3 segundos...`;
            searchMessage.style.color = 'green';
            
            // Recarrega o status para ver o manifesto recém-criado
            setTimeout(checkManifestoStatus, 3000); 
        } else {
            // Erro de validação ou motorista ativo (status 400 Bad Request)
            throw new Error(data.mensagem || 'Erro desconhecido na busca.');
        }

    } catch (error) {
        searchMessage.textContent = `Falha na Busca: ${error.message}`;
        searchMessage.style.color = 'red';
    }
}

async function handleManifestoFinalization(event) {
    event.preventDefault();
    const kmFinal = document.getElementById('km-final').value.trim();
    if (!kmFinal) return;

    if (!confirm(`Confirmar KM Final ${kmFinal} e finalizar o manifesto?`)) return;

    const headers = getAuthHeaders();
    if (!headers) return;

    try {
        const response = await fetch(BASE_API_URL + 'manifesto/finalizar/', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ km_final: kmFinal })
        });

        const data = await response.json();
        
        if (response.ok) {
            alert(data.mensagem);
            checkManifestoStatus(); // Volta para a tela de busca
        } else {
            alert(`Erro ao finalizar: ${data.mensagem || 'Ocorreu um erro.'}`);
        }

    } catch (error) {
        console.error('Falha ao finalizar:', error);
        alert('Erro de conexão ao finalizar manifesto.');
    }
}


// --- FUNÇÃO DE INICIALIZAÇÃO ---

async function checkManifestoStatus() {
    // 1. Verifica se tem token, senão faz logout
    const headers = getAuthHeaders();
    if (!headers) return; 

    try {
        // 2. Chama a API de Status com o Token
        const response = await fetch(MANIFESTO_STATUS_ENDPOINT, {
            method: 'GET',
            headers: headers
        });

        if (response.status === 401) {
            // Token JWT inválido ou expirado
            logout();
            return;
        }

        const data = await response.json();

        if (response.ok) {
            if (data.status_manifesto === 'LIVRE') {
                // 3. Renderiza tela de Busca
                renderSearchScreen();
            } else {
                // 4. Renderiza tela de Detalhes do Manifesto
                renderManifestoDetails(data);
            }
        } else {
            throw new Error(data.mensagem || 'Erro desconhecido ao carregar status.');
        }

    } catch (error) {
        console.error("Falha na comunicação:", error);
        // Em caso de falha grave na rede ou API
        document.getElementById('app-content').innerHTML = `
            <p style="color: red;">Erro ao conectar com o servidor: ${error.message}.</p>
            <button onclick="logout()" style="background-color: #6c757d;">Logout</button>
        `;
    }
}

// Inicia a verificação de status quando a página HTML estiver totalmente carregada
document.addEventListener('DOMContentLoaded', checkManifestoStatus);