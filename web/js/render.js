// 渲染器：只吃「数据结构」里的 result 对象，不关心数据来自 demo / rules / qwen
import { MISSING } from './extract-rules.js';
import { SOURCE_LABELS } from './search.js';
import { FIELD_LABELS } from './export.js';

const EL = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'hidden') node.hidden = !!v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return node;
};

const ENGINE_LABELS = { demo: '一键演示', rules: '免 key 实时（规则抽取）', qwen: 'Qwen 增强' };

export function fieldMissing(value) {
  return !value || String(value).trim() === MISSING || String(value).trim() === '';
}

function sourcesOf(p) {
  return (p.sources || []).map((s) => SOURCE_LABELS[s] || s);
}

function paperTitleNode(p) {
  const label = `${p.n}. ${p.title || '(无标题)'}`;
  if (!p.url) return EL('span', { class: 'pt-title', text: label });
  return EL('a', { class: 'pt-title', href: p.url, target: '_blank', rel: 'noopener noreferrer', text: label });
}

function paperRefButton(n, onLocate) {
  return EL('button', { class: 'ref', type: 'button', text: `[${n}]`, dataset: { ref: String(n) }, onclick: () => onLocate(n) });
}

function refsInline(text, onLocate) {
  // 把文本里的 [n] 变成可点击按钮
  const frag = document.createDocumentFragment();
  const re = /\[(\d{1,3})\]/g;
  let last = 0;
  let m;
  const s = String(text || '');
  while ((m = re.exec(s))) {
    if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
    frag.appendChild(paperRefButton(Number(m[1]), onLocate));
    last = m.index + m[0].length;
  }
  if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
  return frag;
}

/* ---------------- 进度面板 ---------------- */

const STEP_DEFS = [
  ['understand', '理解输入 · 生成检索式'],
  ['search:openalex', `检索 ${SOURCE_LABELS.openalex}`],
  ['search:arxiv', `检索 ${SOURCE_LABELS.arxiv}`],
  ['search:s2', `检索 ${SOURCE_LABELS.s2}`],
  ['dedupe', '去重与排序'],
  ['extract', '逐篇抽取 7 字段'],
  ['cluster', '聚类与空白点分析']
];

const STATE_ICON = { running: '◐', done: '●', failed: '✕', skipped: '–', pending: '○' };

export function createProgress(panelEl, { onFinish } = {}) {
  const list = EL('ol', { class: 'steps' });
  const timer = EL('span', { class: 'timer', text: '0.0s' });
  const head = EL('div', { class: 'progress-head' }, [EL('h2', { text: '处理进度' }), timer]);
  const noteEl = EL('p', { class: 'progress-note' });
  panelEl.replaceChildren(head, list, noteEl);
  const rows = new Map();
  let t0 = 0;
  let raf = null;

  const tick = () => {
    timer.textContent = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
    raf = requestAnimationFrame(tick);
  };

  return {
    start(note) {
      panelEl.hidden = false;
      list.replaceChildren();
      rows.clear();
      for (const [key, label] of STEP_DEFS) {
        const detail = EL('span', { class: 'step-detail' });
        const hint = EL('span', { class: 'step-hint', style: 'display:block;margin-top:2px;color:var(--warn)', hidden: true });
        const main = EL('span', { class: 'step-main', style: 'display:block' }, [detail, hint]);
        const row = EL('li', { class: 'step', dataset: { key } }, [
          EL('span', { class: 'step-icon', text: STATE_ICON.pending }),
          EL('span', { class: 'step-label', text: label }),
          main
        ]);
        rows.set(key, { row, detail, hint, icon: row.firstChild });
        list.appendChild(row);
      }
      noteEl.textContent = note || '';
      t0 = Date.now();
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    },
    set(key, state, detail) {
      const entry = rows.get(key);
      if (!entry) return;
      entry.icon.textContent = STATE_ICON[state] || STATE_ICON.pending;
      entry.row.dataset.state = state;
      if (detail != null) entry.detail.textContent = detail;
    },
    setHint(key, text) {
      const entry = rows.get(key);
      if (!entry) return;
      entry.hint.textContent = text || '';
      entry.hint.hidden = !text;
    },
    setNote(text) {
      noteEl.textContent = text;
    },
    stop(extra = '') {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      timer.textContent = `${secs}s${extra}`;
      if (onFinish) onFinish(Number(secs));
    },
    hide() {
      panelEl.hidden = true;
    }
  };
}

/* ---------------- 对比矩阵 ---------------- */

const COLUMNS = [
  { key: 'n', label: '#', type: 'num', fixed: true },
  { key: 'title', label: '论文', type: 'text' },
  { key: 'year', label: '年份', type: 'num' },
  { key: 'sources', label: '来源', type: 'text' },
  { key: 'citations', label: '引用数', type: 'num' },
  ...FIELD_LABELS.map(([key, label]) => ({ key: `fields.${key}`, label, type: 'text' }))
];

function getter(key) {
  return (p) => (key.startsWith('fields.') ? (p.fields || {})[key.slice(7)] : p[key]);
}

function compareValues(a, b, type) {
  if (type === 'num') {
    const na = Number(a), nb = Number(b);
    return (Number.isFinite(na) ? na : -Infinity) - (Number.isFinite(nb) ? nb : -Infinity);
  }
  return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'zh-Hans-CN');
}

function matchesFilter(p, s) {
  if (s.source !== 'all' && !(p.sources || []).includes(s.source)) return false;
  if (s.yearFrom && Number(p.year || 0) < s.yearFrom) return false;
  if (s.yearTo && Number(p.year || 9999) > s.yearTo) return false;
  if (s.onlyDataset && fieldMissing((p.fields || {}).dataset)) return false;
  if (s.text) {
    const hay = [p.title, p.abstract, p.venue, ...(p.authors || []), ...Object.values(p.fields || {})].join(' ').toLowerCase();
    if (!hay.includes(s.text.toLowerCase())) return false;
  }
  return true;
}

export function renderMatrix(result) {
  const state = {
    sortKey: 'n', sortDir: 'asc', text: '', yearFrom: 0, yearTo: 0, source: 'all',
    onlyDataset: false, view: 'table'
  };
  const papers = result.papers || [];

  const tbody = EL('tbody');
  const table = EL('table', { class: 'matrix' }, [EL('thead'), tbody]);
  const thead = table.firstChild;
  const headRow = EL('tr');
  thead.appendChild(headRow);
  const scroller = EL('div', { class: 'table-scroll' }, [table]);

  const cardsWrap = EL('div', { class: 'cards hidden' });

  const textFilter = EL('input', { class: 'input', type: 'search', placeholder: '筛选标题 / 摘要 / 字段内容', 'aria-label': '文本筛选' });
  const yearFrom = EL('input', { class: 'input year', type: 'number', placeholder: '起', 'aria-label': '起始年份' });
  const yearTo = EL('input', { class: 'input year', type: 'number', placeholder: '止', 'aria-label': '结束年份' });
  const sourceSel = EL('select', { class: 'input', 'aria-label': '来源筛选' }, [
    EL('option', { value: 'all', text: '全部来源' }),
    ...Object.entries(SOURCE_LABELS).map(([k, v]) => EL('option', { value: k, text: v }))
  ]);
  const onlyData = EL('label', { class: 'check' }, [
    EL('input', { type: 'checkbox', onchange: (e) => { state.onlyDataset = e.target.checked; refresh(); } }),
    document.createTextNode('只看有数据集的')
  ]);
  const viewToggle = EL('button', { class: 'btn small', type: 'button', text: '卡片视图' });
  const toolbar = EL('div', { class: 'matrix-tools' }, [textFilter, yearFrom, yearTo, sourceSel, onlyData, viewToggle]);

  const sortLabel = (col) => (state.sortKey === col.key ? (state.sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  const counter = EL('p', { class: 'muted tiny' });

  function buildHead() {
    headRow.replaceChildren(...COLUMNS.map((col) => {
      const th = EL('th', { scope: 'col', class: col.fixed ? 'col-fixed' : '' }, [
        EL('button', {
          type: 'button', class: 'th-sort',
          text: col.label + sortLabel(col),
          onclick: () => {
            if (state.sortKey === col.key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
            else { state.sortKey = col.key; state.sortDir = col.type === 'num' ? 'desc' : 'asc'; }
            buildHead();
            refresh();
          }
        })
      ]);
      return th;
    }));
  }

  function fieldCell(value) {
    if (fieldMissing(value)) return EL('td', { class: 'cell missing', text: MISSING });
    return EL('td', { class: 'cell', text: String(value) });
  }

  function buildTable(list) {
    tbody.replaceChildren(...list.map((p) => {
      const tr = EL('tr', { dataset: { n: String(p.n) } }, [
        EL('td', { class: 'col-fixed num', text: String(p.n) }),
        EL('td', { class: 'cell title-cell' }, [paperTitleNode(p), EL('div', { class: 'muted tiny', text: [p.venue, (p.authors || [])[0] && `${(p.authors || []).length > 3 ? (p.authors[0] + ' 等') : (p.authors || []).join(', ')}`].filter(Boolean).join(' · ') })]),
        EL('td', { class: 'num', text: p.year ? String(p.year) : '—' }),
        EL('td', { text: sourcesOf(p).join(' + ') || '—' }),
        EL('td', { class: 'num', text: p.citations == null ? '—' : String(p.citations) }),
        ...FIELD_LABELS.map(([key]) => fieldCell((p.fields || {})[key]))
      ]);
      return tr;
    }));
  }

  function buildCards(list) {
    cardsWrap.replaceChildren(...list.map((p) => EL('article', { class: 'paper-card', dataset: { n: String(p.n) } }, [
      EL('header', {}, [paperTitleNode(p)]),
      EL('p', { class: 'muted tiny', text: `${p.year || 'n.d.'} · ${sourcesOf(p).join(' + ') || '—'} · 引用 ${p.citations ?? '—'}${p.venue ? ` · ${p.venue}` : ''}` }),
      EL('dl', { class: 'fields' }, FIELD_LABELS.flatMap(([key, label]) => [
        EL('dt', { text: label }),
        fieldMissing((p.fields || {})[key])
          ? EL('dd', { class: 'missing', text: MISSING })
          : EL('dd', { text: String(p.fields[key]) })
      ]))
    ])));
  }

  function refresh() {
    const list = papers.filter((p) => matchesFilter(p, state));
    const col = COLUMNS.find((c) => c.key === state.sortKey) || COLUMNS[0];
    const get = getter(col.key);
    list.sort((a, b) => {
      const r = compareValues(get(a), get(b), col.type);
      return state.sortDir === 'asc' ? r : -r;
    });
    if (state.view === 'table') buildTable(list);
    else buildCards(list);
    counter.textContent = `显示 ${list.length} / ${papers.length} 篇 · 点击表头可排序`;
  }

  textFilter.addEventListener('input', () => { state.text = textFilter.value.trim(); refresh(); });
  yearFrom.addEventListener('input', () => { state.yearFrom = Number(yearFrom.value) || 0; refresh(); });
  yearTo.addEventListener('input', () => { state.yearTo = Number(yearTo.value) || 0; refresh(); });
  sourceSel.addEventListener('change', () => { state.source = sourceSel.value; refresh(); });
  viewToggle.addEventListener('click', () => {
    state.view = state.view === 'table' ? 'cards' : 'table';
    viewToggle.textContent = state.view === 'table' ? '卡片视图' : '表格视图';
    scroller.classList.toggle('hidden', state.view !== 'table');
    cardsWrap.classList.toggle('hidden', state.view !== 'cards');
    refresh();
  });

  buildHead();
  refresh();
  const wrap = EL('div', { class: 'matrix-wrap' }, [toolbar, scroller, cardsWrap, counter]);
  wrap.locate = (n) => {
    const exists = papers.some((p) => p.n === n);
    if (!exists) return false;
    if (!papers.filter((p) => matchesFilter(p, state)).some((p) => p.n === n)) {
      textFilter.value = ''; state.text = '';
      yearFrom.value = ''; yearTo.value = ''; state.yearFrom = 0; state.yearTo = 0;
      sourceSel.value = 'all'; state.source = 'all';
      state.onlyDataset = false;
      if (onlyData.firstChild) onlyData.firstChild.checked = false;
      refresh();
    }
    const target = wrap.querySelector(`[data-n="${n}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('flash');
      setTimeout(() => target.classList.remove('flash'), 1600);
    }
    return true;
  };
  return wrap;
}

/* ---------------- 结果区 ---------------- */

export function renderResult(container, result, { onExport } = {}) {
  const locateRefs = (() => {
    let matrix = null;
    const locate = (n) => {
      if (!matrix || !matrix.locate(n)) {
        const card = container.querySelector(`.paper-card[data-n="${n}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
    return { locate, attach: (m) => { matrix = m; } };
  })();

  container.replaceChildren();
  const papers = result.papers || [];

  const statChips = [
    EL('span', { class: 'chip', text: `引擎：${ENGINE_LABELS[result.engine] || result.engine || 'rules'}` }),
    EL('span', { class: 'chip', text: `模式：${result.mode === 'problem' ? '我遇到个问题' : '我有个想法'}` }),
    EL('span', { class: 'chip', text: `OpenAlex ${result.stats?.openalex ?? '—'} 条` }),
    EL('span', { class: 'chip', text: `arXiv ${result.stats?.arxiv ?? '—'} 条` }),
    EL('span', { class: 'chip', text: `Semantic Scholar ${result.stats?.s2 ?? '—'} 条` }),
    EL('span', { class: 'chip', text: `去重后 ${result.stats?.deduped ?? papers.length} 篇` }),
    EL('span', { class: 'chip strong', text: `保留 ${result.stats?.kept ?? papers.length} 篇` }),
    result.stats?.seconds != null ? EL('span', { class: 'chip', text: `用时 ${result.stats.seconds}s` }) : null
  ].filter(Boolean);

  const statsNote = result.stats?.note
    ? EL('p', { class: 'muted tiny stats-note', text: result.stats.note })
    : null;

  const queries = (result.queries || []).length
    ? EL('div', { class: 'queries' }, [
      EL('h3', { text: '检索式' }),
      EL('div', { class: 'chips' }, (result.queries || []).map((q) => EL('code', { class: 'chip query', text: q })))
    ])
    : null;

  const inputBlock = EL('div', { class: 'result-input' }, [
    EL('p', { class: 'muted tiny', text: `${result.mode === 'problem' ? '我的问题' : '我的想法'} · ${result.generatedAt || ''}` }),
    EL('blockquote', { text: result.input || '' })
  ]);

  const sourceNotes = (result.sourceNotes || []).length
    ? EL('p', { class: 'notice', text: `部分数据源未参与：${result.sourceNotes.join('；')}。结果可能不完整。` })
    : null;

  const approaches = (result.approaches || []).length
    ? EL('section', { class: 'block' }, [
      EL('h2', { text: '按解决思路分组' }),
      ...result.approaches.map((a) => EL('article', { class: 'approach' }, [
        EL('h3', { text: a.name }),
        EL('p', { text: a.summary }),
        EL('p', { class: 'kv' }, [EL('strong', { text: '报告的效果：' }), refsInline(a.effect || MISSING, locateRefs.locate)]),
        EL('p', { class: 'kv' }, [EL('strong', { text: '局限：' }), refsInline(a.limits || MISSING, locateRefs.locate)]),
        EL('p', { class: 'refs' }, [
          EL('span', { class: 'muted tiny', text: '代表论文：' }),
          ...(a.papers || []).map((n) => paperRefButton(n, locateRefs.locate))
        ])
      ]))
    ])
    : null;

  const clusters = (result.clusters || []).length
    ? EL('section', { class: 'block' }, [
      EL('h2', { text: '方法簇' }),
      EL('div', { class: 'cluster-grid' }, result.clusters.map((c) => EL('article', { class: 'cluster-card' }, [
        EL('h3', { text: c.name }),
        EL('p', { text: c.summary }),
        EL('div', { class: 'refs' }, (c.papers || []).map((n) => paperRefButton(n, locateRefs.locate)))
      ])))
    ])
    : null;

  const gaps = (result.gaps || []).length
    ? EL('section', { class: 'block' }, [
      EL('h2', { text: '还空着什么（研究空白点）' }),
      EL('ol', { class: 'gaps' }, result.gaps.map((g) => EL('li', {}, [
        EL('strong', { text: g.title }),
        EL('p', {}, [refsInline(g.detail, locateRefs.locate)]),
        (g.papers || []).length
          ? EL('p', { class: 'refs' }, [EL('span', { class: 'muted tiny', text: '相关论文：' }), ...g.papers.map((n) => paperRefButton(n, locateRefs.locate))])
          : null
      ])))
    ])
    : null;

  const matrix = renderMatrix(result);
  locateRefs.attach(matrix);

  const collapsed = result.mode === 'problem';
  const matrixSection = EL('section', { class: 'block' }, [
    EL('div', { class: 'block-head' }, [
      EL('h2', { text: '对比矩阵' }),
      EL('button', {
        class: 'btn small ghost', type: 'button', text: collapsed ? '展开矩阵' : '收起矩阵',
        onclick: (e) => {
          const hidden = matrixBody.hasAttribute('hidden');
          if (hidden) matrixBody.removeAttribute('hidden');
          else matrixBody.setAttribute('hidden', '');
          e.target.textContent = hidden ? '收起矩阵' : '展开矩阵';
        }
      })
    ]),
    EL('p', { class: 'muted tiny', text: '行=论文，列=年份/来源/引用数与 7 个抽取字段；缺失字段统一标注「' + MISSING + '」。窄屏可切换卡片视图或横向滚动。' })
  ]);
  const matrixBody = EL('div', { class: 'matrix-body', hidden: collapsed }, [matrix]);
  matrixSection.appendChild(matrixBody);

  const exportBar = onExport
    ? EL('section', { class: 'block export-block' }, [
      EL('h2', { text: '导出' }),
      EL('div', { class: 'chips' }, [
        EL('button', { class: 'btn', type: 'button', text: '下载 Markdown', onclick: () => onExport('md') }),
        EL('button', { class: 'btn', type: 'button', text: '下载 CSV（Excel 可直接打开）', onclick: () => onExport('csv') }),
        EL('button', { class: 'btn', type: 'button', text: '下载 BibTeX', onclick: () => onExport('bib') })
      ]),
      EL('p', { class: 'muted tiny', text: 'BibTeX 由论文元数据生成（键 = 第一作者姓 + 年份 + 标题首词）。' })
    ])
    : null;

  const empty = !papers.length
    ? EL('p', { class: 'notice', text: '没有检索到可分析的论文：可能是三个数据源同时不可用，或检索式过窄。可换个说法重试。' })
    : null;

  container.appendChild(EL('div', { class: 'result-head' }, [inputBlock, EL('div', { class: 'chips' }, statChips), statsNote, queries, sourceNotes, empty]));
  if (papers.length) {
    container.appendChild(approaches || EL('div'));
    container.appendChild(clusters || EL('div'));
    container.appendChild(gaps || EL('div'));
    container.appendChild(matrixSection);
    container.appendChild(exportBar || EL('div'));
  }
  container.hidden = false;
  container.dataset.engine = result.engine || '';
  return container;
}
