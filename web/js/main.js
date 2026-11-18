// 主编排：模式 A/B、三种运行方式、进度展示、导出下载
import { buildQueries, keywords } from './terms.js';
import { dedupe, rank, searchAll, queryTermsFor, SOURCE_LABELS } from './search.js';
import { rulesResult, MISSING } from './extract-rules.js';
import { createProgress, renderResult } from './render.js';
import { toMarkdown, toCSV, toBibTeX, fileName } from './export.js';
import {
  probeHealth, serverInfo, llmAvailable, getKey, setKey, getModel, setModel, MODELS,
  enginePref, setEnginePref, llmExpandQueries, llmAnalyze
} from './llm.js';

const $ = (sel) => document.querySelector(sel);

const ERROR_LABELS = {
  rate_limited: '限流，稍后重试',
  timeout: '请求超时（12s）',
  unreachable: '不可达（浏览器限制且无可用代理）',
  parse_error: '返回内容解析失败',
  cors_blocked: '浏览器跨域限制（未启用同源代理）',
  html_response: '同源代理未部署（返回了页面而非数据）',
  proxy_required: '需服务器代理，已跳过（OpenAlex 已收录 arXiv 预印本）',
  empty_queries: '检索式为空',
  failed: '请求失败'
};

const EXAMPLES = {
  idea: [
    '用检索增强生成减少大模型在医学问答中的幻觉',
    'few-shot molecular property prediction with graph neural networks',
    '让多模态大模型在文档理解中少编造表格数值'
  ],
  problem: [
    '我的医学影像分类模型在类别极度不平衡时少数类召回率很低',
    'RAG 检索到的段落噪声太大，答案经常被带偏',
    '微调小模型做端侧问答时显存不够'
  ]
};

const ENGINE_BADGE = { auto: '自动（有 key 用 Qwen）', qwen: '强制 Qwen 增强', rules: '免 key 实时模式' };

const state = { mode: 'idea', busy: false, lastResult: null, demos: [] };
const els = {};
let progress = null;

const EL = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return node;
};

const nextTick = () => new Promise((r) => setTimeout(r, 0));

function labelError(code) {
  const key = String(code || 'failed');
  if (ERROR_LABELS[key]) return ERROR_LABELS[key];
  if (key.startsWith('http_')) return `服务返回 ${key.slice(5)}`;
  return key.slice(0, 40);
}

function showError(text, kind = 'error') {
  els.errors.textContent = text || '';
  els.errors.className = `notice ${kind}`;
  els.errors.hidden = !text;
}

/* ---------------- 模式与输入 ---------------- */

function setMode(mode) {
  state.mode = mode === 'problem' ? 'problem' : 'idea';
  for (const btn of els.tabs.querySelectorAll('[data-mode]')) {
    btn.setAttribute('aria-selected', String(btn.dataset.mode === state.mode));
  }
  els.label.textContent = state.mode === 'problem'
    ? '描述你遇到的问题（越具体越好）'
    : '用一句话说出你的研究想法（中文或英文）';
  els.input.placeholder = `例如：${EXAMPLES[state.mode][0]}`;
  renderExamples();
}

function renderExamples() {
  els.examples.replaceChildren(
    EL('span', { class: 'muted tiny', text: '试试：' }),
    ...EXAMPLES[state.mode].map((ex) => EL('button', {
      class: 'chip example', type: 'button', text: ex,
      onclick: () => { els.input.value = ex; els.input.focus(); }
    }))
  );
}

/* ---------------- 实时运行 ---------------- */

async function shouldUseLlm() {
  const pref = els.engineSelect.value;
  if (pref === 'rules') return false;
  if (!serverInfo().checked) await probeHealth();
  const available = llmAvailable();
  return available;
}

async function runLive() {
  if (state.busy) return;
  const input = els.input.value.trim();
  if (!input) {
    showError('先写点什么，再开始检索。');
    els.input.focus();
    return;
  }
  showError('');
  state.busy = true;
  state.busyStart = Date.now();
  els.run.disabled = true;
  els.run.textContent = '检索中…';
  els.result.hidden = true;
  progress.start('检索与抽取全部在浏览器里完成，目标 60 秒内；任一数据源失败不影响其余结果。');

  let llmNote = '';
  try {
    const wantLlm = await shouldUseLlm();
    const terms = queryTermsFor(input);
    const { unmapped } = keywords(input);

    progress.set('understand', 'running', wantLlm ? '调用 Qwen 生成英文检索式…' : '规则法拆分中英术语…');
    let queries = buildQueries(input);
    if (wantLlm) {
      try {
        queries = await llmExpandQueries(input, state.mode);
      } catch (err) {
        llmNote = `Qwen 生成检索式失败（${labelError(err.message)}），已改用规则法`;
      }
    }
    if (!queries.length) throw new Error('empty_queries');
    progress.set('understand', 'done', queries.join(' ／ '));
    if (unmapped.length) {
      progress.setHint('understand', `未识别：${unmapped.slice(0, 3).join('、')}（建议用英文描述或在设置里启用 Qwen 增强）`);
    }

    for (const name of Object.keys(SOURCE_LABELS)) progress.set(`search:${name}`, 'running');
    const { raw, counts, status } = await searchAll(queries, {
      allowProxy: serverInfo().ok,
      onSource: (name, st) => {
        const stepKey = `search:${name}`;
        const detail = st.state === 'done'
          ? `命中 ${st.count} 条`
          : st.state === 'skipped'
            ? '需代理，已跳过'
            : st.state === 'failed' ? labelError(st.note) : '';
        progress.set(stepKey, st.state === 'running' ? 'running' : st.state, detail);
      }
    });
    const sourceNotes = Object.entries(status)
      .filter(([, st]) => st.state === 'failed' || st.state === 'skipped')
      .map(([name, st]) => `${SOURCE_LABELS[name]} ${labelError(st.note)}`);
    if (sourceNotes.length) progress.setNote(`部分数据源缺失：${sourceNotes.join('；')}`);

    progress.set('dedupe', 'running');
    const deduped = dedupe(raw);
    const ranked = rank(deduped, terms.length ? terms : buildQueries(input), { keep: 15 });
    progress.set('dedupe', 'done', `${raw.length} 条 → 去重 ${deduped.length} 篇 → 相关性过滤后保留 ${ranked.length} 篇`);

    if (!ranked.length) {
      progress.stop();
      progress.setNote('');
      showError('检索到了结果，但没有一篇同时满足相关性门槛（得分 ≥ 最高分的 35%，且命中 2 个以上检索词或多词短语）。可换个更具体的说法重试，或先看一键演示。', 'warn');
      els.result.hidden = true;
      return;
    }

    // 逐篇抽取（Qwen 一次性批量；规则法逐篇，便于显示 n/N）
    let papersWithFields = ranked;
    let llmOut = null;
    if (wantLlm && !llmNote) {
      progress.set('extract', 'running', `调用 Qwen 批量抽取 ${ranked.length} 篇…`);
      try {
        llmOut = await llmAnalyze({ mode: state.mode, input, queries, papers: ranked });
        papersWithFields = llmOut.papers;
        progress.set('extract', 'done', `${papersWithFields.length}/${ranked.length} 篇（Qwen）`);
      } catch (err) {
        llmNote = `Qwen 抽取失败（${labelError(err.message)}），已自动回落到规则抽取`;
        progress.set('extract', 'running', '回落到规则抽取…');
      }
    }
    if (!llmOut) {
      papersWithFields = rulesResult({ papers: ranked, input }).papers;
      for (let i = 0; i < papersWithFields.length; i += 1) {
        progress.set('extract', 'running', `${i + 1}/${papersWithFields.length}`);
        if (i % 2 === 0) await nextTick();
      }
      progress.set('extract', 'done', `${papersWithFields.length} 篇（规则抽取，缺字段标注「${MISSING}」）`);
    }

    progress.set('cluster', 'running', llmOut ? '汇总 Qwen 结果…' : 'TF-IDF 方法聚类…');
    const elapsed = (Date.now() - state.busyStart) / 1000;
    const result = rulesResult({
      id: 'live',
      mode: state.mode,
      input,
      queries,
      papers: papersWithFields,
      counts,
      dedupedTotal: deduped.length,
      seconds: elapsed,
      engine: llmOut ? 'qwen' : 'rules'
    });
    if (llmOut) {
      if (llmOut.clusters.length) result.clusters = llmOut.clusters;
      if (state.mode === 'idea' && llmOut.gaps.length) result.gaps = llmOut.gaps;
      if (state.mode === 'problem' && llmOut.approaches.length) result.approaches = llmOut.approaches;
    }
    result.sourceNotes = sourceNotes;
    if (llmNote) result.llmNote = llmNote;
    progress.set('cluster', 'done', `${result.clusters.length} 簇 · ${result.gaps.length} 条空白点 · ${result.approaches.length} 组思路`);
    finish(result);
  } catch (err) {
    progress.stop();
    showError(`运行中断：${labelError(err && err.message)}。可重试；不想等可直接看一键演示。`);
  } finally {
    state.busy = false;
    els.run.disabled = false;
    els.run.textContent = '开始检索';
  }
}

function finish(result) {
  progress.stop();
  state.lastResult = result;
  renderResult(els.result, result, { onExport: download });
  const notes = [result.llmNote, result.sourceNotes?.length ? `数据源提示：${result.sourceNotes.join('；')}` : '']
    .filter(Boolean).join(' ｜ ');
  showError(notes, 'warn');
  requestAnimationFrame(() => els.result.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

/* ---------------- 一键演示 ---------------- */

async function loadDemos() {
  try {
    const res = await fetch('demos/index.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    state.demos = Array.isArray(data) ? data : data.demos || [];
  } catch {
    state.demos = [];
  }
  if (!state.demos.length) {
    els.demoWrap.replaceChildren(EL('p', {
      class: 'muted tiny',
      text: '演示数据尚未就绪（demos/index.json 为空或不存在），可先用免 key 实时模式检索真实文献。'
    }));
    return;
  }
  els.demoWrap.replaceChildren(
    EL('span', { class: 'muted tiny', text: '一键演示 · 预计算的真实检索结果' }),
    ...state.demos.map((d) => EL('button', { class: 'btn demo', type: 'button', dataset: { demo: d.id }, onclick: () => runDemo(d.id) }, [
      EL('span', { class: 'demo-mode', text: d.mode === 'problem' ? '问题' : '想法' }),
      EL('span', { class: 'demo-title', text: d.title })
    ]))
  );
}

async function runDemo(id) {
  if (state.busy) return;
  await runDemoFile(`demos/${encodeURIComponent(id)}.json`, `demos/${String(id).replace(/[^a-z0-9-]/gi, '')}.json`);
}

// demoFile 参数用于本地自测（例如 ?demoFile=../dev/fixture.json），不用于线上
async function runDemoFile(path, label = path) {
  if (state.busy) return;
  let result;
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    result = await res.json();
  } catch (err) {
    showError(`演示数据 ${label} 读取失败（${labelError(err.message)}）。`);
    return;
  }
  showError('');
  state.busy = true;
  els.run.disabled = true;
  els.result.hidden = true;
  progress.start('回放预计算结果，不发起任何网络请求。');

  const kept = result.stats?.kept ?? (result.papers || []).length;
  const steps = [
    ['understand', (result.queries || []).join(' ／ ') || '检索式已生成'],
    ['search:openalex', `命中 ${result.stats?.openalex ?? '—'} 条`],
    ['search:arxiv', `命中 ${result.stats?.arxiv ?? '—'} 条`],
    ['search:s2', `命中 ${result.stats?.s2 ?? '—'} 条`],
    ['dedupe', `${result.stats?.deduped ?? kept} 篇 → 取前 ${kept} 篇`],
    ['extract', `${kept} 篇 × 7 字段`],
    ['cluster', `${(result.clusters || []).length} 簇 · ${(result.gaps || []).length} 条空白点`]
  ];
  const total = 2400;
  for (let i = 0; i < steps.length; i += 1) {
    const [key, detail] = steps[i];
    progress.set(key, 'running', '');
    await new Promise((r) => setTimeout(r, total / steps.length / 2));
    progress.set(key, 'done', detail);
  }
  progress.stop();
  result.engine = result.engine || 'demo';
  state.lastResult = result;
  renderResult(els.result, result, { onExport: download });
  state.busy = false;
  els.run.disabled = false;
  requestAnimationFrame(() => els.result.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

/* ---------------- 导出 ---------------- */

function download(kind) {
  const r = state.lastResult;
  if (!r) return;
  let text = '';
  let mime = 'text/plain;charset=utf-8';
  let ext = kind;
  if (kind === 'md') { text = toMarkdown(r); mime = 'text/markdown;charset=utf-8'; ext = 'md'; }
  if (kind === 'csv') { text = '\ufeff' + toCSV(r); mime = 'text/csv;charset=utf-8'; ext = 'csv'; }
  if (kind === 'bib') { text = toBibTeX(r); mime = 'application/x-bibtex;charset=utf-8'; ext = 'bib'; }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = EL('a', { href: url, download: fileName(r, ext) });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------------- 设置 ---------------- */

function refreshSettingsUi() {
  const info = serverInfo();
  els.serverStatus.textContent = !info.checked ? '正在检测同源函数…'
    : info.ok ? (info.llm ? '同源函数可用且已配置服务器端 key（默认走函数）' : '同源函数存在，但未配置 DASHSCOPE_API_KEY')
      : '未检测到同源函数：将使用浏览器直连或免 key 规则模式';
  els.keyState.textContent = getKey() ? '本浏览器已保存 key（清除浏览器数据即失效）' : '尚未保存 key';
  els.localBadge.textContent = llmAvailable() ? 'Qwen 增强：可用' : 'Qwen 增强：不可用（走免 key 规则模式）';
  els.engineBadge.textContent = ENGINE_BADGE[els.engineSelect.value] || ENGINE_BADGE.auto;
}

function openSettings() {
  els.keyInput.value = getKey();
  refreshSettingsUi();
  if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
  else els.dialog.setAttribute('open', '');
  probeHealth().then(refreshSettingsUi);
}

function wireSettings() {
  els.engineSelect.value = enginePref();
  els.modelSelect.replaceChildren(...MODELS.map((m) => EL('option', { value: m, text: m })));
  els.modelSelect.value = getModel();
  els.saveBtn.addEventListener('click', () => {
    setKey(els.keyInput.value);
    setModel(els.modelSelect.value);
    setEnginePref(els.engineSelect.value);
    refreshSettingsUi();
    els.saveHint.textContent = '已保存在本机浏览器 localStorage。';
    setTimeout(() => { els.saveHint.textContent = ''; }, 3000);
  });
  els.clearBtn.addEventListener('click', () => {
    setKey('');
    els.keyInput.value = '';
    refreshSettingsUi();
    els.saveHint.textContent = '已清除本地 key。';
  });
  els.engineSelect.addEventListener('change', () => {
    setEnginePref(els.engineSelect.value);
    refreshSettingsUi();
  });
  els.modelSelect.addEventListener('change', () => setModel(els.modelSelect.value));
}

/* ---------------- 启动 ---------------- */

function boot() {
  els.tabs = $('#mode-tabs');
  els.label = $('#input-label');
  els.input = $('#main-input');
  els.examples = $('#examples');
  els.run = $('#run-btn');
  els.demoWrap = $('#demo-wrap');
  els.progressPanel = $('#panel-progress');
  els.result = $('#panel-result');
  els.errors = $('#errors');
  els.dialog = $('#settings-dialog');
  els.engineSelect = $('#engine-select');
  els.modelSelect = $('#model-select');
  els.keyInput = $('#key-input');
  els.saveBtn = $('#save-settings');
  els.clearBtn = $('#clear-key');
  els.saveHint = $('#save-hint');
  els.closeSettings = $('#close-settings');
  els.openSettings = $('#open-settings');
  els.serverStatus = $('#server-status');
  els.keyState = $('#key-state');
  els.localBadge = $('#llm-badge');
  els.engineBadge = $('#engine-badge');

  progress = createProgress(els.progressPanel);
  wireSettings();
  renderExamples();
  setMode('idea');

  els.tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (btn) setMode(btn.dataset.mode);
  });
  els.run.addEventListener('click', runLive);
  els.openSettings.addEventListener('click', openSettings);
  els.closeSettings.addEventListener('click', () => els.dialog.close());
  els.result.addEventListener('click', (e) => {
    const ref = e.target.closest('[data-ref]');
    if (!ref) return;
    const wrap = els.result.querySelector('.matrix-wrap');
    const n = Number(ref.dataset.ref);
    if (wrap && wrap.locate) wrap.locate(n);
    else {
      const card = els.result.querySelector(`.paper-card[data-n="${n}"]`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runLive();
  });

  const devFile = new URLSearchParams(location.search).get('demoFile');
  if (devFile && !/^https?:|^\/\//i.test(devFile)) runDemoFile(devFile, devFile);
  else loadDemos();
  refreshSettingsUi();
  probeHealth().then(refreshSettingsUi);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
