import { getJson, putJson, deleteKey } from './r2.js';
import { normalizeEmail, validateEmail, validatePassword, uid, nowIso, hmacHex, randomBytes, base64Url, parseCookies, sessionCookie, clearSessionCookie } from './utils.js';

const SESSION_TTL = 60 * 60 * 24 * 30;
const PBKDF2_ITERATIONS = 120_000;
const enc = new TextEncoder();

async function derivePassword(password, saltBytes) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, base, 256);
  return base64Url(new Uint8Array(bits));
}

export async function hashEmail(env, email) { return hmacHex(env.SESSION_SECRET, normalizeEmail(email)); }

export async function register(env, data, request) {
  const name = String(data.name || '').trim().slice(0, 80);
  const email = normalizeEmail(data.email);
  const password = String(data.password || '');
  if (name.length < 1) throw new AuthError('Enter your name.');
  if (!validateEmail(email)) throw new AuthError('Enter a valid email address.');
  if (!validatePassword(password)) throw new AuthError('Password must be 8–256 characters.');
  const key = `users/${await hashEmail(env, email)}/account.json`;
  const existing = await getJson(env, key, null);
  if (existing) throw new AuthError('An account already exists for that email.', 409, 'ACCOUNT_EXISTS');
  const salt = randomBytes(16);
  const userId = uid();
  const account = {
    id: userId,
    name,
    email,
    salt: base64Url(salt),
    passwordHash: await derivePassword(password, salt),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await putJson(env, key, account);
  return createSession(env, request, { id: userId, name, email });
}

export async function login(env, data, request) {
  const email = normalizeEmail(data.email);
  const password = String(data.password || '');
  if (!validateEmail(email) || !validatePassword(password)) throw new AuthError('Invalid email or password.', 401, 'INVALID_LOGIN');
  const key = `users/${await hashEmail(env, email)}/account.json`;
  const account = await getJson(env, key, null);
  if (!account) throw new AuthError('Invalid email or password.', 401, 'INVALID_LOGIN');
  const salt = decodeBase64Url(account.salt);
  const computed = await derivePassword(password, salt);
  if (computed !== account.passwordHash) throw new AuthError('Invalid email or password.', 401, 'INVALID_LOGIN');
  return createSession(env, request, { id: account.id, name: account.name, email: account.email });
}

async function createSession(env, request, user) {
  const raw = base64Url(randomBytes(32));
  const tokenHash = await hmacHex(env.SESSION_SECRET, raw);
  const expiresAt = new Date(Date.now() + SESSION_TTL * 1000).toISOString();
  await putJson(env, `sessions/${tokenHash}.json`, { userId: user.id, name: user.name, email: user.email, createdAt: nowIso(), expiresAt });
  const secure = new URL(request.url).protocol === 'https:';
  return { user, token: raw, cookie: sessionCookie(raw, secure, SESSION_TTL) };
}

export async function getSession(env, request) {
  const cookies = parseCookies(request);
  const auth = request.headers.get('Authorization') || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim();
  const token = bearer || cookies.nexaro_session;
  if (!token) return null;
  const tokenHash = await hmacHex(env.SESSION_SECRET, token);
  const sessionKey = `sessions/${tokenHash}.json`;
  const session = await getJson(env, sessionKey, null);
  if (!session) return null;
  if (Date.parse(session.expiresAt) <= Date.now()) {
    await deleteKey(env, sessionKey);
    return null;
  }
  return { ...session, tokenHash, sessionKey };
}

export async function logout(env, request) {
  const session = await getSession(env, request);
  if (session) await deleteKey(env, session.sessionKey);
  const secure = new URL(request.url).protocol === 'https:';
  return { cookie: clearSessionCookie(secure) };
}

export class AuthError extends Error {
  constructor(message, status = 400, code = 'AUTH_ERROR') { super(message); this.status = status; this.code = code; }
}

function decodeBase64Url(s) {
  const padded = String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
