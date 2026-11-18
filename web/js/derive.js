// v2 纯函数：相关度解析、聚类回写、筛选与排序。不碰 DOM，单独可测。

export const RELEVANCE_LABELS = { high: '高相关', mid: '中相关', low: '背景' };
export const RELEVANCE_RANK = { high: 2, mid: 1, low: 0 };

const LEVEL_TO_REL = { 高相关: 'high', 中相关: 'mid', 低相关: 'low', 背景: 'low', high: 'high', mid: 'mid', low: 'low' };

export function parseRelevance(relation) {
  const m = String(relation || '').trim().match(/^(高相关|中相关|低相关|背景|high|mid|low)(?:[：:]|$)/i);
  if (!m) return null;
  return LEVEL_TO_REL[m[1].toLowerCase()] || LEVEL_TO_REL[m[1]] || null;
}

export function relationText(relation) {
  return String(relation || '')
    .replace(/^(高相关|中相关|低相关|背景)[：:]\s*/u, '')
    .trim();
}

export function relevanceOf(paper) {
  const direct = String((paper && paper.relevance) || '').toLowerCase();
  if (RELEVANCE_RANK[direct] != null) return direct;
  return parseRelevance(((paper && paper.fields) || {}).relation) || 'mid';
}

// 规则模式只有共同关键词：用方法句首句补充，并允许界面标注「规则抽取」
export function relationDetail(paper) {
  const body = relationText(((paper && paper.fields) || {}).relation);
  const method = String(((paper && paper.fields) || {}).method || '').trim();
  const isKeywordOnly = /^共同关键词/.test(body);
  if (isKeywordOnly && method && method !== '摘要未提及') {
    return { text: method.split(/[。；]/)[0].slice(0, 160), supplementary: true };
  }
  return { text: body, supplementary: false };
}

export function clusterIndexMap(result) {
  const map = new Map();
  (result.clusters || []).forEach((c, i) => (c.papers || []).forEach((n) => map.set(Number(n), i)));
  return map;
}

export function annotatePapers(result) {
  const cmap = clusterIndexMap(result);
  const papers = (result.papers || []).map((p) => ({
    ...p,
    relevance: relevanceOf(p),
    cluster: Number.isInteger(p.cluster) ? p.cluster : (cmap.has(Number(p.n)) ? cmap.get(Number(p.n)) : null)
  }));
  return { ...result, papers };
}

export function datasetKey(paper) {
  const raw = String((((paper || {}).fields) || {}).dataset || '').trim();
  if (!raw || raw === '摘要未提及') return '';
  return raw.split(/[；。;]/)[0].replace(/（[^）]*摘要未提及[^）]*）/g, '').replace(/[，,、\s]+$/g, '').slice(0, 60);
}

export function metricKey(paper) {
  const raw = String((((paper || {}).fields) || {}).metric || '').trim();
  if (!raw || raw === '摘要未提及') return '';
  const named = raw.match(/\b(AUC-ROC|ROC-AUC|AUROC|AUPRC|F1|AUC|RMSE|MAE|accuracy|precision|recall|BLEU|ROUGE)\b/gi);
  return named ? Array.from(new Set(named.map((s) => s.toUpperCase()))).join('+') : '';
}

export function matchesFilters(paper, f = {}) {
  if (f.cluster != null && f.cluster !== '' && Number(paper.cluster) !== Number(f.cluster)) return false;
  if (f.relevance && f.relevance !== 'all' && relevanceOf(paper) !== f.relevance) return false;
  if (f.yearFrom && Number(paper.year || 0) < Number(f.yearFrom)) return false;
  if (f.yearTo && Number(paper.year || 9999) > Number(f.yearTo)) return false;
  if (f.dataset && datasetKey(paper) !== f.dataset) return false;
  return true;
}

export function sortPapers(papers, sort = 'relevance') {
  const list = papers.slice();
  if (sort === 'year') {
    list.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0) || (Number(b.citations) || 0) - (Number(a.citations) || 0));
  } else if (sort === 'citations') {
    list.sort((a, b) => (Number(b.citations) || 0) - (Number(a.citations) || 0) || (RELEVANCE_RANK[relevanceOf(b)] || 0) - (RELEVANCE_RANK[relevanceOf(a)] || 0));
  } else {
    list.sort((a, b) => (RELEVANCE_RANK[relevanceOf(b)] || 0) - (RELEVANCE_RANK[relevanceOf(a)] || 0) || (Number(b.citations) || 0) - (Number(a.citations) || 0));
  }
  return list;
}

export function conclusionOf(papers) {
  const list = sortPapers(papers, 'relevance');
  const top = list[0];
  const counts = new Map();
  for (const p of papers) {
    if (p.cluster == null) continue;
    counts.set(p.cluster, (counts.get(p.cluster) || 0) + 1);
  }
  const topClusters = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([i]) => i);
  return { top, topClusters };
}

export function overviewLayout(papers, { width = 860, laneH = 54, padL = 96, padR = 22, padT = 26, padB = 34 } = {}) {
  const years = papers.map((p) => Number(p.year)).filter((y) => y >= 1900);
  const minY = years.length ? Math.min(...years) : new Date().getFullYear() - 5;
  const maxY = years.length ? Math.max(...years) : new Date().getFullYear();
  const laneIds = Array.from(new Set(papers.map((p) => p.cluster).filter((i) => i != null))).sort((a, b) => a - b);
  const height = padT + Math.max(1, laneIds.length) * laneH + padB;
  const plotW = Math.max(60, width - padL - padR);
  const x = (year) => padL + (maxY === minY ? plotW / 2 : ((Number(year) - minY) / (maxY - minY)) * plotW);
  const laneY = (i) => padT + laneIds.indexOf(i) * laneH + laneH / 2;
  const maxCit = Math.max(1, ...papers.map((p) => Number(p.citations) || 0));
  const points = papers.filter((p) => p.cluster != null).map((p) => ({
    p,
    x: x(p.year),
    y: laneY(p.cluster),
    r: 4 + Math.log10(1 + (Number(p.citations) || 0)) / Math.log10(1 + maxCit) * 8
  }));
  const lanes = laneIds.map((id, i) => ({ id, y: padT + i * laneH + laneH / 2 }));
  return { width, height, minY, maxY, padL, padR, padT, padB, laneH, points, lanes, x, laneY };
}

export function relationLinks(papers, mode = 'dataset') {
  if (mode === 'none') return [];
  const keyOf = mode === 'metric' ? metricKey : datasetKey;
  const groups = new Map();
  for (const p of papers) {
    const k = keyOf(p);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const links = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    for (let i = 1; i < list.length; i += 1) links.push([list[i - 1], list[i]]);
  }
  return links;
}
