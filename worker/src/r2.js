import { nowIso, uid, safeId } from './utils.js';

export function paths(userId) {
  return {
    root: `memory/${userId}`,
    profile: `memory/${userId}/profile.json`,
    preferences: `memory/${userId}/preferences.json`,
    index: `memory/${userId}/index.json`,
    conversations: `memory/${userId}/conversations`,
    projects: `memory/${userId}/projects`,
    documents: `memory/${userId}/documents`,
  };
}

export async function getJson(env, key, fallback = null) {
  const obj = await env.NEXARO_R2.get(key);
  if (!obj) return fallback;
  try { return await obj.json(); } catch { return fallback; }
}

export async function putJson(env, key, value, customMetadata = {}) {
  await env.NEXARO_R2.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' },
    customMetadata: { updatedAt: nowIso(), ...customMetadata },
  });
}

export async function deleteKey(env, key) { await env.NEXARO_R2.delete(key); }

export async function ensureUserMemory(env, userId) {
  const p = paths(userId);
  const profile = await getJson(env, p.profile, null);
  const prefs = await getJson(env, p.preferences, null);
  const index = await getJson(env, p.index, null);
  if (!profile) await putJson(env, p.profile, { userId, facts: [], createdAt: nowIso(), updatedAt: nowIso() });
  if (!prefs) await putJson(env, p.preferences, { tone: 'helpful', systemPrompt: '', voiceOutput: false, modelPreference: 'auto', updatedAt: nowIso() });
  if (!index) await putJson(env, p.index, { conversations: [], projects: [], documents: [], updatedAt: nowIso() });
}

export async function readUserMemory(env, userId) {
  await ensureUserMemory(env, userId);
  const p = paths(userId);
  return {
    profile: await getJson(env, p.profile, { facts: [] }),
    preferences: await getJson(env, p.preferences, {}),
    index: await getJson(env, p.index, { conversations: [], projects: [], documents: [] }),
  };
}

export async function writeIndex(env, userId, patch) {
  const p = paths(userId);
  const index = await getJson(env, p.index, { conversations: [], projects: [], documents: [] });
  const merged = { ...index, ...patch, updatedAt: nowIso() };
  await putJson(env, p.index, merged);
  return merged;
}

export async function upsertConversationIndex(env, userId, item) {
  const { index } = await readUserMemory(env, userId);
  const conversations = (index.conversations || []).filter(x => x.id !== item.id);
  conversations.unshift(item);
  conversations.splice(100);
  await writeIndex(env, userId, { conversations });
}

export async function deleteConversationIndex(env, userId, id) {
  const { index } = await readUserMemory(env, userId);
  await writeIndex(env, userId, { conversations: (index.conversations || []).filter(x => x.id !== id) });
}

export async function listUserObjects(env, prefix, limit = 1000) {
  const all = [];
  let cursor;
  do {
    const r = await env.NEXARO_R2.list({ prefix, limit, cursor });
    all.push(...r.objects);
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return all;
}

export async function createProject(env, userId, input) {
  const projectId = uid();
  const project = { id: projectId, name: input.name, description: input.description || '', notes: [], createdAt: nowIso(), updatedAt: nowIso() };
  const p = paths(userId);
  await putJson(env, `${p.projects}/${projectId}.json`, project);
  const { index } = await readUserMemory(env, userId);
  const projects = [{ id: projectId, name: project.name, updatedAt: project.updatedAt }, ...(index.projects || [])].slice(0, 50);
  await writeIndex(env, userId, { projects });
  return project;
}

export async function getProject(env, userId, projectId) {
  if (!safeId(projectId)) return null;
  return getJson(env, `${paths(userId).projects}/${projectId}.json`, null);
}

export async function deleteProject(env, userId, projectId) {
  if (!safeId(projectId)) return;
  await deleteKey(env, `${paths(userId).projects}/${projectId}.json`);
  const { index } = await readUserMemory(env, userId);
  await writeIndex(env, userId, { projects: (index.projects || []).filter(x => x.id !== projectId) });
}

export async function saveConversation(env, userId, conversation) {
  const p = paths(userId);
  await putJson(env, `${p.conversations}/${conversation.id}.json`, conversation);
  const firstUser = conversation.messages.find(m => m.role === 'user');
  await upsertConversationIndex(env, userId, {
    id: conversation.id,
    title: conversation.title || (firstUser?.content || 'New conversation').slice(0, 60),
    snippet: (conversation.messages.at(-1)?.content || '').slice(0, 180),
    updatedAt: conversation.updatedAt,
  });
}

export async function getConversation(env, userId, id) {
  if (!safeId(id)) return null;
  return getJson(env, `${paths(userId).conversations}/${id}.json`, null);
}

export async function deleteConversation(env, userId, id) {
  if (!safeId(id)) return;
  await deleteKey(env, `${paths(userId).conversations}/${id}.json`);
  await deleteConversationIndex(env, userId, id);
}

export function trimConversation(conversation, maxMessages = 120) {
  if (conversation.messages.length <= maxMessages) return conversation;
  const head = conversation.messages.slice(0, 1);
  const tail = conversation.messages.slice(-(maxMessages - 1));
  return { ...conversation, messages: [...head, ...tail] };
}

export async function searchConversationIndex(env, userId, q = '', limit = 8) {
  const { index } = await readUserMemory(env, userId);
  const needle = String(q || '').toLowerCase().trim();
  const rows = (index.conversations || []).filter(x => !needle || `${x.title} ${x.snippet}`.toLowerCase().includes(needle));
  return rows.slice(0, limit);
}
