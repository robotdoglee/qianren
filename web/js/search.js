// 三源并行检索 + 摘要还原 + 去重 + 相关度排序（纯逻辑，不碰 DOM；fetch 在浏览器/Node 均可用）
import { keywords } from './terms.js';

export const SOURCE_LABELS = {
  openalex: 'OpenAlex',
  arxiv: 'arXiv',
  s2: 'Semantic Scholar'
};

export const SELECT = 'id,doi,title,publication_year,authorships,primary_location,abstract_inverted_index,cited_by_count,relevance_score';
export const S2_FIELDS = 'title,abstract,year,authors,venue,externalIds,url,citationCount';
export const FN_BASE = '/functions/v1/app';
export const MAX_N = 25;

const clampN = (n) => Math.max(1, Math.min(MAX_N, Number(n) || 0) || 15);

export function openalexUrl(q, n = 15) {
  return `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=${clampN(n)}&select=${SELECT}`;
}

export function s2Url(q, n = 15) {
  return `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${clampN(n)}&fields=${S2_FIELDS}`;
}

export function arxivUrl(q) {
  return `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&max_results=10`;
}

// 同源函数代理地址；arXiv 无 CORS，只能走代理
export function proxyUrl(source, q, base = FN_BASE, n = null) {
  const params = new URLSearchParams({ q });
  if (source !== 'arxiv' && n) params.set('n', String(clampN(n)));
  return `${base}/${source}?${params.toString()}`;
}

export function describeError(err) {
  if (!err) return 'failed';
  if (err.rateLimited || err.status === 429) return 'rate_limited';
  if (err.name === 'AbortError') return 'timeout';
  if (err.status) return `http_${err.status}`;
  return String(err.message || err).slice(0, 60);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 单次请求：不抛异常，统一返回 {ok, data|text, error}
export async function attempt(url, timeout = 12000, kind = 'json') {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: kind === 'json' ? { Accept: 'application/json' } : {} });
    if (res.status === 429) return { ok: false, error: 'rate_limited', retryable: true };
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    if (kind === 'json') return { ok: true, data: await res.json() };
    const text = await res.text();
    // 代理不存在时静态托管常回落到 index.html
    if (/^\s*(<!doctype html|<html)/i.test(text)) return { ok: false, error: 'html_response' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function directUrlFor(name, q, n) {
  if (name === 'openalex') return openalexUrl(q, n);
  if (name === 's2') return s2Url(q, n);
  return arxivUrl(q);
}

// 取数顺序：直连 → 同源代理 → 直连退避重试一次；proxyOnly（arXiv）只走代理
export async function fetchSource(name, q, opts = {}) {
  const { timeout = 12000, proxyBase = FN_BASE, allowProxy = true, proxyOnly = false, n = null, retryDelay = 1600 } = opts;
  const kind = name === 'arxiv' ? 'text' : 'json';
  const steps = [];
  if (!proxyOnly) steps.push({ url: directUrlFor(name, q, n), via: 'direct' });
  if (allowProxy) steps.push({ url: proxyUrl(name, q, proxyBase, n), via: 'proxy' });
  if (!proxyOnly) steps.push({ url: directUrlFor(name, q, n), via: 'direct', delay: retryDelay });

  let last = { ok: false, error: 'proxy_required', via: 'none' };
  for (const step of steps) {
    if (step.delay) await sleep(step.delay);
    const r = await attempt(step.url, timeout, kind);
    if (r.ok) return { ...r, via: step.via };
    last = { ...r, via: step.via };
  }
  return last;
}

// OpenAlex 的 abstract_inverted_index → 正常语序摘要
export function restoreAbstract(inv) {
  if (!inv || typeof inv !== 'object') return '';
  const pairs = [];
  for (const [word, positions] of Object.entries(inv)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) pairs.push([p, word]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  const seen = new Set();
  const out = [];
  for (const [, word] of pairs) {
    const key = `${out.length}:${word}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

function joinAuthors(list) {
  return (list || []).map((a) => (typeof a === 'string' ? a : a && a.name)).filter(Boolean).slice(0, 12);
}

export function fromOpenAlex(w) {
  const authors = (w.authorships || []).map((a) => a && a.author && a.author.display_name).filter(Boolean).slice(0, 12);
  const doi = w.doi ? String(w.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') : '';
  const url = w.id || (doi ? `https://doi.org/${doi}` : '');
  const venue = (w.primary_location && w.primary_location.source && w.primary_location.source.display_name) || '';
  return {
    title: (w.title || w.display_name || '').trim(),
    authors,
    year: w.publication_year || null,
    venue,
    url,
    doi,
    arxiv: '',
    sources: ['openalex'],
    citations: w.cited_by_count || 0,
    abstract: restoreAbstract(w.abstract_inverted_index),
    apiScore: w.relevance_score || 0
  };
}

export function fromS2(p) {
  const ids = p.externalIds || {};
  const doi = p.DOI || ids.DOI || '';
  const arxiv = ids.ArXiv || '';
  const url = p.url || (doi ? `https://doi.org/${doi}` : arxiv ? `https://arxiv.org/abs/${arxiv}` : '');
  return {
    title: (p.title || '').trim(),
    authors: joinAuthors(p.authors),
    year: p.year || null,
    venue: p.venue || '',
    url,
    doi: doi ? String(doi).toLowerCase() : '',
    arxiv,
    sources: ['s2'],
    citations: p.citationCount || 0,
    abstract: (p.abstract || '').trim(),
    apiScore: 0
  };
}

export function fromArxivEntry(e) {
  const rawId = (e.id || '').split('/abs/').pop() || '';
  const arxiv = rawId.replace(/v\d+$/, '');
  return {
    title: (e.title || '').replace(/\s+/g, ' ').trim(),
    authors: (e.authors || []).slice(0, 12),
    year: e.published ? Number(String(e.published).slice(0, 4)) || null : null,
    venue: 'arXiv',
    url: e.id || (arxiv ? `https://arxiv.org/abs/${arxiv}` : ''),
    doi: e.doi || '',
    arxiv,
    sources: ['arxiv'],
    citations: 0,
    abstract: (e.summary || '').replace(/\s+/g, ' ').trim(),
    apiScore: 0
  };
}

// Atom XML → 条目数组（浏览器用 DOMParser；异常时退回轻量正则解析）
export function parseAtom(xmlText) {
  const text = String(xmlText || '');
  if (typeof DOMParser !== 'undefined') {
    try {
      // application/atom+xml 并非 DOMParser 支持的类型，按 XML 解析
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (!doc.querySelector('parsererror')) {
        const entries = Array.from(doc.getElementsByTagName('entry'));
        return entries.map((entry) => {
          const get = (tag) => {
            const nodes = entry.getElementsByTagName(tag);
            return nodes.length ? nodes[0].textContent : '';
          };
          const authors = Array.from(entry.getElementsByTagName('author'))
            .map((a) => {
              const n = a.getElementsByTagName('name');
              return n.length ? n[0].textContent.trim() : '';
            })
            .filter(Boolean);
          return {
            id: get('id').trim(),
            title: get('title'),
            summary: get('summary'),
            published: get('published'),
            doi: get('arxiv:doi'),
            authors
          };
        });
      }
    } catch {
      // 落到下面的兜底解析
    }
  }
  return parseAtomFallback(text);
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseAtomFallback(text) {
  return (text.match(/<entry[\s\S]*?<\/entry>/g) || []).map((block) => {
    const pick = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? decodeEntities(m[1]).trim() : '';
    };
    return {
      id: pick('id'),
      title: pick('title'),
      summary: pick('summary'),
      published: pick('published'),
      doi: '',
      authors: (block.match(/<name>([\s\S]*?)<\/name>/g) || [])
        .map((n) => decodeEntities(n.replace(/<\/?name>/g, '')).trim())
        .filter(Boolean)
    };
  });
}

export function titleKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, 120);
}

export function normArxiv(id) {
  return String(id || '').trim().toLowerCase().replace(/^arxiv:/, '').replace(/v\d+$/, '');
}

function betterPaper(a, b) {
  if ((b.abstract || '').length !== (a.abstract || '').length) {
    return (b.abstract || '').length > (a.abstract || '').length ? b : a;
  }
  return (b.citations || 0) > (a.citations || 0) ? b : a;
}

export function mergeTwo(a, b) {
  const base = betterPaper(a, b);
  const merged = { ...base };
  merged.title = base.title || a.title || b.title;
  merged.url = base.url || a.url || b.url;
  merged.doi = a.doi || b.doi || '';
  merged.arxiv = a.arxiv || b.arxiv || '';
  merged.venue = base.venue || a.venue || b.venue;
  merged.year = base.year || a.year || b.year || null;
  merged.citations = Math.max(a.citations || 0, b.citations || 0);
  merged.apiScore = Math.max(a.apiScore || 0, b.apiScore || 0);
  if ((merged.authors || []).length < 2) merged.authors = (a.authors && a.authors.length ? a.authors : b.authors) || [];
  merged.sources = Array.from(new Set([...(a.sources || []), ...(b.sources || [])]));
  return merged;
}

// DOI → arXiv ID → 规范化标题
export function dedupe(papers) {
  const byKey = new Map();
  const result = [];
  const put = (key, paper) => {
    const prev = byKey.get(key);
    if (prev) {
      const merged = mergeTwo(prev, paper);
      byKey.set(key, merged);
      result[result.indexOf(prev)] = merged;
    } else {
      byKey.set(key, paper);
      result.push(paper);
    }
  };
  for (const raw of papers) {
    const paper = { ...raw, sources: raw.sources ? [...raw.sources] : ['unknown'] };
    const doi = (paper.doi || '').trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    const ax = normArxiv(paper.arxiv);
    const tk = titleKey(paper.title);
    if (doi) put(`doi:${doi}`, paper);
    else if (ax) put(`arxiv:${ax}`, paper);
    else if (tk) put(`title:${tk}`, paper);
  }
  return result.map((p, i) => ({ ...p, n: i + 1, id: paperId(p) }));
}

export function paperId(p) {
  const doi = (p.doi || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (doi) return `doi:${doi.toLowerCase()}`;
  if (p.arxiv) return `arxiv:${normArxiv(p.arxiv)}`;
  return `title:${titleKey(p.title)}`;
}

function docTokens(paper) {
  const title = `${paper.title || ''} ${paper.title || ''}`;
  return `${title} ${paper.abstract || ''} ${paper.venue || ''}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+@.\- ]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function phraseCount(haystack, phrase) {
  if (!phrase) return 0;
  let count = 0;
  let idx = haystack.indexOf(phrase);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(phrase, idx + phrase.length);
  }
  return count;
}

// BM25 风格相关度 + 引用小幅加成 + 多源加成；无摘要降权
export function rank(papers, terms, opts = {}) {
  const k1 = 1.5;
  const b = 0.75;
  const queryTerms = (terms || []).map((t) => String(t).toLowerCase()).filter(Boolean);
  const docs = papers.map((p) => ({ paper: p, tokens: docTokens(p), text: docTokens(p).join(' '), titleText: `${p.title || ''}`.toLowerCase() }));
  const avgLen = docs.reduce((s, d) => s + d.tokens.length, 0) / Math.max(1, docs.length) || 1;
  const df = new Map();
  for (const d of docs) {
    for (const t of new Set(d.tokens)) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = docs.length || 1;
  for (const d of docs) {
    let rel = 0;
    const tf = new Map();
    for (const t of d.tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const q of queryTerms) {
      const f = tf.get(q) || 0;
      if (f > 0) {
        const idf = Math.log(1 + (N - (df.get(q) || 0) + 0.5) / ((df.get(q) || 0) + 0.5));
        rel += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.tokens.length / avgLen))));
      }
      const phrase = phraseCount(d.text, q);
      if (phrase > 0 && q.includes(' ')) rel += 1.2 * Math.log(1 + phrase);
      if (q.includes(' ') && d.titleText.includes(q)) rel += 2;
    }
    const srcCount = (d.paper.sources || []).length;
    const cit = d.paper.citations || 0;
    let score = rel + 0.1 * Math.log(cit + 1) + 0.5 * (srcCount - 1);
    if (!(d.paper.abstract || '').trim()) score *= 0.6;
    d.paper.score = Number(Math.max(0, score).toFixed(3));
    d.paper.matchedTerms = queryTerms.filter((q) => d.text.includes(q) || d.titleText.includes(q));
  }
  const sorted = docs.map((d) => d.paper).sort((a, b2) => b2.score - a.score);
  const kept = Number(opts.keep || 15);
  const minKeep = Number(opts.minKeep || 10);
  const cut = Math.max(minKeep, Math.min(kept, sorted.length));
  return sorted.slice(0, cut).map((p, i) => ({ ...p, n: i + 1 }));
}

export function queryTermsFor(input) {
  return keywords(input).terms;
}

// queries: 3–5 条检索式；每个源取前两条以控制请求量。arXiv 无 CORS，只走同源代理。
export async function searchAll(queries, opts = {}) {
  const { timeout = 12000, proxyBase = FN_BASE, allowProxy = true, onSource = () => {} } = opts;
  const qs = (queries || []).filter(Boolean);
  const perSource = qs.slice(0, 2);
  const buckets = { openalex: [], arxiv: [], s2: [] };
  const status = {
    openalex: { state: 'running', count: 0, note: '', via: '' },
    arxiv: { state: 'running', count: 0, note: '', via: '' },
    s2: { state: 'running', count: 0, note: '', via: '' }
  };
  const report = (name) => onSource(name, status[name]);

  const runOne = async (name, q, extra) => {
    const r = await fetchSource(name, q, { timeout, proxyBase, allowProxy, ...extra });
    let ok = false;
    if (r.ok) {
      try {
        if (name === 'openalex') for (const w of (r.data && r.data.results) || []) buckets.openalex.push(fromOpenAlex(w));
        else if (name === 's2') for (const p of (r.data && r.data.data) || []) buckets.s2.push(fromS2(p));
        else for (const e of parseAtom(r.text)) buckets.arxiv.push(fromArxivEntry(e));
        ok = true;
      } catch {
        r.error = 'parse_error';
      }
    }
    const count = buckets[name].length;
    // arXiv 只能经同源代理：代理缺失/404/HTML/网络错一律按「需代理，已跳过」呈现
    const needProxy = r.error === 'proxy_required' || (name === 'arxiv' && r.error !== 'rate_limited');
    if (ok) status[name] = { state: 'done', count, note: '', via: r.via || '' };
    else if (count > 0) status[name] = { state: 'done', count, note: '', via: status[name].via || '' };
    else if (needProxy) status[name] = { state: 'skipped', count: 0, note: 'proxy_required', via: r.via || 'none' };
    else status[name] = { state: 'failed', count: 0, note: r.error || 'failed', via: r.via || '' };
    report(name);
  };

  const tasks = [];
  for (const q of perSource) {
    tasks.push(runOne('openalex', q, { n: 15 }));
    tasks.push(runOne('s2', q, { n: 15 }));
  }
  const aq = perSource[perSource.length - 1] || qs[0] || '';
  tasks.push(runOne('arxiv', aq, { proxyOnly: true }));

  await Promise.all(tasks);
  const raw = [...buckets.openalex, ...buckets.arxiv, ...buckets.s2];
  return {
    raw,
    counts: { openalex: buckets.openalex.length, arxiv: buckets.arxiv.length, s2: buckets.s2.length },
    status
  };
}
