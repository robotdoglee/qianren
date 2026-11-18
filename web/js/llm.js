// Qwen（DashScope）增强：优先同源服务器函数，其次浏览器直连（key 仅存 localStorage）
import { MISSING } from './extract-rules.js';

export const LS_KEY = 'qianren.dashscope.key';
export const LS_MODEL = 'qianren.model';
export const LS_ENGINE = 'qianren.engine';
export const FN_BASE = '/functions/v1/app';
export const MODELS = ['qwen-plus', 'qwen-turbo', 'qwen-max'];
const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

const store = typeof localStorage !== 'undefined' ? localStorage : {
  getItem: () => null, setItem: () => {}, removeItem: () => {}
};

export function getKey() {
  return (store.getItem(LS_KEY) || '').trim();
}
export function setKey(key) {
  const v = (key || '').trim();
  if (v) store.setItem(LS_KEY, v);
  else store.removeItem(LS_KEY);
  return v;
}
export function getModel() {
  const m = store.getItem(LS_MODEL);
  return MODELS.includes(m) ? m : MODELS[0];
}
export function setModel(model) {
  store.setItem(LS_MODEL, MODELS.includes(model) ? model : MODELS[0]);
}
export function enginePref() {
  const v = store.getItem(LS_ENGINE);
  return ['auto', 'rules', 'qwen'].includes(v) ? v : 'auto';
}
export function setEnginePref(v) {
  store.setItem(LS_ENGINE, ['auto', 'rules', 'qwen'].includes(v) ? v : 'auto');
}

let serverState = { checked: false, ok: false, llm: false };

export function serverInfo() {
  return serverState;
}

// 探测函数是否存在且已配置 key；404 / 返回 HTML 都视为不存在
export async function probeHealth(base = FN_BASE, timeout = 4000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const res = await fetch(`${base}/health`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(timer);
    if (!res.ok) throw new Error('unavailable');
    const text = await res.text();
    const data = JSON.parse(text);
    serverState = { checked: true, ok: !!data.ok, llm: !!data.llm };
  } catch {
    serverState = { checked: true, ok: false, llm: false };
  }
  return serverState;
}

export function llmAvailable() {
  return Boolean((serverState.ok && serverState.llm) || getKey());
}

function extractContent(payload) {
  const choice = payload && payload.choices && payload.choices[0];
  const msg = choice && (choice.message || choice.delta);
  const content = msg && typeof msg.content === 'string' ? msg.content : '';
  if (!content) {
    const err = new Error('empty_llm_response');
    throw err;
  }
  return content;
}

async function postJson(url, body, timeout, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const err = new Error(`llm_http_${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// 统一入口：有服务器函数则走函数，否则用本地 key 直连
export async function chat(messages, opts = {}) {
  const model = opts.model || getModel();
  if (!MODELS.includes(model)) throw new Error('model_not_allowed');
  if (serverState.ok && serverState.llm && !opts.forceDirect) {
    try {
      const payload = await postJson(`${FN_BASE}/llm`, { messages, model }, 50000);
      if (payload && payload.ok === false) throw new Error(payload.error || 'llm_failed');
      return extractContent(payload);
    } catch (err) {
      if (!getKey()) throw err;
      // 有本地 key 时继续回落直连
    }
  }
  const key = getKey();
  if (!key) throw new Error('no_llm_channel');
  const payload = await postJson(
    DASHSCOPE_URL,
    { model, messages, temperature: 0.2, ...(opts.json ? { response_format: { type: 'json_object' } } : {}) },
    50000,
    { Authorization: `Bearer ${key}` }
  );
  return extractContent(payload);
}

function parseJsonBlock(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('llm_json_parse');
  return JSON.parse(body.slice(start, end + 1));
}

export async function llmExpandQueries(input, mode) {
  const messages = [
    {
      role: 'system',
      content: '你是学术文献检索助手。把用户的研究' + (mode === 'problem' ? '问题' : '想法') +
        '翻译成 3-5 条用于检索英文文献论文的检索式。每条 3-7 个英文词，只用通用学术表达，不要编号、不要解释，每行一条。'
    },
    { role: 'user', content: input }
  ];
  const text = await chat(messages, { model: getModel() });
  const lines = String(text)
    .split('\n')
    .map((l) => l.replace(/^[-*\d.、\s]+/, '').trim())
    .filter((l) => l.length > 3 && /[a-zA-Z]{3}/.test(l));
  const queries = Array.from(new Set(lines)).slice(0, 5);
  if (!queries.length) throw new Error('llm_no_queries');
  return queries;
}

const FIELD_KEYS = ['question', 'method', 'dataset', 'metric', 'result', 'limitation', 'relation'];
const RELEVANCE_KEYS = ['high', 'mid', 'low'];

function brief(p) {
  return {
    n: p.n,
    title: p.title,
    year: p.year,
    abstract: String(p.abstract || '').slice(0, 900)
  };
}

export function buildAnalyzePrompt({ mode, input, queries, papers }) {
  const schema = JSON.stringify({
    papers: [{ n: 1, relevance: 'high|mid|low', fields: Object.fromEntries(FIELD_KEYS.map((k) => [k, ''])) }],
    clusters: [{ name: '', summary: '', papers: [1] }],
    gaps: [{ title: '', detail: '引用 [1][2]', papers: [1, 2] }],
    approaches: [{ name: '', summary: '', papers: [1], effect: '', limits: '' }]
  });
  const system = [
    '你是严谨的文献综述助手。只依据给出的论文标题与摘要作答，禁止编造摘要中没有的信息。',
    '任何字段在摘要中找不到依据时，必须逐字填写「' + MISSING + '」。',
    '用简体中文填写；数据集名、指标名、模型名等原文专有名词保留英文。',
    'relation 字段说明该论文与用户' + (mode === 'problem' ? '问题' : '想法') + '的关系（相同点/差异点）。',
    '每篇论文另给 relevance：high=直接相关、mid=同路线可参考、low=仅背景。',
    'clusters 为 3-5 个方法簇；gaps 为 2-4 条空白点，每条 detail 里用 [编号] 引用具体论文，papers 数组同步这些编号。',
    'approaches 仅在 mode=problem 时需要：按解决思路分组，每组 2-4 篇，effect 为摘要中报告的效果，limits 为摘要中的局限。',
    '只输出一个 JSON 对象，结构为：' + schema
  ].join('\n');
  const user = JSON.stringify({
    mode,
    input,
    queries,
    papers: papers.map(brief)
  });
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// 一次请求完成抽取 + 聚类 + 空白点
export async function llmAnalyze(ctx) {
  const messages = buildAnalyzePrompt(ctx);
  const text = await chat(messages, { json: true });
  const data = parseJsonBlock(text);
  const byN = new Map(ctx.papers.map((p) => [p.n, p]));
  const papers = ctx.papers.map((p) => {
    const hit = (data.papers || []).find((x) => Number(x.n) === p.n) || {};
    const fields = hit.fields || {};
    const rel = String(hit.relevance || '').toLowerCase();
    return {
      ...p,
      relevance: RELEVANCE_KEYS.includes(rel) ? rel : undefined,
      fields: Object.fromEntries(FIELD_KEYS.map((k) => {
        const v = String(fields[k] || '').trim();
        return [k, v || MISSING];
      }))
    };
  });
  const numbersValid = (list) => (Array.isArray(list) ? list.map(Number).filter((n) => byN.has(n)) : []);
  const clusters = (data.clusters || []).slice(0, 5).map((c) => ({
    name: String(c.name || '').trim() || '未命名方法簇',
    summary: String(c.summary || '').trim(),
    papers: numbersValid(c.papers)
  })).filter((c) => c.papers.length);
  const gaps = (data.gaps || []).slice(0, 4).map((g) => ({
    title: String(g.title || '').trim() || '空白点',
    detail: String(g.detail || '').trim(),
    papers: numbersValid(g.papers)
  }));
  const approaches = (data.approaches || []).slice(0, 5).map((a) => ({
    name: String(a.name || '').trim() || '未命名思路',
    summary: String(a.summary || '').trim(),
    papers: numbersValid(a.papers),
    effect: String(a.effect || '').trim() || MISSING,
    limits: String(a.limits || '').trim() || MISSING
  })).filter((a) => a.papers.length);
  return { papers, clusters, gaps, approaches };
}
