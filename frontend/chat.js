import { api, streamSSE } from './api.js';

export function createChatController({ getProjectId, getDocumentIds, getVoiceOutput, onProvider }) {
  const chat = document.querySelector('#chatMessages');
  const composer = document.querySelector('#composer');
  const sendBtn = document.querySelector('#sendBtn');
  const stopBtn = document.querySelector('#stopBtn');
  const newBtn = document.querySelector('#newChatBtn');
  const title = document.querySelector('#chatTitle');
  let conversationId = null;
  let messages = [];
  let aborter = null;
  let voice = null;

  function setVoice(v) { voice = v; }
  function reset() { conversationId = null; messages = []; title.textContent = 'New chat'; render(); }
  function bubble(role, content, id, meta = {}) {
    const wrap = document.createElement('article'); wrap.className = `message ${role}`; wrap.dataset.id = id || '';
    const avatar = role === 'user' ? 'You' : 'N';
    wrap.innerHTML = `<div class="avatar">${avatar}</div><div class="bubble-body"><div class="message-meta"><span>${role === 'user' ? 'You' : `Nexaro · ${escapeHTML(meta.provider || '')}`}</span><span>${role === 'assistant' && meta.model ? escapeHTML(meta.model) : ''}</span></div><div class="content"></div><div class="message-actions"></div></div>`;
    renderMarkdown(wrap.querySelector('.content'), content || '');
    const actions = wrap.querySelector('.message-actions');
    const copy = button('Copy'); copy.onclick = () => navigator.clipboard?.writeText(content || ''); actions.append(copy);
    if (role === 'assistant') { const regen = button('Regenerate'); regen.onclick = () => regenerate(); actions.append(regen); }
    if (role === 'user') { const edit = button('Edit'); edit.onclick = () => { composer.value = content; composer.dataset.editId = id || ''; composer.focus(); }; actions.append(edit); }
    return wrap;
  }
  function button(label) { const b = document.createElement('button'); b.className = 'mini-btn'; b.textContent = label; return b; }
  function render() {
    chat.innerHTML = '';
    if (!messages.length) chat.innerHTML = `<div class="welcome"><div class="logo-orb">N</div><h2>How can Nexaro help?</h2><p>Chat, code, analyze documents, remember useful preferences, and switch AI providers automatically.</p></div>`;
    for (const m of messages) chat.appendChild(bubble(m.role, m.content, m.id, m));
    chat.scrollTop = chat.scrollHeight;
  }
  async function load(id) {
    const r = await api(`/conversations/${id}`); conversationId = id; messages = r.conversation.messages || []; title.textContent = r.conversation.title || 'Chat'; render();
  }
  async function send(regenerate = false, replaceMessageId = null) {
    const editId = replaceMessageId || composer.dataset.editId || null;
    const text = composer.value.trim();
    if (!regenerate && !text) return;
    const body = { conversationId, message: text, regenerate, replaceMessageId: editId, projectId: getProjectId(), documentIds: getDocumentIds(), provider: document.querySelector('#providerSelect').value };
    if (!regenerate) {
      if (editId) { const i = messages.findIndex(m => m.id === editId); if (i >= 0) messages = messages.slice(0, i); }
      const m = { id: crypto.randomUUID(), role: 'user', content: text }; messages.push(m); composer.value = ''; delete composer.dataset.editId; render();
    }
    sendBtn.disabled = true; stopBtn.hidden = false; aborter = new AbortController();
    const assistant = { id: crypto.randomUUID(), role: 'assistant', content: '', provider: '', model: '' }; messages.push(assistant); render();
    try {
      await streamSSE('/chat/stream', body, {
        signal: aborter.signal,
        onMeta: meta => { conversationId = meta.conversationId; assistant.provider = meta.provider; assistant.model = meta.model; onProvider?.(meta.provider, meta.model); render(); },
        onDelta: delta => { assistant.content += delta; const el = chat.querySelector(`.message[data-id="${assistant.id}"] .content`); if (el) renderMarkdown(el, assistant.content); chat.scrollTop = chat.scrollHeight; },
        onDone: () => { title.textContent = messages.find(m => m.role === 'user')?.content.slice(0, 60) || 'Chat'; if (getVoiceOutput()) voice?.speak(assistant.content); },
        onError: msg => { assistant.content = msg; const el = chat.querySelector(`.message[data-id="${assistant.id}"] .content`); if (el) el.textContent = msg; }
      });
    } catch (e) {
      if (e.name !== 'AbortError') { assistant.content = `Error: ${e.message}`; const el = chat.querySelector(`.message[data-id="${assistant.id}"] .content`); if (el) el.textContent = assistant.content; }
    } finally { sendBtn.disabled = false; stopBtn.hidden = true; aborter = null; }
  }
  async function regenerate() {
    if (!conversationId) return;
    const lastUser = [...messages].reverse().find(m => m.role === 'user'); if (!lastUser) return;
    while (messages.at(-1)?.role === 'assistant') messages.pop();
    await send(true);
  }
  newBtn.addEventListener('click', reset);
  sendBtn.addEventListener('click', () => send(false));
  stopBtn.addEventListener('click', () => aborter?.abort());
  composer.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(false); } });
  return { load, reset, setVoice, getConversationId: () => conversationId, send };
}

function escapeHTML(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]); }
function renderMarkdown(el, source) {
  const text = String(source || '').replace(/\r/g, '');
  const codeBlocks = [];
  let safe = text.replace(/```([\w+-]*)\n([\s\S]*?)```/g, (_, lang, code) => { const i = codeBlocks.push({ lang, code }) - 1; return `\n@@CODE${i}@@\n`; });
  safe = escapeHTML(safe);
  safe = safe.replace(/^### (.*)$/gm, '<h4>$1</h4>').replace(/^## (.*)$/gm, '<h3>$1</h3>').replace(/^# (.*)$/gm, '<h2>$1</h2>');
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  safe = safe.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>');
  safe = `<p>${safe}</p>`;
  safe = safe.replace(/@@CODE(\d+)@@/g, (_, i) => { const b = codeBlocks[Number(i)]; return `<pre class="code-block"><div class="code-head"><span>${escapeHTML(b.lang || 'code')}</span><button class="code-copy" data-code="${encodeURIComponent(b.code)}">Copy</button></div><code>${escapeHTML(b.code)}</code></pre>`; });
  el.innerHTML = safe;
  el.querySelectorAll('.code-copy').forEach(b => b.onclick = () => navigator.clipboard?.writeText(decodeURIComponent(b.dataset.code)));
}
