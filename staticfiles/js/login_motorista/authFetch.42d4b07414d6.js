// authFetch.js

// URL base para os dados (Notas, Baixas, Manifesto)
const API_BASE = window.location.hostname.includes('ngrok')
    ? 'https://1bdf6f7e1548.ngrok-free.app/api/'
    : 'http://localhost:8089/api/';

// URL base para Autenticação (Login, Refresh, Perfil)
const AUTH_BASE = window.location.hostname.includes('ngrok')
    ? 'https://1bdf6f7e1548.ngrok-free.app/auth/'
    : 'http://localhost:8089/auth/';

async function authFetch(url, options = {}) {
    let access = localStorage.getItem('accessToken');

    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${access}`
    };

    if (!(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
    }

    try {
        let response = await fetch(url, options);

        if (response.status === 401) {
            console.warn("Access Token expirado. Tentando renovação...");
            const refreshed = await refreshToken();
            
            if (refreshed) {
                // Tenta novamente a requisição original com o novo token
                access = localStorage.getItem('accessToken');
                options.headers.Authorization = `Bearer ${access}`;
                return await fetch(url, options);
            } else {
                logout();
                return null;
            }
        }
        return response;
    } catch (err) {
        return null;
    }
}

async function refreshToken() {
    const refresh = localStorage.getItem('refreshToken');
    if (!refresh) return false;

    try {
        // AQUI ESTÁ A CORREÇÃO: Usando AUTH_BASE
        const urlRefresh = `${AUTH_BASE}token/refresh/`; 

        const res = await fetch(urlRefresh, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh: refresh })
        });

        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('accessToken', data.access);
            
            // Salva o novo refresh se o Django rotacionar o token
            if (data.refresh) {
                localStorage.setItem('refreshToken', data.refresh);
            }
            return true;
        }
        return false;
    } catch (err) {
        return false;
    }
}

function logout() {
    localStorage.clear();
    if (!window.location.pathname.includes('/login/')) {
        window.location.href = '/app/login/';
    }
}