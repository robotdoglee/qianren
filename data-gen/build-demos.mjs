// 由 data-gen/cand-<id>.json（真实 OpenAlex 元数据）+ data-gen/author-<id>.json（人工撰写的 7 字段与分析结构）
// 生成 web/demos/demo-<id>.json。论文元数据一律原样复制，只重排编号并替换 fields。
import fs from 'node:fs';

const IDS = ['demo-rag-med', 'demo-gnn-fewshot', 'demo-imbalance'];
const FIELDS = ['question', 'method', 'dataset', 'metric', 'result', 'limitation', 'relation'];
const NOTE = '演示数据生成时 arXiv 与 Semantic Scholar 对生成环境 IP 限流，故仅含 OpenAlex 结果；实时模式会同时检索三个来源。';
const META_KEYS = ['title', 'authors', 'year', 'venue', 'url', 'doi', 'arxiv', 'sources', 'citations', 'abstract', 'openalex', 'id', 'score', 'matchedTerms'];

const fail = (id, msg) => { throw new Error(`[${id}] ${msg}`); };
const refsIn = (text) => [...String(text || '').matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1]));

for (const id of IDS) {
  const cand = JSON.parse(fs.readFileSync(`data-gen/cand-${id}.json`, 'utf8'));
  const spec = JSON.parse(fs.readFileSync(`data-gen/author-${id}.json`, 'utf8'));
  const byOld = new Map(cand.papers.map((p) => [p.n, p]));
  const N = spec.keep.length;

  if (N < 10 || N > 13) fail(id, `保留篇数 ${N} 不在 10–13`);
  if (new Set(spec.keep).size !== N) fail(id, 'keep 中有重复编号');
  const rest = cand.papers.map((p) => p.n).filter((n) => !spec.keep.includes(n));
  const dropped = (spec.dropped || []).map((d) => d.n).sort((a, b) => a - b);
  if (String(rest.sort((a, b) => a - b)) !== String(dropped)) fail(id, `剔除清单与实际不符：实际未保留 ${rest}，声明剔除 ${dropped}`);

  const papers = spec.keep.map((oldN, i) => {
    const src = byOld.get(oldN);
    if (!src) fail(id, `候选文件中不存在 n=${oldN}`);
    if (!src.abstract || src.abstract.length < 200) fail(id, `n=${oldN} 摘要缺失，不能凭空填写字段`);
    const f = spec.fields[String(oldN)];
    if (!f) fail(id, `n=${oldN} 缺少 fields`);
    for (const k of FIELDS) {
      const v = f[k];
      if (typeof v !== 'string' || !v.trim()) fail(id, `n=${oldN}（新号 ${i + 1}）字段 ${k} 为空`);
    }
    for (const k of Object.keys(f)) if (!FIELDS.includes(k)) fail(id, `n=${oldN} 有多余字段 ${k}`);
    const out = { ...src, n: i + 1 };
    for (const k of Object.keys(src)) if (!META_KEYS.includes(k) && k !== 'n' && k !== 'fields') delete out[k];
    out.fields = Object.fromEntries(FIELDS.map((k) => [k, f[k]]));
    return out;
  });

  const checkRefs = (arr, label) => {
    if (!Array.isArray(arr)) fail(id, `${label} 的 papers 不是数组`);
    for (const n of arr) if (!(n >= 1 && n <= N)) fail(id, `${label} 引用了不存在的编号 [${n}]`);
  };

  if (cand.mode === 'problem') {
    if (spec.clusters.length < 3 || spec.clusters.length > 5) fail(id, 'clusters 数量需在 3–5');
    if (spec.approaches.length < 3 || spec.approaches.length > 5) fail(id, 'approaches 数量需在 3–5');
    if (spec.gaps.length < 1 || spec.gaps.length > 4) fail(id, 'gaps 数量需在 1–4');
  } else {
    if (spec.clusters.length < 3 || spec.clusters.length > 5) fail(id, 'clusters 数量需在 3–5');
    if (spec.gaps.length < 3 || spec.gaps.length > 4) fail(id, '模式 A 的 gaps 数量需在 3–4');
    if (spec.approaches.length !== 0) fail(id, '模式 A 的 approaches 必须为空数组');
  }

  const clusters = spec.clusters.map((c) => {
    if (!c.name || !c.summary) fail(id, `簇「${c.name}」缺 name/summary`);
    checkRefs(c.papers, `簇「${c.name}」`);
    for (const n of refsIn(c.summary)) if (!(n >= 1 && n <= N)) fail(id, `簇「${c.name}」说明引用 [${n}] 越界`);
    return { name: c.name, summary: c.summary, papers: c.papers };
  });

  const gaps = spec.gaps.map((g) => {
    if (!g.title || !g.detail) fail(id, `空白点「${g.title}」缺 title/detail`);
    if (!refsIn(g.detail).length) fail(id, `空白点「${g.title}」的 detail 未以 [n] 引用论文`);
    for (const n of refsIn(g.detail)) if (!(n >= 1 && n <= N)) fail(id, `空白点「${g.title}」引用 [${n}] 越界`);
    if (g.papers) checkRefs(g.papers, `空白点「${g.title}」`);
    return g.papers ? { title: g.title, detail: g.detail, papers: g.papers } : { title: g.title, detail: g.detail };
  });

  const approaches = spec.approaches.map((a) => {
    for (const k of ['name', 'summary', 'papers', 'effect', 'limits']) if (!a[k]) fail(id, `思路「${a.name}」缺 ${k}`);
    if (a.papers.length < 2 || a.papers.length > 4) fail(id, `思路「${a.name}」的代表论文需 2–4 篇`);
    checkRefs(a.papers, `思路「${a.name}」`);
    for (const n of [...refsIn(a.summary), ...refsIn(a.effect), ...refsIn(a.limits)]) {
      if (!(n >= 1 && n <= N)) fail(id, `思路「${a.name}」引用 [${n}] 越界`);
    }
    return { name: a.name, summary: a.summary, papers: a.papers, effect: a.effect, limits: a.limits };
  });

  const covered = new Set(approaches.flatMap((a) => a.papers));
  if (approaches.length && [...Array(N).keys()].map((i) => i + 1).some((n) => !covered.has(n))) {
    fail(id, `并非每篇都归入某个解决思路，缺少 ${[...Array(N).keys()].map((i) => i + 1).filter((n) => !covered.has(n))}`);
  }

  const result = {
    id,
    mode: cand.mode,
    input: cand.input,
    engine: 'demo',
    generatedAt: '2026-11-18',
    queries: cand.queries,
    stats: {
      openalex: cand.stats.openalex,
      arxiv: 0,
      s2: 0,
      deduped: cand.stats.deduped,
      kept: N,
      seconds: 0,
      note: NOTE
    },
    papers,
    clusters,
    gaps,
    approaches
  };

  fs.mkdirSync('web/demos', { recursive: true });
  fs.writeFileSync(`web/demos/${id}.json`, `${JSON.stringify(result, null, 1)}\n`);
  console.log(id, 'kept', N, 'clusters', clusters.length, 'gaps', gaps.length, 'approaches', approaches.length);
}
