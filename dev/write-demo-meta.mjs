// 给 web/demos/*.json 回写 relevance 与 cluster：只新增字段，不改其他内容。
// cluster 来自现有 clusters[].papers；relevance 按 fields.relation 开头判断。
import { readFile, writeFile } from 'node:fs/promises';
import { parseRelevance } from '../web/js/derive.js';

const files = ['web/demos/demo-gnn-fewshot.json', 'web/demos/demo-imbalance.json', 'web/demos/demo-rag-med.json'];

const HIGH = /几乎同题|最直接|直接回答|直接支撑|直接回应|直接针对|高度重合|核心先行|命中用户|覆盖用户想法|最接近|差不多/;
const LOW = /快速核查|背景|提醒式|源头之一|系统综述|工程实现|增量场景|路线对照|不必自行复现|坐标/;

function inferRelevance(relation) {
  const head = String(relation || '').slice(0, 48);
  const explicit = parseRelevance(head);
  if (explicit) return explicit;
  if (HIGH.test(head)) return 'high';
  if (LOW.test(head)) return 'low';
  return 'mid';
}

for (const file of files) {
  const data = JSON.parse(await readFile(file, 'utf8'));
  const clusterOf = new Map();
  (data.clusters || []).forEach((c, i) => (c.papers || []).forEach((n) => clusterOf.set(Number(n), i)));
  data.papers = (data.papers || []).map((p) => ({
    ...p,
    relevance: p.relevance || inferRelevance(p.fields?.relation),
    cluster: Number.isInteger(p.cluster) ? p.cluster : clusterOf.get(Number(p.n))
  }));
  await writeFile(file, JSON.stringify(data, null, 1) + '\n');
  const counts = data.papers.reduce((m, p) => (m[p.relevance] = (m[p.relevance] || 0) + 1, m), {});
  console.log(file, counts);
}
