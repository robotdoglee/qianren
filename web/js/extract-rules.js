// 规则模式：7 字段抽取 + 方法聚类 + 空白点分析（只依据标题与摘要，缺失一律「摘要未提及」）
import { CLUES, METHOD_WORDS, matchKnownDatasets, matchKnownMetrics, keywords } from './terms.js';

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
  const sentences = splitSentences(paper.abstract || '');
  const use = sentences.length ? sentences : splitSentences(paper.title || '');
  if (!use.length) {
    return {
      question: MISSING, method: MISSING, dataset: MISSING, metric: MISSING,
      result: MISSING, limitation: MISSING, relation: extractRelation(paper, terms)
    };
  }
  const question = pickSentence(use, CLUES.question) || (use.length ? use[0] : '');
  const result = pickSentence(use, CLUES.result, (s) => /\d|outperform|improve|state[- ]of[- ]the[- ]art|achiev/i.test(s));
  const limitation = pickSentence(use, CLUES.limitation, (s) => s !== question);
  return {
    question: question ? excerpt(question) : MISSING,
    method: extractMethodSnippet(use),
    dataset: extractDatasetSnippet(paper, use),
    metric: extractMetricSnippet(paper, use),
    result: result ? excerpt(result) : MISSING,
    limitation: limitation ? excerpt(limitation) : MISSING,
    relation: extractRelation(paper, terms)
  };
}

function methodTokens(paper) {
  const text = `${paper.title || ''} ${paper.method || ''} ${(paper.fields && paper.fields.method) || ''} ${paper.abstract || ''}`.toLowerCase();
  const hits = METHOD_WORDS.filter((w) => text.includes(w));
  return Array.from(new Set(hits));
}

function buildVectors(papers) {
  const docs = papers.map(methodTokens);
  const df = new Map();
  docs.forEach((toks) => {
    for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1);
  });
  const N = docs.length || 1;
  return docs.map((toks) => {
    const vec = new Map();
    for (const t of new Set(toks)) {
      const tf = toks.filter((x) => x === t).length;
      vec.set(t, (1 + Math.log(tf)) * Math.log(1 + N / (df.get(t) || 1)));
    }
    return vec;
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

function topTerms(vecs, indices, limit = 3) {
  const agg = new Map();
  for (const i of indices) {
    for (const [k, v] of vecs[i]) agg.set(k, (agg.get(k) || 0) + v);
  }
  return Array.from(agg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

function humanizeName(terms) {
  if (!terms.length) return '其他路径';
  const labels = terms.map((t) =>
    t.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/-/g, ' ')
  );
  return `${labels.slice(0, 2).join(' + ')}${labels.length > 2 ? ` 等 ${labels.length} 类关键词` : ''}`;
}

// 贪心 TF-IDF 余弦聚类，输出 3–5 簇
export function clusterPapers(papers, opts = {}) {
  const maxClusters = opts.maxClusters || 5;
  const threshold = opts.threshold || 0.22;
  if (!papers.length) return [];
  const vecs = buildVectors(papers);
  const assigned = new Map();
  const clusters = [];
  const order = papers.map((p, i) => i).sort((a, b) => vecs[b].size - vecs[a].size);
  for (const seed of order) {
    if (assigned.has(seed)) continue;
    if (vecs[seed].size === 0) continue;
    if (clusters.length >= maxClusters) {
      // 已有足够簇时，把剩余论文归入最相近的一簇
      let best = -1;
      let bestSim = 0;
      clusters.forEach((c, ci) => {
        for (const m of c.members) {
          const sim = cosine(vecs[seed], vecs[m]);
          if (sim > bestSim) { bestSim = sim; best = ci; }
        }
      });
      if (best >= 0 && bestSim > 0.08) {
        clusters[best].members.push(seed);
        assigned.set(seed, best);
        continue;
      }
      continue;
    }
    const ci = clusters.length;
    const members = [seed];
    assigned.set(seed, ci);
    for (const j of order) {
      if (assigned.has(j) || vecs[j].size === 0) continue;
      if (cosine(vecs[seed], vecs[j]) >= threshold) {
        members.push(j);
        assigned.set(j, ci);
      }
    }
    clusters.push({ members });
  }
  const leftovers = papers.map((p, i) => i).filter((i) => !assigned.has(i));
  if (leftovers.length) {
    if (clusters.length < maxClusters) clusters.push({ members: leftovers });
    else leftovers.forEach((i) => clusters[clusters.length - 1].members.push(i));
  }
  clusters.sort((a, b) => b.members.length - a.members.length);
  return clusters.slice(0, maxClusters).map((c) => {
    const numbers = c.members.map((i) => papers[i].n);
    const names = topTerms(vecs, c.members, 3);
    const lead = papers[c.members[0]];
    return {
      name: humanizeName(names),
      summary: `共 ${c.members.length} 篇：多采用 ${names.slice(0, 3).join(' / ') || '（摘要未提及方法关键词）'}；代表工作《${clip(lead.title, 90)}》[${numbers.slice(0, 4).join('][')}]。`,
      papers: numbers
    };
  });
}

function sentencesOf(papers, key) {
  return papers
    .map((p, i) => ({ p, text: String((p.fields && p.fields[key]) || ''), idx: i }))
    .filter((x) => x.text && !x.text.startsWith(MISSING));
}

// 空白点：低频方法×数据集组合 / 多数论文未报告指标 / 反复出现的局限
export function findGaps(papers, clusters) {
  const gaps = [];
  const vecs = buildVectors(papers);

  const methodFreq = new Map();
  papers.forEach((p, i) => {
    for (const t of new Set(methodTokens(p))) {
      const e = methodFreq.get(t) || { count: 0, papers: [] };
      e.count += 1;
      e.papers.push(p.n);
      methodFreq.set(t, e);
    }
  });
  const rareMethods = Array.from(methodFreq.entries())
    .filter(([, e]) => e.count <= 2)
    .sort((a, b) => a[1].count - b[1].count)
    .slice(0, 3);
  for (const [m, e] of rareMethods) {
    gaps.push({
      title: `「${m}」只在 ${e.count} 篇中出现，尚未与更多场景/数据集组合`,
      detail: `${m} 仅见于 [${e.papers.join('][')}]，其余论文集中在别的方法路线；把该路线迁移到其他任务/数据上的系统性验证在摘要层面尚未看到。`,
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
    gaps.push({
      title: `多数论文未共同报告 ${weak.map(([m]) => m).slice(0, 3).join(' / ')} 等指标`,
      detail: `在这些指标上只有 [${Array.from(new Set(weak.flatMap(([, l]) => l))).slice(0, 5).join('][')}] 给出数字，跨论文不可直接比较；统一评测口径是一个可切入的空隙。`,
      papers: Array.from(new Set(weak.flatMap(([, l]) => l))).slice(0, 6)
    });
  }

  const limitationWords = new Map();
  for (const p of papers) {
    const text = String((p.fields && p.fields.limitation) || '');
    if (!text || text.startsWith(MISSING)) continue;
    const { terms } = keywords(`${p.title} ${text}`);
    for (const t of new Set(terms.slice(0, 4))) {
      const e = limitationWords.get(t) || { count: 0, papers: [] };
      e.count += 1;
      e.papers.push(p.n);
      limitationWords.set(t, e);
    }
  }
  const repeated = Array.from(limitationWords.entries())
    .filter(([, e]) => e.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 2);
  for (const [w, e] of repeated) {
    gaps.push({
      title: `反复出现的局限：${w}`,
      detail: `${e.count} 篇论文在局限/挑战表述中指向同一处（${w}）：[${e.papers.join('][')}]。这是被现有工作承认但尚未解决的问题。`,
      papers: e.papers
    });
  }

  const missing = papers.filter((p) => !p.abstract || String(p.abstract).length < 60).map((p) => p.n);
  if (missing.length >= 3) {
    gaps.push({
      title: '部分高相关论文摘要信息量不足',
      detail: `[${missing.slice(0, 6).join('][')}] 的摘要过短或缺失，方法/数据集细节需要读原文才能确认，先补全这些工作的对比信息可能改变结论。`,
      papers: missing
    });
  }

  const seen = new Set();
  return gaps
    .filter((g) => {
      const k = g.title;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 4)
    .map((g) => ({ ...g, papers: Array.from(new Set(g.papers)) }));
}

// 模式 B：按解决思路分组
export function buildApproaches(papers, clusters) {
  const basis = (clusters && clusters.length ? clusters : clusterPapers(papers)).slice(0, 5);
  return basis.map((c) => {
    const members = papers.filter((p) => c.papers.includes(p.n));
    const effects = sentencesOf(members, 'result').slice(0, 3);
    const limits = sentencesOf(members, 'limitation').slice(0, 3);
    const effect = effects.length
      ? effects.map(({ p, text }) => `[${p.n}] ${text.replace(/^原文摘录：/, '')}`).join('；')
      : MISSING;
    const limits2 = limits.length
      ? limits.map(({ p, text }) => `[${p.n}] ${text.replace(/^原文摘录：/, '')}`).join('；')
      : MISSING;
    const names = topTerms(buildVectors(members), members.map((_, i) => i), 2);
    return {
      name: c.name,
      summary: `${members.length} 篇论文属于这一思路，共同关键词：${names.join(' / ') || '（摘要未提及）'}。代表工作 [${c.papers.slice(0, 4).join('][')}]。`,
      papers: c.papers,
      effect: clip(effect, 700),
      limits: clip(limits2, 700)
    };
  });
}

// 规则模式：从输入到完整结果对象（渲染器只吃这个结构）
export function rulesResult({ id, mode, input, queries, papers, counts, dedupedTotal, seconds, engine } = {}) {
  const terms = keywords(input || '').terms;
  // 已有 fields 的论文直接沿用，避免重复抽取
  const withFields = (papers || []).map((p) => (p.fields ? { ...p } : { ...p, fields: extractFields(p, terms) }));
  const isProblem = mode === 'problem';
  const clusters = clusterPapers(withFields);
  return {
    id: id || 'live',
    mode: isProblem ? 'problem' : 'idea',
    input: input || '',
    engine: engine || 'rules',
    generatedAt: new Date().toISOString().slice(0, 10),
    queries: queries || [],
    stats: {
      openalex: (counts || {}).openalex ?? 0,
      arxiv: (counts || {}).arxiv ?? 0,
      s2: (counts || {}).s2 ?? 0,
      deduped: dedupedTotal ?? withFields.length,
      kept: withFields.length,
      seconds: Number(seconds) || 0
    },
    papers: withFields,
    clusters,
    gaps: isProblem ? [] : findGaps(withFields, clusters),
    approaches: isProblem ? buildApproaches(withFields, clusters) : []
  };
}
