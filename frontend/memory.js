import { api } from './api.js';

export function createMemoryController() {
  const list = document.querySelector('#memoryList');
  const systemPrompt = document.querySelector('#systemPrompt');
  const memoryToggle = document.querySelector('#memoryToggle');
  const addForm = document.querySelector('#memoryForm');
  const factInput = document.querySelector('#factInput');

  async function load() {
    const r = await api('/memory');
    const facts = r.profile?.facts || [];
    const prefs = r.preferences || {};
    memoryToggle.checked = prefs.memoryEnabled !== 'false';
    systemPrompt.value = prefs.systemPrompt || '';
    list.innerHTML = '';
    if (!facts.length) list.innerHTML = '<div class="empty-mini">No durable memories yet.</div>';
    for (const fact of facts) {
      const row = document.createElement('div'); row.className = 'memory-row';
      row.innerHTML = `<span>${escapeHTML(fact.text)}</span><button class="icon-btn danger" aria-label="Delete memory">×</button>`;
      row.querySelector('button').addEventListener('click', async () => { await api(`/memory/${encodeURIComponent(fact.id)}`, { method: 'DELETE' }); load(); });
      list.appendChild(row);
    }
  }
  addForm.addEventListener('submit', async e => {
    e.preventDefault(); const text = factInput.value.trim(); if (!text) return;
    await api('/memory', { method: 'POST', body: JSON.stringify({ kind: 'fact', text }) }); factInput.value = ''; await load();
  });
  let timer;
  systemPrompt.addEventListener('change', async () => {
    clearTimeout(timer); timer = setTimeout(() => api('/memory', { method: 'POST', body: JSON.stringify({ kind: 'preference', key: 'systemPrompt', value: systemPrompt.value }) }), 250);
  });
  memoryToggle.addEventListener('change', () => api('/memory', { method: 'POST', body: JSON.stringify({ kind: 'preference', key: 'memoryEnabled', value: String(memoryToggle.checked) }) }));
  return { load };
}
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]); }
