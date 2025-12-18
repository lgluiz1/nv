// authFetch.js

// Única declaração de API_BASE para todo o App
const API_BASE = window.location.hostname.includes('ngrok')
    ? 'https://1bdf6f7e1548.ngrok-free.app/api/'
    : 'http://localhost:8089/api/';

async function authFetch(url, options = {}) {
    let access = localStorage.getItem('accessToken');

    // Se não houver token nenhum, nem tenta; manda logar
    if (!access) {
        logout();
        return null;
    }

    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${access}`
    };

    if (!(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
    }

    try {
        let response = await fetch(url, options);

        // Se o token de 15 min expirou
        if (response.status === 401) {
            console.warn("Token de acesso expirado. Tentando renovar com Refresh Token...");
            const refreshed = await refreshToken();
            
            if (refreshed) {
                // Tenta novamente com o novo token
                access = localStorage.getItem('accessToken');
                options.headers.Authorization = `Bearer ${access}`;
                return await fetch(url, options);
            } else {
                // Refresh token também falhou ou expirou (após 30 dias)
                logout();
                return null;
            }
        }
        return response;
    } catch (err) {
        console.error("Erro de conexão no authFetch:", err);
        return null;
    }
}

async function refreshToken() {
    const refresh = localStorage.getItem('refreshToken');
    if (!refresh) return false;

    try {
        // Rota correta para o SimpleJWT renovar os tokens
        const res = await fetch(`${API_BASE}auth/token/refresh/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh })
        });

        if (!res.ok) return false;

        const data = await res.json();
        localStorage.setItem('accessToken', data.access);
        
        // Se o Django configurou ROTATE_REFRESH_TOKENS, salvamos o novo refresh aqui
        if (data.refresh) {
            localStorage.setItem('refreshToken', data.refresh);
        }
        return true;
    } catch (e) {
        return false;
    }
}

function logout() {
    console.log("Sessão finalizada. Limpando dados...");
    localStorage.clear();
    // Evita loop se já estiver na página de login
    if (!window.location.pathname.includes('/login/')) {
        window.location.href = '/app/login/';
    }
}