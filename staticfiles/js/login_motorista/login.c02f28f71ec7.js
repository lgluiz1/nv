const API_BASE = window.location.hostname.includes('ngrok')
  ? 'https://9ee00b85b0fc.ngrok-free.app/api/auth/'
  : 'http://localhost:8089/api/auth/';

const form = document.getElementById('login-form');
const alertBox = document.getElementById('alert');
const btnText = document.getElementById('btn-text');
const btnLoading = document.getElementById('btn-loading');

const senhaArea = document.getElementById('senha-area');
const confirmarArea = document.getElementById('confirmar-area');

let modo = 'CPF'; // CPF | LOGIN | PRIMEIRO_ACESSO

function showAlert(msg, type = 'danger') {
    alertBox.className = `alert alert-${type}`;
    alertBox.textContent = msg;
    alertBox.classList.remove('d-none');
}

function setLoading(state) {
    btnLoading.classList.toggle('d-none', !state);
    btnText.textContent = state ? 'Aguarde...' : 'Continuar';
}

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
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ cpf })
            });

            const data = await res.json();

            if (data.status === 'NOVO_USUARIO') {
                senhaArea.classList.remove('d-none');
                confirmarArea.classList.remove('d-none');
                btnText.textContent = 'Criar Senha';
                modo = 'PRIMEIRO_ACESSO';
            }
            else if (data.status === 'USUARIO_EXISTENTE') {
                senhaArea.classList.remove('d-none');
                btnText.textContent = 'Entrar';
                modo = 'LOGIN';
            }
            else {
                showAlert('CPF não encontrado');
            }
        }

        // ETAPA 2 — LOGIN
        else if (modo === 'LOGIN') {
            const res = await fetch(API_BASE + 'login/', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ username: cpf, password: senha })
            });

            if (!res.ok) throw new Error('Senha inválida');

            const data = await res.json();
            localStorage.setItem('accessToken', data.access);
            window.location.href = '/app/';
        }

        // ETAPA 3 — PRIMEIRO ACESSO
        else if (modo === 'PRIMEIRO_ACESSO') {
            const res = await fetch(API_BASE + 'primeiro-acesso/', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    cpf,
                    senha,
                    confirmar_senha: confirmar
                })
            });

            if (!res.ok) throw new Error('Erro ao criar usuário');

            const data = await res.json();
            localStorage.setItem('accessToken', data.access);
            window.location.href = '/app/';
        }

    } catch (err) {
        showAlert(err.message);
    } finally {
        setLoading(false);
    }
});
