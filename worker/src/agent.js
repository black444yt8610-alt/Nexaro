import { complete } from './ai.js';
import { getJson, readUserMemory, searchConversationIndex } from './r2.js';
import { getDocumentText } from './documents.js';
import { cleanText, formatTimeZone } from './utils.js';

export const TOOL_DEFINITIONS = [
  { name: 'memory_search', description: 'Search the user’s durable memory.', args: { query: 'string' } },
  { name: 'conversation_search', description: 'Search previous conversation titles and snippets.', args: { query: 'string' } },
  { name: 'project_lookup', description: 'Load a user project by id or name query.', args: { projectId: 'string', query: 'string' } },
  { name: 'document_lookup', description: 'Read extracted text from an uploaded document by id or name query.', args: { documentId: 'string', query: 'string' } },
  { name: 'calculator', description: 'Evaluate a basic arithmetic expression.', args: { expression: 'string' } },
  { name: 'current_time', description: 'Return the current date/time for a timezone.', args: { timeZone: 'string' } },
  { name: 'text_transform', description: 'Transform text using a safe basic operation.', args: { operation: 'uppercase|lowercase|trim|title', text: 'string' } },
];

export function calculator(expression) {
  const src = String(expression || '').replace(/\s+/g, '');
  if (src.length > 120 || !/^[0-9+\-*/%.^()]+$/.test(src)) throw new Error('Unsupported expression.');
  const tokens = src.match(/\d+(?:\.\d+)?|[()+\-*/%.^]/g) || [];
  if (tokens.join('') !== src) throw new Error('Invalid expression.');
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };
  const right = new Set(['^']);
  const output = [], ops = [];
  let prev = null;
  for (const t of tokens) {
    if (/^\d/.test(t)) output.push(Number(t));
    else if (t === '(') ops.push(t);
    else if (t === ')') {
      while (ops.length && ops.at(-1) !== '(') output.push(ops.pop());
      if (ops.pop() !== '(') throw new Error('Mismatched parentheses.');
    } else {
      const unary = (t === '-' || t === '+') && (prev === null || ['(', '+', '-', '*', '/', '%', '^'].includes(prev));
      if (unary) output.push(0);
      while (ops.length && ops.at(-1) !== '(' && (prec[ops.at(-1)] > prec[t] || (prec[ops.at(-1)] === prec[t] && !right.has(t)))) output.push(ops.pop());
      ops.push(t);
    }
    prev = t;
  }
  while (ops.length) {
    const op = ops.pop();
    if (op === '(') throw new Error('Mismatched parentheses.');
    output.push(op);
  }
  const stack = [];
  for (const t of output) {
    if (typeof t === 'number') { stack.push(t); continue; }
    const b = stack.pop(); const a = stack.pop();
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Invalid expression.');
    let v;
    if (t === '+') v = a + b; else if (t === '-') v = a - b; else if (t === '*') v = a * b; else if (t === '/') v = a / b; else if (t === '%') v = a % b; else v = a ** b;
    if (!Number.isFinite(v)) throw new Error('Result is not finite.');
    stack.push(v);
  }
  if (stack.length !== 1) throw new Error('Invalid expression.');
  return stack[0];
}

function titleCase(text) { return String(text).toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()); }

export async function runTool(env, userId, name, args) {
  if (!TOOL_DEFINITIONS.some(t => t.name === name)) throw new Error('Tool not allowed.');
  if (name === 'memory_search') {
    const m = await readUserMemory(env, userId);
    const q = cleanText(args?.query, 120).toLowerCase();
    return { facts: (m.profile?.facts || []).filter(x => x.text.toLowerCase().includes(q)).slice(0, 12), preferences: m.preferences || {} };
  }
  if (name === 'conversation_search') return { conversations: await searchConversationIndex(env, userId, cleanText(args?.query, 120), 10) };
  if (name === 'project_lookup') {
    const { index } = await readUserMemory(env, userId);
    const q = cleanText(args?.query, 120).toLowerCase();
    const found = (index.projects || []).find(x => x.id === args?.projectId) || (q ? (index.projects || []).find(x => x.name.toLowerCase().includes(q)) : null);
    return found ? { project: await getJson(env, `memory/${userId}/projects/${found.id}.json`, null) } : { project: null };
  }
  if (name === 'document_lookup') {
    const { index } = await readUserMemory(env, userId);
    const q = cleanText(args?.query, 120).toLowerCase();
    const found = args?.documentId ? { id: args.documentId } : (q ? (index.documents || []).find(x => x.name.toLowerCase().includes(q)) : null);
    const result = found ? await getDocumentText(env, userId, found.id) : null;
    return result ? { document: result.meta, text: result.text.slice(0, 30000) } : { document: null };
  }
  if (name === 'calculator') return { result: calculator(args?.expression) };
  if (name === 'current_time') return { time: formatTimeZone(new Date().toISOString(), args?.timeZone || 'Asia/Kolkata'), iso: new Date().toISOString(), timeZone: args?.timeZone || 'Asia/Kolkata' };
  if (name === 'text_transform') {
    const text = String(args?.text || '').slice(0, 10000); const op = args?.operation;
    if (op === 'uppercase') return { text: text.toUpperCase() };
    if (op === 'lowercase') return { text: text.toLowerCase() };
    if (op === 'trim') return { text: text.trim() };
    if (op === 'title') return { text: titleCase(text) };
    throw new Error('Unsupported transform.');
  }
}

export async function runAgent(env, userId, messages, taskText) {
  const toolList = TOOL_DEFINITIONS.map(t => `- ${t.name}: ${t.description}; args=${JSON.stringify(t.args)}`).join('\n');
  const planner = [
    'You are Nexaro AI’s tool planner. Decide whether one allowed tool is genuinely useful for answering the user.',
    'Return STRICT JSON only: {"tool":null} or {"tool":"name","args":{...}}. Use at most one tool per planning step. Do not invent tool names or arguments.',
    `Allowed tools:\n${toolList}`,
    `User request:\n${cleanText(taskText, 6000)}`,
  ].join('\n\n');
  const planResult = await complete(env, [{ role: 'system', content: planner }], { taskText: 'tool planning', maxTokens: 350, temperature: 0 });
  let plan = { tool: null };
  try { plan = JSON.parse(planResult.text.match(/\{[\s\S]*\}/)?.[0] || '{"tool":null}'); } catch {}
  let toolResult = null;
  if (plan.tool) {
    try { toolResult = { name: plan.tool, result: await runTool(env, userId, plan.tool, plan.args || {}) }; }
    catch (e) { toolResult = { name: plan.tool, result: { error: e.message } }; }
  }
  const finalMessages = [...messages];
  if (toolResult) finalMessages.push({ role: 'system', content: `Tool result from ${toolResult.name}:\n${JSON.stringify(toolResult.result).slice(0, 20000)}\nUse it only when relevant.` });
  const answer = await complete(env, finalMessages, { taskText, maxTokens: 2500, temperature: 0.4 });
  return { ...answer, tool: toolResult };
}
