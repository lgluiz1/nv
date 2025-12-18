const API_BASE = window.location.origin;

async function authFetch(url, options = {}) {
    let access = localStorage.getItem('accessToken');

    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${access}`,
        'Content-Type': 'application/json'
    };

    let response = await fetch(url, options);

    // Token expirou
    if (response.status === 401) {
        const refreshed = await refreshToken();
        if (!refreshed) {
            logout();
            return;
        }

        access = localStorage.getItem('accessToken');
        options.headers.Authorization = `Bearer ${access}`;
        response = await fetch(url, options);
    }

    return response;
}

async function refreshToken() {
    const refresh = localStorage.getItem('refreshToken');
    if (!refresh) return false;

    const res = await fetch('/api/auth/token/refresh/', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ refresh })
    });

    if (!res.ok) return false;

    const data = await res.json();
    localStorage.setItem('accessToken', data.access);
    return true;
}


function logout() {
    localStorage.clear();
    window.location.href = '/app/login/';
}


document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
        logout();
        return;
    }

    const res = await authFetch('/api/auth/me/');
    if (!res || !res.ok) logout();
});
