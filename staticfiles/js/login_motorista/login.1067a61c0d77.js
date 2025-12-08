// login.js

// URL base do seu servidor Django (mude se estiver em produção)
const BASE_API_URL = 'http://localhost:8099/'; 
const LOGIN_ENDPOINT = BASE_API_URL + 'login/';

document.getElementById('login-form').addEventListener('submit', function(event) {
    event.preventDefault(); // Impede o envio padrão do formulário
    
    const cpf = document.getElementById('cpf').value.trim();
    const senha = document.getElementById('senha').value.trim();
    const messageElement = document.getElementById('message');
    
    messageElement.textContent = ''; // Limpa mensagens anteriores

    if (!cpf || !senha) {
        messageElement.textContent = 'Preencha todos os campos.';
        return;
    }

    // 1. Envia as credenciais para o backend
    fetch(LOGIN_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            username: cpf, // O backend JWT usa 'username' (que é o CPF)
            password: senha
        })
    })
    .then(response => {
        // Se a resposta for 200 OK (Sucesso), o token é retornado
        if (response.ok) {
            return response.json();
        } 
        // Se a resposta for 401 Unauthorized ou erro geral, lança um erro
        return response.json().then(err => { 
            throw new Error(err.detail || 'Login Inválido');
        });
    })
    .then(data => {
        // 2. Armazena o token JWT (A CHAVE É O 'access')
        const token = data.access;
        localStorage.setItem('accessToken', token);
        
        messageElement.textContent = 'Login bem-sucedido! Redirecionando...';
        messageElement.style.color = 'green';
        
        // 3. Redireciona para a próxima página do PWA (Ex: Manifesto)
        // Você criará esta página em seguida
        window.location.href = 'manifesto.html'; 
    })
    .catch(error => {
        // 4. Trata erros
        console.error('Erro de Login:', error);
        messageElement.textContent = `Erro: ${error.message}`;
        messageElement.style.color = 'red';
    });
});