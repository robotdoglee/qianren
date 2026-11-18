// v2.3 论文之外：书籍、百科、代码、模型、问答、博客的免费 API。
// 这里只做 URL 构造、响应解析、触发判断与并发抓取；DOM 渲染在 render.js。
import { relevanceOf } from './derive.js';

export const FN_BASE = '/functions/v1/app';
export const BEYOND_LIMIT = 4;
export const HIGH_RELEVANCE_MIN = 3;

export const RESOURCE_TYPES = {
  book: '书',
  wiki: '百科',
  code: '代码',
  model: '模型',
  qa: '问答',
  blog: '博客'
};

export const TYPE_ORDER = ['book', 'wiki', 'code', 'model', 'qa', 'blog'];

export const BEYOND_SOURCES = {
  openlibrary: { label: 'Open Library', type: 'book' },
  gbooks: { label: 'Google Books', type: 'book' },
  wikipedia_zh: { label: '中文维基百科', type: 'wiki' },
  wikipedia_en: { label: 'English Wikipedia', type: 'wiki' },
  github: { label: 'GitHub', type: 'code', proxy: true },
  hf_models: { label: 'Hugging Face 模型', type: 'model' },
  hf_datasets: { label: 'Hugging Face 数据集', type: 'model' },
  stackexchange: { label: 'Stack Exchange', type: 'qa' },
  hn: { label: 'Hacker News', type: 'qa' },
  devto: { label: 'dev.to', type: 'blog' }
};

const clip = (s, n) => {
  const text = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
};

function decodeEntities(text) {
  return String(text || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function plain(text, n = 240) {
  return clip(decodeEntities(String(text || '').replace(/<[^>]*>/g, ' ')), n);
}

function yearOf(value) {
  const m = String(value || '').match(/(1[5-9]\d{2}|20\d{2}|21\d{2})/);
  return m ? Number(m[1]) : null;
}

function queryFor(queries, input) {
  const list = Array.isArray(queries) ? queries : [];
  return clip(list.find((q) => /[a-zA-Z]{3}/.test(q)) || list[0] || input || '', 120);
}

function wikiLangQuery(queries, input) {
  return clip(/[\u4e00-\u9fff]/.test(input || '') ? input : queryFor(queries, input), 120);
}

export function devtoTag(query) {
  const word = String(query || '').match(/[A-Za-z][A-Za-z0-9]{2,}/);
  return word ? word[0].toLowerCase() : '';
}

export function beyondUrl(source, query, { proxyBase = FN_BASE, lang = 'en' } = {}) {
  const q = encodeURIComponent(clip(query, 120));
  switch (source) {
    case 'openlibrary':
      return `https://openlibrary.org/search.json?q=${q}&limit=${BEYOND_LIMIT}&fields=key,title,author_name,first_publish_year,edition_count,subject`;
    case 'gbooks':
      return `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=${BEYOND_LIMIT}&printType=books`;
    case 'wikipedia_zh':
      return `https://zh.wikipedia.org/w/rest.php/v1/search/page?q=${q}&limit=${BEYOND_LIMIT}`;
    case 'wikipedia_en':
      return `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${q}&limit=${BEYOND_LIMIT}`;
    case 'github':
      return `${proxyBase}/beyond?source=github&q=${q}&n=${BEYOND_LIMIT}`;
    case 'hf_models':
      return `https://huggingface.co/api/models?search=${q}&limit=${BEYOND_LIMIT}&sort=downloads&direction=-1`;
    case 'hf_datasets':
      return `https://huggingface.co/api/datasets?search=${q}&limit=${BEYOND_LIMIT}&sort=downloads&direction=-1`;
    case 'stackexchange':
      return `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${q}&site=stackoverflow&pagesize=${BEYOND_LIMIT}`;
    case 'hn':
      return `https://hn.algolia.com/api/v1/search?query=${q}&tags=story&hitsPerPage=${BEYOND_LIMIT}`;
    case 'devto': {
      const tag = devtoTag(query);
      return tag ? `https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&top=30&per_page=${BEYOND_LIMIT}` : '';
    }
    default:
      return '';
  }
}

/* ---------------- 解析：只取标题、链接、片段、元信息 ---------------- */

function item(source, title, url, snippet, meta = '') {
  const metaInfo = BEYOND_SOURCES[source];
  if (!metaInfo) return null;
  const href = String(url || '').trim();
  return {
    source,
    type: metaInfo.type,
    typeLabel: RESOURCE_TYPES[metaInfo.type],
    sourceLabel: metaInfo.label,
    title: clip(title, 220),
    url: /^https?:\/\//i.test(href) ? href : '',
    snippet: plain(snippet, 240),
    meta: clip(meta, 80)
  };
}

export function parseOpenLibrary(payload) {
  return (payload?.docs || []).map((d) => item(
    'openlibrary',
    d.title,
    d.key ? `https://openlibrary.org${d.key}` : '',
    Array.isArray(d.subject) ? d.subject.slice(0, 6).join(' · ') : '',
    [d.first_publish_year || '年份未知', d.edition_count ? `${d.edition_count} 个版本` : ''].filter(Boolean).join(' · ')
  )).filter((x) => x && x.title && x.url);
}

export function parseGoogleBooks(payload) {
  return (payload?.items || []).map((x) => {
    const v = x.volumeInfo || {};
    return item(
      'gbooks', v.title, v.infoLink || v.canonicalVolumeLink || '',
      v.description || (v.categories || []).join(' · '),
      [yearOf(v.publishedDate) || '年份未知', (v.authors || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ')
    );
  }).filter((x) => x && x.title && x.url);
}

export function parseWikipedia(payload, lang = 'zh') {
  const base = lang === 'zh' ? 'https://zh.wikipedia.org/wiki/' : 'https://en.wikipedia.org/wiki/';
  return (payload?.pages || []).map((p) => item(
    lang === 'zh' ? 'wikipedia_zh' : 'wikipedia_en',
    p.title,
    `${base}${encodeURIComponent(p.key || p.title || '')}`,
    p.excerpt || p.description || '',
    lang === 'zh' ? '中文维基百科 · 未经同行评审' : 'English Wikipedia · 未经同行评审'
  )).filter((x) => x && x.title && x.url);
}

export function parseGitHub(payload) {
  return (payload?.items || []).map((r) => item(
    'github', r.full_name, r.html_url, r.description || (r.topics || []).join(' · '),
    [r.stargazers_count ? `★ ${r.stargazers_count}` : '', r.language || ''].filter(Boolean).join(' · ')
  )).filter((x) => x && x.title && x.url);
}

function parseHf(payload, source) {
  return (Array.isArray(payload) ? payload : []).map((m) => {
    const id = m.id || m.modelId || '';
    const url = source === 'hf_datasets' ? `https://huggingface.co/datasets/${id}` : `https://huggingface.co/${id}`;
    return item(
      source, id, id ? url : '', (m.tags || []).slice(0, 6).join(' · '),
      [`↓ ${m.downloads ?? 0}`, `♥ ${m.likes ?? 0}`, m.pipeline_tag || ''].filter(Boolean).join(' · ')
    );
  }).filter((x) => x && x.title && x.url);
}

export const parseHuggingFaceModels = (payload) => parseHf(payload, 'hf_models');
export const parseHuggingFaceDatasets = (payload) => parseHf(payload, 'hf_datasets');

export function parseStackExchange(payload) {
  return (payload?.items || []).map((q) => item(
    'stackexchange', plain(q.title, 220), q.link, (q.tags || []).join(' · '),
    [`${q.score ?? 0} 分`, `${q.answer_count ?? 0} 个回答`, q.is_answered ? '已有采纳答案' : ''].filter(Boolean).join(' · ')
  )).filter((x) => x && x.title && x.url);
}

export function parseHackerNews(payload) {
  return (payload?.hits || []).map((h) => item(
    'hn', h.title, h.url || (h.objectID ? `https://news.ycombinator.com/item?id=${h.objectID}` : ''),
    h.story_text || h.comment_text || '',
    [`${h.points ?? 0} 分`, `${h.num_comments ?? 0} 条讨论`].join(' · ')
  )).filter((x) => x && x.title && x.url);
}

export function parseDevTo(payload) {
  return (Array.isArray(payload) ? payload : []).map((a) => item(
    'devto', a.title, a.url, a.description || '',
    [`♥ ${a.positive_reactions_count ?? 0}`, (a.tag_list || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ')
  )).filter((x) => x && x.title && x.url);
}

export function parseBeyond(source, payload) {
  switch (source) {
    case 'openlibrary': return parseOpenLibrary(payload);
    case 'gbooks': return parseGoogleBooks(payload);
    case 'wikipedia_zh': return parseWikipedia(payload, 'zh');
    case 'wikipedia_en': return parseWikipedia(payload, 'en');
    case 'github': return parseGitHub(payload);
    case 'hf_models': return parseHuggingFaceModels(payload);
    case 'hf_datasets': return parseHuggingFaceDatasets(payload);
    case 'stackexchange': return parseStackExchange(payload);
    case 'hn': return parseHackerNews(payload);
    case 'devto': return parseDevTo(payload);
    default: return [];
  }
}

/* ---------------- 触发、抓取、分组 ---------------- */

export function highRelevanceCount(papers) {
  return (papers || []).filter((p) => relevanceOf(p) === 'high').length;
}

export function shouldExpandBeyond(papers) {
  return highRelevanceCount(papers) < HIGH_RELEVANCE_MIN;
}

export function beyondJobs({ input, queries, allowProxy = false, proxyBase = FN_BASE } = {}) {
  const en = queryFor(queries, input);
  const zh = wikiLangQuery(queries, input);
  const jobs = Object.keys(BEYOND_SOURCES).map((source) => ({
    source,
    url: beyondUrl(source, source === 'wikipedia_zh' ? zh : en, { proxyBase })
  }));
  return jobs.filter((job) => job.url && (allowProxy || !BEYOND_SOURCES[job.source].proxy));
}

function resourceKey(r) {
  return String(r.url || '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
}

export function assignResourceIds(resources) {
  const seen = new Set();
  const out = [];
  for (const r of resources || []) {
    const key = resourceKey(r) || `${r.source}|${String(r.title).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, rid: `R${out.length + 1}` });
  }
  return out;
}

export function groupResources(resources) {
  const groups = new Map();
  for (const r of resources || []) {
    if (!groups.has(r.type)) groups.set(r.type, []);
    groups.get(r.type).push(r);
  }
  return TYPE_ORDER.filter((t) => groups.has(t)).map((type) => ({
    type,
    typeLabel: RESOURCE_TYPES[type],
    items: groups.get(type)
  }));
}

export async function fetchBeyond({
  input, queries, allowProxy = false, proxyBase = FN_BASE, timeout = 9000, fetchImpl = fetch
} = {}) {
  const jobs = beyondJobs({ input, queries, allowProxy, proxyBase });
  const status = {};
  const errors = [];
  for (const source of Object.keys(BEYOND_SOURCES)) {
    if (BEYOND_SOURCES[source].proxy && !allowProxy) {
      status[source] = { state: 'skipped', note: 'proxy_required' };
    }
  }
  for (const job of jobs) status[job.source] = { state: 'running' };

  const settled = await Promise.all(jobs.map(async (job) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetchImpl(job.url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const err = new Error(res.status === 429 ? 'rate_limited' : `http_${res.status}`);
        err.code = err.message;
        throw err;
      }
      const text = await res.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('parse_error');
      }
      const list = parseBeyond(job.source, payload);
      status[job.source] = { state: 'done', count: list.length };
      if (!list.length) status[job.source].note = 'empty';
      return list;
    } catch (err) {
      const note = err?.name === 'AbortError' ? 'timeout' : (err?.code || err?.message || 'failed');
      status[job.source] = { state: 'failed', note };
      errors.push({ source: job.source, label: BEYOND_SOURCES[job.source].label, note });
      return [];
    } finally {
      clearTimeout(timer);
    }
  }));

  const resources = assignResourceIds(settled.flat());
  return {
    resources,
    groups: groupResources(resources),
    status,
    errors,
    queries: { primary: queryFor(queries, input), wiki: wikiLangQuery(queries, input) },
    at: new Date().toISOString()
  };
}