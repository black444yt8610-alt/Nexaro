import { API_BASE_URL } from './app-config.js';
let sessionToken = '';
export function setSessionToken(token) { sessionToken = String(token || ''); }

async function parseError(res) {
  try {
    const data = await res.json();
    return data?.error?.message || 'Request failed.';
  } catch {
    return `Request failed (${res.status}).`;
  }
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  const res = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include', ...options, headers });
  if (!res.ok) throw new Error(await parseError(res));
  const type = res.headers.get('content-type') || '';
  return type.includes('application/json') ? res.json() : res.text();
}

export async function streamSSE(path, body, { signal, onMeta, onDelta, onDone, onError } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST', credentials: 'include', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await parseError(res));
  if (!res.body) throw new Error('Streaming is not available in this browser.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\n\n/);
    buffer = frames.pop() || '';
    for (const frame of frames) {
      const event = frame.match(/^event:\s*(.+)$/m)?.[1]?.trim() || 'message';
      const raw = frame.match(/^data:\s*(.+)$/m)?.[1] || '';
      if (!raw) continue;
      let data; try { data = JSON.parse(raw); } catch { continue; }
      if (event === 'meta') onMeta?.(data);
      else if (event === 'delta') onDelta?.(data.text || '');
      else if (event === 'done') onDone?.(data);
      else if (event === 'error') onError?.(data.message || 'Generation failed.');
    }
  }
}
