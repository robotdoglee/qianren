// v2 纯函数测试：相关度解析、筛选排序、全景布局、关系线。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseRelevance, relationText, relationDetail, relevanceOf, annotatePapers,
  matchesFilters, sortPapers, overviewLayout, relationLinks, conclusionOf, datasetKey
} from '../web/js/derive.js';
import { parseImport, detectImportFormat, IMPORT_FORMATS } from '../web/js/import-papers.js';
import {
  dedupe, includeImported, searchAll, fromScopus, fromIeee, fromSpringer, fromCore, fromSerpApi
} from '../web/js/search.js';
import {
  USER_KEY_PROVIDERS, providerHeader, enabledKeyedSources, keyHeadersFor, textLeaksAnyKey
} from '../web/js/userkeys.js';
import { rulesResult } from '../web/js/extract-rules.js';
import { toMarkdown } from '../web/js/export.js';
import {
  shouldExpandBeyond, highRelevanceCount, beyondUrl, beyondJobs, devtoTag,
  parseOpenLibrary, parseGoogleBooks, parseWikipedia, parseGitHub,
  parseHuggingFaceModels, parseHuggingFaceDatasets, parseStackExchange,
  parseHackerNews, parseDevTo, assignResourceIds, groupResources, fetchBeyond
} from '../web/js/beyond.js';
import { buildSynthesisPrompt } from '../web/js/llm.js';

const demo = JSON.parse(readFileSync(new URL('../web/demos/demo-gnn-fewshot.json', import.meta.url), 'utf8'));

test('相关度：解析规则前缀与 Qwen 字段', () => {
  assert.equal(parseRelevance('高相关：共同关键词 A'), 'high');
  assert.equal(parseRelevance('中相关: x'), 'mid');
  assert.equal(parseRelevance('低相关：x'), 'low');
  assert.equal(parseRelevance('共同关键词 x'), null);
  assert.equal(relevanceOf({ fields: { relation: '高相关：x' } }), 'high');
  assert.equal(relevanceOf({ relevance: 'low', fields: { relation: '高相关：x' } }), 'low');
  assert.equal(relationText('中相关：共同关键词 GNN'), '共同关键词 GNN');
});

test('关系补充：规则模式用方法首句并标注补充', () => {
  const rel = relationDetail({ fields: { relation: '低相关：共同关键词 x', method: 'We propose Foo。另见方法二。' } });
  assert.equal(rel.supplementary, true);
  assert.equal(rel.text, 'We propose Foo');
  const qwen = relationDetail({ fields: { relation: '直接相关的工作，差异点在数据。', method: 'x' } });
  assert.equal(qwen.supplementary, false);
});

test('聚类回写：每篇论文都有簇下标与相关度', () => {
  const annotated = annotatePapers(demo);
  assert.ok(annotated.papers.every((p) => ['high', 'mid', 'low'].includes(p.relevance)));
  assert.ok(annotated.papers.every((p) => Number.isInteger(p.cluster)));
  assert.notEqual(annotated, demo);
});

test('筛选与排序：簇/相关度/年份/数据集可组合', () => {
  const annotated = annotatePapers(demo);
  const high = annotated.papers.filter((p) => p.relevance === 'high');
  assert.equal(annotated.papers.filter((p) => matchesFilters(p, { relevance: 'high' })).length, high.length);
  const one = annotated.papers.find((p) => p.cluster === 0);
  assert.ok(matchesFilters(one, { cluster: 0 }));
  assert.ok(!matchesFilters(one, { cluster: 2 }));
  const byRel = sortPapers(annotated.papers, 'relevance');
  const rank = { high: 2, mid: 1, low: 0 };
  for (let i = 1; i < byRel.length; i += 1) assert.ok(rank[relevanceOf(byRel[i - 1])] >= rank[relevanceOf(byRel[i])]);
  const byCit = sortPapers(annotated.papers, 'citations');
  for (let i = 1; i < byCit.length; i += 1) assert.ok((byCit[i - 1].citations || 0) >= (byCit[i].citations || 0));
  assert.ok(datasetKey({ fields: { dataset: 'ChEMBL20（用于模拟低资源设定）。' } }).includes('ChEMBL20'));
  assert.equal(datasetKey({ fields: { dataset: '摘要未提及' } }), '');
});

test('全景布局：泳道数=簇数，点都落在画布内', () => {
  const annotated = annotatePapers(demo);
  const layout = overviewLayout(annotated.papers, { width: 860 });
  assert.equal(layout.lanes.length, new Set(annotated.papers.map((p) => p.cluster)).size);
  assert.equal(layout.points.length, annotated.papers.length);
  for (const pt of layout.points) {
    assert.ok(pt.x >= 0 && pt.x <= layout.width);
    assert.ok(pt.y >= 0 && pt.y <= layout.height);
    assert.ok(pt.r >= 4);
  }
});

test('关系线：按数据集/指标/不连', () => {
  const papers = [
    { n: 1, fields: { dataset: 'FS-Mol 数据集', metric: 'AUC' } },
    { n: 2, fields: { dataset: 'FS-Mol 数据集', metric: 'AUC' } },
    { n: 3, fields: { dataset: '其他', metric: 'AUC' } }
  ];
  assert.equal(relationLinks(papers, 'none').length, 0);
  assert.equal(relationLinks(papers, 'dataset').length, 1);
  assert.ok(relationLinks(papers, 'metric').length >= 2);
});

test('一句话结论：选出高相关且引用最高的论文', () => {
  const annotated = annotatePapers(demo);
  const { top } = conclusionOf(annotated.papers);
  assert.equal(top.relevance, 'high');
  assert.ok(top.citations >= Math.max(...annotated.papers.filter((p) => p.relevance === 'high').map((p) => p.citations || 0)));
});

/* ---------------- v2.2：文件导入解析 ---------------- */

const RIS_SAMPLE = `TY  - JOUR
TI  - Retrieval Augmented Generation for Clinical QA
AU  - Zhang, San
AU  - Li, Si
PY  - 2023
JO  - Journal of Medical AI
DO  - 10.1000/ris.1
AB  - We propose a retrieval-augmented method that reduces hallucination.
ER  -
`;

const BIB_SAMPLE = `@article{zhang2023rag,
  title = {Retrieval-{A}ugmented {G}eneration for {C}linical {QA}},
  author = {Zhang, San and Li, Si},
  year = {2023},
  journal = {Journal of Medical AI},
  doi = {10.1000/bib.1},
  abstract = {We reduce hallucination with retrieval.}
}

@misc{note2024,
  title = "A {S}hort {N}ote",
  author = "Doe, Jane",
  year = 2024,
  url = {https://example.org/n}
}`;

const ENW_SAMPLE = `%0 Journal Article
%T EndNote Paper
%A Alpha, A
%A Beta, B
%D 2022
%J Journal X
%R 10.1000/enw.1
%X Abstract text from EndNote.
%U https://example.org/e

%0 Conference Paper
%T Second EndNote Paper
%A Gamma, G
%D 2020
%J Conf Y
`;

const NE_SAMPLE = `{Reference Type}: Journal Article
{Title}: NoteExpress Paper
{Author}: Alpha, A;Beta, B
{Year}: 2021
{Journal}: Journal N
{DOI}: 10.1000/ne.1
{Abstract}: Abstract text from NoteExpress.

{Reference Type}: Conference Paper
{Title}: Second NoteExpress Paper
{Author}: Gamma, G
{Year}: 2019
`;

const RW_SAMPLE = `RT Journal Article
SR 1
A1 Alpha, A
A2 Beta, B
T1 RefWorks Paper
JF Journal R
YR 2020
DO 10.1000/rw.1
AB Abstract text from RefWorks.
UL https://example.org/r
ER
`;

test('导入：RIS 解析标题/作者/年份/期刊/DOI/摘要', () => {
  const { format, papers } = parseImport(RIS_SAMPLE, 'cnki.ris');
  assert.equal(format, 'ris');
  assert.equal(papers.length, 1);
  const p = papers[0];
  assert.equal(p.title, 'Retrieval Augmented Generation for Clinical QA');
  assert.deepEqual(p.authors, ['Zhang, San', 'Li, Si']);
  assert.equal(p.year, 2023);
  assert.equal(p.venue, 'Journal of Medical AI');
  assert.equal(p.doi, '10.1000/ris.1');
  assert.match(p.abstract, /retrieval-augmented/);
  assert.deepEqual(p.sources, ['import']);
});

test('导入：BibTeX 解析嵌套花括号、作者与两条记录', () => {
  const { format, papers } = parseImport(BIB_SAMPLE, 'library.bib');
  assert.equal(format, 'bibtex');
  assert.equal(papers.length, 2);
  assert.equal(papers[0].title, 'Retrieval-Augmented Generation for Clinical QA');
  assert.deepEqual(papers[0].authors, ['San Zhang', 'Si Li']);
  assert.equal(papers[0].year, 2023);
  assert.equal(papers[0].doi, '10.1000/bib.1');
  assert.equal(papers[1].title, 'A Short Note');
  assert.equal(papers[1].year, 2024);
  assert.equal(papers[1].url, 'https://example.org/n');
});

test('导入：EndNote (.enw) 多记录', () => {
  const { format, papers } = parseImport(ENW_SAMPLE, 'endnote.enw');
  assert.equal(format, 'endnote');
  assert.equal(papers.length, 2);
  assert.equal(papers[0].title, 'EndNote Paper');
  assert.deepEqual(papers[0].authors, ['Alpha, A', 'Beta, B']);
  assert.equal(papers[0].year, 2022);
  assert.equal(papers[0].venue, 'Journal X');
  assert.equal(papers[0].doi, '10.1000/enw.1');
  assert.match(papers[0].abstract, /EndNote/);
  assert.equal(papers[1].title, 'Second EndNote Paper');
});

test('导入：NoteExpress (.net 文本)', () => {
  const { format, papers } = parseImport(NE_SAMPLE, 'noteexpress.net');
  assert.equal(format, 'noteexpress');
  assert.equal(papers.length, 2);
  assert.equal(papers[0].title, 'NoteExpress Paper');
  assert.deepEqual(papers[0].authors, ['Alpha, A', 'Beta, B']);
  assert.equal(papers[0].year, 2021);
  assert.equal(papers[0].doi, '10.1000/ne.1');
  assert.equal(papers[1].title, 'Second NoteExpress Paper');
});

test('导入：RefWorks（知网导出文本）', () => {
  const { format, papers } = parseImport(RW_SAMPLE, 'cnki.txt');
  assert.equal(format, 'refworks');
  assert.equal(papers.length, 1);
  assert.equal(papers[0].title, 'RefWorks Paper');
  assert.deepEqual(papers[0].authors, ['Alpha, A', 'Beta, B']);
  assert.equal(papers[0].year, 2020);
  assert.equal(papers[0].venue, 'Journal R');
  assert.equal(papers[0].doi, '10.1000/rw.1');
  assert.equal(papers[0].url, 'https://example.org/r');
});

test('导入：格式识别与空文件', () => {
  assert.equal(detectImportFormat(RIS_SAMPLE), 'ris');
  assert.equal(detectImportFormat(BIB_SAMPLE), 'bibtex');
  assert.equal(detectImportFormat(ENW_SAMPLE), 'endnote');
  assert.equal(detectImportFormat(NE_SAMPLE), 'noteexpress');
  assert.equal(detectImportFormat(RW_SAMPLE), 'refworks');
  assert.deepEqual(parseImport('   ', 'x.txt'), { format: '', papers: [] });
  assert.deepEqual(Object.keys(IMPORT_FORMATS), ['ris', 'bibtex', 'endnote', 'noteexpress', 'refworks']);
});

test('导入与检索结果去重：DOI 合并、导入的论文不会被相关性淘汰', () => {
  const imported = parseImport(RIS_SAMPLE, 'x.ris').papers[0];
  const api = {
    title: 'Retrieval Augmented Generation for Clinical QA', year: 2023, doi: '10.1000/RIS.1',
    sources: ['openalex'], citations: 12, abstract: 'short', venue: '', url: 'https://openalex/x'
  };
  const merged = dedupe([api, imported]);
  assert.equal(merged.length, 1);
  assert.ok(merged[0].sources.includes('import'));
  assert.ok(merged[0].sources.includes('openalex'));
  assert.equal(merged[0].citations, 12);
  assert.match(merged[0].abstract, /retrieval-augmented/);

  const kept = includeImported([{ id: 'a', n: 1, sources: ['openalex'], title: 'A' }], [
    { id: 'a', n: 1, sources: ['openalex'], title: 'A' },
    { id: 'b', n: 2, sources: ['import'], title: 'B' }
  ], { keep: 15 });
  assert.deepEqual(kept.map((p) => p.title), ['A', 'B']);
  assert.deepEqual(kept.map((p) => p.n), [1, 2]);
});

/* ---------------- v2.2：自带凭证 ---------------- */

test('自带凭证：六个来源、请求头名与启用条件', () => {
  assert.deepEqual(USER_KEY_PROVIDERS.map((p) => p.id), ['s2', 'scopus', 'ieee', 'springer', 'core', 'serpapi']);
  for (const p of USER_KEY_PROVIDERS) {
    assert.ok(p.label && p.desc && /^https:\/\//.test(p.apply), p.id);
    assert.equal(providerHeader(p.id), `X-User-Key-${p.id}`);
  }
  assert.deepEqual(enabledKeyedSources({ scopus: 'x', serpapi: 'y' }), ['scopus', 'serpapi']);
  assert.deepEqual(enabledKeyedSources({ s2: 'only-s2' }), [], 'S2 本身是基础来源，不额外追加');
  assert.deepEqual(keyHeadersFor({ core: 'c' }), { 'X-User-Key-core': 'c' });
});

test('自带凭证：key 不出现在 Markdown 导出与结果对象里', () => {
  const result = rulesResult({
    mode: 'idea', input: '用检索增强生成减少大模型在医学问答中的幻觉',
    papers: demo.papers, counts: { scopus: 3, import: 1 }, seconds: 1
  });
  const keys = { scopus: 'sk-scopus-SECRET-123', serpapi: 'serpapi-SECRET-456' };
  const md = toMarkdown(result);
  assert.equal(textLeaksAnyKey(md, keys), false);
  assert.equal(textLeaksAnyKey(JSON.stringify(result), keys), false);
  assert.match(md, /来源/);
});

test('自带凭证来源适配器：Scopus / IEEE / Springer / CORE / SerpApi 字段归一', () => {
  const scopus = fromScopus({
    'dc:title': 'S paper', 'dc:creator': 'A One', 'prism:publicationName': 'S Venue',
    'prism:coverDate': '2023-04-01', 'prism:doi': '10.1/S', 'citedby-count': '9',
    'dc:description': 'S abstract', 'prism:url': 'https://scopus/x'
  });
  assert.equal(scopus.title, 'S paper');
  assert.equal(scopus.year, 2023);
  assert.equal(scopus.doi, '10.1/s');
  assert.equal(scopus.citations, 9);
  assert.deepEqual(scopus.sources, ['scopus']);

  const ieee = fromIeee({
    title: 'I paper', publication_year: '2022', publication_title: 'I Conf', doi: '10.1/I',
    abstract: 'I abstract', citing_paper_count: '5', html_url: 'https://ieee/x',
    authors: { authors: [{ full_name: 'B Two' }] }
  });
  assert.equal(ieee.venue, 'I Conf');
  assert.deepEqual(ieee.authors, ['B Two']);
  assert.equal(ieee.citations, 5);

  const springer = fromSpringer({
    title: 'Sp paper', creators: [{ creator: 'C Three' }], publicationDate: '2021-02-03',
    publicationName: 'Sp Journal', doi: '10.1/SP', abstract: 'Sp abstract', url: [{ value: 'https://springer/x' }]
  });
  assert.equal(springer.year, 2021);
  assert.equal(springer.url, 'https://springer/x');
  assert.deepEqual(springer.authors, ['C Three']);

  const core = fromCore({
    title: 'C paper', yearPublished: 2020, authors: [{ name: 'D Four' }],
    downloadUrl: 'https://core/x.pdf', doi: '10.1/C', abstract: 'C abstract'
  });
  assert.equal(core.oaUrl, 'https://core/x.pdf');
  assert.equal(core.year, 2020);

  const serp = fromSerpApi({
    title: 'G paper', link: 'https://scholar/x', snippet: 'G snippet',
    publication_info: { summary: 'E Five, F Six - Journal G, 2019' },
    inline_links: { cited_by: { total: 21 } }, resources: [{ link: 'https://pdf/x' }]
  });
  assert.equal(serp.year, 2019);
  assert.equal(serp.citations, 21);
  assert.equal(serp.oaUrl, 'https://pdf/x');
  assert.deepEqual(serp.authors, ['E Five', 'F Six']);
});

test('自带凭证检索：key 只进请求头、不进 URL', async () => {
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), headers: init?.headers || {} });
    return new Response(JSON.stringify({
      'search-results': { entry: [{ 'dc:title': 'Scopus hit', 'prism:doi': '10.1/keyed', 'prism:coverDate': '2024' }] }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const out = await searchAll(['q'], { sources: ['scopus'], userKeys: { scopus: 'SECRET-KEY' }, cache: false });
  globalThis.fetch = realFetch;
  assert.equal(out.counts.scopus, 1);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].headers['X-User-Key-scopus'], 'SECRET-KEY');
  assert.ok(seen[0].url.includes('/functions/v1/app/scopus'));
  assert.ok(!seen[0].url.includes('SECRET-KEY'), 'key 不能出现在 URL 或缓存键里');
});

/* ---------------- v2.3 论文之外 ---------------- */

test('论文之外触发：高相关 < 3 篇才自动拓展', () => {
  const high = (n) => Array.from({ length: n }, (_, i) => ({ n: i + 1, relevance: 'high' }));
  assert.equal(highRelevanceCount(high(2)), 2);
  assert.equal(shouldExpandBeyond(high(2)), true);
  assert.equal(shouldExpandBeyond(high(3)), false);
  assert.equal(shouldExpandBeyond([{ fields: { relation: '高相关：x' } }]), true);
});

test('论文之外 URL：各源参数与 GitHub 必须走同源函数', () => {
  assert.match(beyondUrl('openlibrary', 'graph neural nets'), /openlibrary\.org\/search\.json/);
  assert.match(beyondUrl('gbooks', 'graph neural nets'), /googleapis\.com\/books\/v1\/volumes/);
  assert.match(beyondUrl('wikipedia_zh', '图神经网络'), /zh\.wikipedia\.org\/w\/rest\.php/);
  assert.match(beyondUrl('wikipedia_en', 'graph neural nets'), /en\.wikipedia\.org\/w\/rest\.php/);
  assert.match(beyondUrl('github', 'graph neural nets'), /\/functions\/v1\/app\/beyond\?source=github/);
  assert.match(beyondUrl('hf_models', 'bert'), /huggingface\.co\/api\/models/);
  assert.match(beyondUrl('hf_datasets', 'squad'), /huggingface\.co\/api\/datasets/);
  assert.match(beyondUrl('stackexchange', 'rag hallucination'), /api\.stackexchange\.com/);
  assert.match(beyondUrl('hn', 'rag'), /hn\.algolia\.com/);
  assert.equal(devtoTag('Retrieval-augmented generation'), 'retrieval');
  assert.match(beyondUrl('devto', 'rag systems'), /dev\.to\/api\/articles\?tag=rag/);
  assert.equal(beyondUrl('devto', '中文想法'), '');

  const noProxy = beyondJobs({ input: 'RAG', queries: ['RAG'], allowProxy: false });
  assert.ok(!noProxy.some((j) => j.source === 'github'));
  const withProxy = beyondJobs({ input: 'RAG', queries: ['RAG'], allowProxy: true });
  assert.ok(withProxy.some((j) => j.source === 'github'));
});

test('论文之外解析：书 / 百科 / 代码 / 模型 / 问答 / 博客', () => {
  const books = parseOpenLibrary({
    docs: [{ key: '/works/OL1W', title: 'Deep Learning', first_publish_year: 2016, edition_count: 3, subject: ['AI', 'ML'] }]
  });
  assert.equal(books[0].type, 'book');
  assert.equal(books[0].typeLabel, '书');
  assert.equal(books[0].url, 'https://openlibrary.org/works/OL1W');
  assert.match(books[0].meta, /2016/);

  const gbooks = parseGoogleBooks({
    items: [{ volumeInfo: { title: 'Book', authors: ['A B'], publishedDate: '2020-01-01', description: 'Desc', infoLink: 'https://books/x' } }]
  });
  assert.equal(gbooks[0].year, undefined);
  assert.equal(gbooks[0].source, 'gbooks');
  assert.equal(gbooks[0].url, 'https://books/x');

  const zh = parseWikipedia({ pages: [{ key: '图神经网络', title: '图神经网络', excerpt: '<b>图</b>神经网络…' }] }, 'zh');
  assert.equal(zh[0].type, 'wiki');
  assert.match(zh[0].snippet, /图 神经网络/);
  assert.ok(zh[0].url.startsWith('https://zh.wikipedia.org/wiki/'));

  const gh = parseGitHub({ items: [{ full_name: 'o/r', html_url: 'https://github.com/o/r', description: 'repo', stargazers_count: 42, language: 'Python' }] });
  assert.equal(gh[0].type, 'code');
  assert.match(gh[0].meta, /42/);

  const hf = parseHuggingFaceModels([{ id: 'org/model', downloads: 100, likes: 5, pipeline_tag: 'text-generation', tags: ['llm'] }]);
  assert.equal(hf[0].type, 'model');
  assert.equal(hf[0].url, 'https://huggingface.co/org/model');
  const ds = parseHuggingFaceDatasets([{ id: 'org/data', downloads: 2, likes: 1, tags: ['qa'] }]);
  assert.equal(ds[0].url, 'https://huggingface.co/datasets/org/data');

  const se = parseStackExchange({ items: [{ title: 'How &amp; why?', link: 'https://stackoverflow.com/q/1', score: 9, answer_count: 2, is_answered: true, tags: ['python'] }] });
  assert.equal(se[0].type, 'qa');
  assert.equal(se[0].title, 'How & why?');
  assert.match(se[0].meta, /9 分/);

  const hn = parseHackerNews({ hits: [{ title: 'Show HN', url: 'https://x', objectID: '1', points: 3, num_comments: 4 }] });
  assert.equal(hn[0].type, 'qa');
  const devto = parseDevTo([{ title: 'Post', url: 'https://dev.to/p', description: 'd', tag_list: ['rag'], positive_reactions_count: 7 }]);
  assert.equal(devto[0].type, 'blog');
  assert.match(devto[0].meta, /7/);
  assert.deepEqual(parseDevTo([{ title: 'bad', url: 'javascript:alert(1)' }]), [], '只接受 http(s) 链接');
});

test('论文之外合并：去重、编号与类型分组有序', () => {
  const a = parseOpenLibrary({ docs: [{ key: '/works/1', title: 'B1' }, { key: '/works/1', title: 'B1 dup' }] });
  const b = parseDevTo([{ title: 'P1', url: 'https://dev.to/p1' }]);
  const ids = assignResourceIds([...a, ...b]);
  assert.equal(ids.length, 2);
  assert.deepEqual(ids.map((x) => x.rid), ['R1', 'R2']);
  const groups = groupResources(ids);
  assert.deepEqual(groups.map((g) => g.type), ['book', 'blog']);
  assert.equal(groups[0].typeLabel, '书');
  assert.equal(groups[1].typeLabel, '博客');
});

test('论文之外抓取：无函数时跳过 GitHub、失败不拖垮其他来源', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('hn.algolia.com')) return { ok: false, status: 429, text: async () => '' };
    if (String(url).includes('openlibrary.org')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ docs: [{ key: '/works/1', title: 'B1' }] }) };
    }
    if (String(url).includes('dev.to')) {
      return { ok: true, status: 200, text: async () => JSON.stringify([{ title: 'P1', url: 'https://dev.to/p1' }]) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({}) };
  };
  const out = await fetchBeyond({ input: 'RAG', queries: ['retrieval augmented generation'], allowProxy: false, fetchImpl });
  assert.ok(calls.length >= 8);
  assert.ok(!calls.some((u) => u.includes('/beyond?source=github')));
  assert.equal(out.status.github.state, 'skipped');
  assert.equal(out.status.hn.state, 'failed');
  assert.ok(out.resources.some((r) => r.source === 'openlibrary'));
  assert.ok(out.errors.some((e) => e.source === 'hn'));
  assert.equal(out.resources[0].rid, 'R1');
});

test('综合解答 prompt：论文 [P#] 与资源 [R#] 都在上下文，并要求证据不足直说', () => {
  const messages = buildSynthesisPrompt({
    mode: 'idea',
    input: '用 RAG 减少幻觉',
    papers: [{ n: 1, title: 'Paper', year: 2024, abstract: 'Abstract', fields: { method: 'RAG', result: 'less hallucination' } }],
    resources: [{ rid: 'R1', typeLabel: '百科', sourceLabel: '中文维基百科', title: 'RAG', snippet: '定义' }]
  });
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /\[P1\]/);
  assert.match(messages[0].content, /\[R1\]/);
  assert.match(messages[0].content, /证据不足/);
  const ctx = JSON.parse(messages[1].content);
  assert.equal(ctx.papers[0].ref, 'P1');
  assert.equal(ctx.resources[0].ref, 'R1');
  assert.equal(ctx.resources[0].type, '百科');
});

test('Markdown 导出：论文之外按类型分节，综合解答保留引用', () => {
  const withBeyond = {
    ...demo,
    beyond: {
      resources: [
        { rid: 'R1', type: 'book', typeLabel: '书', source: 'openlibrary', sourceLabel: 'Open Library', title: 'Book [1]', url: 'https://openlibrary.org/works/1', snippet: 'Book desc', meta: '2016' },
        { rid: 'R2', type: 'wiki', typeLabel: '百科', source: 'wikipedia_zh', sourceLabel: '中文维基百科', title: 'Wiki', url: 'https://zh.wikipedia.org/wiki/x', snippet: 'Wiki desc', meta: '' }
      ]
    },
    synthesis: { text: '论文认为 RAG 能减少幻觉 [P1]，百科给出定义 [R2]。' }
  };
  const md = toMarkdown(withBeyond);
  assert.match(md, /## 论文之外/);
  assert.match(md, /### 书/);
  assert.match(md, /### 百科/);
  assert.match(md, /未经同行评审/);
  assert.match(md, /R1 \[Book ［1］\]\(https:\/\/openlibrary\.org\/works\/1\)/);
  assert.match(md, /## 综合解答/);
  assert.match(md, /\[P1\]/);
  assert.match(md, /\[R2\]/);
  assert.ok(!toMarkdown(demo).includes('## 论文之外'));
});
