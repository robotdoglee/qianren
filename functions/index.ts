// 可选的同源边缘函数（Deno）。站点在函数不存在时也能完整工作。
// 路由按路径后缀匹配：…/health、…/llm、…/arxiv、…/openalex、…/s2
// 环境变量：DASHSCOPE_API_KEY

const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const ARXIV_HOST = 'https://export.arxiv.org/api/query';
const OPENALEX_HOST = 'https://api.openalex.org/works';
const S2_HOST = 'https://api.semanticscholar.org/graph/v1/paper/search';
const OPENALEX_SELECT = 'id,doi,title,publication_year,authorships,primary_location,abstract_inverted_index,cited_by_count,relevance_score';
const S2_FIELDS = 'title,abstract,year,authors,venue,externalIds,url,citationCount';
const ALLOWED_MODELS = ['qwen-plus', 'qwen-turbo', 'qwen-max'];
const MAX_BODY = 64 * 1024;
const LLM_TIMEOUT = 50_000;
const PROXY_TIMEOUT = 12_000;
const MAX_QUERY = 300;
const MAX_N = 25;
const RATE_LIMIT_PER_MIN = 60;
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

function rateLimited(): Response {
  return new Response(JSON.stringify({ ok: false, error: 'rate_limited' }), {
    status: 429,
    headers: { ...JSON_HEADERS, 'retry-after': '60' }
  });
}

// 上游正文原样转发；命中缓存 1 小时，错误响应不缓存
async function forward(url: string, contentType: string): Promise<Response> {
  try {
    const upstream = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(PROXY_TIMEOUT) });
    const body = await upstream.text();
    if (!upstream.ok) {
      return error(upstream.status === 429 ? 'upstream_rate_limited' : `upstream_${upstream.status}`, upstream.status === 429 ? 429 : 502);
    }
    return new Response(body, {
      status: 200,
      headers: { 'content-type': contentType, 'cache-control': 'public, max-age=3600' }
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
  const url = `${ARXIV_HOST}?search_query=${encodeURIComponent(q)}&max_results=10`;
  return forward(url, 'application/atom+xml; charset=utf-8');
}

function handleOpenAlex(params: URLSearchParams): Response | Promise<Response> {
  const q = qparam(params);
  if (!q) return error('missing_query_or_too_long');
  if (limited('openalex')) return rateLimited();
  const url = `${OPENALEX_HOST}?search=${encodeURIComponent(q)}&per-page=${nparam(params)}&select=${OPENALEX_SELECT}`;
  return forward(url, 'application/json; charset=utf-8');
}

function handleS2(params: URLSearchParams): Response | Promise<Response> {
  const q = qparam(params);
  if (!q) return error('missing_query_or_too_long');
  if (limited('s2')) return rateLimited();
  const url = `${S2_HOST}?query=${encodeURIComponent(q)}&limit=${nparam(params)}&fields=${S2_FIELDS}`;
  return forward(url, 'application/json; charset=utf-8');
}

function route(request: Request): Promise<Response> | Response {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.endsWith('/health')) {
    return json({ ok: true, llm: hasEnv('DASHSCOPE_API_KEY') });
  }
  if (path.endsWith('/llm')) return handleLlm(request);
  if (path.endsWith('/arxiv')) return handleArxiv(url.searchParams);
  if (path.endsWith('/openalex')) return handleOpenAlex(url.searchParams);
  if (path.endsWith('/s2')) return handleS2(url.searchParams);
  return error('not_found', 404);
}

Deno.serve({ port: Number(Deno.env.get('PORT') || 8000) }, route);
