export const MAX_JSON_BYTES = 256 * 1024;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT = 180_000;

const enc = new TextEncoder();

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export function text(data, status = 200, headers = {}) {
  return new Response(data, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers } });
}

export function error(message, status = 400, code = 'BAD_REQUEST') {
  return json({ error: { code, message } }, status);
}

export function nowIso() { return new Date().toISOString(); }
export function uid() { return crypto.randomUUID(); }

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 256;
}

export function cleanText(value, max = 20_000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

export function safeId(value) {
  const s = String(value || '');
  return /^[A-Za-z0-9_-]{8,100}$/.test(s) ? s : null;
}

export function isJsonRequest(request) {
  return (request.headers.get('content-type') || '').includes('application/json');
}

export async function readJson(request, maxBytes = MAX_JSON_BYTES) {
  const cl = Number(request.headers.get('content-length') || 0);
  if (cl && cl > maxBytes) throw Object.assign(new Error('Request too large'), { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw Object.assign(new Error('Request too large'), { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  try { return JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('Malformed JSON'), { status: 400, code: 'INVALID_JSON' }); }
}

export function csvSafe(value) { return String(value ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 500); }

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function randomBytes(size = 32) {
  const b = new Uint8Array(size);
  crypto.getRandomValues(b);
  return b;
}

export function base64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, secure = true, maxAge = 60 * 60 * 24 * 30) {
  return `nexaro_session=${encodeURIComponent(token)}; Path=/; HttpOnly; ${secure ? 'SameSite=None; Secure; ' : 'SameSite=Lax; '}Max-Age=${maxAge}`;
}

export function clearSessionCookie(secure = true) {
  return `nexaro_session=; Path=/; HttpOnly; ${secure ? 'SameSite=None; Secure; ' : 'SameSite=Lax; '}Max-Age=0`;
}

export function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowedRaw = String(env.ALLOWED_ORIGINS || '').trim();
  const allowed = allowedRaw.split(',').map(x => x.trim()).filter(Boolean);
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    ...(ok && origin ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {}),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  };
}

export function addCors(response, request, env) {
  const h = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(request, env))) h.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

export function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function isTransientStatus(status) { return status === 408 || status === 409 || status === 429 || status >= 500; }

export function stripUnsafeMemory(text) {
  const s = cleanText(text, 800);
  if (!s) return null;
  const bad = /(password|passcode|api[_ -]?key|secret|token|credit\s*card|bank\s*(account|details)|medical|diagnos|prescription|exact\s+(home|street)\s+address|ssn|aadhaar|otp|one[- ]time\s+password)/i;
  return bad.test(s) ? null : s;
}

export function formatTimeZone(iso, timeZone = 'Asia/Kolkata') {
  try {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeStyle: 'medium', timeZone }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString();
  }
}
