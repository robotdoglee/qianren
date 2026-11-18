// 访客自带的第三方检索凭证：只存浏览器 localStorage，经同源函数转发，不记录、不缓存 key。
// 合规：不登录、不注入 Cookie、不抓取谷歌学术/知网；SerpApi 是用户自担条款与费用的第三方接口。

export const USER_KEY_PROVIDERS = [
  {
    id: 's2',
    label: 'Semantic Scholar',
    desc: '提高 Semantic Scholar 限流额度。同源函数已配置服务端 key 时可留空。',
    apply: 'https://www.semanticscholar.org/product/api'
  },
  {
    id: 'scopus',
    label: 'Elsevier Scopus',
    desc: 'Scopus 检索。需所在机构的订阅与 IP 授权，请自行确认访问权限。',
    apply: 'https://dev.elsevier.com/'
  },
  {
    id: 'ieee',
    label: 'IEEE Xplore',
    desc: 'IEEE 会议与期刊检索。',
    apply: 'https://developer.ieee.org/'
  },
  {
    id: 'springer',
    label: 'Springer Nature',
    desc: 'Springer Nature Meta 元数据检索。',
    apply: 'https://dev.springernature.com/'
  },
  {
    id: 'core',
    label: 'CORE',
    desc: '开放获取全文与元数据检索。',
    apply: 'https://core.ac.uk/services/api'
  },
  {
    id: 'serpapi',
    label: 'SerpApi（Google Scholar）',
    desc: '第三方付费的 Google Scholar 接口，遵守其条款并自担费用；本站不登录、不抓取谷歌学术。',
    apply: 'https://serpapi.com/'
  }
];

export const KEYED_SEARCH_SOURCES = ['scopus', 'ieee', 'springer', 'core', 'serpapi'];

const PREFIX = 'qianren.userkey.';

function local() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function providerById(id) {
  return USER_KEY_PROVIDERS.find((p) => p.id === id) || null;
}

// 请求头名固定为 X-User-Key-<source>；函数只读不写日志、不写缓存键
export function providerHeader(id) {
  return `X-User-Key-${id}`;
}

export function getUserKey(id) {
  const store = local();
  if (!store) return '';
  return String(store.getItem(`${PREFIX}${id}`) || '').trim();
}

export function setUserKey(id, value) {
  if (!providerById(id)) return '';
  const store = local();
  if (!store) return '';
  const v = String(value || '').trim();
  if (v) store.setItem(`${PREFIX}${id}`, v);
  else store.removeItem(`${PREFIX}${id}`);
  return v;
}

export function getUserKeys() {
  const out = {};
  for (const p of USER_KEY_PROVIDERS) {
    const v = getUserKey(p.id);
    if (v) out[p.id] = v;
  }
  return out;
}

export function clearUserKeys() {
  const store = local();
  if (!store) return;
  for (const p of USER_KEY_PROVIDERS) store.removeItem(`${PREFIX}${p.id}`);
}

// 有 key 才启用的额外检索来源（S2 本身是基础来源，这里只给其余 5 个）
export function enabledKeyedSources(keys = getUserKeys()) {
  return KEYED_SEARCH_SOURCES.filter((id) => Boolean(keys[id]));
}

export function keyHeadersFor(keys = getUserKeys()) {
  const headers = {};
  for (const [id, key] of Object.entries(keys || {})) {
    if (key && providerById(id)) headers[providerHeader(id)] = key;
  }
  return headers;
}

export function enabledKeyedLabels(keys = getUserKeys()) {
  return USER_KEY_PROVIDERS
    .filter((p) => keys[p.id])
    .map((p) => p.label);
}

// 测试与日志安全：任何 key 都不应出现在导出文本里
export function textLeaksAnyKey(text, keys = getUserKeys()) {
  const hay = String(text || '');
  return Object.values(keys || {}).some((k) => k && hay.includes(k));
}