import { api } from './api.js';

export function createProjectsController({ onProject }) {
  const select = document.querySelector('#projectSelect');
  const list = document.querySelector('#projectList');
  const form = document.querySelector('#projectForm');
  const name = document.querySelector('#projectName');
  const description = document.querySelector('#projectDescription');
  let projects = [];
  async function load() {
    const r = await api('/projects'); projects = r.projects || [];
    select.innerHTML = '<option value="">No project</option>' + projects.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
    list.innerHTML = projects.length ? '' : '<div class="empty-mini">No projects yet.</div>';
    for (const p of projects) {
      const row = document.createElement('div'); row.className = 'project-row';
      row.innerHTML = `<button class="project-pick" type="button">${escapeHTML(p.name)}</button><button class="icon-btn danger" type="button">×</button>`;
      row.querySelector('.project-pick').addEventListener('click', () => { select.value = p.id; onProject(p.id); });
      row.querySelector('.danger').addEventListener('click', async () => { await api(`/projects/${p.id}`, { method: 'DELETE' }); if (select.value === p.id) select.value = ''; await load(); });
      list.appendChild(row);
    }
  }
  select.addEventListener('change', () => onProject(select.value || null));
  form.addEventListener('submit', async e => { e.preventDefault(); if (!name.value.trim()) return; const r = await api('/projects', { method: 'POST', body: JSON.stringify({ name: name.value, description: description.value }) }); name.value = ''; description.value = ''; await load(); select.value = r.project.id; onProject(r.project.id); });
  return { load, getCurrent: () => select.value || null };
}
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]); }
