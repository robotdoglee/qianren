// 多源并行检索 + 摘要还原 + 去重 + 相关度排序（纯逻辑，不碰 DOM；fetch 在浏览器/Node 均可用）
// 只调用官方开放 API：OpenAlex / Semantic Scholar / Crossref / Europe PMC / DBLP / arXiv / Unpaywall
import { keywords } from './terms.js';

export const SOURCE_LABELS = {
  openalex: 'OpenAlex',
  s2: 'Semantic Scholar',
  crossref: 'Crossref',
  europepmc: 'Europe PMC',
  dblp: 'DBLP',
  arxiv: 'arXiv'
};

export const SOURCE_ORDER = ['openalex', 's2', 'crossref', 'europepmc', 'dblp', 'arxiv'];
export const DEFAULT_SOURCES = ['openalex', 's2', 'crossref', 'arxiv'];
export const SELECT = 'id,ids,doi,title,publication_year,authorships,primary_location,abstract_inverted_index,cited_by_count,relevance_score';
export const S2_FIELDS = 'title,abstract,year,authors,venue,externalIds,url,citationCount';
export const FN_BASE = '/functions/v1/app';
export const MAX_N = 25;
export const SESSION_TTL_MS = 30 * 60 * 1000;

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

// Europe PMC 支持 CORS（Access-Control-Allow-Origin: *），浏览器可直连
export function europePmcUrl(q, n = 10) {
  return `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&format=json&resultType=core&pageSize=${clampN(n)}`;
}

// Crossref / DBLP / Unpaywall 统一走同源边缘函数
export function crossrefProxyUrl(q, base = FN_BASE, n = 10) {
  return `${base}/crossref?${new URLSearchParams({ q, n: String(clampN(n)) })}`;
}

export function dblpProxyUrl(q, base = FN_BASE, n = 10) {
  return `${base}/dblp?${new URLSearchParams({ q, n: String(clampN(n)) })}`;
}

export function unpaywallProxyUrl(dois, base = FN_BASE) {
  return `${base}/unpaywall?dois=${encodeURIComponent((dois || []).join(','))}`;
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
  // 浏览器的 TypeError: Failed to fetch / Load failed 一律归为不可达，界面不再出现英文
  if (err.name === 'TypeError') return 'unreachable';
  const msg = String(err.message || err);
  if (/failed to fetch|load failed|networkerror|fetch failed/i.test(msg)) return 'unreachable';
  return 'unreachable';
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
  if (name === 'europepmc') return europePmcUrl(q, n);
  if (name === 'crossref') return crossrefProxyUrl(q, FN_BASE, n);
  if (name === 'dblp') return dblpProxyUrl(q, FN_BASE, n);
  return arxivUrl(q);
}

// 取数顺序：直连 → 同源代理 → 直连退避重试一次
// proxyOnly（arXiv/Crossref/DBLP）只走代理；preferProxy（S2）先走函数，429 时浏览器直连没有 CORS 头
export async function fetchSource(name, q, opts = {}) {
  const {
    timeout = 12000, proxyBase = FN_BASE, allowProxy = true, proxyOnly = false,
    preferProxy = false, noProxy = false, n = null, retryDelay = 1600
  } = opts;
  const kind = name === 'arxiv' ? 'text' : 'json';
  const steps = [];
  const useProxy = allowProxy && !noProxy;
  const direct = () => ({ url: directUrlFor(name, q, n), via: 'direct' });
  const proxy = () => ({ url: proxyUrl(name, q, proxyBase, n), via: 'proxy' });
  if (proxyOnly) {
    if (useProxy) steps.push(proxy());
  } else if (preferProxy && useProxy) {
    steps.push(proxy(), direct());
    steps.push({ ...proxy(), delay: retryDelay });
    steps.push({ ...direct(), delay: retryDelay });
  } else {
    steps.push(direct());
    if (useProxy) steps.push(proxy());
    steps.push({ ...direct(), delay: retryDelay });
  }

  let last = { ok: false, error: proxyOnly ? 'proxy_required' : 'unreachable', via: 'none' };
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
  return (list || []).map((a) => (typeof a === 'string' ? a : a && (a.name || [a.given, a.family].filter(Boolean).join(' ')))).filter(Boolean).slice(0, 12);
}

export function normPmid(value) {
  const m = String(value == null ? '' : value).match(/(\d{1,9})/);
  return m ? m[1] : '';
}

function normDoi(value) {
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// Crossref 摘要为 JATS XML，Europe PMC 摘要含 <h4>/<p>；去掉标签并解码实体
export function stripJats(text) {
  return decodeEntities(String(text || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function fromOpenAlex(w) {
  const authors = (w.authorships || []).map((a) => a && a.author && a.author.display_name).filter(Boolean).slice(0, 12);
  const doi = normDoi(w.doi);
  const url = w.id || (doi ? `https://doi.org/${doi}` : '');
  const venue = (w.primary_location && w.primary_location.source && w.primary_location.source.display_name) || '';
  return {
    title: stripJats(w.title || w.display_name || ''),
    authors,
    year: w.publication_year || null,
    venue,
    venueSource: 'openalex',
    url,
    doi,
    arxiv: '',
    pmid: normPmid(w.ids && w.ids.pmid),
    oaUrl: '',
    sources: ['openalex'],
    citations: w.cited_by_count || 0,
    citationSource: 'openalex',
    abstract: restoreAbstract(w.abstract_inverted_index),
    apiScore: w.relevance_score || 0
  };
}

export function fromS2(p) {
  const ids = p.externalIds || {};
  const doi = normDoi(p.DOI || ids.DOI);
  const arxiv = ids.ArXiv || '';
  const pmid = normPmid(ids.PubMed || ids.PubMedCentral);
  const url = p.url || (doi ? `https://doi.org/${doi}` : arxiv ? `https://arxiv.org/abs/${arxiv}` : '');
  return {
    title: stripJats(p.title || ''),
    authors: joinAuthors(p.authors),
    year: p.year || null,
    venue: stripJats(p.venue || ''),
    venueSource: 's2',
    url,
    doi,
    arxiv,
    pmid,
    oaUrl: '',
    sources: ['s2'],
    citations: p.citationCount || 0,
    citationSource: 's2',
    abstract: stripJats(p.abstract || ''),
    apiScore: 0
  };
}

export function fromArxivEntry(e) {
  const rawId = (e.id || '').split('/abs/').pop() || '';
  const arxiv = rawId.replace(/v\d+$/, '');
  return {
    title: stripJats(e.title || ''),
    authors: (e.authors || []).slice(0, 12),
    year: e.published ? Number(String(e.published).slice(0, 4)) || null : null,
    venue: 'arXiv',
    venueSource: 'arxiv',
    url: e.id || (arxiv ? `https://arxiv.org/abs/${arxiv}` : ''),
    doi: normDoi(e.doi),
    arxiv,
    pmid: '',
    oaUrl: arxiv ? `https://arxiv.org/pdf/${arxiv}` : '',
    sources: ['arxiv'],
    citations: 0,
    citationSource: 'arxiv',
    abstract: stripJats(e.summary || ''),
    apiScore: 0
  };
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function crossrefYear(item) {
  for (const key of ['issued', 'published-print', 'published-online', 'published', 'created']) {
    const parts = item[key] && item[key]['date-parts'];
    const year = parts && parts[0] && Number(parts[0][0]);
    if (Number.isFinite(year) && year > 0) return year;
  }
  return null;
}

export function fromCrossref(item) {
  const doi = normDoi(item.DOI || item.URL);
  const titles = Array.isArray(item.title) ? item.title : [item.title];
  const containers = Array.isArray(item['container-title']) ? item['container-title'] : [item['container-title']];
  const authors = (item.author || [])
    .map((a) => (a && (a.name || [a.given, a.family].filter(Boolean).join(' '))) || '')
    .filter(Boolean);
  const allIds = [...(item['alternative-id'] || []), item.URL || ''];
  const pmid = normPmid(allIds.find((v) => /pubmed|pmid/i.test(String(v))) || '');
  return {
    title: stripJats(titles.find(Boolean) || ''),
    authors: authors.slice(0, 12),
    year: crossrefYear(item),
    venue: stripJats(containers.find(Boolean) || ''),
    venueSource: 'crossref',
    url: item.URL || (doi ? `https://doi.org/${doi}` : ''),
    doi,
    arxiv: '',
    pmid,
    oaUrl: '',
    sources: ['crossref'],
    citations: item['is-referenced-by-count'] || 0,
    citationSource: 'crossref',
    abstract: stripJats(item.abstract || ''),
    apiScore: 0
  };
}

export function fromEuropePmc(r) {
  const doi = normDoi(r.doi);
  const pmid = normPmid(r.pmid || r.id);
  const urls = ((r.fullTextUrlList && r.fullTextUrlList.fullTextUrl) || []);
  const oa = urls.find((u) => u && /open access|free/i.test(String(u.availability || '')) && u.url);
  const url = doi ? `https://doi.org/${doi}` : (r.source === 'MED' && pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : `https://europepmc.org/article/${r.source || 'MED'}/${r.id || pmid}`);
  return {
    title: stripJats(r.title || ''),
    authors: stripJats(r.authorString || '').split(/,\s*/).filter(Boolean).slice(0, 12),
    year: Number(r.pubYear) || (r.firstPublicationDate ? Number(String(r.firstPublicationDate).slice(0, 4)) : null) || null,
    venue: stripJats(r.journalTitle || ''),
    venueSource: 'europepmc',
    url,
    doi,
    arxiv: '',
    pmid,
    oaUrl: (oa && oa.url) || '',
    sources: ['europepmc'],
    citations: Number(r.citedByCount) || 0,
    citationSource: 'europepmc',
    abstract: stripJats(r.abstractText || ''),
    apiScore: 0
  };
}

export function fromDblp(hit) {
  const info = (hit && hit.info) || hit || {};
  const rawAuthors = info.authors && info.authors.author;
  const authors = (Array.isArray(rawAuthors) ? rawAuthors : rawAuthors ? [rawAuthors] : [])
    .map((a) => (typeof a === 'string' ? a : a && (a.text || a.name)))
    .filter(Boolean);
  const doi = normDoi(info.doi);
  const ee = first(info.ee);
  const url = ee || info.url || (doi ? `https://doi.org/${doi}` : '');
  return {
    title: stripJats(info.title || '').replace(/\.$/, ''),
    authors: authors.slice(0, 12),
    year: Number(info.year) || null,
    venue: stripJats(info.venue || ''),
    venueSource: 'dblp',
    url,
    doi,
    arxiv: '',
    pmid: '',
    oaUrl: '',
    sources: ['dblp'],
    citations: 0,
    citationSource: '',
    abstract: '',
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

const VENUE_RANK = { crossref: 3, dblp: 3, europepmc: 2, openalex: 1, s2: 1, arxiv: 0 };

function sourceList(p) {
  return Array.isArray(p.sources) && p.sources.length ? p.sources : ['unknown'];
}

// 字段合并：摘要取最长；引用取最大并记录来源；venue 优先 Crossref/DBLP；oaUrl 取任一
export function mergeTwo(a, b) {
  const abstract = String(b.abstract || '').length > String(a.abstract || '').length ? b.abstract : a.abstract;
  const citations = Math.max(a.citations || 0, b.citations || 0);
  const citationWins = citations > (a.citations || 0) ? b : a;
  const aVenueRank = VENUE_RANK[a.venueSource] ?? VENUE_RANK[sourceList(a)[0]] ?? 0;
  const bVenueRank = VENUE_RANK[b.venueSource] ?? VENUE_RANK[sourceList(b)[0]] ?? 0;
  const venueWins = b.venue && (!a.venue || bVenueRank > aVenueRank) ? b : a;
  const base = String(a.abstract || '').length >= String(b.abstract || '').length ? a : b;
  const merged = { ...base };
  merged.title = a.title || b.title || '';
  merged.authors = ((a.authors || []).length >= (b.authors || []).length ? a.authors : b.authors) || [];
  merged.year = a.year || b.year || null;
  merged.venue = venueWins.venue || '';
  merged.venueSource = venueWins.venueSource || venueWins.sources?.[0] || '';
  merged.url = a.url || b.url || '';
  merged.doi = normDoi(a.doi) || normDoi(b.doi);
  merged.arxiv = normArxiv(a.arxiv) || normArxiv(b.arxiv);
  merged.pmid = a.pmid || b.pmid || '';
  merged.oaUrl = a.oaUrl || b.oaUrl || '';
  merged.abstract = abstract || '';
  merged.citations = citations;
  merged.citationSource = citationWins.citationSource || citationWins.sources?.[0] || a.citationSource || '';
  merged.apiScore = Math.max(a.apiScore || 0, b.apiScore || 0);
  merged.sources = Array.from(new Set([...sourceList(a), ...sourceList(b)]));
  return merged;
}

function yearsCompatible(a, b) {
  const ya = Number(a.year) || 0;
  const yb = Number(b.year) || 0;
  return !ya || !yb || Math.abs(ya - yb) <= 1;
}

// 去重：DOI（小写）→ arXiv id → PMID → 规范化标题 + 年份 ±1
// 用并查集把同一篇论文在各来源的不同标识串起来，再按首次出现顺序合并
export function dedupe(papers) {
  const list = (papers || []).map((raw) => ({ ...raw, sources: [...sourceList(raw)] }));
  const parent = list.map((_, i) => i);
  const find = (i) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== i) { const next = parent[i]; parent[i] = root; i = next; }
    return root;
  };
  const union = (i, j) => {
    const a = find(i);
    const b = find(j);
    if (a === b) return;
    // 让较小下标做根，保持首次出现顺序
    if (a < b) parent[b] = a;
    else parent[a] = b;
  };

  const mark = (map, key, i) => {
    if (!key) return;
    if (map.has(key)) union(map.get(key), i);
    else map.set(key, i);
  };
  const byDoi = new Map();
  const byArxiv = new Map();
  const byPmid = new Map();
  const byTitle = new Map();
  list.forEach((p, i) => {
    mark(byDoi, normDoi(p.doi) && `doi:${normDoi(p.doi)}`, i);
    mark(byArxiv, normArxiv(p.arxiv) && `arxiv:${normArxiv(p.arxiv)}`, i);
    mark(byPmid, p.pmid && `pmid:${p.pmid}`, i);
    const tk = titleKey(p.title);
    if (tk) {
      // 同标题只有年份相差 ≤1 才合并，避免把不同版本的文献误并
      const group = byTitle.get(tk) || [];
      for (const j of group) if (yearsCompatible(list[j], p)) union(j, i);
      group.push(i);
      byTitle.set(tk, group);
    }
  });

  const groups = new Map();
  list.forEach((p, i) => {
    const root = find(i);
    if (groups.has(root)) groups.set(root, mergeTwo(groups.get(root), p));
    else groups.set(root, p);
  });
  return Array.from(groups.values()).map((p, i) => ({ ...p, n: i + 1, id: paperId(p) }));
}

export function paperId(p) {
  const doi = normDoi(p.doi);
  if (doi) return `doi:${doi}`;
  if (p.arxiv) return `arxiv:${normArxiv(p.arxiv)}`;
  if (p.pmid) return `pmid:${p.pmid}`;
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
// 过滤：得分低于最高分 relFloor 倍的丢弃；命中 <2 个检索词且没有命中任何多词短语的丢弃
// 保留数量上限 keep（尽量 10–15），不足不硬凑
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
  const floor = (opts.relFloor ?? 0.35) * (sorted[0] ? sorted[0].score : 0);
  const eligible = sorted.filter((p) => {
    if (p.score < floor) return false;
    const hits = p.matchedTerms || [];
    return hits.length >= 2 || hits.some((t) => t.includes(' '));
  });
  return eligible.slice(0, kept).map((p, i) => ({ ...p, n: i + 1 }));
}

export function queryTermsFor(input) {
  return keywords(input).terms;
}

/* ---------------- 来源选择（设置里可勾选） ---------------- */

export const LS_SOURCES = 'qianren.sources';

const localStore = (() => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
})();

export function getSourcePrefs() {
  try {
    const raw = localStore && localStore.getItem(LS_SOURCES);
    if (!raw) return null;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    const valid = SOURCE_ORDER.filter((s) => list.includes(s));
    return valid.length ? valid : null;
  } catch {
    return null;
  }
}

export function setSourcePrefs(list) {
  if (!localStore) return null;
  if (!Array.isArray(list) || !list.length) {
    localStore.removeItem(LS_SOURCES);
    return null;
  }
  const valid = SOURCE_ORDER.filter((s) => list.includes(s));
  localStore.setItem(LS_SOURCES, JSON.stringify(valid));
  return valid;
}

const MEDICAL_RE = /(medic|clinic|biomed|biolog| PubMed|health|cancer|tumou?r|disease|patient|drug|gene|genom|protein|cell|diagnos|医学|医疗|临床|生物|疾病|患者|药物|基因|蛋白|癌症|肿瘤|诊断与|诊断|影像)/i;
const CS_RE = /(computer science|machine learning|deep learning|neural|algorithm|software|programming|database|data mining|information retrieval|retrieval[- ]augmented|computer vision|natural language|language model|question answering|text generation|transformer|artificial intelligence|reinforcement learning|robot|\bAI\b|\bML\b|\bNLP\b|\bRAG\b|人工智能|计算机|机器学习|深度学习|神经网络|算法|程序|数据库|机器人|自然语言|知识图谱|大模型|大语言模型|检索增强)/i;

// 默认 OpenAlex + S2 + Crossref + arXiv；医学/生物检索追加 Europe PMC，计算机/AI 追加 DBLP
export function pickSources(input, prefs = null) {
  if (Array.isArray(prefs) && prefs.length) {
    const fixed = SOURCE_ORDER.filter((s) => prefs.includes(s));
    if (fixed.length) return fixed;
  }
  const text = `${input || ''}`;
  const terms = keywords(text).terms.join(' ');
  const hay = `${text} ${terms}`;
  const extra = [];
  if (MEDICAL_RE.test(hay)) extra.push('europepmc');
  if (CS_RE.test(hay)) extra.push('dblp');
  return SOURCE_ORDER.filter((s) => DEFAULT_SOURCES.includes(s) || extra.includes(s));
}

/* ---------------- sessionStorage 缓存（同一检索式 30 分钟） ---------------- */

const CACHE_PREFIX = 'qianren.search.v21:';

function sessionStore() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function cacheKey(name, q, n) {
  return `${CACHE_PREFIX}${name}:${n ?? ''}:${q}`;
}

export function readSourceCache(name, q, n, now = Date.now()) {
  const store = sessionStore();
  if (!store) return null;
  try {
    const raw = store.getItem(cacheKey(name, q, n));
    if (!raw) return null;
    const hit = JSON.parse(raw);
    if (!hit || typeof hit.t !== 'number' || now - hit.t > SESSION_TTL_MS || !Array.isArray(hit.papers)) return null;
    return hit.papers;
  } catch {
    return null;
  }
}

export function writeSourceCache(name, q, n, papers, now = Date.now()) {
  const store = sessionStore();
  if (!store) return;
  try {
    store.setItem(cacheKey(name, q, n), JSON.stringify({ t: now, papers }));
  } catch {
    // 配额满或隐私模式禁用存储时静默跳过
  }
}

export function clearSearchCache() {
  const store = sessionStore();
  if (!store) return;
  try {
    for (let i = store.length - 1; i >= 0; i -= 1) {
      const key = store.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) store.removeItem(key);
    }
  } catch {
    // ignore
  }
}

/* ---------------- 多源检索 ---------------- */

const SOURCE_META = {
  openalex: { n: 15, maxQueries: 2 },
  s2: { n: 15, maxQueries: 2, preferProxy: true },
  crossref: { n: 10, maxQueries: 2, proxyOnly: true },
  europepmc: { n: 10, maxQueries: 2, noProxy: true },
  dblp: { n: 10, maxQueries: 1, pick: 'first', proxyOnly: true },
  arxiv: { n: null, maxQueries: 1, pick: 'last', proxyOnly: true, kind: 'text' }
};

function normalizeSource(name, r) {
  if (name === 'openalex') return ((r.data && r.data.results) || []).map(fromOpenAlex);
  if (name === 's2') return ((r.data && r.data.data) || []).map(fromS2);
  if (name === 'crossref') return (((r.data && r.data.message) || {}).items || []).map(fromCrossref);
  if (name === 'europepmc') return (((r.data && r.data.resultList) || {}).result || []).map(fromEuropePmc);
  if (name === 'dblp') {
    const hits = (((r.data && r.data.result) || {}).hits || {}).hit;
    return (Array.isArray(hits) ? hits : hits ? [hits] : []).map(fromDblp);
  }
  return parseAtom(r.text).map(fromArxivEntry);
}

// queries: 3–5 条检索式；每个源按 SOURCE_META 控制请求量。arXiv/Crossref/DBLP 无 CORS 能力时走同源代理。
export async function searchAll(queries, opts = {}) {
  const {
    timeout = 12000, proxyBase = FN_BASE, allowProxy = true, onSource = () => {},
    sources = null, input = '', cache = true
  } = opts;
  const qs = (queries || []).filter(Boolean);
  const perSource = qs.slice(0, 2);
  const active = SOURCE_ORDER.filter((s) => (sources || DEFAULT_SOURCES).includes(s));
  const buckets = Object.fromEntries(active.map((s) => [s, []]));
  const tally = Object.fromEntries(active.map((s) => [s, { ok: 0, fail: 0, errors: [], ms: 0, via: '' }]));
  const status = Object.fromEntries(active.map((s) => [s, { state: 'running', count: 0, note: '', via: '', ms: 0 }]));
  const report = (name) => onSource(name, status[name]);

  const update = (name) => {
    const t = tally[name];
    const count = buckets[name].length;
    if (count > 0 || t.ok > 0) {
      status[name] = { state: 'done', count, note: '', via: t.via, ms: t.ms };
    } else if (t.errors.includes('proxy_required')) {
      status[name] = { state: 'skipped', count: 0, note: 'proxy_required', via: t.via || 'none', ms: t.ms };
    } else {
      status[name] = { state: 'failed', count: 0, note: t.errors[t.errors.length - 1] || 'failed', via: t.via, ms: t.ms };
    }
    report(name);
  };

  const runOne = async (name, q, meta, extra) => {
    const n = meta.n;
    const started = Date.now();
    const cached = cache ? readSourceCache(name, q, n) : null;
    let items = null;
    if (cached) {
      items = cached;
      tally[name].ok += 1;
      tally[name].via = tally[name].via || 'cache';
    } else {
      const r = await fetchSource(name, q, { timeout, proxyBase, allowProxy, ...meta, ...extra });
      if (r.ok) {
        try {
          items = normalizeSource(name, r);
          tally[name].ok += 1;
          tally[name].via = r.via || tally[name].via;
          if (cache) writeSourceCache(name, q, n, items);
        } catch {
          tally[name].fail += 1;
          tally[name].errors.push('parse_error');
          tally[name].via = r.via || tally[name].via;
        }
      } else {
        tally[name].fail += 1;
        tally[name].errors.push(r.error || 'failed');
        tally[name].via = r.via || tally[name].via;
      }
    }
    if (items && items.length) buckets[name].push(...items);
    tally[name].ms = Math.max(tally[name].ms, Date.now() - started);
    update(name);
  };

  const tasks = [];
  for (const name of active) {
    const meta = SOURCE_META[name] || { n: 15, maxQueries: 2 };
    const limit = Math.max(1, parseInt(meta.maxQueries, 10) || 1);
    const picked = meta.pick === 'last'
      ? perSource.slice(perSource.length - limit)
      : perSource.slice(0, limit);
    for (const q of picked.length ? picked : qs.slice(0, 1)) {
      tasks.push(runOne(name, q, meta, {}));
    }
  }

  await Promise.all(tasks);
  const raw = active.flatMap((name) => buckets[name]);
  return {
    raw,
    counts: Object.fromEntries(active.map((name) => [name, buckets[name].length])),
    status,
    sources: active
  };
}

// Unpaywall：只给最终保留的论文按 DOI 批量补开放获取链接
export async function enrichOpenAccess(papers, opts = {}) {
  const { proxyBase = FN_BASE, allowProxy = true, timeout = 12000 } = opts;
  const list = papers || [];
  const dois = Array.from(new Set(list.map((p) => normDoi(p.doi)).filter(Boolean))).slice(0, 20);
  if (!dois.length) return { papers: list, status: { state: 'skipped', note: 'no_doi', count: 0 } };
  if (!allowProxy) return { papers: list, status: { state: 'skipped', note: 'proxy_required', count: 0 } };
  const r = await attempt(unpaywallProxyUrl(dois, proxyBase), timeout, 'json');
  if (!r.ok) return { papers: list, status: { state: 'failed', note: r.error || 'failed', count: 0 } };
  if (!r.data || r.data.ok === false || r.data.skipped) {
    return { papers: list, status: { state: 'skipped', note: (r.data && (r.data.skipped || r.data.error)) || 'unavailable', count: 0 } };
  }
  const found = new Map((r.data.results || []).map((x) => [normDoi(x.doi), x]));
  let count = 0;
  const updated = list.map((p) => {
    const hit = found.get(normDoi(p.doi));
    if (hit && hit.oaUrl && !p.oaUrl) {
      count += 1;
      return { ...p, oaUrl: hit.oaUrl };
    }
    return p;
  });
  return { papers: updated, status: { state: 'done', count } };
}
