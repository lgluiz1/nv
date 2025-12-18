// authFetch.js
// authFetch.js

// 1. Ajuste o API_BASE para ser igual ao manifesto
const API_BASE = window.location.hostname.includes('ngrok')
    ? 'https://1bdf6f7e1548.ngrok-free.app/api/'
    : 'http://localhost:8089/api/';

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
            console.warn("Token expirado, tentando refresh...");
            const refreshed = await refreshToken();
            if (!refreshed) {
                logout();
                return null;
            }

            access = localStorage.getItem('accessToken');
            options.headers.Authorization = `Bearer ${access}`;
            response = await fetch(url, options);
        }

        return response;
    } catch (err) {
        console.error("Erro na requisição:", err);
        return null;
    }
}

async function refreshToken() {
    const refresh = localStorage.getItem('refreshToken');
    if (!refresh) return false;

    try {
        // Use a URL completa para não haver erro de rota no Ngrok ou Celular
        const res = await fetch(`${API_BASE}auth/token/refresh/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ refresh })
        });

        if (!res.ok) {
            console.error("Servidor recusou o Refresh Token");
            return false;
        }

        const data = await res.json();
        localStorage.setItem('accessToken', data.access);
        
        // Se o Django girar o refresh token, salve o novo também
        if (data.refresh) {
            localStorage.setItem('refreshToken', data.refresh);
        }
        return true;
    } catch (err) {
        console.error("Erro de rede ao tentar renovar token");
        return false;
    }
}

function logout() {
    console.log("Executando Logout...");
    localStorage.clear();
    window.location.href = '/app/login/';
}
