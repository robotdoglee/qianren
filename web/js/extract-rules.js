// 规则模式：7 字段抽取 + 方法标签聚类 + 空白点分析（只依据标题与摘要，缺失一律「摘要未提及」）
import {
  BACKGROUND_VOICE, CLUES, METHOD_LABELS, OWN_STRUCTURAL_VOICE, OWN_VOICE, keywords, matchKnownDatasets,
  matchKnownMetrics, matchMethodLabels
} from './terms.js';
import { annotatePapers } from './derive.js';

export const MISSING = '摘要未提及';
const EXCERPT_TAG = '原文摘录';

// 按句切分：保护小数点（8.2）与常见缩写，避免把一句拆断
const ABBREV = /(?:et al|e\.g|i\.e|vs|cf|Fig|Sec|Ref|Dr|Prof|approx|approx\.|No)\.$/i;

export function splitSentences(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out = [];
  let buf = '';
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    buf += ch;
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    const next = clean[i + 1];
    const prev = clean[i - 1];
    if (ch === '.' && next && /\d/.test(next) && prev && /\d/.test(prev)) continue;
    if (ABBREV.test(buf)) continue;
    if (next === undefined || next === ' ' || (next && /[A-Z“"([(]/.test(next))) {
      out.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.map((s) => s.trim()).filter((s) => s.length > 12);
}

function clip(sentence, max = 320) {
  const s = sentence.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 120 ? lastSpace : max)}…`;
}

function pickSentence(sentences, patterns, extraFilter) {
  for (const re of patterns) {
    for (const s of sentences) {
      if (re.test(s) && (!extraFilter || extraFilter(s))) return s;
    }
  }
  return '';
}

function excerpt(sentence) {
  if (!sentence) return MISSING;
  return `${EXCERPT_TAG}：${clip(sentence)}`;
}

const anyOf = (list) => new RegExp(list.map((re) => re.source).join('|'), 'i');
const RESULT_VOICE = anyOf(CLUES.result);
const LIMIT_VOICE = anyOf(CLUES.limitation);
// 明确承认不足的强线索（弱线索如 however/only 排在其后）
const LIMIT_STRONG = /\b(?:limitation\w*|fail\w*|failure|cannot|can not|remains?\b|struggl\w*|suffer\w*|drawback\w*|shortcoming\w*|insufficient|restricted)\b/i;
const HAS_NUMBER = /\d/;
// 让步连接词：出现在句首通常意味着「但是还有问题」，效果句让位、局限句加分
const CONCESSIVE = /^(?:however|nevertheless|although|though|unfortunately|in contrast|conversely|yet)\b/i;
// 「现有方法做不到」属于立题动机，不是本文自陈的局限
const OTHERS_FAULT = /\b(?:existing|current|prior|previous|traditional|conventional|most|many)\s+(?:class\s+of\s+)?(?:methods?|approaches?|models?|techniques?|solutions?|studies|works?)\b/i;

// 摘要中括号定义的缩写（如 (FCA)）基本就是本文方法名，句中出现即算「本文自身」
export function ownAcronyms(abstract) {
  const list = (String(abstract || '').match(/\(\s*[A-Z][A-Z0-9-]{1,7}\s*\)/g) || [])
    .map((s) => s.replace(/[()\s]/g, ''));
  return Array.from(new Set(list)).slice(0, 6);
}

function isOwn(sentence, acronyms) {
  if (OWN_VOICE.test(sentence) || OWN_STRUCTURAL_VOICE.test(sentence)) return true;
  return (acronyms || []).some((a) => sentence.includes(a));
}

// 「报告的效果」：只取本文自身的结论句（自身线索 + 结论线索），带数字的优先，其次是靠后的句子
export function pickOwnResult(sentences, acronyms = []) {
  const cands = sentences
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => isOwn(s, acronyms) && RESULT_VOICE.test(s) && !BACKGROUND_VOICE.test(s));
  if (!cands.length) return '';
  const last = Math.max(1, sentences.length - 1);
  const scored = cands.map(({ s, i }) => ({
    s,
    v: (HAS_NUMBER.test(s) ? 2 : 0) + (i / last) * 1.5 + (/state[- ]of[- ]the[- ]art|outperform/i.test(s) ? 0.5 : 0)
      - (CONCESSIVE.test(s) ? 3 : 0)
  }));
  scored.sort((a, b) => b.v - a.v);
  return scored[0].s;
}

// 「局限」：优先本文自身承认不足的句子；纯结果句即使含 only 也不算局限
export function pickOwnLimitation(sentences, exclude, acronyms = []) {
  const cands = sentences
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s !== exclude && LIMIT_VOICE.test(s) && isOwn(s, acronyms));
  if (!cands.length) return '';
  const last = Math.max(1, sentences.length - 1);
  const scored = cands.map(({ s, i }) => {
    const strong = LIMIT_STRONG.test(s);
    const resultish = !strong && !CONCESSIVE.test(s) && HAS_NUMBER.test(s) && RESULT_VOICE.test(s);
    return { s, v: (strong ? 2 : 0) + (CONCESSIVE.test(s) ? 1.5 : 0) - (resultish ? 1.5 : 0) - (OTHERS_FAULT.test(s) ? 2 : 0) + (i / last) * 1.5 };
  });
  scored.sort((a, b) => b.v - a.v);
  return scored[0].s;
}

export function extractMethodSnippet(sentences) {
  const s = pickSentence(sentences, CLUES.method);
  if (s) return excerpt(s);
  const any = sentences.find((x) => /\bmethod|approach|framework|model\b/i.test(x));
  return any ? excerpt(any) : MISSING;
}

export function extractDatasetSnippet(paper, sentences) {
  const named = matchKnownDatasets(`${paper.title || ''} ${paper.abstract || ''}`);
  if (named.length) {
    const host = sentences.find((s) => named.some((d) => s.toLowerCase().includes(d.toLowerCase())));
    const text = host ? clip(host) : `Known datasets mentioned: ${named.join(', ')}`;
    return `${EXCERPT_TAG}：${text}`;
  }
  const s = pickSentence(sentences, [CLUES.datasetPrep]);
  return s ? excerpt(s) : MISSING;
}

export function extractMetricSnippet(paper, sentences) {
  const named = matchKnownMetrics(`${paper.title || ''} ${paper.abstract || ''}`);
  const s = pickSentence(sentences, [/\b(?:metric|metrics|evaluate|evaluation|measured|following(?: the)? metrics?)\b/i]);
  if (named.length && s) return `${EXCERPT_TAG}：${clip(s)}（${named.join(', ')}）`;
  if (named.length) return `摘要中出现指标名：${named.join(', ')}`;
  return s ? excerpt(s) : MISSING;
}

export function extractRelation(paper, terms) {
  const hay = `${paper.title || ''} ${paper.abstract || ''}`.toLowerCase();
  const shared = (terms || []).map((t) => String(t).toLowerCase()).filter((t) => t && hay.includes(t));
  const titleHay = (paper.title || '').toLowerCase();
  const inTitle = shared.filter((t) => titleHay.includes(t));
  if (!shared.length) {
    return `低相关：标题与摘要中未出现该想法的关键词，仅作背景参考`;
  }
  const ratio = shared.length / Math.max(1, (terms || []).length);
  const level = inTitle.length && ratio >= 0.4 ? '高相关' : ratio >= 0.35 || inTitle.length >= 2 ? '高相关' : ratio >= 0.2 ? '中相关' : '低相关';
  return `${level}：共同关键词 ${shared.slice(0, 5).join('、')}`;
}

export function extractFields(paper, terms = []) {
  const relation = extractRelation(paper, terms);
  const sentences = splitSentences(paper.abstract || '');
  // 摘要缺失时不回显标题：七个字段里除关系外一律「摘要未提及」
  if (!sentences.length) {
    return {
      question: MISSING, method: MISSING, dataset: MISSING, metric: MISSING,
      result: MISSING, limitation: MISSING, relation
    };
  }
  const use = sentences;
  const acronyms = ownAcronyms(paper.abstract);
  const question = pickSentence(use, CLUES.question) || use[0];
  const resultSentence = pickOwnResult(use, acronyms);
  const limitationSentence = pickOwnLimitation(use, resultSentence, acronyms);
  return {
    question: question ? excerpt(question) : MISSING,
    method: extractMethodSnippet(use),
    dataset: extractDatasetSnippet(paper, use),
    metric: extractMetricSnippet(paper, use),
    result: resultSentence ? excerpt(resultSentence) : MISSING,
    limitation: limitationSentence ? excerpt(limitationSentence) : MISSING,
    relation
  };
}

/* ---------------- 方法标签向量与聚类 ---------------- */

const labelCache = new WeakMap();

// 标题权重 ×2（标题里的方法词更能代表做法）
function paperLabels(paper) {
  let hit = labelCache.get(paper);
  if (!hit) {
    const title = String(paper.title || '');
    hit = matchMethodLabels(`${title} ${title} ${paper.abstract || ''}`);
    labelCache.set(paper, hit);
  }
  return hit;
}

function nameVectors(docs) {
  const df = new Map();
  docs.forEach((labs) => {
    for (const l of labs) df.set(l.label, (df.get(l.label) || 0) + 1);
  });
  const N = docs.length || 1;
  return docs.map((labs) => {
    const vec = new Map();
    for (const l of labs) vec.set(l.label, (1 + Math.log(l.hits)) * Math.log(1 + N / (df.get(l.label) || 1)));
    return vec;
  });
}

// 相似度向量：减去全库质心，把「人人都有的做法」压掉，只留差异，否则整组论文会被同一个标签黏成一簇
function distinctVectors(vecs) {
  const M = vecs.length || 1;
  const centroid = new Map();
  for (const v of vecs) {
    for (const [k, x] of v) centroid.set(k, (centroid.get(k) || 0) + x / M);
  }
  return vecs.map((v) => {
    const out = new Map();
    for (const k of new Set([...v.keys(), ...centroid.keys()])) {
      const x = (v.get(k) || 0) - (centroid.get(k) || 0);
      if (Math.abs(x) > 1e-4) out.set(k, x);
    }
    return out;
  });
}

function cosine(a, b) {
  let dot = 0;
  for (const [k, v] of a) {
    const o = b.get(k);
    if (o) dot += v * o;
  }
  if (!dot) return 0;
  const na = Math.sqrt(Array.from(a.values()).reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt(Array.from(b.values()).reduce((s, v) => s + v * v, 0));
  return dot / (na * nb || 1);
}

// 簇内标签聚合：权重（TF-IDF 求和）降序，并回收命中的英文原词用于说明
function aggregateLabels(vecs, papers, indices) {
  const agg = new Map();
  for (const i of indices) {
    for (const [label, w] of vecs[i]) {
      const e = agg.get(label) || { label, weight: 0, members: 0, words: [] };
      e.weight += w;
      e.members += 1;
      agg.set(label, e);
    }
  }
  for (const [label, e] of agg) {
    for (const i of indices) {
      const hit = paperLabels(papers[i]).find((x) => x.label === label);
      if (hit) for (const w of hit.matched) if (!e.words.includes(w)) e.words.push(w);
    }
    e.words.sort((a, b) => b.length - a.length);
  }
  return Array.from(agg.values()).sort((a, b) => b.weight - a.weight || b.members - a.members);
}

const LABEL_BY_NAME = new Map(METHOD_LABELS.map((e) => [e.label, e]));

// 命名只用「簇内至少 2 篇用到」的标签，单篇的冷门做法不足以代表一整簇
function nameLabels(top, minMembers = 1) {
  const pool = top.filter((e) => e.members >= minMembers);
  const cand = pool.length ? pool : top;
  if (!cand.length) return '其他做法';
  const first = cand[0].label;
  // 第二个标签只有与第一个足够接近才进名字，避免拼出无关后缀
  if (cand.length > 1 && cand[1].weight >= 0.4 * cand[0].weight) return `${first} · ${cand[1].label}`;
  return first;
}

function approachLine(count, top, reps) {
  const how = top.length
    ? top.slice(0, 3).map((e) => {
      const words = e.words.slice(0, 2);
      return words.length ? `${e.label}（${words.join(' / ')}）` : e.label;
    }).join('、')
    : MISSING;
  const ref = reps.map((p) => `[${p.n}]`).join('');
  return `${count} 篇，主要做法：${how}；代表 ${ref}`;
}

function nearestCluster(clusters, vecs, i) {
  let best = -1;
  let bestSim = 0;
  clusters.forEach((c, ci) => {
    for (const m of c.members) {
      const sim = cosine(vecs[i], vecs[m]);
      if (sim > bestSim) { bestSim = sim; best = ci; }
    }
  });
  return { ci: best, sim: bestSim };
}

// 贪心 TF-IDF 余弦聚类 → 3–5 簇；单篇簇并入最相近的簇
export function clusterPapers(papers, opts = {}) {
  const maxClusters = opts.maxClusters || 5;
  const threshold = opts.threshold ?? 0.18;
  if (!papers.length) return [];
  const weights = nameVectors(papers.map(paperLabels));
  const vecs = distinctVectors(weights);
  const mass = vecs.map((v) => Array.from(v.values()).reduce((s, x) => s + Math.max(0, x), 0));
  const hasLabels = weights.map((v) => v.size > 0);
  const assigned = new Map();
  const clusters = [];
  const order = papers.map((p, i) => i).sort((a, b) => mass[b] - mass[a]);

  for (const seed of order) {
    if (assigned.has(seed)) continue;
    if (!hasLabels[seed] || mass[seed] <= 0) continue;
    if (clusters.length >= maxClusters) {
      const near = nearestCluster(clusters, vecs, seed);
      const ci = near.ci >= 0 ? near.ci : clusters.length - 1;
      clusters[ci].members.push(seed);
      assigned.set(seed, ci);
      continue;
    }
    const ci = clusters.length;
    const members = [seed];
    assigned.set(seed, ci);
    for (const j of order) {
      if (assigned.has(j) || !hasLabels[j] || mass[j] <= 0) continue;
      if (cosine(vecs[seed], vecs[j]) >= threshold) {
        members.push(j);
        assigned.set(j, ci);
      }
    }
    clusters.push({ members });
  }

  // 没有任何方法标签的论文：挂到最大簇，保证每篇都有归属
  for (const i of papers.map((p, k) => k)) {
    if (assigned.has(i) || !clusters.length) continue;
    const big = clusters.reduce((a, b) => (b.members.length > a.members.length ? b : a));
    const ci = clusters.indexOf(big);
    big.members.push(i);
    assigned.set(i, ci);
  }
  // 整组论文都没命中方法词表：合成一簇「其他做法」，保证每篇都有归属
  if (!clusters.length) clusters.push({ members: papers.map((p, k) => k) });

  // 1 篇的簇并进最相近的（≥2 篇）簇
  const singles = clusters
    .map((c, ci) => ({ ci, n: c.members.length }))
    .filter((x) => x.n < 2 && clusters.length > 1)
    .sort((a, b) => a.n - b.n);
  for (const { ci } of singles) {
    const src = clusters[ci];
    if (!src || src.done) continue;
    let best = -1;
    let bestSim = 0;
    clusters.forEach((c, cj) => {
      if (cj === ci || c.members.length < 2) return;
      for (const m of src.members) {
        for (const k of c.members) {
          const sim = cosine(vecs[m], vecs[k]);
          if (sim > bestSim) { bestSim = sim; best = cj; }
        }
      }
    });
    if (best < 0) continue;
    clusters[best].members.push(...src.members);
    src.members = [];
    src.done = true;
  }

  const byScore = (a, b) => (papers[b].score || 0) - (papers[a].score || 0);
  const kept = clusters
    .filter((c) => c.members.length)
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, maxClusters);
  const out = kept.map((c) => {
    const members = c.members.slice().sort(byScore);
    const top = aggregateLabels(weights, papers, members);
    const reps = members.slice(0, 2).map((i) => papers[i]);
    return {
      name: nameLabels(top, members.length >= 2 ? 2 : 1),
      summary: approachLine(members.length, top, reps),
      papers: members.map((i) => papers[i].n),
      labels: top
    };
  });
  return out;
}

/* ---------------- 空白点 ---------------- */

function sentencesOf(papers, key) {
  return papers
    .map((p, i) => ({ p, text: String((p.fields && p.fields[key]) || ''), idx: i }))
    .filter((x) => x.text && !x.text.startsWith(MISSING));
}

// 空白点：低频方法标签 / 多数论文未共同报告的指标 / 反复出现的局限 / 摘要信息不足
export function findGaps(papers, opts = {}) {
  const gaps = [];
  // 用户输入里已经写明的做法（如 few-shot、retrieval-augmented）不算空白点
  const queryish = (opts.excludeWords || []).map((w) => String(w).toLowerCase());
  const isQueryish = (label) => (LABEL_BY_NAME.get(label)?.words || [])
    .some((w) => queryish.some((q) => q.includes(w) || w.includes(q)));
  const weights = nameVectors(papers.map(paperLabels));

  const freq = new Map();
  papers.forEach((p, i) => {
    for (const l of paperLabels(p)) {
      const e = freq.get(l.label) || { count: 0, papers: [], words: [], weight: 0 };
      e.count += 1;
      e.papers.push(p.n);
      e.weight += (weights[i].get(l.label) || 0);
      for (const w of l.matched.slice(0, 2)) if (!e.words.includes(w)) e.words.push(w);
      freq.set(l.label, e);
    }
  });
  const rare = Array.from(freq.entries())
    .filter(([label, e]) => e.count <= 2 && !isQueryish(label))
    .sort((a, b) => a[1].count - b[1].count || b[1].weight - a[1].weight)
    .slice(0, 2);
  for (const [label, e] of rare) {
    const words = e.words.slice(0, 2).join(' / ');
    gaps.push({
      kind: 'rare',
      title: `「${label}」${words ? `（${words}）` : ''}只有 ${e.count} 篇用到`,
      detail: `这一做法仅见于 [${e.papers.join('][')}]，其余论文集中在别的方法路线；把它迁移到更多任务/数据集上的系统性验证，在摘要层面还没看到。`,
      papers: e.papers
    });
  }

  const metricUnion = new Set();
  const reported = new Map();
  for (const p of papers) {
    for (const m of matchKnownMetrics(`${p.title || ''} ${p.abstract || ''}`)) {
      metricUnion.add(m);
      const e = reported.get(m) || [];
      e.push(p.n);
      reported.set(m, e);
    }
  }
  const weak = Array.from(reported.entries()).filter(([, list]) => list.length <= Math.max(2, Math.ceil(papers.length * 0.25)));
  if (metricUnion.size && weak.length) {
    const ids = Array.from(new Set(weak.flatMap(([, l]) => l)));
    gaps.push({
      kind: 'metric',
      title: `多数论文未共同报告 ${weak.map(([m]) => m).slice(0, 3).join(' / ')} 等指标`,
      detail: `这些指标只有 [${ids.slice(0, 5).join('][')}] 给出数字，跨论文不可直接比较；统一评测口径是可切入的空隙。`,
      papers: ids.slice(0, 6)
    });
  }

  const repeat = new Map();
  for (const p of papers) {
    const text = String((p.fields && p.fields.limitation) || '').replace(/^原文摘录：/, '');
    if (!text || text.startsWith(MISSING)) continue;
    for (const l of matchMethodLabels(text).slice(0, 3)) {
      const e = repeat.get(l.label) || { count: 0, papers: [] };
      e.count += 1;
      e.papers.push(p.n);
      repeat.set(l.label, e);
    }
  }
  const again = Array.from(repeat.entries())
    .filter(([, e]) => e.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 2);
  for (const [label, e] of again) {
    gaps.push({
      kind: 'repeat',
      title: `「${label}」这条路线上多篇自陈不足`,
      detail: `${e.count} 篇论文在局限句里都承认与「${label}」有关的问题：[${Array.from(new Set(e.papers)).join('][')}]。这是被现有工作承认但尚未解决的地方。`,
      papers: Array.from(new Set(e.papers))
    });
  }

  const missing = papers.filter((p) => !p.abstract || String(p.abstract).length < 60).map((p) => p.n);
  if (missing.length >= 3) {
    gaps.push({
      kind: 'sparse',
      title: '部分高相关论文摘要信息量不足',
      detail: `[${missing.slice(0, 6).join('][')}] 的摘要过短或缺失，方法/数据集细节需要读原文才能确认，先补全这些工作的对比信息可能改变结论。`,
      papers: missing
    });
  }

  const seen = new Set();
  return gaps.filter((g) => {
    if (seen.has(g.title)) return false;
    seen.add(g.title);
    return true;
  });
}

// 模式 A 取 3–4 条；模式 B 取 1–2 条，优先「反复出现的局限」与「评测口径不一致」这类有直接依据的
export function pickGaps(all, mode) {
  const order = mode === 'problem' ? ['repeat', 'metric', 'rare', 'sparse'] : ['rare', 'metric', 'repeat', 'sparse'];
  const sorted = all
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (order.indexOf(a.g.kind) - order.indexOf(b.g.kind)) || a.i - b.i)
    .map(({ g }) => g);
  return sorted.slice(0, mode === 'problem' ? 2 : 4).map((g) => ({ ...g, papers: Array.from(new Set(g.papers || [])) }));
}

/* ---------------- 模式 B：按解决思路分组 ---------------- */

export function buildApproaches(papers, clusters) {
  const basis = (clusters && clusters.length ? clusters : clusterPapers(papers)).slice(0, 5);
  return basis.map((c) => {
    const members = papers.filter((p) => c.papers.includes(p.n));
    const effects = sentencesOf(members, 'result').slice(0, 3);
    const limits = sentencesOf(members, 'limitation').slice(0, 3);
    const join = (list) => (list.length
      ? list.map(({ p, text }) => `[${p.n}] ${text.replace(/^原文摘录：/, '')}`).join('；')
      : MISSING);
    return {
      name: c.name,
      summary: c.summary,
      papers: c.papers,
      effect: clip(join(effects), 700),
      limits: clip(join(limits), 700)
    };
  });
}

/* ---------------- 规则模式总入口 ---------------- */

export function rulesResult({ id, mode, input, queries, papers, counts, dedupedTotal, seconds, engine } = {}) {
  const terms = keywords(input || '').terms;
  // 已有 fields 的论文直接沿用，避免重复抽取
  const withFields = (papers || []).map((p) => (p.fields ? { ...p } : { ...p, fields: extractFields(p, terms) }));
  const isProblem = mode === 'problem';
  const clusters = clusterPapers(withFields).map((c) => ({ name: c.name, summary: c.summary, papers: c.papers }));
  return annotatePapers({
    id: id || 'live',
    mode: isProblem ? 'problem' : 'idea',
    input: input || '',
    engine: engine || 'rules',
    generatedAt: new Date().toISOString().slice(0, 10),
    queries: queries || [],
    stats: {
      openalex: 0,
      arxiv: 0,
      s2: 0,
      ...Object.fromEntries(
        ['openalex', 'arxiv', 's2', 'crossref', 'europepmc', 'dblp', 'scopus', 'ieee', 'springer', 'core', 'serpapi', 'import']
          .filter((key) => counts && key in counts)
          .map((key) => [key, Number(counts[key]) || 0])
      ),
      deduped: dedupedTotal ?? withFields.length,
      kept: withFields.length,
      seconds: Number(seconds) || 0
    },
    papers: withFields,
    clusters,
    gaps: pickGaps(findGaps(withFields, { excludeWords: terms }), isProblem ? 'problem' : 'idea'),
    approaches: isProblem ? buildApproaches(withFields, clusters) : []
  });
}
