// 渲染器：只吃「数据结构」里的 result 对象，不关心数据来自 demo / rules / qwen
import { MISSING } from './extract-rules.js';
import { SOURCE_LABELS } from './search.js';
import { FIELD_LABELS, toBibTeX } from './export.js';
import {
  annotatePapers, relevanceOf, relationDetail, datasetKey,
  matchesFilters, sortPapers, conclusionOf, overviewLayout, relationLinks
} from './derive.js';

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

/* ---------------- v2 结果区：L0 全景 / L1 卡片 / L2 抽屉 / 对比表 ---------------- */

let activeDrawerCleanup = null;

const RELEVANCE_TEXT = { high: '高', mid: '中', low: '背景' };
const SORT_LABELS = { relevance: '相关度', citations: '引用最多', year: '最新' };

function relevanceChip(p) {
  const level = relevanceOf(p);
  return EL('span', { class: `rel-tag rel-${level}`, text: RELEVANCE_TEXT[level] || '中' });
}

function fieldValue(p, key) {
  const v = (p.fields || {})[key];
  return fieldMissing(v) ? EL('span', { class: 'missing', text: MISSING }) : document.createTextNode(String(v));
}

function paperByN(result, n) {
  return (result.papers || []).find((p) => Number(p.n) === Number(n));
}

function createDrawer(result, opts) {
  const papers = result.papers || [];
  const clusters = result.clusters || [];
  const isRule = (result.engine || '') === 'rules';
  const backdrop = EL('div', { class: 'drawer-backdrop', hidden: true });
  const body = EL('div', { class: 'drawer-body' });
  const titleRow = EL('div', { class: 'drawer-title-row' });
  const backBtn = EL('button', { class: 'btn small ghost drawer-back', type: 'button', text: '← 返回' });
  const closeBtn = EL('button', { class: 'drawer-close', type: 'button', 'aria-label': '关闭详情', text: '×' });
  const handle = EL('button', { class: 'drawer-handle', type: 'button', 'aria-label': '展开或收起详情', text: '' });
  const drawer = EL('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': '论文详情', tabindex: '-1', hidden: true }, [
    handle, EL('div', { class: 'drawer-head' }, [titleRow, backBtn, closeBtn]), body
  ]);
  const frag = EL('div', { class: 'drawer-layer', hidden: true }, [backdrop, drawer]);
  document.body.appendChild(frag);
  let current = null;
  let stack = [];
  let lastFocus = null;
  let expanded = false;

  function setHash(n, push) {
    const next = n == null ? location.pathname + location.search : `#paper-${n}`;
    if (n == null) history.replaceState(null, '', next);
    else if (location.hash !== `#paper-${n}`) {
      if (push) history.pushState(null, '', next);
      else history.replaceState(null, '', next);
    }
  }

  function close(updateHash = true) {
    frag.hidden = true;
    drawer.hidden = true;
    backdrop.hidden = true;
    expanded = false;
    stack = [];
    drawer.classList.remove('expanded');
    if (updateHash) setHash(null, false);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    current = null;
    opts.onClose && opts.onClose();
  }

  function relatedCards(p) {
    const same = papers.filter((x) => x.n !== p.n && x.cluster != null && x.cluster === p.cluster).slice(0, 5);
    const dk = datasetKey(p);
    const shared = dk ? papers.filter((x) => x.n !== p.n && datasetKey(x) === dk && x.cluster !== p.cluster).slice(0, 5) : [];
    const make = (list, label) => list.length
      ? EL('section', { class: 'drawer-rel-block' }, [
        EL('h4', { text: label }),
        EL('div', { class: 'mini-list' }, list.map((x) => EL('button', { class: 'mini-card', type: 'button', onclick: () => open(x.n) }, [
          EL('span', { class: 'mini-title', text: x.title || '(无标题)' }),
          EL('span', { class: 'mini-meta', text: `${x.year || 'n.d.'} · ${SOURCE_LABELS[(x.sources || [])[0]] || ''} · ${RELEVANCE_TEXT[relevanceOf(x)]}` })
        ])))
      ])
      : null;
    return EL('div', { class: 'drawer-rel' }, [make(same, `同簇论文（${clusters[p.cluster]?.name || '未分组'}）`), make(shared, '共享数据集的论文')].filter(Boolean));
  }

  function renderPaper(p) {
    const fields = p.fields || {};
    const rel = relationDetail(p);
    const cluster = p.cluster != null ? clusters[p.cluster] : null;
    const abstractText = String(p.abstract || '').trim();
    const abstractBox = abstractText
      ? EL('div', { class: 'abstract-box' }, [
        EL('p', { class: 'abstract-text clamped', text: abstractText }),
        EL('button', { class: 'btn small ghost abstract-toggle', type: 'button', text: '展开全文', onclick: (e) => {
          const clamped = abstractBox.querySelector('.abstract-text').classList.toggle('clamped');
          e.target.textContent = clamped ? '展开全文' : '收起摘要';
        } })
      ])
      : EL('p', { class: 'muted', text: '摘要未获取，仅显示元数据。' });
    const links = [];
    if (p.doi) links.push(EL('a', { class: 'chip', href: `https://doi.org/${encodeURIComponent(p.doi)}`, target: '_blank', rel: 'noopener noreferrer', text: `DOI ${p.doi}` }));
    if (p.arxiv) links.push(EL('a', { class: 'chip', href: `https://arxiv.org/abs/${encodeURIComponent(p.arxiv)}`, target: '_blank', rel: 'noopener noreferrer', text: `arXiv ${p.arxiv}` }));
    if (p.url) links.push(EL('a', { class: 'chip', href: p.url, target: '_blank', rel: 'noopener noreferrer', text: '原文链接 ↗' }));
    const copyBtn = EL('button', { class: 'btn small ghost', type: 'button', text: '复制 BibTeX', onclick: async (e) => {
      try {
        const text = opts.bibtex ? opts.bibtex(p) : '';
        await navigator.clipboard.writeText(text);
        e.target.textContent = '已复制';
        setTimeout(() => { e.target.textContent = '复制 BibTeX'; }, 1600);
      } catch { e.target.textContent = '复制失败，请手动选择'; }
    } });

    body.replaceChildren(
      EL('header', { class: 'drawer-paper-head' }, [
        EL('div', { class: 'chips tight' }, [
          relevanceChip(p),
          EL('span', { class: 'chip', text: p.year ? String(p.year) : '年份未知' }),
          p.venue ? EL('span', { class: 'chip', text: p.venue }) : null,
          EL('span', { class: 'chip', text: `引用 ${p.citations ?? '—'}` })
        ]),
        EL('h2', { class: 'drawer-title', text: p.title || '(无标题)' }),
        p.authors && p.authors.length ? EL('p', { class: 'drawer-authors muted', text: p.authors.join(', ') }) : null
      ]),
      EL('section', { class: 'relation-block' }, [
        EL('h3', { text: '与你想法的关联' }),
        EL('p', { text: rel.text || MISSING }),
        (rel.supplementary || isRule) ? EL('span', { class: 'rule-tag', text: rel.supplementary ? '规则抽取 · 方法句首句' : '规则抽取' }) : null
      ]),
      EL('section', { class: 'drawer-fields' }, [
        EL('h3', { text: '抽取字段' }),
        EL('dl', {}, FIELD_LABELS.filter(([k]) => k !== 'relation').flatMap(([key, label]) => [
          EL('dt', { text: label }), EL('dd', {}, [fieldValue(p, key)])
        ]))
      ]),
      EL('section', { class: 'drawer-abstract' }, [EL('h3', { text: '原文摘要' }), abstractBox]),
      relatedCards(p),
      EL('section', { class: 'drawer-links' }, [
        EL('h3', { text: '原文' }),
        EL('div', { class: 'chips' }, links.length ? links : [EL('span', { class: 'muted tiny', text: '未提供原文链接' })]),
        EL('div', { class: 'chips' }, [copyBtn])
      ]),
      cluster ? EL('p', { class: 'muted tiny drawer-note', text: `方法簇：${cluster.name}${p.rule ? '' : ''}` }) : null
    );
    titleRow.replaceChildren(relevanceChip(p), EL('span', { class: 'muted tiny', text: `第 ${p.n} 篇` }));
    backBtn.hidden = stack.length === 0;
    body.scrollTop = 0;
  }

  function open(n, push = true) {
    const p = paperByN(result, n);
    if (!p) return false;
    if (current && current.n !== p.n) stack.push(current.n);
    if (!current) lastFocus = document.activeElement;
    current = p;
    renderPaper(p);
    frag.hidden = false;
    drawer.hidden = false;
    backdrop.hidden = false;
    setHash(p.n, push);
    drawer.focus({ preventScroll: true });
    return true;
  }

  function goBack() {
    if (!stack.length) return close();
    const n = stack.pop();
    const p = paperByN(result, n);
    if (!p) return close();
    current = p;
    renderPaper(p);
    setHash(p.n, false);
  }

  closeBtn.addEventListener('click', () => close());
  backdrop.addEventListener('click', () => close());
  backBtn.addEventListener('click', goBack);
  handle.addEventListener('click', () => {
    expanded = !expanded;
    drawer.classList.toggle('expanded', expanded);
  });
  const escHandler = (e) => {
    if (e.key === 'Escape' && !frag.hidden) {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', escHandler);
  const syncHash = () => {
    const m = location.hash.match(/^#paper-(\d+)$/);
    if (m && paperByN(result, m[1])) {
      if (!current || current.n !== Number(m[1])) open(Number(m[1]), false);
    } else if (!m && !frag.hidden) close(false);
  };
  window.addEventListener('hashchange', syncHash);
  window.addEventListener('popstate', syncHash);
  // 手机底部弹层：向上滑动展开
  let touchY = null;
  handle.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  handle.addEventListener('touchend', (e) => {
    if (touchY == null) return;
    const dy = e.changedTouches[0].clientY - touchY;
    if (dy < -30) { expanded = true; drawer.classList.add('expanded'); }
    if (dy > 30) { expanded = false; drawer.classList.remove('expanded'); }
    touchY = null;
  }, { passive: true });
  const destroy = () => {
    document.removeEventListener('keydown', escHandler);
    window.removeEventListener('hashchange', syncHash);
    window.removeEventListener('popstate', syncHash);
    frag.remove();
  };
  return { open, close, syncHash, destroy, el: frag, isOpen: () => !frag.hidden };
}

export function renderResult(container, rawResult, { onExport } = {}) {
  const result = annotatePapers(rawResult);
  container.classList.remove('drawer-open');
  const papers = result.papers || [];
  const clusters = result.clusters || [];
  const state = { cluster: null, relevance: 'all', yearFrom: 0, yearTo: 0, dataset: '', sort: 'relevance', links: 'dataset' };
  const allDatasets = Array.from(new Set(papers.map(datasetKey).filter(Boolean)));

  container.replaceChildren();
  container.hidden = false;

  /* ---- L0 一句话结论 ---- */
  const { top, topClusters } = conclusionOf(papers);
  const conclusion = EL('p', { class: 'conclusion' }, [
    EL('span', { class: 'conclusion-num', text: `共 ${papers.length} 篇` }),
    '，最接近你的是 ',
    top ? paperRefButton(top.n, (n) => open(n)) : '—',
    top ? EL('strong', { text: `《${top.title || '(无标题)'}》` }) : null,
    clusters.length ? '，主流方法是 ' : '',
    ...topClusters.map((i, k) => [
      k ? ' / ' : '',
      EL('button', { class: 'link-btn', type: 'button', text: clusters[i]?.name || `簇 ${i + 1}`, onclick: () => setCluster(i) })
    ]).flat(),
    clusters.length ? '，' : '',
    EL('span', { class: 'conclusion-gap', text: `空白点 ${(result.gaps || []).length} 条。` })
  ]);

  /* ---- 全景图 ---- */
  const svgNS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}) => {
    const node = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };
  const layout = overviewLayout(papers, { width: 860 });
  const svg = svgEl('svg', { class: 'overview-svg', viewBox: `0 0 ${layout.width} ${layout.height}`, role: 'img', 'aria-label': '方法 × 年份全景图' });
  const gridG = svgEl('g', { class: 'ov-grid' });
  const linkG = svgEl('g', { class: 'ov-links' });
  const dotG = svgEl('g', { class: 'ov-dots' });
  const labelG = svgEl('g', { class: 'ov-labels' });
  svg.append(gridG, linkG, dotG, labelG);
  const tickYears = (() => {
    const span = layout.maxY - layout.minY;
    const step = span <= 6 ? 1 : span <= 12 ? 2 : 5;
    const out = [];
    for (let y = layout.minY; y <= layout.maxY; y += step) out.push(y);
    if (out[out.length - 1] !== layout.maxY) out.push(layout.maxY);
    return out;
  })();
  for (const y of tickYears) {
    const x = layout.x(y);
    gridG.appendChild(svgEl('line', { x1: x, x2: x, y1: layout.padT - 8, y2: layout.height - layout.padB + 4, class: 'ov-year-line' }));
    const t = svgEl('text', { x, y: layout.height - 8, class: 'ov-tick', 'text-anchor': 'middle' });
    t.textContent = String(y);
    gridG.appendChild(t);
  }
  for (const lane of layout.lanes) {
    const name = clusters[lane.id]?.name || `簇 ${lane.id + 1}`;
    labelG.appendChild(svgEl('line', { x1: layout.padL - 8, x2: layout.width - 8, y1: lane.y, y2: lane.y, class: 'ov-lane-line' }));
    const label = svgEl('text', { x: layout.padL - 14, y: lane.y + 4, class: 'ov-lane-label', 'text-anchor': 'end' });
    label.textContent = name.length > 10 ? name.slice(0, 9) + '…' : name;
    label.addEventListener('click', () => setCluster(state.cluster === lane.id ? null : lane.id));
    labelG.appendChild(label);
  }
  const pointNodes = new Map();
  for (const pt of layout.points) {
    const p = pt.p;
    const g = svgEl('g', { class: `ov-dot rel-${relevanceOf(p)}`, tabindex: '0', role: 'button', 'aria-label': `${p.n}. ${p.title || ''}` });
    g.appendChild(svgEl('circle', { cx: pt.x, cy: pt.y, r: pt.r }));
    const tip = svgEl('title');
    tip.textContent = `${p.n}. ${p.title || ''}（${p.year || 'n.d.'}，引用 ${p.citations ?? '—'}）`;
    g.appendChild(tip);
    g.addEventListener('click', () => open(p.n));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(p.n); } });
    dotG.appendChild(g);
    pointNodes.set(p.n, g);
  }
  function drawLinks() {
    linkG.replaceChildren();
    const links = relationLinks(papers, state.links);
    const byN = new Map(layout.points.map((pt) => [pt.p.n, pt]));
    for (const [a, b] of links) {
      const pa = byN.get(a.n), pb = byN.get(b.n);
      if (!pa || !pb) continue;
      linkG.appendChild(svgEl('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, class: 'ov-link' }));
    }
  }
  const linkChips = EL('div', { class: 'chips link-chips', role: 'group', 'aria-label': '关系线模式' }, [
    ['dataset', '按数据集连'], ['metric', '按指标连'], ['none', '不连']
  ].map(([key, label]) => EL('button', {
    class: 'chip toggle', type: 'button', 'aria-pressed': 'false', dataset: { link: key }, text: label,
    onclick: () => { state.links = key; syncLinkChips(); drawLinks(); }
  })));
  function syncLinkChips() {
    for (const b of linkChips.querySelectorAll('[data-link]')) b.setAttribute('aria-pressed', String(b.dataset.link === state.links));
  }
  syncLinkChips();
  drawLinks();

  const svgScroll = EL('div', { class: 'overview-scroll' }, [svg]);
  const overview = EL('section', { class: 'block overview' }, [
    EL('div', { class: 'block-head' }, [
      EL('h2', { text: '全景：方法 × 年份' }),
      EL('span', { class: 'muted tiny', text: '点大小=引用数（对数）· 颜色=相关度 · 点击圆点看详情' })
    ]),
    conclusion,
    linkChips,
    svgScroll,
    (result.gaps || []).length ? EL('div', { class: 'gaps-wrap' }, [
      EL('h3', { text: '还空着什么（研究空白点）' }),
      EL('ol', { class: 'gaps' }, result.gaps.map((g) => EL('li', {}, [
        EL('strong', { text: g.title }),
        EL('p', {}, [refsInline(g.detail, (n) => open(n))])
      ])))
    ]) : null
  ]);

  /* ---- 标签页 ---- */
  const cardsPanel = EL('section', { class: 'tab-panel' });
  const matrixPanel = EL('section', { class: 'tab-panel', hidden: true });
  const tabs = EL('div', { class: 'view-tabs', role: 'tablist', 'aria-label': '结果视图' }, [
    EL('button', { class: 'view-tab', role: 'tab', type: 'button', 'aria-selected': 'true', text: '论文卡片' }),
    EL('button', { class: 'view-tab', role: 'tab', type: 'button', 'aria-selected': 'false', text: '对比表' })
  ]);
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-tab');
    if (!btn) return;
    const isCards = btn.textContent === '论文卡片';
    for (const b of tabs.querySelectorAll('.view-tab')) b.setAttribute('aria-selected', String(b === btn));
    cardsPanel.hidden = !isCards;
    matrixPanel.hidden = isCards;
  });

  /* ---- 筛选 ---- */
  const clusterBtns = [];
  const relBtns = [];
    const mkClusterBtn = (i, label, count, compact) => {
    const b = EL('button', {
      class: compact ? 'chip filter-chip' : 'filter-opt', type: 'button', 'aria-pressed': 'false', dataset: { cluster: i == null ? 'all' : String(i) },
      onclick: () => setCluster(i)
    }, [EL('span', { text: label }), EL('span', { class: 'filter-count', text: String(count) })]);
    clusterBtns.push(b);
    return b;
  };
  const mkRelBtn = (key, label, compact) => {
    const b = EL('button', {
      class: compact ? 'chip filter-chip' : 'filter-opt', type: 'button', 'aria-pressed': 'false', dataset: { rel: key },
      onclick: () => { state.relevance = key; syncFilters(); renderCards(); }
    }, [EL('span', { text: label })]);
    relBtns.push(b);
    return b;
  };
  const yearFrom = EL('input', { class: 'input year', type: 'number', placeholder: '起', 'aria-label': '起始年份' });
  const yearTo = EL('input', { class: 'input year', type: 'number', placeholder: '止', 'aria-label': '结束年份' });
  yearFrom.addEventListener('input', () => { state.yearFrom = Number(yearFrom.value) || 0; renderCards(); });
  yearTo.addEventListener('input', () => { state.yearTo = Number(yearTo.value) || 0; renderCards(); });
  const datasetSel = EL('select', { class: 'input', 'aria-label': '数据集筛选' }, [
    EL('option', { value: '', text: '全部数据集' }),
    ...allDatasets.map((d) => EL('option', { value: d, text: d.length > 26 ? d.slice(0, 25) + '…' : d }))
  ]);
  datasetSel.addEventListener('change', () => { state.dataset = datasetSel.value; renderCards(); });
  const resetBtn = EL('button', { class: 'btn small ghost', type: 'button', text: '重置筛选', onclick: () => {
    state.cluster = null; state.relevance = 'all'; state.yearFrom = 0; state.yearTo = 0; state.dataset = '';
    yearFrom.value = ''; yearTo.value = ''; datasetSel.value = '';
    syncFilters(); renderCards();
  } });

  const aside = EL('aside', { class: 'filter-aside', 'aria-label': '筛选' }, [
    EL('h3', { text: '筛选' }),
    EL('div', { class: 'filter-group' }, [EL('h4', { text: '方法簇' }), ...clusterBtns.length ? [] : [], mkClusterBtn(null, '全部', papers.length), ...clusters.map((c, i) => mkClusterBtn(i, c.name, (c.papers || []).length))]),
    EL('div', { class: 'filter-group' }, [EL('h4', { text: '相关度' }), mkRelBtn('all', '全部'), mkRelBtn('high', '高'), mkRelBtn('mid', '中'), mkRelBtn('low', '背景')]),
    EL('div', { class: 'filter-group' }, [EL('h4', { text: '年份' }), EL('div', { class: 'year-row' }, [yearFrom, EL('span', { class: 'muted', text: '–' }), yearTo])]),
    EL('div', { class: 'filter-group' }, [EL('h4', { text: '数据集' }), datasetSel]),
    resetBtn
  ]);
  // 手机/平板顶部横向筛选
  const mobileFilters = EL('div', { class: 'filter-mobile' }, [
    EL('div', { class: 'filter-scroll' }, [
      mkClusterBtn(null, '全部', papers.length, true),
      ...clusters.map((c, i) => mkClusterBtn(i, c.name, (c.papers || []).length, true)),
      EL('span', { class: 'filter-sep' }),
      mkRelBtn('all', '全部相关度', true), mkRelBtn('high', '高', true), mkRelBtn('mid', '中', true), mkRelBtn('low', '背景', true)
    ]),
    EL('div', { class: 'filter-mobile-row' }, [yearFrom, EL('span', { class: 'muted', text: '–' }), yearTo, datasetSel])
  ]);
  // 把桌面端筛选组按钮补到 aside（上面已生成引用）
  function syncFilters() {
    for (const b of clusterBtns) {
      const v = b.dataset.cluster;
      const on = v === 'all' ? state.cluster == null : Number(v) === state.cluster;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('active', on);
    }
    for (const b of relBtns) {
      const on = (b.dataset.rel || 'all') === state.relevance;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('active', on);
    }
    for (const pt of layout.points) {
      const node = pointNodes.get(pt.p.n);
      if (node) node.classList.toggle('dim', !matchesFilters(pt.p, state));
    }
    for (const lane of labelG.querySelectorAll('.ov-lane-label')) {
      const idx = layout.lanes.findIndex((l, k) => labelG.querySelectorAll('.ov-lane-label')[k] === lane);
      lane.classList.toggle('active', state.cluster != null && layout.lanes[idx]?.id === state.cluster);
    }
  }
  function setCluster(i) { state.cluster = i == null ? null : Number(i); syncFilters(); renderCards(); }

  /* ---- 卡片 ---- */
  const cardList = EL('div', { class: 'paper-grid' });
  const cardCount = EL('p', { class: 'muted tiny card-count' });
  const sortBtns = [];
  const sortBar = EL('div', { class: 'sort-bar', role: 'group', 'aria-label': '排序' }, [
    EL('span', { class: 'muted tiny', text: '排序' }),
    ...Object.entries(SORT_LABELS).map(([key, label]) => {
      const b = EL('button', { class: 'chip toggle', type: 'button', 'aria-pressed': String(key === state.sort), text: label, onclick: () => {
        state.sort = key; sortBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderCards();
      } });
      sortBtns.push(b);
      return b;
    })
  ]);

  function cardNode(p) {
    const rel = relationDetail(p);
    const cluster = p.cluster != null ? clusters[p.cluster] : null;
    const dk = datasetKey(p);
    return EL('article', {
      class: 'paper-card v2', dataset: { n: String(p.n) }, tabindex: '0', role: 'button',
      'aria-label': `打开 ${p.n}. ${p.title || ''} 详情`,
      onclick: () => open(p.n),
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); open(p.n); } }
    }, [
      EL('header', { class: 'card-meta' }, [
        relevanceChip(p),
        EL('span', { class: 'chip plain', text: p.year ? String(p.year) : '年份未知' }),
        p.venue ? EL('span', { class: 'venue', text: p.venue }) : null,
        EL('span', { class: 'cite', text: `引用 ${p.citations ?? '—'}` })
      ]),
      EL('h3', { class: 'card-title' }, [p.title || '(无标题)']),
      EL('div', { class: 'card-rel' }, [
        EL('span', { class: 'card-rel-label', text: '与你想法的关联' }),
        EL('p', { text: rel.text || MISSING }),
        (rel.supplementary || result.engine === 'rules') ? EL('span', { class: 'rule-tag', text: '规则抽取' }) : null
      ]),
      (cluster || dk) ? EL('footer', { class: 'card-chips' }, [
        cluster ? EL('span', { class: 'chip small', text: cluster.name }) : null,
        dk ? EL('span', { class: 'chip small', text: dk.length > 22 ? dk.slice(0, 21) + '…' : dk }) : null
      ]) : null
    ]);
  }
  function renderCards() {
    const filtered = papers.filter((p) => matchesFilters(p, state));
    const list = sortPapers(filtered, state.sort);
    cardList.replaceChildren(...list.map(cardNode));
    cardCount.textContent = `显示 ${list.length} / ${papers.length} 篇${state.cluster != null ? ` · 簇「${clusters[state.cluster]?.name || ''}」` : ''}`;
    if (!list.length) cardList.appendChild(EL('p', { class: 'notice', text: '当前筛选下没有论文，试试重置筛选。' }));
  }

  cardsPanel.append(
    EL('div', { class: 'block-head' }, [EL('h2', { text: '论文卡片' }), EL('span', { class: 'muted tiny', text: '按相关度与引用数排序，点击卡片看详情' })]),
    mobileFilters,
    EL('div', { class: 'results-layout' }, [
      aside,
      EL('div', { class: 'cards-col' }, [sortBar, cardCount, cardList])
    ])
  );

  /* ---- 对比表 ---- */
  const matrix = renderMatrix(result);
  matrixPanel.append(EL('h2', { text: '对比表' }), matrix);

  /* ---- 顶部信息与导出 ---- */
  const isDemo = (result.engine || '') === 'demo';
  const statChips = [
    EL('span', { class: 'chip', text: `引擎：${ENGINE_LABELS[result.engine] || result.engine || 'rules'}` }),
    EL('span', { class: 'chip', text: `去重后 ${result.stats?.deduped ?? papers.length} 篇` }),
    EL('span', { class: 'chip strong', text: `保留 ${result.stats?.kept ?? papers.length} 篇` }),
    isDemo ? EL('span', { class: 'chip', text: '预计算结果' }) : (result.stats?.seconds != null ? EL('span', { class: 'chip', text: `用时 ${result.stats.seconds}s` }) : null)
  ].filter(Boolean);
  const exportBtns = onExport ? [
    EL('button', { class: 'btn small ghost', type: 'button', text: '导出 Markdown', onclick: () => onExport('md') }),
    EL('button', { class: 'btn small ghost', type: 'button', text: '导出 CSV', onclick: () => onExport('csv') }),
    EL('button', { class: 'btn small ghost', type: 'button', text: '导出 BibTeX', onclick: () => onExport('bib') })
  ] : [];
  const header = EL('div', { class: 'result-head v2' }, [
    EL('p', { class: 'muted tiny', text: `${result.mode === 'problem' ? '我的问题' : '我的想法'} · ${result.generatedAt || ''}` }),
    EL('blockquote', { text: result.input || '' }),
    EL('div', { class: 'chips' }, statChips),
    (result.queries || []).length ? EL('div', { class: 'queries' }, [EL('h3', { text: '检索式' }), EL('div', { class: 'chips' }, (result.queries || []).map((q) => EL('code', { class: 'chip query', text: q })))]) : null,
    (result.sourceNotes || []).length ? EL('p', { class: 'notice', text: `部分数据源未参与：${result.sourceNotes.join('；')}。` }) : null,
    exportBtns.length ? EL('div', { class: 'export-row chips' }, [EL('span', { class: 'muted tiny', text: '带走结果：' }), ...exportBtns]) : null
  ]);

  const mobileExport = onExport ? EL('div', { class: 'mobile-export' }, [
    EL('button', { class: 'btn primary', type: 'button', text: '导出', onclick: () => onExport('md') })
  ]) : null;

  /* ---- 抽屉与 hash ---- */
  if (activeDrawerCleanup) { activeDrawerCleanup(); activeDrawerCleanup = null; }
  const drawer = createDrawer(result, {
    bibtex: (p) => toBibTeX({ ...result, papers: [p] }),
    onClose: () => { container.classList.remove('drawer-open'); }
  });
  activeDrawerCleanup = drawer.destroy;
  const open = (n) => { container.classList.add('drawer-open'); drawer.open(n); };

  if (!papers.length) {
    container.append(header, EL('p', { class: 'notice', text: '没有检索到可分析的论文：可能是三个数据源同时不可用，或检索式过窄。可换个说法重试。' }));
    return container;
  }
  container.append(header, overview, tabs, cardsPanel, matrixPanel, mobileExport);
  syncFilters();
  renderCards();
  drawer.syncHash();
  container.dataset.engine = result.engine || '';
  return container;
}
