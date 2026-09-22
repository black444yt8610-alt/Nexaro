import { paths, getJson, putJson, deleteKey, readUserMemory, writeIndex } from './r2.js';
import { MAX_FILE_BYTES, MAX_EXTRACTED_TEXT, uid, nowIso, safeId } from './utils.js';

const extMap = {
  txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', json: 'application/json', csv: 'text/csv',
};

function extension(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function decodeText(buf) {
  return new TextDecoder('utf-8', { fatal: false }).decode(buf).replace(/\u0000/g, '');
}

function extractPdfText(buf) {
  const raw = decodeText(buf);
  const chunks = [];
  const btBlocks = raw.match(/BT[\s\S]*?ET/g) || [];
  for (const block of btBlocks) {
    const re = /\(((?:\\.|[^()])*)\)\s*(?:Tj|'|\")/g;
    let m;
    while ((m = re.exec(block))) {
      let s = m[1].replace(/\\([()\\])/g, '$1').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
      if (s.trim()) chunks.push(s);
    }
  }
  return chunks.join(' ').replace(/\s{3,}/g, ' ').slice(0, MAX_EXTRACTED_TEXT);
}

export async function uploadDocument(env, userId, file) {
  if (!(file instanceof File)) throw new DocError('No file received.', 400, 'NO_FILE');
  if (file.size > MAX_FILE_BYTES) throw new DocError('File is too large. Maximum size is 5 MB.', 413, 'FILE_TOO_LARGE');
  const ext = extension(file.name);
  const supported = ['txt', 'json', 'csv', 'md', 'markdown', 'pdf'];
  if (!supported.includes(ext)) throw new DocError('Unsupported file type. Use TXT, JSON, CSV, Markdown, or a text-extractable PDF.', 415, 'UNSUPPORTED_FILE');
  const bytes = await file.arrayBuffer();
  let extracted = '';
  let extractionStatus = 'ready';
  if (ext === 'pdf') {
    extracted = extractPdfText(bytes);
    if (!extracted.trim()) extractionStatus = 'stored_no_text';
  } else {
    extracted = decodeText(bytes).slice(0, MAX_EXTRACTED_TEXT);
  }
  const id = uid();
  const p = paths(userId);
  const safeName = String(file.name).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160) || `document-${id}`;
  const meta = {
    id, name: safeName, type: file.type || extMap[ext] || 'application/octet-stream', extension: ext,
    size: file.size, extractedChars: extracted.length, extractionStatus, createdAt: nowIso(), updatedAt: nowIso(),
  };
  await env.NEXARO_R2.put(`${p.documents}/${id}.bin`, bytes, { httpMetadata: { contentType: meta.type }, customMetadata: { name: safeName, userId } });
  await putJson(env, `${p.documents}/${id}.json`, meta);
  if (extracted) await env.NEXARO_R2.put(`${p.documents}/${id}.txt`, extracted, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
  const { index } = await readUserMemory(env, userId);
  const documents = [{ id, name: safeName, type: meta.type, size: file.size, extractionStatus, createdAt: meta.createdAt }, ...(index.documents || [])].slice(0, 100);
  await writeIndex(env, userId, { documents });
  return meta;
}

export async function listDocuments(env, userId) {
  const { index } = await readUserMemory(env, userId);
  return index.documents || [];
}

export async function getDocumentText(env, userId, id) {
  if (!safeId(id)) return null;
  const p = paths(userId);
  const meta = await getJson(env, `${p.documents}/${id}.json`, null);
  if (!meta || meta.extractionStatus !== 'ready') return meta ? { meta, text: '' } : null;
  const obj = await env.NEXARO_R2.get(`${p.documents}/${id}.txt`);
  return { meta, text: obj ? (await obj.text()).slice(0, MAX_EXTRACTED_TEXT) : '' };
}

export async function deleteDocument(env, userId, id) {
  if (!safeId(id)) return;
  const p = paths(userId);
  await Promise.all([
    deleteKey(env, `${p.documents}/${id}.json`),
    deleteKey(env, `${p.documents}/${id}.bin`),
    deleteKey(env, `${p.documents}/${id}.txt`),
  ]);
  const { index } = await readUserMemory(env, userId);
  await writeIndex(env, userId, { documents: (index.documents || []).filter(x => x.id !== id) });
}

export class DocError extends Error { constructor(message, status = 400, code = 'DOCUMENT_ERROR') { super(message); this.status = status; this.code = code; } }
