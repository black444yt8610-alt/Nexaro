import { api, setSessionToken } from './api.js';

export function setupAuth({ onAuth }) {
  const auth = document.querySelector('#authScreen');
  const app = document.querySelector('#app');
  const tabs = document.querySelectorAll('[data-auth-tab]');
  const form = document.querySelector('#authForm');
  const name = document.querySelector('#authName');
  const email = document.querySelector('#authEmail');
  const password = document.querySelector('#authPassword');
  const title = document.querySelector('#authTitle');
  const button = document.querySelector('#authSubmit');
  const message = document.querySelector('#authMessage');
  let mode = 'login';

  function setMode(next) {
    mode = next;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.authTab === mode));
    name.hidden = mode === 'login';
    title.textContent = mode === 'login' ? 'Welcome back' : 'Create your Nexaro account';
    button.textContent = mode === 'login' ? 'Log in' : 'Create account';
    message.textContent = '';
  }
  tabs.forEach(t => t.addEventListener('click', () => setMode(t.dataset.authTab)));

  async function check() {
    try {
      const r = await api('/auth/me');
      if (r.authenticated) { auth.hidden = true; app.hidden = false; onAuth(r.user); }
      else { auth.hidden = false; app.hidden = true; }
    } catch {
      auth.hidden = false; app.hidden = true; message.textContent = 'Worker is unreachable. Check the API URL.';
    }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault(); button.disabled = true; message.textContent = '';
    try {
      const r = await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify({ name: name.value, email: email.value, password: password.value }) });
      setSessionToken(r.sessionToken);
      auth.hidden = true; app.hidden = false; form.reset(); onAuth(r.user);
    } catch (err) { message.textContent = err.message; }
    finally { button.disabled = false; }
  });

  document.querySelector('#logoutBtn').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setSessionToken('');
    location.reload();
  });
  setMode('login');
  check();
}
