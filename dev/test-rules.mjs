// 离线单元测试：规则查询扩展、去重、排序、规则抽取、导出（不访问网络）
// 运行： node dev/test-rules.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildQueries, keywords, segmentChinese, STOPWORDS } from '../web/js/terms.js';
import {
  dedupe, rank, restoreAbstract, titleKey, parseAtom, fromOpenAlex, fromS2, fromArxivEntry,
  openalexUrl, s2Url, arxivUrl, proxyUrl, attempt, fetchSource, searchAll, MAX_N
} from '../web/js/search.js';
import { extractFields, clusterPapers, findGaps, buildApproaches, rulesResult, MISSING } from '../web/js/extract-rules.js';
import { toMarkdown, toCSV, toBibTeX, bibKey, fileName } from '../web/js/export.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, 'fixture.json'), 'utf8'));

const IDEA = '用检索增强生成减少大模型在医学问答中的幻觉';

test('术语词典：中文最长匹配与翻译', () => {
  assert.deepEqual(segmentChinese('大语言模型').hits, ['大语言模型']);
  const { terms } = keywords(IDEA);
  assert.ok(terms.includes('retrieval-augmented generation'), terms.join(','));
  assert.ok(terms.includes('large language model'), terms.join(','));
  assert.ok(terms.includes('hallucination'), terms.join(','));
  assert.ok(terms.includes('medical question answering'), terms.join(','));
});

test('规则查询扩展：生成 3–5 条英文检索式', () => {
  const qs = buildQueries(IDEA);
  assert.ok(qs.length >= 3 && qs.length <= 5, `实际 ${qs.length} 条`);
  for (const q of qs) {
    assert.ok(/[a-z]/.test(q), q);
    assert.ok(!/[\u4e00-\u9fff]/.test(q), `检索式不应含中文：${q}`);
  }
  assert.ok(qs.some((q) => q.includes('hallucination')));
  assert.ok(buildQueries('few-shot molecular property prediction with graph neural networks').length >= 3);
  assert.deepEqual(buildQueries(''), []);
});

// 断言：3–5 条检索式，纯英文，且不含任何停用词 token
function assertCleanQueries(qs) {
  assert.ok(qs.length >= 3 && qs.length <= 5, `检索式应 3–5 条，实际 ${qs.length}：${JSON.stringify(qs)}`);
  for (const q of qs) {
    assert.ok(!/[\u4e00-\u9fff]/.test(q), `检索式不应含中文：${q}`);
    for (const raw of q.split(/\s+/)) {
      const w = raw.toLowerCase().replace(/[^a-z]/g, '');
      assert.ok(!w || !STOPWORDS.has(w), `检索式含停用词「${raw}」：${q}`);
    }
  }
}

test('中文预处理：程度副词/虚词剔除 + 最长匹配 + 保留内嵌英文', () => {
  // 「极度」被剔除后「类别不平衡」应命中；「少数类」「分类」需识别；CT 原样保留
  const imbalance = keywords('我的医学影像分类模型在类别极度不平衡时少数类召回率很低');
  for (const want of ['class imbalance', 'minority class', 'classification', 'medical imaging', 'recall']) {
    assert.ok(imbalance.terms.includes(want), `缺少术语 ${want}：${imbalance.terms.join(',')}`);
  }
  const denoise = keywords('基于扩散模型的低剂量CT图像去噪');
  for (const want of ['diffusion model', 'low-dose', 'image denoising', 'CT']) {
    assert.ok(denoise.terms.includes(want), `缺少术语 ${want}：${denoise.terms.join(',')}`);
  }
  // 未识别片段兜底：仅剩的「低」等单字不进 unmapped
  assert.deepEqual(imbalance.unmapped, [], `不应有未识别片段：${imbalance.unmapped.join(',')}`);
});

test('英文输入：停用词过滤 + 短语识别', () => {
  const r = keywords('How to detect AI-generated text in student essays');
  assert.ok(r.terms.includes('AI-generated text'), r.terms.join(','));
  assert.ok(r.terms.includes('student essays'), r.terms.join(','));
  // 不应把 how/to/in 这类词带进术语或检索式
  assert.ok(!r.terms.some((t) => STOPWORDS.has(t.toLowerCase())), r.terms.join(','));
  assertCleanQueries(buildQueries('How to detect AI-generated text in student essays'));
});

test('五个真实输入的检索式均 3–5 条且不含停用词', () => {
  for (const s of [
    '我的医学影像分类模型在类别极度不平衡时少数类召回率很低',
    '基于扩散模型的低剂量CT图像去噪',
    'How to detect AI-generated text in student essays',
    '用检索增强生成减少大模型在医学问答中的幻觉',
    '用图神经网络在小样本数据上预测分子性质'
  ]) {
    assertCleanQueries(buildQueries(s));
  }
  // RAG 与 GNN 输入的术语质量
  const rag = keywords('用检索增强生成减少大模型在医学问答中的幻觉').terms;
  assert.ok(rag.includes('retrieval-augmented generation') && rag.includes('hallucination'), rag.join(','));
  const gnn = keywords('用图神经网络在小样本数据上预测分子性质').terms;
  assert.ok(gnn.includes('graph neural network') && gnn.includes('few-shot') && gnn.includes('molecular property prediction'), gnn.join(','));
});

test('词典规模 ≥ 400 条', async () => {
  const { TERMS } = await import('../web/js/terms.js');
  assert.ok(TERMS.length >= 400, `词典仅 ${TERMS.length} 条`);
});

test('OpenAlex 摘要还原', () => {
  const text = restoreAbstract({
    We: [0], propose: [1], a: [2], method: [3], dot: [4], words: [5]
  });
  assert.equal(text, 'We propose a method dot words');
  assert.equal(restoreAbstract(null), '');
});

test('去重：DOI 优先，其次 arXiv ID，其次规范化标题', () => {
  const a = { title: 'Deep Learning for Images', doi: '10.1/AAA', sources: ['openalex'], citations: 5, abstract: 'short' };
  const b = { title: 'Deep learning for images!', doi: 'https://doi.org/10.1/aaa', sources: ['s2'], citations: 9, abstract: 'longer abstract here' };
  const c = { title: 'Graph Nets', arxiv: '2101.00001v2', sources: ['arxiv'], abstract: 'we propose a graph net' };
  const d = { title: 'Graph Nets', doi: '', arxiv: '2101.00001', sources: ['s2'], citations: 2 };
  const out = dedupe([a, b, c, d]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].sources.sort(), ['openalex', 's2']);
  assert.equal(out[0].citations, 9);
  assert.equal(out[0].abstract, 'longer abstract here', '应保留信息量更大的摘要');
  assert.equal(out[0].id, 'doi:10.1/aaa');
  assert.deepEqual(out[1].sources.sort(), ['arxiv', 's2']);
  assert.equal(out[1].id, 'arxiv:2101.00001');
  assert.deepEqual(out.map((p) => p.n), [1, 2], '去重后重新编号');
  assert.equal(titleKey('A, B!: c'), 'abc');
});

test('去重：DOI 变体（规范化标题相同 + 年份相差 ≤1）合并', () => {
  const mk = (over) => ({ sources: ['openalex'], citations: 1, abstract: 'x', ...over });
  const base = { title: 'Diffusion Models for Low-Dose CT Denoising', year: 2023 };
  const a = mk({ ...base, doi: '10.5/a', sources: ['openalex'], citations: 3 });
  const pdf = mk({ ...base, doi: 'https://doi.org/10.5/a/pdf', sources: ['s2'], citations: 9, abstract: 'longer abstract here' });
  const out = dedupe([a, pdf]);
  assert.equal(out.length, 1, '同一论文的 DOI 与其 /pdf 变体应合并');
  assert.deepEqual(out[0].sources.sort(), ['openalex', 's2']);
  assert.equal(out[0].citations, 9, '合并后取较大引用数');
  assert.equal(out[0].abstract, 'longer abstract here');

  // 年份相差 >1：同名不合并（避免误并不同版本/再版）
  const far1 = mk({ title: 'A Recurring Title', year: 2019, doi: '10.9/far1' });
  const far2 = mk({ title: 'A Recurring Title', year: 2023, doi: '10.9/far2' });
  assert.equal(dedupe([far1, far2]).length, 2, '年份相差过大应视为不同文献');

  // 相邻年份（差 1）同名：合并
  const adj1 = mk({ title: 'Neighboring Year Paper', year: 2020, doi: '10.9/adj1' });
  const adj2 = mk({ title: 'Neighboring Year Paper', year: 2021, doi: '10.9/adj2' });
  assert.equal(dedupe([adj1, adj2]).length, 1);
});

test('排序：关键词命中优先，无摘要降权，引用小幅加成', () => {
  const mk = (over) => ({ sources: ['openalex'], citations: 0, abstract: '', ...over });
  const relevant = mk({
    title: 'Retrieval-augmented generation reduces hallucination in medical question answering',
    abstract: 'We propose a retrieval-augmented generation framework for medical question answering and show lower hallucination rates.'
  });
  const noAbstract = mk({ title: 'Hallucination in medical question answering', citations: 300 });
  const offTopic = mk({ title: 'Solid state batteries', abstract: 'We study cathode materials for solid state batteries at low temperature.' });
  const terms = ['retrieval-augmented generation', 'hallucination', 'medical question answering'];
  const ranked = rank([offTopic, noAbstract, relevant], terms, { keep: 15, minKeep: 10 });
  assert.equal(ranked[0].title, relevant.title);
  assert.ok(ranked[0].score > ranked[1].score);
  assert.ok(noAbstract.score !== undefined);
  assert.ok(offTopic.score < relevant.score);
  assert.ok(ranked.some((p) => p.matchedTerms && p.matchedTerms.length >= 2));
});

test('规则抽取：命中线索词，缺失写「摘要未提及」', () => {
  const fields = extractFields({
    title: 'A study of class imbalance',
    abstract: 'Few-class recall is the main problem in medical imaging classification. We propose a re-weighting method with focal loss. ' +
      'Experiments on CheXpert show recall improves by 8.2 points, measured with F1 and AUC. However, the approach fails on rare pathologies.'
  }, ['class imbalance', 'medical imaging']);
  assert.match(fields.question, /原文摘录/);
  assert.match(fields.method, /re-weighting method/);
  assert.match(fields.dataset, /CheXpert/);
  assert.match(fields.metric, /F1|AUC/);
  assert.match(fields.result, /8\.2 points/);
  assert.match(fields.limitation, /fails on rare pathologies/);
  assert.match(fields.relation, /共同关键词/);

  const empty = extractFields({ title: 'No abstract here', abstract: '' }, ['zzz']);
  for (const key of ['question', 'method', 'dataset', 'metric', 'result', 'limitation']) {
    assert.ok(empty[key] === MISSING || typeof empty[key] === 'string', key);
  }
  const sparse = extractFields({ title: '', abstract: '' }, ['zzz']);
  assert.equal(sparse.method, MISSING);
  assert.equal(sparse.dataset, MISSING);
  assert.equal(sparse.metric, MISSING);
  assert.equal(sparse.result, MISSING);
  assert.equal(sparse.limitation, MISSING);
  assert.match(sparse.relation, /低相关/);
});

test('规则抽取不会编造：无数据集/指标信息时保持缺失', () => {
  const f = extractFields({
    title: 'Something', abstract: 'We propose a method. It works well on many tasks and outperforms prior baselines by a large margin.'
  }, ['method']);
  assert.equal(f.dataset, MISSING);
  assert.equal(f.metric, MISSING);
});

test('无摘要的论文不回显标题，除关系外全部「摘要未提及」', () => {
  const f = extractFields({
    title: 'A survey of retrieval-augmented generation for medical question answering', abstract: '',
    sources: ['openalex']
  }, ['retrieval-augmented generation', 'hallucination']);
  for (const key of ['question', 'method', 'dataset', 'metric', 'result', 'limitation']) {
    assert.equal(f[key], MISSING, key);
  }
  assert.match(f.relation, /高相关|中相关|低相关/);
});

test('聚类 3–5 簇 + 空白点引用论文编号', () => {
  const result = rulesResult({ mode: 'idea', input: IDEA, papers: fixture.papers, counts: { openalex: 1, arxiv: 1, s2: 1 }, dedupedTotal: 4, seconds: 1 });
  assert.ok(result.clusters.length >= 1 && result.clusters.length <= 5);
  assert.ok(result.gaps.length >= 1 && result.gaps.length <= 4, `空白点 ${result.gaps.length} 条`);
  const numbers = new Set(result.papers.map((p) => p.n));
  for (const g of result.gaps) {
    assert.match(g.detail, /\[\d/, 'detail 需引用论文编号');
    assert.ok(g.papers.every((n) => numbers.has(n)), '空白点引用的编号必须存在于论文列表');
  }
  for (const c of result.clusters) assert.ok(c.papers.every((n) => numbers.has(n)));

  const problem = rulesResult({ mode: 'problem', input: '类别不平衡导致少数类召回率低', papers: fixture.papers, counts: {}, seconds: 1 });
  assert.equal(problem.mode, 'problem');
  assert.equal(problem.gaps.length, 0);
  assert.ok(problem.approaches.length >= 1);
  for (const a of problem.approaches) {
    assert.ok(typeof a.effect === 'string' && a.effect.length);
    assert.ok(typeof a.limits === 'string' && a.limits.length);
  }
});

test('独立聚类/空白点/思路分组函数', () => {
  const withFields = fixture.papers.map((p) => ({ ...p, fields: p.fields }));
  const clusters = clusterPapers(withFields);
  assert.ok(clusters.length <= 5);
  assert.ok(findGaps(withFields, clusters).length <= 4);
  const approaches = buildApproaches(withFields, clusters);
  assert.ok(approaches.length >= 1);
  assert.ok(approaches[0].papers.length >= 1);
});

test('arXiv Atom 解析（Node 下走正则兜底）', () => {
  const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <id>http://arxiv.org/abs/2301.00002v1</id><title>Fake &amp; Test Title</title>
    <summary>We propose a fake method.</summary><published>2023-01-02T00:00:00Z</published>
    <author><name>Tester One</name></author><author><name>Tester Two</name></author>
  </entry></feed>`;
  const entries = parseAtom(xml);
  assert.equal(entries.length, 1);
  const paper = fromArxivEntry(entries[0]);
  assert.equal(paper.arxiv, '2301.00002');
  assert.equal(paper.title, 'Fake & Test Title');
  assert.equal(paper.year, 2023);
  assert.deepEqual(paper.authors, ['Tester One', 'Tester Two']);
  assert.deepEqual(paper.sources, ['arxiv']);
  assert.equal(paper.venue, 'arXiv');
  assert.equal(paper.url, 'http://arxiv.org/abs/2301.00002v1');
});

test('来源适配器：OpenAlex 与 Semantic Scholar 字段归一', () => {
  const oa = fromOpenAlex({
    id: 'https://openalex.org/W1', doi: 'https://doi.org/10.5/x', title: 'T1', publication_year: 2024,
    authorships: [{ author: { display_name: 'A One' } }],
    primary_location: { source: { display_name: 'Venue A' } },
    abstract_inverted_index: { Hello: [0], world: [1] }, cited_by_count: 12, relevance_score: 3.5
  });
  assert.equal(oa.doi, '10.5/x');
  assert.equal(oa.abstract, 'Hello world');
  assert.equal(oa.venue, 'Venue A');
  assert.equal(oa.citations, 12);
  const s2 = fromS2({
    title: 'T2', year: 2022, abstract: 'Abs', venue: 'V2', url: 'https://s2/u',
    authors: [{ name: 'B Two' }], externalIds: { DOI: '10.5/y', ArXiv: '2201.00003' }, citationCount: 4
  });
  assert.equal(s2.doi, '10.5/y');
  assert.equal(s2.arxiv, '2201.00003');
  assert.deepEqual(s2.authors, ['B Two']);
  assert.equal(s2.sources[0], 's2');
});

test('导出 Markdown：包含矩阵、簇、空白点与缺失标注', () => {
  const result = rulesResult({ mode: 'idea', input: IDEA, queries: fixture.queries, papers: fixture.papers, counts: fixture.stats, dedupedTotal: 24, seconds: 18.6 });
  const md = toMarkdown(result);
  assert.match(md, /^# 前人做过吗/);
  assert.match(md, /## 对比矩阵/);
  assert.match(md, /## 方法簇/);
  assert.match(md, /## 空白点/);
  assert.match(md, new RegExp(MISSING));
  assert.match(md, /\[1\] \[【测试论文 1】/);
  assert.match(md, /\(https:\/\/example\.com\/test-1\)/);
  assert.match(md, /检索式/);
  assert.match(md, /`fake method placeholder task`/);
  assert.ok(md.split('\n').some((l) => l.startsWith('| 论文 | 年份 | 来源 |')));
});

test('导出 CSV：表头、引号转义与行数', () => {
  const result = rulesResult({ mode: 'idea', input: IDEA, papers: fixture.papers, counts: fixture.stats, seconds: 1 });
  const csv = toCSV(result);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, result.papers.length + 1);
  assert.match(lines[0], /^编号,标题,年份,/);
  assert.match(lines[0], /研究问题,方法,数据集,指标,主要结果,局限,与该想法的关系,摘要$/);
  const escaped = toCSV({ papers: [{ n: 1, title: 'a,b "c"', fields: {} }] });
  assert.match(escaped.split('\r\n')[1], /^1,"a,b ""c""",/);
  assert.equal(('\ufeff' + csv).charCodeAt(0), 0xfeff, 'Excel 需要 UTF-8 BOM');
});

test('导出 BibTeX：key = 第一作者姓 + 年份 + 标题首词', () => {
  const bib = toBibTeX({ papers: [
    { n: 1, title: 'The BERT study of things', authors: ['Ada Lovelace', 'Grace Hopper'], year: 1994, venue: 'Journal X', doi: '10.1/a', url: 'https://x/y' },
    { n: 2, title: 'Another paper', authors: [], year: null, venue: '', arxiv: '2101.00001', url: '' }
  ] });
  assert.match(bib, /@article\{lovelace1994bert,/);
  assert.match(bib, /author = \{Ada Lovelace and Grace Hopper\},/);
  assert.match(bib, /title = \{The BERT study of things\},/);
  assert.match(bib, /@misc\{anonymousndanother,/);
  assert.equal(bibKey({ title: 'On a study of scale', authors: ['Jean-Luc Picard'], year: 2380 }), 'picard2380study');
  assert.match(fileName({ input: '用检索增强 生成', generatedAt: '2026-11-18' }, 'md'), /^用检索增强-生成-2026-11-18\.md$/);
});

test('fixture.json 符合规格里的数据结构', () => {
  assert.ok(['idea', 'problem'].includes(fixture.mode));
  assert.ok(['demo', 'rules', 'qwen'].includes(fixture.engine));
  for (const key of ['openalex', 'arxiv', 's2', 'deduped', 'kept', 'seconds']) assert.ok(key in fixture.stats, key);
  const FIELD_KEYS = ['question', 'method', 'dataset', 'metric', 'result', 'limitation', 'relation'];
  for (const p of fixture.papers) {
    for (const key of ['n', 'id', 'title', 'year', 'sources', 'citations', 'abstract', 'score']) assert.ok(key in p, `${key} on paper ${p.n}`);
    for (const key of FIELD_KEYS) assert.equal(typeof p.fields[key], 'string', `paper ${p.n}.${key}`);
    assert.ok(Array.isArray(p.sources) && p.sources.length);
  }
  const numbers = new Set(fixture.papers.map((p) => p.n));
  for (const c of fixture.clusters) assert.ok(c.papers.every((n) => numbers.has(n)));
  for (const g of fixture.gaps) assert.ok(g.papers.every((n) => numbers.has(n)));
  for (const a of fixture.approaches) assert.ok(a.papers.every((n) => numbers.has(n)));
});

test('演示目录只列 3 个条目且不落论文数据', () => {
  const index = JSON.parse(readFileSync(join(here, '..', 'web', 'demos', 'index.json'), 'utf8'));
  assert.equal(index.demos.length, 3);
  assert.deepEqual(index.demos.map((d) => d.id), ['demo-rag-med', 'demo-gnn-fewshot', 'demo-imbalance']);
  assert.deepEqual(index.demos.map((d) => d.mode), ['idea', 'idea', 'problem']);
});

/* ---------------- 检索回退（离线桩 fetch，不访问网络） ---------------- */

const realFetch = globalThis.fetch;

function stubFetch(routes) {
  const seen = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    seen.push(u);
    const hit = Object.keys(routes).find((k) => u.includes(k));
    if (!hit) return new Response('{"detail":"nope"}', { status: 404 });
    const r = routes[hit];
    if (typeof r === 'function') return r(u);
    return new Response(r.body, { status: r.status ?? 200, headers: { 'content-type': r.type ?? 'application/json' } });
  };
  return seen;
}

const OALEX_HIT = '{"results":[{"id":"https://openalex.org/W1","doi":"https://doi.org/10.1/a","title":"Direct hit","publication_year":2024,"cited_by_count":3}]}';
const S2_HIT = '{"data":[{"paperId":"x1","title":"S2 hit","year":2023,"citationCount":2}]}';
const ATOM_HIT = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/2401.00001v2</id><title>AX hit</title><summary>abs</summary><published>2024-01-01T00:00:00Z</published><author><name>Zhang</name></author></entry></feed>';

test('URL 构造：select/fields 完整、n 夹在 1..25、代理地址不含邮箱', () => {
  const oa = openalexUrl('graph neural network', 15);
  assert.ok(oa.startsWith('https://api.openalex.org/works?search=graph%20neural%20network&per-page=15&select='));
  for (const f of ['abstract_inverted_index', 'cited_by_count', 'relevance_score', 'primary_location']) assert.ok(oa.includes(f), f);
  assert.ok(openalexUrl('q', 999).includes(`per-page=${MAX_N}`));
  assert.ok(openalexUrl('q', 0).includes('per-page=15'));
  const s2 = s2Url('few shot', 7);
  assert.ok(s2.includes('limit=7') && s2.includes('fields=') && s2.includes('externalIds'));
  assert.ok(arxivUrl('a b').includes('export.arxiv.org/api/query?search_query=all:a%20b&max_results=10'));
  const p = proxyUrl('openalex', 'a b&c', '/functions/v1/app', 20);
  assert.ok(p.startsWith('/functions/v1/app/openalex?'));
  assert.ok(p.includes('q=a+b%26c') && p.includes('n=20'), p);
  assert.ok(!proxyUrl('arxiv', 'q').includes('n='), 'arXiv 代理只透传 q');
  for (const u of [oa, s2, arxivUrl('q'), p, proxyUrl('s2', 'q', '/f', 5)]) assert.ok(!u.includes('@'), u);
});

test('attempt：代理缺失回落到 index.html 时判为 html_response', async () => {
  stubFetch({ '/functions/v1/app': { body: '<!doctype html><html><head></head><body>app</body></html>', status: 200, type: 'text/html' } });
  const r = await attempt('/functions/v1/app/arxiv?q=x', 4000, 'text');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'html_response');
  globalThis.fetch = realFetch;
});

test('fetchSource：OpenAlex 直连 429 → 同源代理成功', async () => {
  const seen = stubFetch({
    'api.openalex.org': { body: '{}', status: 429 },
    '/functions/v1/app/openalex': { body: OALEX_HIT }
  });
  const r = await fetchSource('openalex', 'q a', { retryDelay: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.via, 'proxy');
  assert.equal(r.data.results.length, 1);
  assert.ok(seen[0].includes('api.openalex.org'), '先直连');
  assert.ok(seen[1].includes('/functions/v1/app/openalex'), '再代理');
  assert.equal(seen.length, 2);
  globalThis.fetch = realFetch;
});

test('fetchSource：直连→代理→直连退避重试一次', async () => {
  const seen = stubFetch({
    'api.semanticscholar.org': (u) => (seen.filter((x) => x.includes('semanticscholar')).length > 1
      ? new Response(S2_HIT, { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response('slow down', { status: 429 })),
    '/functions/v1/app/s2': { body: '{"detail":"gone"}', status: 404 }
  });
  const r = await fetchSource('s2', 'q', { retryDelay: 1 });
  assert.equal(r.ok, true, '第三次直连恢复');
  assert.equal(r.via, 'direct');
  assert.equal(seen.length, 3, seen.join(' | '));
  assert.ok(seen[2].includes('semanticscholar'));
  globalThis.fetch = realFetch;
});

test('fetchSource：全部失败时返回最后错误，不抛异常', async () => {
  stubFetch({ 'api.openalex.org': { body: 'boom', status: 500 }, '/functions/v1/app/openalex': { body: 'gone', status: 404 } });
  const r = await fetchSource('openalex', 'q', { retryDelay: 1 });
  assert.equal(r.ok, false);
  assert.match(r.error, /http_/);
  globalThis.fetch = realFetch;
});

test('fetchSource：arXiv 不直连，只走同源代理', async () => {
  const seen = stubFetch({ '/functions/v1/app/arxiv': { body: ATOM_HIT, type: 'application/atom+xml' } });
  const r = await fetchSource('arxiv', 'q a', { proxyOnly: true });
  assert.equal(r.ok, true);
  assert.equal(r.via, 'proxy');
  assert.equal(seen.length, 1, seen.join(' | '));
  assert.ok(seen[0].startsWith('/functions/v1/app/arxiv?q=q+a'), seen[0]);
  assert.ok(!seen.some((u) => u.includes('export.arxiv.org')), '绝不直连 export.arxiv.org');
  globalThis.fetch = realFetch;
});

test('fetchSource：arXiv 无可用代理时标记 proxy_required 且不发请求', async () => {
  const seen = stubFetch({});
  const r = await fetchSource('arxiv', 'q', { proxyOnly: true, allowProxy: false });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'proxy_required');
  assert.equal(seen.length, 0);
  globalThis.fetch = realFetch;
});

test('searchAll：OpenAlex/S2 直连可用，arXiv 无代理时跳过而非失败', async () => {
  const events = [];
  stubFetch({
    'api.openalex.org': { body: OALEX_HIT },
    'api.semanticscholar.org': { body: S2_HIT }
  });
  const out = await searchAll(['q one', 'q two'], {
    allowProxy: false,
    onSource: (name, st) => events.push([name, st.state, st.count, st.note])
  });
  globalThis.fetch = realFetch;
  assert.equal(out.status.openalex.state, 'done');
  assert.equal(out.status.s2.state, 'done');
  assert.equal(out.status.arxiv.state, 'skipped', JSON.stringify(out.status));
  assert.equal(out.status.arxiv.note, 'proxy_required');
  assert.deepEqual(out.counts, { openalex: 2, s2: 2, arxiv: 0 });
  assert.equal(out.raw.length, 4);
  assert.ok(events.some(([n, s]) => n === 'arxiv' && s === 'skipped'));
});

test('searchAll：直连全 429 时三源都经代理取回', async () => {
  stubFetch({
    'api.openalex.org/works': { body: '{}', status: 429 },
    'api.semanticscholar.org': { body: '{}', status: 429 },
    '/functions/v1/app/openalex': { body: OALEX_HIT },
    '/functions/v1/app/s2': { body: S2_HIT },
    '/functions/v1/app/arxiv': { body: ATOM_HIT, type: 'application/atom+xml' }
  });
  const out = await searchAll(['q one'], {});
  globalThis.fetch = realFetch;
  assert.deepEqual(out.counts, { openalex: 1, arxiv: 1, s2: 1 });
  assert.equal(out.status.openalex.via, 'proxy');
  assert.equal(out.status.arxiv.via, 'proxy');
  assert.equal(out.status.s2.state, 'done');
  const ax = out.raw.find((p) => p.sources.includes('arxiv'));
  assert.equal(ax.arxiv, '2401.00001', '版本号被剥掉');
});
