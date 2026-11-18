// 纯前端文献导入解析：RIS / BibTeX / EndNote(.enw) / NoteExpress(.net 文本) / RefWorks（知网导出）。
// 文件只在浏览器里读取与解析，不上传；导入的论文来源标「导入」，随后与检索结果一起参与去重与抽取。

export const IMPORT_FORMATS = {
  ris: 'RIS',
  bibtex: 'BibTeX',
  endnote: 'EndNote',
  noteexpress: 'NoteExpress',
  refworks: 'RefWorks'
};

export const IMPORT_ACCEPT = '.ris,.bib,.bibtex,.enw,.net,.txt';

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

function cleanDoi(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;]+$/, '');
}

function cleanArxiv(value) {
  const m = String(value || '').match(/(\d{4}\.\d{4,5})(v\d+)?/);
  return m ? m[1] : '';
}

function parseYear(value) {
  const m = String(value || '').match(/(1[89]\d{2}|20\d{2}|21\d{2})/);
  return m ? Number(m[1]) : null;
}

function splitAuthors(value, separator = /\s*(?:;|；|\band\b)\s*/i) {
  return Array.from(new Set(
    String(value || '').split(separator).map((a) => clean(a).replace(/,$/, '')).filter(Boolean)
  )).slice(0, 40);
}

function makePaper(raw, format) {
  const title = clean(raw.title).replace(/^["“]|["”]$/g, '');
  if (!title) return null;
  const doi = cleanDoi(raw.doi);
  const arxiv = cleanArxiv(raw.arxiv || raw.eprint);
  const url = clean(raw.url) || (doi ? `https://doi.org/${doi}` : arxiv ? `https://arxiv.org/abs/${arxiv}` : '');
  return {
    title,
    authors: splitAuthors(raw.authors, raw.authorSep || /\s*(?:;|；)\s*/).slice(0, 12),
    year: parseYear(raw.year),
    venue: clean(raw.venue),
    venueSource: 'import',
    url,
    doi,
    arxiv,
    pmid: '',
    oaUrl: '',
    sources: ['import'],
    citations: 0,
    citationSource: 'import',
    abstract: clean(raw.abstract),
    apiScore: 0,
    importFormat: format
  };
}

function finish(records, format) {
  return records.map((r) => makePaper(r, format)).filter(Boolean);
}

/* ---------------- RIS ---------------- */

const RIS_MAP = {
  TI: 'title', T1: 'title', CT: 'title', BT: 'title',
  AU: 'authors', A1: 'authors', A2: 'authors',
  PY: 'year', Y1: 'year', DA: 'year',
  JO: 'venue', JF: 'venue', T2: 'venue', JA: 'venue', PB: 'venue',
  DO: 'doi', AB: 'abstract', N2: 'abstract', UR: 'url', L1: 'url', L2: 'url'
};

export function parseRis(text) {
  const records = [];
  let current = null;
  let lastKey = '';
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9])\s{1,2}-\s?(.*)$/);
    if (m) {
      const tag = m[1];
      const value = m[2] || '';
      if (tag === 'ER') {
        if (current) records.push(current);
        current = null;
        lastKey = '';
        continue;
      }
      if (!current) current = {};
      lastKey = RIS_MAP[tag] || '';
      if (lastKey) {
        if (lastKey === 'authors' || lastKey === 'title') {
          current[lastKey] = [current[lastKey], value].filter(Boolean).join(lastKey === 'authors' ? '; ' : ' ');
        } else {
          current[lastKey] = [current[lastKey], value].filter(Boolean).join(' ');
        }
      }
      continue;
    }
    if (current && lastKey && /^\s+\S/.test(line)) {
      current[lastKey] = `${current[lastKey] || ''} ${line.trim()}`.trim();
    }
  }
  if (current) records.push(current);
  return finish(records, 'ris');
}

/* ---------------- BibTeX ---------------- */

function bibEntries(text) {
  const out = [];
  let i = 0;
  while ((i = text.indexOf('@', i)) !== -1) {
    const head = text.slice(i).match(/^@\s*([A-Za-z]+)\s*\{/);
    if (!head) { i += 1; continue; }
    const start = i + head[0].length - 1;
    let depth = 0;
    let inQuote = false;
    let end = start;
    for (; end < text.length; end += 1) {
      const ch = text[end];
      if (ch === '"' && text[end - 1] !== '\\') inQuote = !inQuote;
      if (inQuote) continue;
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push({ type: head[1].toLowerCase(), body: text.slice(start + 1, end) });
    i = end + 1;
  }
  return out;
}

function splitTopLevel(body, sep) {
  const parts = [];
  let buf = '';
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '"' && body[i - 1] !== '\\') inQuote = !inQuote;
    if (!inQuote) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }
    if (ch === sep && depth === 0 && !inQuote) {
      parts.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  parts.push(buf);
  return parts;
}

function decodeLatex(value) {
  return clean(
    String(value || '')
      .replace(/\\['"`^~=.]\{?([A-Za-z])\}?/g, '$1')
      .replace(/\\([&%$#_{}])/g, '$1')
      .replace(/\\[a-zA-Z]+\s*/g, ' ')
      .replace(/[{}]/g, '')
      .replace(/---?/g, '–')
      .replace(/~/g, ' ')
  );
}

function formatBibAuthor(author) {
  const s = clean(author);
  if (!s.includes(',')) return s;
  const [last, ...rest] = s.split(',').map((x) => x.trim());
  return [rest.join(' '), last].filter(Boolean).join(' ');
}

export function parseBibTeX(text) {
  const records = [];
  for (const entry of bibEntries(String(text || ''))) {
    const fields = {};
    const parts = splitTopLevel(entry.body, ',');
    parts.shift();
    for (const part of parts) {
      const eq = splitTopLevel(part, '=');
      if (eq.length < 2) continue;
      const key = eq[0].trim().toLowerCase();
      const raw = eq.slice(1).join('=').trim();
      const val = raw.replace(/^\{([\s\S]*)\}$/, '$1').replace(/^"([\s\S]*)"$/, '$1');
      if (key && !(key in fields)) fields[key] = decodeLatex(val);
    }
    const arxiv = /arxiv/i.test(fields.archiveprefix || '') ? (fields.eprint || '') : '';
    records.push({
      title: fields.title,
      authors: String(fields.author || '').split(/\s+and\s+/i).map(formatBibAuthor).join('; '),
      year: fields.year || fields.date,
      venue: fields.journal || fields.journaltitle || fields.booktitle || fields.publisher || '',
      doi: fields.doi,
      abstract: fields.abstract,
      url: fields.url || (/^https?:/i.test(fields.eprint || '') ? fields.eprint : ''),
      arxiv: arxiv || fields.eprint
    });
  }
  return finish(records, 'bibtex');
}

/* ---------------- EndNote (.enw) ---------------- */

const ENW_MAP = {
  T: 'title', TI: 'title',
  A: 'authors',
  D: 'year', '8': 'year',
  J: 'venue', B: 'venue', I: 'venue',
  R: 'doi',
  U: 'url',
  X: 'abstract',
  '7': 'year'
};

export function parseEndNote(text) {
  const records = [];
  let current = null;
  let lastKey = '';
  const flush = () => {
    if (current) records.push(current);
    current = null;
    lastKey = '';
  };
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) {
      if (current && Object.keys(current).length > 1) flush();
      continue;
    }
    const m = line.match(/^%([0-9A-Z@*$]) (.*)$/);
    if (m) {
      if (m[1] === '0') {
        flush();
        current = {};
        continue;
      }
      if (!current) current = {};
      lastKey = ENW_MAP[m[1]] || '';
      if (lastKey) {
        current[lastKey] = [current[lastKey], m[2]].filter(Boolean).join(lastKey === 'authors' ? '; ' : ' ');
      }
      continue;
    }
    if (current && lastKey && /^\s+\S/.test(line)) {
      current[lastKey] = `${current[lastKey] || ''} ${line.trim()}`.trim();
    }
  }
  flush();
  return finish(records, 'endnote');
}

/* ---------------- NoteExpress（.net 文本） ---------------- */

const NE_MAP = {
  'reference type': 'type', '文献类型': 'type',
  title: 'title', '标题': 'title', '题名': 'title',
  author: 'authors', '作者': 'authors',
  year: 'year', '年份': 'year', date: 'year', '日期': 'year',
  journal: 'venue', '期刊': 'venue', '来源': 'venue', publisher: 'venue', '出版社': 'venue',
  doi: 'doi', abstract: 'abstract', '摘要': 'abstract',
  url: 'url', '链接': 'url', keywords: 'keywords', '关键词': 'keywords',
  volume: 'volume', issue: 'issue', pages: 'pages'
};

export function parseNoteExpress(text) {
  const records = [];
  let current = null;
  let lastKey = '';
  const flush = () => {
    if (current && (current.title || current.titleAlt)) records.push({ ...current, title: current.title || current.titleAlt });
    current = null;
    lastKey = '';
  };
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) {
      if (current && current.title) flush();
      continue;
    }
    const m = line.match(/^\s*\{([^}]+)\}\s*[:：]\s*(.*)$/);
    if (m) {
      if (!current) current = {};
      const key = NE_MAP[m[1].trim().toLowerCase()] || NE_MAP[m[1].trim()] || '';
      lastKey = key;
      if (key) {
        if (key === 'title' && current.title) {
          current.title = `${current.title} ${m[2]}`.trim();
        } else {
          current[key] = [current[key], m[2]].filter(Boolean).join(key === 'authors' ? '; ' : ' ');
        }
      }
      continue;
    }
    if (current && lastKey && /^\s+\S/.test(line)) {
      current[lastKey] = `${current[lastKey] || ''} ${line.trim()}`.trim();
    }
  }
  flush();
  return finish(records, 'noteexpress');
}

/* ---------------- RefWorks（知网导出） ---------------- */

const RW_MAP = {
  T1: 'title', TI: 'title',
  A1: 'authors', AU: 'authors', A2: 'authors',
  YR: 'year', FD: 'year',
  JF: 'venue', JO: 'venue', T2: 'venue', BT: 'venue', PB: 'venue',
  DO: 'doi', AB: 'abstract', UL: 'url', L1: 'url', L2: 'url'
};

export function parseRefWorks(text) {
  const records = [];
  let current = null;
  let lastKey = '';
  const flush = () => {
    if (current) records.push(current);
    current = null;
    lastKey = '';
  };
  for (const line of String(text || '').split(/\r?\n/)) {
    if (/^ER\s*$/.test(line.trim())) {
      flush();
      continue;
    }
    const m = line.match(/^([A-Z][A-Z0-9])\s+(.*)$/);
    if (m) {
      if (!current) current = {};
      lastKey = RW_MAP[m[1]] || '';
      if (lastKey) {
        current[lastKey] = [current[lastKey], m[2]].filter(Boolean).join(lastKey === 'authors' ? '; ' : ' ');
      }
      continue;
    }
    if (current && lastKey && /^\s+\S/.test(line)) {
      current[lastKey] = `${current[lastKey] || ''} ${line.trim()}`.trim();
    }
  }
  if (current) records.push(current);
  return finish(records, 'refworks');
}

/* ---------------- 入口 ---------------- */

export function detectImportFormat(text, filename = '') {
  const name = String(filename || '').toLowerCase();
  const head = String(text || '').slice(0, 8000);
  if (/\.bib(tex)?$/.test(name) || /^\s*@\s*[A-Za-z]+\s*\{/m.test(head)) return 'bibtex';
  if (/\.ris$/.test(name) || /^TY\s{1,2}-/m.test(head)) return 'ris';
  if (/\.enw$/.test(name) || /^%0\s+/m.test(head)) return 'endnote';
  if (/\.net$/.test(name) || /^\s*\{[^}\n]+\}\s*[:：]/m.test(head)) return 'noteexpress';
  if (/^RT\s+/m.test(head) || (/^A1\s+/m.test(head) && /^T1\s+/m.test(head))) return 'refworks';
  return '';
}

const PARSERS = {
  ris: parseRis,
  bibtex: parseBibTeX,
  endnote: parseEndNote,
  noteexpress: parseNoteExpress,
  refworks: parseRefWorks
};

export function parseImport(text, filename = '') {
  const raw = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!raw.trim()) return { format: '', papers: [] };
  const detected = detectImportFormat(raw, filename);
  const order = detected ? [detected] : Object.keys(PARSERS);
  for (const format of order) {
    const papers = PARSERS[format](raw);
    if (papers.length) return { format, papers };
  }
  return { format: detected, papers: [] };
}