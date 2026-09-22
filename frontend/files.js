import { api } from './api.js';

export function createFilesController({ onChange }) {
  const input = document.querySelector('#fileInput');
  const list = document.querySelector('#documentList');
  const count = document.querySelector('#documentCount');
  let documents = [];
  const selected = new Set();
  async function load() {
    const r = await api('/documents'); documents = r.documents || [];
    list.innerHTML = documents.length ? '' : '<div class="empty-mini">No documents uploaded.</div>';
    for (const d of documents) {
      const row = document.createElement('label'); row.className = 'doc-row';
      const checked = selected.has(d.id) ? 'checked' : '';
      row.innerHTML = `<input type="checkbox" ${checked}><span class="doc-main"><strong>${escapeHTML(d.name)}</strong><small>${formatBytes(d.size)} · ${escapeHTML(d.extractionStatus)}</small></span><button type="button" class="icon-btn danger">×</button>`;
      row.querySelector('input').addEventListener('change', e => { e.target.checked ? selected.add(d.id) : selected.delete(d.id); count.textContent = selected.size; onChange([...selected]); });
      row.querySelector('.danger').addEventListener('click', async e => { e.preventDefault(); selected.delete(d.id); await api(`/documents/${d.id}`, { method: 'DELETE' }); load(); });
      list.appendChild(row);
    }
    count.textContent = selected.size;
  }
  input.addEventListener('change', async () => {
    for (const file of input.files || []) {
      const form = new FormData(); form.append('file', file);
      try { await api('/documents/upload', { method: 'POST', body: form }); } catch (e) { alert(e.message); }
    }
    input.value = ''; await load();
  });
  return { load, getSelected: () => [...selected] };
}
function formatBytes(n) { if (n < 1024) return `${n} B`; const units = ['KB', 'MB']; let x = n / 1024, i = 0; while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; } return `${x.toFixed(1)} ${units[i]}`; }
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]); }
