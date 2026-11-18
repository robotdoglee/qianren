// 校验 web/demos/demo-*.json：JSON 合法、7 字段齐全、引用编号有效、元数据未被改写、无候选文件之外的论文、index 一致。
import fs from 'node:fs';

const IDS = ['demo-rag-med', 'demo-gnn-fewshot', 'demo-imbalance'];
const FIELDS = ['question', 'method', 'dataset', 'metric', 'result', 'limitation', 'relation'];
const META = ['title', 'authors', 'year', 'venue', 'url', 'doi', 'citations', 'abstract'];
const refsIn = (t) => [...String(t || '').matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1]));

let errors = 0;
const bad = (id, msg) => { errors += 1; console.error(`✗ ${id}: ${msg}`); };

for (const id of IDS) {
  let d;
  try {
    d = JSON.parse(fs.readFileSync(`web/demos/${id}.json`, 'utf8'));
  } catch (e) {
    bad(id, `JSON 解析失败 ${e.message}`);
    continue;
  }
  const cand = JSON.parse(fs.readFileSync(`data-gen/cand-${id}.json`, 'utf8'));
  const byKey = new Map(cand.papers.map((p) => [`${p.title}|||${p.doi}`, p]));
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const N = d.papers.length;
  console.log(`• ${id} (${d.mode}) 保留 ${N} 篇，编号 n=1..${N}`);

  if (!(N >= 10 && N <= 13)) bad(id, `保留篇数 ${N} 不在 10–13`);
  if (d.papers.some((p, i) => p.n !== i + 1)) bad(id, '编号不是连续的 1..N');
  if (d.stats.kept !== N) bad(id, `stats.kept=${d.stats.kept} 与实际篇数 ${N} 不一致`);
  if (d.engine !== 'demo') bad(id, 'engine 应为 demo');
  if (d.generatedAt !== '2026-11-18') bad(id, 'generatedAt 应为 2026-11-18');
  if (!d.stats.note || !d.stats.note.includes('限流')) bad(id, 'stats.note 缺失');
  if (d.stats.arxiv !== 0 || d.stats.s2 !== 0 || d.stats.seconds !== 0) bad(id, 'arxiv/s2/seconds 应均为 0');
  if (d.stats.openalex !== cand.stats.openalex || d.stats.deduped !== cand.stats.deduped) bad(id, 'openalex/deduped 未沿用候选文件的值');
  if (String(d.queries) !== String(cand.queries)) bad(id, 'queries 未沿用候选文件');

  const seenTitles = new Set();
  for (const p of d.papers) {
    const src = byKey.get(`${p.title}|||${p.doi}`);
    if (!src) { bad(id, `n=${p.n} 标题/DOI 不在候选文件中：${p.title.slice(0, 60)}`); continue; }
    const nt = norm(p.title);
    if (seenTitles.has(nt)) bad(id, `n=${p.n} 标题实质重复：${p.title.slice(0, 60)}`);
    seenTitles.add(nt);
    for (const k of META) {
      if (JSON.stringify(p[k]) !== JSON.stringify(src[k])) bad(id, `n=${p.n} 的元数据 ${k} 被改写`);
    }
    for (const k of FIELDS) {
      const v = p.fields && p.fields[k];
      if (typeof v !== 'string' || !v.trim()) bad(id, `n=${p.n} 字段 ${k} 缺失或为空`);
      else if (v.length < 5) bad(id, `n=${p.n} 字段 ${k} 过短`);
    }
    for (const k of Object.keys(p.fields || {})) if (!FIELDS.includes(k)) bad(id, `n=${p.n} 有多余字段 ${k}`);
    const abs = src.abstract || '';
    for (const m of String(p.fields.result || '').matchAll(/\d[\d.,]{2,}/g)) {
      if (!abs.includes(m[0])) bad(id, `n=${p.n} result 中的数字 ${m[0]} 在摘要里找不到`);
    }
  }

  const check = (arr, label) => {
    if (!Array.isArray(arr)) { bad(id, `${label} 的 papers 不是数组`); return; }
    for (const n of arr) if (!(n >= 1 && n <= N)) bad(id, `${label} 引用越界 [${n}]`);
  };
  const checkText = (text, label) => {
    for (const n of refsIn(text)) if (!(n >= 1 && n <= N)) bad(id, `${label} 文本引用越界 [${n}]`);
  };

  for (const c of d.clusters) { check(c.papers, `簇「${c.name}」`); checkText(c.summary, `簇「${c.name}」`); if (!c.name || !c.summary) bad(id, `簇「${c.name}」缺 name/summary`); }
  for (const g of d.gaps) { checkText(g.detail, `空白点「${g.title}」`); if (g.papers) check(g.papers, `空白点「${g.title}」`); if (!g.title || !g.detail) bad(id, `空白点缺 title/detail`); if (!refsIn(g.detail).length) bad(id, `空白点「${g.title}」detail 未引用 [n]`); }
  if (d.mode === 'idea') {
    if (d.approaches.length) bad(id, '模式 A 的 approaches 应为空数组');
    if (!(d.clusters.length >= 3 && d.clusters.length <= 5)) bad(id, `模式 A clusters 数 ${d.clusters.length} 不在 3–5`);
    if (!(d.gaps.length >= 3 && d.gaps.length <= 4)) bad(id, `模式 A gaps 数 ${d.gaps.length} 不在 3–4`);
  } else {
    if (!(d.approaches.length >= 3 && d.approaches.length <= 5)) bad(id, `模式 B approaches 数 ${d.approaches.length} 不在 3–5`);
    const covered = new Set();
    for (const a of d.approaches) {
      for (const k of ['name', 'summary', 'papers', 'effect', 'limits']) if (!a[k]) bad(id, `思路「${a.name}」缺 ${k}`);
      if (!(a.papers.length >= 2 && a.papers.length <= 4)) bad(id, `思路「${a.name}」代表论文数 ${a.papers.length} 不在 2–4`);
      check(a.papers, `思路「${a.name}」`);
      for (const t of ['summary', 'effect', 'limits']) checkText(a[t], `思路「${a.name}」${t}`);
      a.papers.forEach((n) => covered.add(n));
    }
    const missing = Array.from({ length: N }, (_, i) => i + 1).filter((n) => !covered.has(n));
    if (missing.length) bad(id, `有论文未归入任何解决思路：${missing}`);
  }

  const cited = new Set(d.clusters.flatMap((c) => c.papers));
  if (d.clusters.some((c) => !c.papers.length)) bad(id, '有空簇');
  console.log(`  clusters=${d.clusters.length} gaps=${d.gaps.length} approaches=${d.approaches.length} 簇覆盖=${cited.size}/${N}`);
}

const index = JSON.parse(fs.readFileSync('web/demos/index.json', 'utf8'));
for (const id of IDS) {
  if (!index.demos.some((x) => x.id === id)) errors += 1, console.error(`✗ index.json 缺少 ${id}`);
}

console.log(errors ? `\n校验失败：${errors} 项` : '\n校验通过');
process.exit(errors ? 1 : 0);
