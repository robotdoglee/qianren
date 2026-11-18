// 可选的同源边缘函数（Deno）。站点在函数不存在时也能完整工作。
// 路由按路径后缀匹配：…/health、…/llm、…/arxiv、…/openalex、…/s2、…/crossref、…/dblp、…/unpaywall、
// …/scopus、…/ieee、…/springer、…/core、…/serpapi、…/beyond（GitHub 仓库搜索）
// 环境变量：DASHSCOPE_API_KEY；可选 CONTACT_EMAIL（Crossref/OpenAlex polite pool、Unpaywall 必填）、S2_API_KEY
// 访客自带 key 只走请求头 X-User-Key-<source>，不记录、不写缓存键、不回显。

const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const ARXIV_HOST = 'https://export.arxiv.org/api/query';
const OPENALEX_HOST = 'https://api.openalex.org/works';
const S2_HOST = 'https://api.semanticscholar.org/graph/v1/paper/search';
const CROSSREF_HOST = 'https://api.crossref.org/works';
const DBLP_HOST = 'https://dblp.org/search/publ/api';
const UNPAYWALL_HOST = 'https://api.unpaywall.org/v2';
const SCOPUS_HOST = 'https://api.elsevier.com/content/search/scopus';
const IEEE_HOST = 'https://ieeexploreapi.ieee.org/api/v1/search/articles';
const SPRINGER_HOST = 'https://api.springernature.com/meta/v2/json';
const CORE_HOST = 'https://api.core.ac.uk/v3/search/works';
const SERPAPI_HOST = 'https://serpapi.com/search.json';
const GITHUB_SEARCH_HOST = 'https://api.github.com/search/repositories';
const OPENALEX_SELECT = 'id,ids,doi,title,publication_year,authorships,primary_location,abstract_inverted_index,cited_by_count,relevance_score';
const S2_FIELDS = 'title,abstract,year,authors,venue,externalIds,url,citationCount';
const CROSSREF_SELECT = 'DOI,title,author,issued,published,container-title,abstract,is-referenced-by-count,URL,type,alternative-id';
const ALLOWED_MODELS = ['qwen-plus', 'qwen-turbo', 'qwen-max'];
const MAX_BODY = 64 * 1024;
const LLM_TIMEOUT = 50_000;
const PROXY_TIMEOUT = 12_000;
const MAX_QUERY = 300;
const MAX_N = 25;
const MAX_DOIS = 20;
const MAX_QUERY_LEN = 120;
const MAX_USER_KEY_LEN = 512;
const RATE_LIMIT_PER_MIN = 60;
const ARXIV_MIN_INTERVAL = 3_000;
const CACHE_TTL = 10 * 60 * 1000;
const UA = 'qianren-site/1.0 (literature search demo)';
const ALLOWED_ROLES = ['system', 'user', 'assistant'];

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function error(code: string, status = 400): Response {
  return json({ ok: false, error: code }, status);
}

function hasEnv(name: string): boolean {
  return (Deno.env.get(name) || '').trim().length > 0;
}

function env(name: string): string {
  return (Deno.env.get(name) || '').trim();
}

// 联系方式只从环境变量读取，绝不写进前端或仓库
function contactEmail(): string {
  return env('CONTACT_EMAIL');
}

// 访客自带凭证只从请求头读取并原样转发；不写日志、不写缓存键、不回显。
function userKey(request: Request, source: string): string {
  const raw = (request.headers.get(`x-user-key-${source}`) || '').trim();
  if (!raw || raw.length > MAX_USER_KEY_LEN || /[\r\n]/.test(raw)) return '';
  return raw;
}

function missingUserKey(): Response {
  return error('missing_user_key', 400);
}

function withMailto(url: string): string {
  const email = contactEmail();
  if (!email) return url;
  const u = new URL(url);
  if (!u.searchParams.has('mailto')) u.searchParams.set('mailto', email);
  return u.toString();
}

/* 边缘函数内存缓存 10 分钟，避免重复请求上游 */
const cache = new Map<string, { body: string; contentType: string; at: number }>();

function cacheGet(key: string): { body: string; contentType: string } | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return hit;
}

function cachePut(key: string, body: string, contentType: string): void {
  if (cache.size > 400) {
    const now = Date.now();
    for (const [k, v] of cache) if (now - v.at > CACHE_TTL) cache.delete(k);
  }
  cache.set(key, { body, contentType, at: Date.now() });
}

async function handleLlm(request: Request): Promise<Response> {
  if (request.method !== 'POST') return error('method_not_allowed', 405);
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY) return error('body_too_large', 413);

  let raw = '';
  const reader = request.body?.getReader();
  if (reader) {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > MAX_BODY) {
        await reader.cancel();
        return error('body_too_large', 413);
      }
      chunks.push(value);
    }
    const buf = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      buf.set(chunk, offset);
      offset += chunk.byteLength;
    }
    raw = new TextDecoder().decode(buf);
  }

  let payload: { messages?: unknown; model?: unknown };
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    return error('invalid_json');
  }

  const messages = payload.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 24) {
    return error('invalid_messages');
  }
  for (const m of messages) {
    if (!m || typeof m !== 'object') return error('invalid_messages');
    const item = m as { role?: unknown; content?: unknown };
    if (typeof item.role !== 'string' || !ALLOWED_ROLES.includes(item.role)) return error('invalid_role');
    if (typeof item.content !== 'string' || item.content.length > 24_000) return error('invalid_content');
  }

  const model = typeof payload.model === 'string' ? payload.model : ALLOWED_MODELS[0];
  if (!ALLOWED_MODELS.includes(model)) return error('model_not_allowed');

  const key = (Deno.env.get('DASHSCOPE_API_KEY') || '').trim();
  if (!key) return error('service_not_configured', 503);

  try {
    const upstream = await fetch(DASHSCOPE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature: 0.2, stream: false }),
      signal: AbortSignal.timeout(LLM_TIMEOUT)
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      // 不回显上游原始异常内容，只给出状态分类
      return error(upstream.status === 429 ? 'rate_limited' : `upstream_${upstream.status}`, 502);
    }
    return new Response(text, { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    const name = err instanceof Error && err.name === 'TimeoutError' ? 'upstream_timeout' : 'upstream_unreachable';
    return error(name, 504);
  }
}

function qparam(params: URLSearchParams): string | null {
  const q = (params.get('q') || '').trim();
  if (!q) return null;
  return q.length > MAX_QUERY ? null : q;
}

function nparam(params: URLSearchParams): number {
  const raw = params.get('n');
  if (raw === null) return 15;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 15;
  return Math.max(1, Math.min(MAX_N, n));
}

/* 内存级限流：每个 isolate 每分钟 RATE_LIMIT_PER_MIN 次 */
const hits = new Map<string, number[]>();

function limited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 60_000);
  if (recent.length >= RATE_LIMIT_PER_MIN) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

function rateLimited(retryAfter = 60): Response {
  return new Response(JSON.stringify({ ok: false, error: 'rate_limited' }), {
    status: 429,
    headers: { ...JSON_HEADERS, 'retry-after': String(retryAfter) }
  });
}

/* arXiv 要求 ≤1 次/3 秒 */
const lastCall = new Map<string, number>();

function minIntervalExceeded(key: string, minMs: number): boolean {
  const now = Date.now();
  const last = lastCall.get(key) || 0;
  if (now - last < minMs) return true;
  lastCall.set(key, now);
  return false;
}

// 上游正文原样转发；命中内存缓存 10 分钟，错误响应不缓存。
// cacheKey 显式传入时，只含来源/检索式/条数，绝不含访客 key。
async function forward(
  url: string,
  contentType: string,
  headers: Record<string, string> = {},
  cacheKey: string = url
): Promise<Response> {
  const cached = cacheGet(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      status: 200,
      headers: { 'content-type': cached.contentType, 'cache-control': 'public, max-age=600', 'x-cache': 'hit' }
    });
  }
  try {
    const upstream = await fetch(url, {
      headers: { 'user-agent': UA, ...headers },
      signal: AbortSignal.timeout(PROXY_TIMEOUT)
    });
    const body = await upstream.text();
    if (!upstream.ok) {
      return error(upstream.status === 429 ? 'upstream_rate_limited' : `upstream_${upstream.status}`, upstream.status === 429 ? 429 : 502);
    }
    cachePut(cacheKey, body, contentType);
    return new Response(body, {
      status: 200,
      headers: { 'content-type': contentType, 'cache-control': 'public, max-age=600' }
    });
  } catch (err) {
    const name = err instanceof Error && err.name === 'TimeoutError' ? 'upstream_timeout' : 'upstream_unreachable';
    return error(name, 504);
  }
}

function handleArxiv(params: URLSearchParams): Response | Promise<Response> {
  const q = qparam(params);
  if (!q) return error('missing_query_or_too_long');
  if (limited('arxiv')) return rateLimited();
  if (minIntervalExceeded('arxiv', ARXIV_MIN_INTERVAL)) return rateLimited(3);
  const url = `${ARXIV_HOST}?search_query=${encodeURIComponent(q)}&max_results=10`;
  return forward(url, 'application/atom+xml; charset=utf-8');
}

function handleOpenAlex(params: URLSearchParams): Response | Promise<Response> {
  const q = qparam(params);
  if (!q) return error('missing_query_or_too_long');
  if (limited('openalex')) return rateLimited();
  const url = withMailto(`${OPENALEX_HOST}?search=${encodeURIComponent(q)}&per-page=${nparam(params)}&select=${OPENALEX_SELECT}`);
  return forward(url, 'application/json; charset=utf-8');
}

function handleS2(params: URLSearchParams, request: Request): Response | Promise<Response> {
  const q = qparam(params);
  if (!q) return error('missing_query_or_too_long');
  if (limited('s2')) return rateLimited();
  const url = `${S2_HOST}?query=${encodeURIComponent(q)}&limit=${nparam(params)}&fields=${S2_FIELDS}`;
  const headers: Record<string, string> = {};
  // 访客自带 key 优先于服务端环境变量；key 不进 URL 与缓存键
  const key = userKey(request, 's2') || env('S2_API_KEY');
  if (key) headers['x-api-key'] = key;
  return forward(url, 'application/json; charset=utf-8', headers);
}

function handleScopus(params: URLSearchParams, request: Request): Response | Promise<Response> {
  const q = qparam(params);
  if (!q) return error('missing_query_or_too_long');
  const key = userKey(request, 'scopus');
  if (!key) return missingUserKey();
  if (limited('scopus')) return rateLimited();
  const n = Math.max(1, Math.min(25, nparam(params)));
  const url = `${SCOPUS_HOST}?query=${encodeURIComponent(q)}&count=${n}`;
  return forward(url, 'application/json; charset=utf-8', { 'X-ELS-APIKey': key, Accept: 'application/json' }, `scopus:${q}:${n}`);
}

function handleIeee(params: URLSearchParams, request: Request): Response | Promise<Response> {
  const q = qparam(params);
  if (!q) return error('missing_query_or_too_long');
  const key = userKey(request, 'ieee');
  if (!key) return missingUserKey();
  if (limited('ieee')) return rateLimited();
  const n = Math.max(1, Math.min(25, nparam(params)));
  // IEEE 官方接口只接受 apikey 查询参数；缓存键单独构造，不含 key
  const url = `${IEEE_HOST}?querytext=${encodeURIComponent(q)}&max_records=${n}&start_record=1&apikey=${encodeURIComponent(key)}`;
  return forward(url, 'application/json; charset=utf-8', { Accept: 'application/json' }, `ieee:${q}:${n}`);
}

function handleSpringer(params: URLSearchParams, request: Request): Response | Promise<Response> {
  const q = qparam(params);
  if (!q) return error('missing_query_or_too_long');
  const key = userKey(request, 'springer');
  if (!key) return missingUserKey();
  if (limited('springer')) return rateLimited();
  const n = Math.max(1, Math.min(25, nparam(params)));
  const url = `${SPRINGER_HOST}?q=${encodeURIComponent(q)}&p=${n}&api_key=${encodeURIComponent(key)}`;
  return forward(url, 'application/json; charset=utf-8', { Accept: 'application/json' }, `springer:${q}:${n}`);
}

function handleCore(params: URLSearchParams, request: Request): Response | Promise<Response> {
  const q = qparam(params);
  if (!q) return error('missing_query_or_too_long');
  const key = userKey(request, 'core');
  if (!key) return missingUserKey();
  if (limited('core')) return rateLimited();
  const n = Math.max(1, Math.min(25, nparam(params)));
  const url = `${CORE_HOST}?q=${encodeURIComponent(q)}&limit=${n}`;
  return forward(url, 'application/json; charset=utf-8', { Authorization: `Bearer ${key}`, Accept: 'application/json' }, `core:${q}:${n}`);
}

function handleSerpApi(params: URLSearchParams, request: Request): Response | Promise<Response> {
  const q = qparam(params);
  if (!q) return error('missing_query_or_too_long');
  const key = userKey(request, 'serpapi');
  if (!key) return missingUserKey();
  if (limited('serpapi')) return rateLimited();
  const n = Math.max(1, Math.min(20, nparam(params)));
  const url = `${SERPAPI_HOST}?engine=google_scholar&q=${encodeURIComponent(q)}&num=${n}&api_key=${encodeURIComponent(key)}`;
  return forward(url, 'application/json; charset=utf-8', { Accept: 'application/json' }, `serpapi:${q}:${n}`);
}

// v2.3 论文之外：GitHub 未认证搜索按官方要求走服务端（带上 UA 与 API 版本头）
function handleBeyond(params: URLSearchParams): Response | Promise<Response> {
  const source = (params.get('source') || '').trim();
  if (source !== 'github') return error('unsupported_source');
  const q = qparam(params);
  if (!q) return error('missing_query_or_too_long');
  if (limited('github')) return rateLimited();
  const n = Math.max(1, Math.min(5, nparam(params)));
  const url = `${GITHUB_SEARCH_HOST}?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${n}`;
  return forward(
    url,
    'application/json; charset=utf-8',
    { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    `github:${q}:${n}`
  );
}

function handleCrossref(params: URLSearchParams): Response | Promise<Response> {
  const q = qparam(params);
  if (!q) return error('missing_query_or_too_long');
  if (limited('crossref')) return rateLimited();
  const rows = Math.max(1, Math.min(20, nparam(params)));
  const url = withMailto(
    `${CROSSREF_HOST}?query=${encodeURIComponent(q)}&rows=${rows}&select=${encodeURIComponent(CROSSREF_SELECT)}`
  );
  return forward(url, 'application/json; charset=utf-8');
}

function handleDblp(params: URLSearchParams): Response | Promise<Response> {
  const q = qparam(params);
  if (!q) return error('missing_query_or_too_long');
  if (limited('dblp')) return rateLimited();
  const h = Math.max(1, Math.min(20, nparam(params)));
  const url = `${DBLP_HOST}?q=${encodeURIComponent(q)}&format=json&h=${h}`;
  return forward(url, 'application/json; charset=utf-8');
}

async function unpaywallOne(doi: string, email: string): Promise<unknown | null> {
  const url = `${UNPAYWALL_HOST}/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`;
  try {
    const upstream = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(PROXY_TIMEOUT) });
    if (!upstream.ok) return null;
    const data = await upstream.json() as {
      is_oa?: boolean;
      doi?: string;
      best_oa_location?: { url_for_pdf?: string; url?: string; host_type?: string; version?: string };
    };
    const best = data.best_oa_location || {};
    const oaUrl = best.url_for_pdf || best.url || '';
    if (!data.is_oa || !oaUrl) return { doi: data.doi || doi, oa: false };
    return {
      doi: data.doi || doi,
      oa: true,
      oaUrl,
      hostType: best.host_type || '',
      version: best.version || ''
    };
  } catch {
    return null;
  }
}

async function handleUnpaywall(params: URLSearchParams): Promise<Response> {
  if (limited('unpaywall')) return rateLimited();
  const email = contactEmail();
  // Unpaywall 要求 email；未配置时安静跳过，不影响其余来源
  if (!email) return json({ ok: true, results: [], skipped: 'no_contact_email' });
  const raw = [...params.getAll('doi'), ...(params.get('dois') || '').split(',')];
  const dois = Array.from(new Set(
    raw.map((d) => d.trim().toLowerCase())
      .filter((d) => d.length <= MAX_QUERY_LEN && /^10\.\d{4,9}\/\S+$/.test(d))
  )).slice(0, MAX_DOIS);
  if (!dois.length) return error('missing_doi');

  const key = `unpaywall:${dois.slice().sort().join(',')}`;
  const cached = cacheGet(key);
  if (cached) {
    return new Response(cached.body, {
      status: 200,
      headers: { 'content-type': cached.contentType, 'cache-control': 'public, max-age=600', 'x-cache': 'hit' }
    });
  }

  const results: unknown[] = [];
  for (let i = 0; i < dois.length; i += 5) {
    const batch = dois.slice(i, i + 5);
    const settled = await Promise.all(batch.map((doi) => unpaywallOne(doi, email)));
    for (const item of settled) if (item) results.push(item);
  }
  const body = JSON.stringify({ ok: true, results });
  cachePut(key, body, 'application/json; charset=utf-8');
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=600' }
  });
}

function route(request: Request): Promise<Response> | Response {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.endsWith('/health')) {
    const sources = ['openalex', 's2', 'arxiv', 'crossref', 'europepmc', 'dblp', 'github'];
    if (hasEnv('CONTACT_EMAIL')) sources.push('unpaywall');
    return json({
      ok: true,
      llm: hasEnv('DASHSCOPE_API_KEY'),
      contactEmail: hasEnv('CONTACT_EMAIL'),
      s2Key: hasEnv('S2_API_KEY'),
      sources
    });
  }
  if (path.endsWith('/llm')) return handleLlm(request);
  if (path.endsWith('/arxiv')) return handleArxiv(url.searchParams);
  if (path.endsWith('/openalex')) return handleOpenAlex(url.searchParams);
  if (path.endsWith('/s2')) return handleS2(url.searchParams, request);
  if (path.endsWith('/crossref')) return handleCrossref(url.searchParams);
  if (path.endsWith('/dblp')) return handleDblp(url.searchParams);
  if (path.endsWith('/unpaywall')) return handleUnpaywall(url.searchParams);
  if (path.endsWith('/scopus')) return handleScopus(url.searchParams, request);
  if (path.endsWith('/ieee')) return handleIeee(url.searchParams, request);
  if (path.endsWith('/springer')) return handleSpringer(url.searchParams, request);
  if (path.endsWith('/core')) return handleCore(url.searchParams, request);
  if (path.endsWith('/serpapi')) return handleSerpApi(url.searchParams, request);
  if (path.endsWith('/beyond')) return handleBeyond(url.searchParams);
  return error('not_found', 404);
}

Deno.serve({ port: Number(Deno.env.get('PORT') || 8000) }, route);
