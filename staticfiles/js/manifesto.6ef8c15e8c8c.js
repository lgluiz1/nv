// manifesto.js

const BASE_API_URL = 'http://localhost:8099/docs/';

function checkManifestoStatus() {
    // 1. Pega o token salvo no login.
    const token = localStorage.getItem('accessToken'); 

    if (!token) {
        // Se não houver token, redireciona de volta para o login.
        window.location.href = 'login.html'; 
        return;
    }

    // 2. Requisição GET para a rota de status do manifesto
    fetch(BASE_API_URL + 'manifesto/status/', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            // CRÍTICO: Envia o token para autenticar no Django
            'Authorization': `Bearer ${token}` 
        }
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } 
        // Se o token expirou (401 Unauthorized), redireciona para login/refresh
        if (response.status === 401) {
             window.location.href = 'login.html';
             throw new Error('Token expirado ou inválido.');
        }
        throw new Error('Erro ao verificar status do manifesto.');
    })
    .then(data => {
        // 3. Lógica do App baseada na resposta:
        if (data.status_manifesto === 'LIVRE') {
            // Se estiver livre, mostra a tela de busca (input)
            console.log("Motorista está livre para buscar novo manifesto.");
            // ... (Função para mostrar o input de busca)
        } else {
            // Se tiver um manifesto ativo, mostra a lista de notas
            console.log("Manifesto Ativo:", data.numero_manifesto);
            // ... (Função para renderizar a lista de notas fiscais (data.notas_fiscais))
        }
    })
    .catch(error => {
        console.error("Falha na comunicação:", error);
    });
}

// Executa a função quando a página carregar
document.addEventListener('DOMContentLoaded', checkManifestoStatus);