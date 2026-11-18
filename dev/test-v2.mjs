// v2 纯函数测试：相关度解析、筛选排序、全景布局、关系线。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseRelevance, relationText, relationDetail, relevanceOf, annotatePapers,
  matchesFilters, sortPapers, overviewLayout, relationLinks, conclusionOf, datasetKey
} from '../web/js/derive.js';

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
