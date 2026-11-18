// 可选的同源边缘函数（Deno）。站点在函数不存在时也能完整工作。
// 路由按路径后缀匹配：…/health、…/llm、…/arxiv
// 环境变量：DASHSCOPE_API_KEY

const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const ARXIV_HOST = 'https://export.arxiv.org/api/query';
const ALLOWED_MODELS = ['qwen-plus', 'qwen-turbo', 'qwen-max'];
const MAX_BODY = 64 * 1024;
const LLM_TIMEOUT = 50_000;
const ARXIV_TIMEOUT = 12_000;
const MAX_QUERY = 300;
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

async function handleArxiv(params: URLSearchParams): Promise<Response> {
  const q = params.get('q') || '';
  if (!q.trim()) return error('missing_query');
  if (q.length > MAX_QUERY) return error('query_too_long');
  const url = `${ARXIV_HOST}?search_query=${encodeURIComponent(q)}&max_results=10`;
  try {
    const upstream = await fetch(url, {
      headers: { 'user-agent': 'qianren-site/1.0 (literature search demo)' },
      signal: AbortSignal.timeout(ARXIV_TIMEOUT)
    });
    const text = await upstream.text();
    if (!upstream.ok) return error(`upstream_${upstream.status}`, 502);
    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'application/atom+xml; charset=utf-8', 'cache-control': 'no-store' }
    });
  } catch {
    return error('upstream_unreachable', 504);
  }
}

function route(request: Request): Promise<Response> | Response {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.endsWith('/health')) {
    return json({ ok: true, llm: hasEnv('DASHSCOPE_API_KEY') });
  }
  if (path.endsWith('/llm')) return handleLlm(request);
  if (path.endsWith('/arxiv')) return handleArxiv(url.searchParams);
  return error('not_found', 404);
}

Deno.serve({ port: Number(Deno.env.get('PORT') || 8000) }, route);
