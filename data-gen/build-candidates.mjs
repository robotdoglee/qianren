import fs from 'node:fs';
import { dedupe, rank, queryTermsFor } from '../web/js/search.js';
import { rulesResult } from '../web/js/extract-rules.js';
const cache = JSON.parse(fs.readFileSync('data-gen/works-cache.json'));
const ids = JSON.parse(fs.readFileSync('data-gen/ids.json'));
const demos = {
  'demo-rag-med': { mode: 'idea', input: '用检索增强生成减少大模型在医学问答中的幻觉' },
  'demo-gnn-fewshot': { mode: 'idea', input: '用图神经网络在小样本数据上预测分子性质' },
  'demo-imbalance': { mode: 'problem', input: '我的医学影像分类模型在类别极度不平衡时少数类召回率很低' },
};
// 摘要字段实际是作者/会议信息而非摘要的条目 —— 视为无摘要
const BAD_ABSTRACT = new Set(['W4411120331']);
for (const [id, d] of Object.entries(demos)) {
  const all = [];
  for (const lst of ids[id].ids) for (const w of lst) {
    const c = cache[w]; if (!c) continue;
    all.push({ title: c.title, authors: c.authors.slice(0, 12), year: c.year, venue: c.venue || '', url: c.doi ? `https://doi.org/${c.doi}` : c.openalex,
      doi: c.doi || '', arxiv: '', sources: ['openalex'], citations: c.citations || 0,
      abstract: BAD_ABSTRACT.has(w) ? '' : (c.abstract || ''), openalex: c.openalex });
  }
  const raw = all.length;
  const dd = dedupe(all);
  const withAbs = dd.filter(p => p.abstract && p.abstract.length > 300);
  const ranked = rank(withAbs, queryTermsFor(d.input), { keep: 15 });
  const res = rulesResult({ id, mode: d.mode, input: d.input, queries: ids[id].queries, papers: ranked, counts: { openalex: raw, arxiv: 0, s2: 0 }, dedupedTotal: dd.length, seconds: 0, engine: 'demo' });
  fs.writeFileSync(`data-gen/cand-${id}.json`, JSON.stringify(res, null, 1));
  console.log(id, 'raw', raw, 'dedup', dd.length, 'withAbs', withAbs.length, 'kept', ranked.length);
  ranked.forEach(p => console.log('  ', p.n, p.score, p.year, p.title.slice(0, 90)));
}
