// 导出：Markdown / CSV / BibTeX（纯字符串函数，可离线测试）
import { MISSING } from './extract-rules.js';
import { SOURCE_LABELS } from './search.js';

export const FIELD_LABELS = [
  ['question', '研究问题'],
  ['method', '方法'],
  ['dataset', '数据集'],
  ['metric', '指标'],
  ['result', '主要结果'],
  ['limitation', '局限'],
  ['relation', '与该想法的关系']
];

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

function paperLink(p) {
  const title = clean(p.title) || '(无标题)';
  return p.url ? `[${title}](${p.url})` : title;
}

function sourcesLabel(p) {
  return (p.sources || []).map((s) => SOURCE_LABELS[s] || s).join(' + ') || '—';
}

function headerLine(r) {
  return `# 问渠 · ${r.mode === 'problem' ? '问题驱动' : '想法驱动'}检索结果\n\n- 输入：${clean(r.input)}\n- 引擎：${r.engine || 'rules'} ｜ 生成时间：${r.generatedAt || ''}\n- 检索式：${(r.queries || []).map((q) => `\`${q}\``).join(' ; ') || '—'}\n- 统计：OpenAlex ${(r.stats && r.stats.openalex) ?? '—'} / arXiv ${(r.stats && r.stats.arxiv) ?? '—'} / Semantic Scholar ${(r.stats && r.stats.s2) ?? '—'} → 去重后 ${(r.stats && r.stats.deduped) ?? '—'} → 保留 ${(r.stats && r.stats.kept) ?? '—'} 篇\n`;
}

function clustersSection(r) {
  if (!r.clusters || !r.clusters.length) return '';
  const lines = r.clusters.map((c) => `- **${clean(c.name)}**（${(c.papers || []).map((n) => `[${n}]`).join('')}）：${clean(c.summary)}`);
  return `\n## 方法簇\n\n${lines.join('\n')}\n`;
}

function approachesSection(r) {
  if (!r.approaches || !r.approaches.length) return '';
  const body = r.approaches.map((a) => [
    `### ${clean(a.name)}`,
    `- 做法概述：${clean(a.summary)}`,
    `- 代表论文：${(a.papers || []).map((n) => `[${n}]`).join(' ')}`,
    `- 报告的效果：${clean(a.effect) || MISSING}`,
    `- 局限：${clean(a.limits) || MISSING}`
  ].join('\n')).join('\n\n');
  return `\n## 解决思路分组\n\n${body}\n`;
}

function gapsSection(r) {
  if (!r.gaps || !r.gaps.length) return '';
  const lines = r.gaps.map((g, i) => `${i + 1}. **${clean(g.title)}** — ${clean(g.detail)}`);
  return `\n## 空白点\n\n${lines.join('\n')}\n`;
}

function matrixSection(r) {
  const cols = ['论文', '年份', '来源', '引用数', ...FIELD_LABELS.map(([, label]) => label)];
  const head = `| ${cols.join(' | ')} |`;
  const sep = `| ${cols.map(() => '---').join(' | ')} |`;
  const rows = (r.papers || []).map((p) => {
    const cells = [
      `[${p.n}] ${paperLink(p)}`,
      p.year || '—',
      sourcesLabel(p),
      p.citations ?? '—',
      ...FIELD_LABELS.map(([key]) => clean((p.fields || {})[key] || MISSING).replace(/\|/g, '/'))
    ];
    return `| ${cells.map((c) => clean(c)).join(' | ')} |`;
  });
  return `\n## 对比矩阵\n\n${[head, sep, ...rows].join('\n')}\n`;
}

function refsSection(r) {
  const refs = (r.papers || []).map((p) => {
    const authors = (p.authors || []).slice(0, 4).join(', ') + ((p.authors || []).length > 4 ? ', et al.' : '');
    return `${p.n}. ${authors}${authors ? '. ' : ''}${clean(p.title)}（${p.year || 'n.d.'}）· ${sourcesLabel(p)}${p.doi ? ` · doi:${p.doi}` : ''}`;
  });
  return `\n## 论文清单\n\n${refs.join('\n')}\n\n> 抽取结果基于标题与摘要，可能不完整，请以原文为准。\n`;
}

export function toMarkdown(r) {
  return [headerLine(r), matrixSection(r), approachesSection(r), clustersSection(r), gapsSection(r), refsSection(r)]
    .filter(Boolean)
    .join('\n')
    .trim() + '\n';
}

function csvCell(value) {
  const s = clean(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_COLUMNS = [
  ['n', '编号'], ['title', '标题'], ['year', '年份'], ['venue', '来源期刊/会议'],
  ['sources', '检索源'], ['citations', '引用数'], ['doi', 'DOI'], ['arxiv', 'arXiv ID'],
  ['url', '链接'], ['score', '相关度']
];

export function toCSV(r) {
  const head = [
    ...CSV_COLUMNS.map(([, label]) => label),
    ...FIELD_LABELS.map(([, label]) => label),
    '摘要'
  ];
  const rows = (r.papers || []).map((p) => [
    ...CSV_COLUMNS.map(([key]) => (key === 'sources' ? (p.sources || []).join('+') : p[key])),
    ...FIELD_LABELS.map(([key]) => (p.fields || {})[key] || MISSING),
    p.abstract || ''
  ].map(csvCell));
  return [head.map(csvCell).join(','), ...rows.map((cells) => cells.join(','))].join('\r\n') + '\r\n';
}

const BIB_STOP = new Set(['a', 'an', 'the', 'on', 'of', 'for', 'in', 'to', 'with', 'and', 'via', 'using', 'from', 'towards', 'rethinking', 'revisiting']);

export function bibKey(paper) {
  const first = (paper.authors || [])[0] || 'Anonymous';
  const surname = String(first).trim().split(/\s+/).pop() || 'Anonymous';
  const word = (String(paper.title || '').match(/[A-Za-z][A-Za-z0-9-]+/g) || ['paper'])
    .find((w) => !BIB_STOP.has(w.toLowerCase())) || 'paper';
  const safe = (s) => s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase() || 'paper';
  return `${safe(surname)}${paper.year || 'nd'}${safe(word)}`;
}

export function toBibTeX(r) {
  const used = new Set();
  return (r.papers || []).map((p) => {
    let key = bibKey(p);
    let i = 2;
    while (used.has(key)) key = `${bibKey(p)}${i++}`;
    used.add(key);
    const authors = (p.authors || []).length ? (p.authors || []).join(' and ') : 'Anonymous';
    const type = /arxiv|preprint/i.test(p.venue || '') || (!p.venue && p.arxiv) ? 'misc' : 'article';
    const fields = [
      ['title', clean(p.title) || 'Untitled'],
      ['author', authors],
      ['year', p.year || ''],
      ['journal', type === 'article' ? clean(p.venue) : 'arXiv preprint'],
      ['volume', p.arxiv || ''],
      ['number', clean(p.venue) || ''],
      ['doi', p.doi || ''],
      ['url', p.url || ''],
      ['note', `citations=${p.citations ?? 0}; sources=${(p.sources || []).join('+')}`]
    ];
    const body = fields
      .filter(([, v]) => String(v || '').trim())
      .map(([k, v]) => `  ${k} = {${String(v).replace(/[{}]/g, '').trim()}},`)
      .join('\n');
    return `@${type}{${key},\n${body.replace(/,$/, '')}\n}`;
  }).join('\n\n') + '\n';
}

export function fileName(result, ext) {
  const base = clean(result.input).slice(0, 24).replace(/[^\p{L}\p{N}]+/gu, '-') || 'qianren';
  return `${base}-${result.generatedAt || 'export'}.${ext}`;
}
