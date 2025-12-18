// login.js

// URL base do seu servidor Django (INCLUI O PREFIXO /api/)
const isNgrok = window.location.hostname.includes('ngrok');

const BASE_API_URL = isNgrok
  ? 'https://9ee00b85b0fc.ngrok-free.app/api/'
  : 'http://localhost:8099/api/';
const LOGIN_ENDPOINT = BASE_API_URL + 'auth/login/'; // <--- ROTA COMPLETA DA API

// URL base do PWA no Django (Rota /app/)
const PWA_BASE_URL = isNgrok
  ? 'https://9ee00b85b0fc.ngrok-free.app/app/'
  : 'http://localhost:8099/app/';

document.getElementById('login-form').addEventListener('submit', function(event) {
    event.preventDefault(); 
    
    const cpf = document.getElementById('cpf').value.trim();
    const senha = document.getElementById('senha').value.trim();
    const messageElement = document.getElementById('message');
    
    messageElement.textContent = ''; 

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
            username: cpf, 
            password: senha
        })
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } 
        // Se a resposta for erro, tenta ler a mensagem de erro JSON
        return response.json().then(err => { 
            throw new Error(err.detail || 'CPF ou Senha Inválidos');
        });
    })
    .then(data => {
        // 2. Armazena o token JWT
        const token = data.access;
        localStorage.setItem('accessToken', token);
        
        messageElement.textContent = 'Login bem-sucedido! Redirecionando...';
        messageElement.style.color = 'green';
        
        // 3. Redireciona usando a URL base do aplicativo
        window.location.href = PWA_BASE_URL; // Redireciona para /app/
    })
    .catch(error => {
        console.error('Erro de Login:', error);
        messageElement.textContent = `Erro: ${error.message}`;
        messageElement.style.color = 'red';
    });
});