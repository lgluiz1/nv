// =====================================================
// CONFIGURAÇÕES DE API
// Pega o domínio atual (ex: http://localhost:8089 ou https://pwa.suaempresa.com)
const BASE_URL = window.location.origin;
// =====================================================
const API_BASE = `${BASE_URL}/api/auth/`;
// =====================================================
// ELEMENTOS DO DOM
// =====================================================
const form = document.getElementById('login-form');
const alertBox = document.getElementById('alert');
const btnText = document.getElementById('btn-text');
const btnLoading = document.getElementById('btn-loading');

const senhaArea = document.getElementById('senha-area');
const confirmarArea = document.getElementById('confirmar-area');

let modo = 'CPF'; // CPF | LOGIN | PRIMEIRO_ACESSO

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================
function showAlert(msg, type = 'danger') {
    alertBox.className = `alert alert-${type}`;
    alertBox.textContent = msg;
    alertBox.classList.remove('d-none');
}

function setLoading(state) {
    btnLoading.classList.toggle('d-none', !state);
    btnText.textContent = state ? 'Aguarde...' : 'Continuar';
}

/**
 * Busca dados do motorista logado e salva o ID
 */
async function carregarMotorista(accessToken) {
    const res = await fetch(API_BASE + 'me/', {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

    if (!res.ok) throw new Error('Erro ao buscar dados do motorista');

    const data = await res.json();

    if (!data.id) throw new Error('Motorista ID não retornado');

    // Salva o ID para uso em WebSockets ou filtros de API
    localStorage.setItem('motorista_id', data.id);
}

// =====================================================
// EVENTO DE SUBMIT (FLUXO PRINCIPAL)
// =====================================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.classList.add('d-none');

    const cpf = document.getElementById('cpf').value.trim();
    const senha = document.getElementById('senha')?.value;
    const confirmar = document.getElementById('confirmar_senha')?.value;

    if (cpf.length !== 11) {
        showAlert('CPF inválido');
        return;
    }

    setLoading(true);

    try {
        // ETAPA 1 — VERIFICAR CPF
        if (modo === 'CPF') {
            const res = await fetch(API_BASE + 'verificar-cpf/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cpf })
            });

            const data = await res.json();

            if (data.status === 'NOVO_USUARIO') {
                senhaArea.classList.remove('d-none');
                confirmarArea.classList.remove('d-none');
                btnText.textContent = 'Criar Senha';
                modo = 'PRIMEIRO_ACESSO';
            } else if (data.status === 'USUARIO_EXISTENTE') {
                senhaArea.classList.remove('d-none');
                btnText.textContent = 'Entrar';
                modo = 'LOGIN';
            } else {
                showAlert('CPF não encontrado');
            }
        }

        // ETAPA 2 — LOGIN EXISTENTE
        else if (modo === 'LOGIN') {
            const res = await fetch(API_BASE + 'login/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: cpf, password: senha })
            });

            if (!res.ok) throw new Error('Senha inválida');

            const data = await res.json();

            // 🔐 TOKENS: Salva tanto o de acesso quanto o de renovação
            localStorage.setItem('accessToken', data.access);
            localStorage.setItem('refreshToken', data.refresh); // Alteração incluída

            // 🔥 BUSCA MOTORISTA
            await carregarMotorista(data.access);

            window.location.href = '/app/';
        }

        // ETAPA 3 — PRIMEIRO ACESSO (CRIAÇÃO DE SENHA)
        else if (modo === 'PRIMEIRO_ACESSO') {
            const res = await fetch(API_BASE + 'primeiro-acesso/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cpf,
                    senha,
                    confirmar_senha: confirmar
                })
            });

            if (!res.ok) throw new Error('Erro ao criar usuário');

            const data = await res.json();

            // 🔐 TOKENS: Salva tanto o de acesso quanto o de renovação
            localStorage.setItem('accessToken', data.access);
            localStorage.setItem('refreshToken', data.refresh); // Alteração incluída

            // 🔥 BUSCA MOTORISTA
            const meRes = await fetch(API_BASE + 'me/', {
                headers: {
                    Authorization: `Bearer ${data.access}`
                }
            });

            if (!meRes.ok) throw new Error('Erro ao carregar perfil do motorista');

            const me = await meRes.json();
            localStorage.setItem('motorista_id', me.id);

            window.location.href = '/app/';
        }

    } catch (err) {
        showAlert(err.message);
    } finally {
        setLoading(false);
    }
});

let deferredPrompt;
const installBanner = document.getElementById('pwa-install-banner');
const installBtn = document.getElementById('btn-instalar-app');

// O navegador dispara este evento se o app puder ser instalado
window.addEventListener('beforeinstallprompt', (e) => {
    // Impede o Chrome de mostrar a barra automática
    e.preventDefault();
    // Salva o evento para ser disparado pelo nosso botão
    deferredPrompt = e;
    
    // Mostra o nosso banner customizado
    installBanner.style.display = 'block';
});

installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
        // Mostra o prompt oficial do navegador
        deferredPrompt.prompt();
        
        // Aguarda a escolha do motorista
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`Escolha do motorista: ${outcome}`);
        
        // Esconde o banner independente da escolha
        installBanner.style.display = 'none';
        deferredPrompt = null;
    }
});

// Esconde o banner se o app for instalado com sucesso
window.addEventListener('appinstalled', () => {
    installBanner.style.display = 'none';
    deferredPrompt = null;
    console.log('PWA instalado com sucesso!');
});
// Adicione isso no seu script do banner
window.addEventListener('beforeinstallprompt', (e) => {
    console.log("PWA: Evento beforeinstallprompt disparado!"); // Verifique isso no console
    e.preventDefault();
    deferredPrompt = e;
    installBanner.style.display = 'block';
});

// Verifique se o Service Worker foi registrado com sucesso
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/serviceworker.js') // Rota padrão do django-pwa
    .then(() => console.log("PWA: Service Worker Registrado!"))
    .catch((err) => console.log("PWA: Falha no Service Worker", err));
}