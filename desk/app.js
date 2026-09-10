/* E-reader desk: Library | Preview | Sync | Ingest. No styling editor, no Kindle. */
const params = new URLSearchParams(location.search);
let book = null, rendition = null;
let lastLib = null, lastPlan = null, deviceMounted = false, pollTimer = null;
let readerMode = null; // 'zip' | 'spine'
let spineState = null; // { path, bookKey, manifest, spineIndex, page, pages, unreadOnly }
let selectedInboxPath = null;
let currentBookMeta = null;

function fmtSize(n) {
  if (!n) return '—';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + 'M';
  return Math.max(1, Math.round(n / 1024)) + 'K';
}

const canTurn = () => {
  if (readerMode === 'spine') return !!(spineState && spineState.ready);
  return !!(rendition && rendition.manager);
};
function setTurning(on) {
  document.getElementById('btn-prev').disabled = !on;
  document.getElementById('btn-next').disabled = !on;
}

const DEVICES = {
  clara: {
    button: 'dev-clara',
    label: 'Kobo Clara BW · 1072×1448 · 300ppi E Ink Carta 1300 · logical 536×724 @2x',
    empty: 'Pick a book from Library<br>to see it on a Clara BW (1072×1448 · 300ppi)',
    w: '536px', h: '724px',
    einkDefault: true, colourNote: false,
  },
  libra: {
    button: 'dev-libra',
    label: 'Kobo Libra Colour · 1264×1680 · 300ppi BW / 150ppi colour · logical 632×840 @2x',
    empty: 'Pick a book from Library<br>to see it on a Libra Colour (1264×1680 · 300ppi BW)',
    w: '632px', h: '840px',
    einkDefault: false, colourNote: true,
  },
};
let device = 'clara';

const errBox = document.createElement('div');
errBox.style.cssText =
  'position:absolute;inset:0;background:#fff;color:#a00;padding:24px;' +
  'font:12px/1.5 monospace;overflow:auto;display:none;z-index:99;white-space:pre-wrap';
document.getElementById('device-frame').appendChild(errBox);
window.onerror = (msg, src, line) => {
  errBox.style.display = 'block';
  errBox.textContent += '[error] ' + msg + ' (' + (src || '').split('/').pop() + ':' + line + ')\n';
};
window.addEventListener('unhandledrejection', e => {
  const m = (e.reason && e.reason.message) || String(e.reason);
  window.onerror('promise: ' + m, '', 0);
});
function trace(msg) {
  document.getElementById('page-info').textContent = msg;
  if (params.get('debug')) console.log('[trace]', msg);
}
if (typeof ePub === 'undefined') {
  window.onerror('epub.js failed to load — vendor files missing', '', 0);
}

/* ---- Shell tabs ---- */
function showView(name) {
  document.querySelectorAll('#shell-nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === 'view-' + name);
  });
  if (name === 'sync') openSync();
  if (name === 'ingest') refreshInbox();
}
document.querySelectorAll('#shell-nav button').forEach(b => {
  b.onclick = () => showView(b.dataset.view);
});

function qaDots(qa) {
  const dots = [
    {
      ok: (qa.pipes || 0) < 5,
      tip: 'pipe-soup scan: ' + (qa.pipes || 0) + ' "|" chars (red ≥ 5)',
    },
    {
      ok: (qa.fig_missing || 0) === 0 && (qa.fig_remote || 0) === 0,
      tip: 'figures: ' + (qa.fig_missing || 0) + ' missing, ' + (qa.fig_remote || 0) + ' remote',
    },
    {
      ok: qa.slug_ok !== false,
      tip: 'slug-title: filename ' + (qa.slug_ok !== false ? 'matches' : 'does NOT match') + ' OPF title',
    },
  ];
  const wrap = document.createElement('span');
  wrap.className = 'qa-dots';
  for (const d of dots) {
    const s = document.createElement('span');
    s.className = 'qa-dot ' + (d.ok ? 'ok' : 'bad');
    s.title = d.tip;
    wrap.appendChild(s);
  }
  return wrap;
}

async function loadLibrary() {
  let lib;
  try {
    const res = await fetch('/api/library');
    lib = await res.json();
  } catch (e) {
    document.getElementById('lib-grid').innerHTML =
      '<p style="font-size:12px;color:#f85149">Library unreachable — is server.py running?</p>';
    window.onerror('library fetch failed: ' + e.message, '', 0);
    return;
  }
  const list = document.getElementById('lib-grid');
  list.innerHTML = '';
  lastLib = lib;
  const wantOpen = params.get('open');
  let total = 0, opened = false;
  for (const shelf of lib.shelves) {
    total += shelf.books.length;
    const label = document.createElement('div');
    label.className = 'shelf-label';
    label.textContent = shelf.name + ' · ' + shelf.books.length;
    list.appendChild(label);
    if (!shelf.books.length) {
      const empty = document.createElement('p');
      empty.style.cssText = 'padding:4px 0 10px;font-size:11.5px;color:#79818c';
      empty.textContent = 'No books — open the Drive folder in Finder so files download.';
      list.appendChild(empty);
      continue;
    }
    for (const b of shelf.books) {
      const item = document.createElement('div');
      item.className = 'book-item';
      const img = document.createElement('img');
      img.src = '/api/cover?path=' + encodeURIComponent(b.path);
      img.alt = '';
      img.onerror = () => { img.style.visibility = 'hidden'; };
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = '<div class="title"></div><div class="sub"></div>';
      meta.querySelector('.title').textContent = b.title;
      meta.querySelector('.title').title = b.title;
      meta.querySelector('.sub').textContent =
        (b.author || '—') + ' · ' + fmtSize(b.size);
      const mode = document.createElement('span');
      mode.className = 'mode-pill' + (b.mode === 'spine' ? ' spine' : '');
      mode.textContent = b.mode === 'spine' ? 'spine' : 'zip';
      mode.title = b.mode === 'spine'
        ? 'Chapter fetch — browser never downloads the full EPUB'
        : 'Full EPUB via epub.js (small title)';
      item.append(img, meta, mode);
      if (b.qa) item.appendChild(qaDots(b.qa));
      item.onclick = () => {
        document.querySelectorAll('.book-item.active').forEach(e => e.classList.remove('active'));
        item.classList.add('active');
        openBook(b);
      };
      list.appendChild(item);
      if (wantOpen && b.path.includes(wantOpen) && !opened) {
        opened = true;
        item.classList.add('active');
        openBook(b);
      }
    }
  }
  if (total === 0) {
    const note = document.createElement('p');
    note.style.cssText = 'padding:12px 0;font-size:12px;color:#79818c';
    note.textContent = 'Library is empty (Drive may be offline). Drop an .epub onto Preview.';
    list.appendChild(note);
  }
}

function destroyReaders() {
  setTurning(false);
  if (rendition) { try { rendition.destroy(); } catch (_) {} rendition = null; }
  if (book) { try { book.destroy(); } catch (_) {} book = null; }
  const host = document.getElementById('spine-host');
  host.style.display = 'none';
  host.removeAttribute('srcdoc');
  host.src = 'about:blank';
  document.getElementById('viewer').style.display = 'block';
  document.getElementById('toc-panel').innerHTML = '';
  document.getElementById('toc-panel').classList.remove('open');
  spineState = null;
  readerMode = null;
}

function openBook(meta) {
  currentBookMeta = meta;
  showView('preview');
  document.getElementById('empty-msg').style.display = 'none';
  errBox.style.display = 'none';
  errBox.textContent = '';
  destroyReaders();
  if (meta.mode === 'spine') {
    openSpineBook(meta);
  } else {
    openZipBook(meta.path);
  }
}

function openZipBook(path) {
  readerMode = 'zip';
  document.getElementById('viewer').style.display = 'block';
  document.getElementById('spine-host').style.display = 'none';
  trace('loading zip…');
  try {
    book = ePub('/api/book?path=' + encodeURIComponent(path));
    book.ready.then(() => trace('book parsed, rendering…'));
    rendition = book.renderTo('viewer', {
      width: '100%', height: '100%',
      flow: 'paginated', spread: 'none', minSpreadWidth: 40000,
    });
    rendition.display().then(() => {
      registerThemes();
      loadZipToc();
      setTurning(true);
      trace('ready');
    }).catch(e => window.onerror('render failed: ' + e.message, '', 0));
    rendition.on('relocated', loc => {
      document.getElementById('page-info').textContent =
        'loc ' + (loc.start.displayed.page + '/' + loc.start.displayed.total);
    });
  } catch (e) {
    window.onerror('open failed: ' + e.message, '', 0);
  }
}

/* ---- Spine reader (large / generated) ---- */
async function openSpineBook(meta) {
  readerMode = 'spine';
  document.getElementById('viewer').style.display = 'none';
  const host = document.getElementById('spine-host');
  host.style.display = 'block';
  trace('loading spine…');
  try {
    const res = await fetch('/api/book/spine?path=' + encodeURIComponent(meta.path));
    if (!res.ok) throw new Error('spine ' + res.status);
    const man = await res.json();
    spineState = {
      path: meta.path,
      bookKey: man.bookKey || meta.bookKey,
      manifest: man,
      spineIndex: 0,
      page: 0,
      pages: 1,
      ready: false,
      unreadOnly: false,
      fragment: '',
    };
    // Continue where left off
    const cont = (man.read && man.read.continue) || null;
    if (cont && cont.href) {
      jumpSpineHref(cont.href);
    } else {
      const first = (man.spine || []).find(s =>
        (s.href || '').includes('text/ch') || (s.media || '').includes('html'));
      spineState.spineIndex = Math.max(0, (man.spine || []).indexOf(first));
      await loadSpineChapter();
    }
    renderSpineToc();
  } catch (e) {
    window.onerror('spine open failed: ' + e.message, '', 0);
  }
}

function spineHrefFile(href) {
  return (href || '').split('#')[0];
}
function spineHrefFrag(href) {
  const i = (href || '').indexOf('#');
  return i >= 0 ? href.slice(i + 1) : '';
}

function findSpineIndex(file) {
  const spine = spineState.manifest.spine || [];
  let idx = spine.findIndex(s => s.href === file || s.href.endsWith('/' + file) || file.endsWith(s.href));
  if (idx < 0) {
    const base = file.replace(/^EPUB\//, '');
    idx = spine.findIndex(s => s.href === base || s.href.endsWith(base));
  }
  return idx;
}

async function jumpSpineHref(href) {
  const file = spineHrefFile(href);
  const frag = spineHrefFrag(href);
  const idx = findSpineIndex(file);
  if (idx < 0) {
    window.onerror('spine href not in spine: ' + href, '', 0);
    return;
  }
  spineState.spineIndex = idx;
  spineState.fragment = frag;
  await loadSpineChapter();
}

async function loadSpineChapter() {
  if (!spineState) return;
  setTurning(false);
  spineState.ready = false;
  const entry = (spineState.manifest.spine || [])[spineState.spineIndex];
  if (!entry) {
    window.onerror('empty spine', '', 0);
    return;
  }
  const href = entry.href;
  trace('chapter ' + href + '…');
  const url = '/api/book/chapter?path=' + encodeURIComponent(spineState.path)
    + '&href=' + encodeURIComponent(href);
  let html;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('chapter ' + res.status);
    html = await res.text();
  } catch (e) {
    window.onerror('chapter fetch failed: ' + e.message, '', 0);
    return;
  }
  const fs = document.getElementById('font-size').value;
  const dark = document.getElementById('chk-dark').checked;
  const theme = dark
    ? 'html,body{background:#151515!important;color:#cfcfcf!important;}'
      + 'p,h1,h2,h3,li,figcaption,blockquote{color:#cfcfcf!important;}'
    : '';
  const wrapped =
    '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>'
    + 'html,body{margin:0;padding:0;height:100%;}'
    + 'body{font-size:' + fs + '%;line-height:1.6;padding:18px 20px;'
    + 'column-width:var(--col-w, 500px);column-gap:0;height:100%;'
    + 'overflow:hidden;box-sizing:border-box;}'
    + 'img,svg{max-width:100%!important;height:auto!important;}'
    + theme
    + '</style></head><body>'
    + extractBody(html)
    + '</body></html>';
  const host = document.getElementById('spine-host');
  host.onload = () => {
    try {
      layoutSpinePages();
      if (spineState._jumpLast) {
        spineState._jumpLast = false;
        spineState.page = Math.max(0, spineState.pages - 1);
        applySpinePage();
      } else if (spineState.fragment) {
        const doc = host.contentDocument;
        const el = doc.getElementById(spineState.fragment)
          || doc.querySelector('[id="' + CSS.escape(spineState.fragment) + '"]');
        if (el) {
          const colW = host.clientWidth || 500;
          const left = el.offsetLeft || 0;
          spineState.page = Math.max(0, Math.floor(left / colW));
          applySpinePage();
        }
      }
      spineState.ready = true;
      setTurning(true);
      updateSpinePageInfo();
      trace('ready');
    } catch (e) {
      window.onerror('spine layout: ' + e.message, '', 0);
    }
  };
  host.srcdoc = wrapped;
}

function extractBody(xhtml) {
  const m = xhtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return m ? m[1] : xhtml;
}

function layoutSpinePages() {
  const host = document.getElementById('spine-host');
  const doc = host.contentDocument;
  if (!doc || !doc.body) return;
  const w = host.clientWidth;
  const h = host.clientHeight;
  doc.documentElement.style.setProperty('--col-w', w + 'px');
  doc.body.style.columnWidth = w + 'px';
  doc.body.style.height = h + 'px';
  doc.body.style.width = w + 'px';
  // Force layout then measure scrollWidth
  const sw = doc.body.scrollWidth;
  spineState.pages = Math.max(1, Math.ceil(sw / w));
  spineState.page = Math.min(spineState.page, spineState.pages - 1);
  applySpinePage();
}

function applySpinePage() {
  const host = document.getElementById('spine-host');
  const doc = host.contentDocument;
  if (!doc || !doc.body) return;
  const w = host.clientWidth;
  doc.body.style.transform = 'translateX(' + (-spineState.page * w) + 'px)';
  updateSpinePageInfo();
}

function updateSpinePageInfo() {
  if (!spineState) return;
  const entry = (spineState.manifest.spine || [])[spineState.spineIndex] || {};
  document.getElementById('page-info').textContent =
    'ch ' + (spineState.spineIndex + 1) + '/' + (spineState.manifest.spine || []).length
    + ' · p ' + (spineState.page + 1) + '/' + spineState.pages
    + (entry.href ? ' · ' + entry.href.split('/').pop() : '');
}

async function spineNext() {
  if (!spineState || !spineState.ready) return;
  if (spineState.page < spineState.pages - 1) {
    spineState.page += 1;
    applySpinePage();
    return;
  }
  if (spineState.spineIndex < (spineState.manifest.spine || []).length - 1) {
    spineState.spineIndex += 1;
    spineState.page = 0;
    spineState.fragment = '';
    await loadSpineChapter();
  }
}

async function spinePrev() {
  if (!spineState || !spineState.ready) return;
  if (spineState.page > 0) {
    spineState.page -= 1;
    applySpinePage();
    return;
  }
  if (spineState.spineIndex > 0) {
    spineState.spineIndex -= 1;
    spineState.page = 0;
    spineState.fragment = '';
    spineState._jumpLast = true;
    await loadSpineChapter();
  }
}

function readSet() {
  const articles = ((spineState.manifest.read || {}).articles) || {};
  const set = new Set();
  for (const [id, v] of Object.entries(articles)) {
    if (v && v.read) set.add(id);
  }
  return set;
}

function renderSpineToc() {
  const panel = document.getElementById('toc-panel');
  panel.innerHTML = '';
  if (!spineState) return;
  const man = spineState.manifest;
  const toolbar = document.createElement('div');
  toolbar.className = 'toc-toolbar';
  const filt = document.createElement('button');
  filt.type = 'button';
  filt.textContent = spineState.unreadOnly ? 'Show all' : 'Unread only';
  filt.onclick = () => {
    spineState.unreadOnly = !spineState.unreadOnly;
    renderSpineToc();
  };
  const cont = document.createElement('button');
  cont.type = 'button';
  cont.textContent = 'Continue';
  cont.onclick = () => {
    const c = (man.read && man.read.continue) || null;
    if (c && c.href) jumpSpineHref(c.href);
  };
  toolbar.append(filt, cont);
  panel.appendChild(toolbar);

  const prog = document.createElement('div');
  prog.className = 'progress';
  const parts = man.progress || [];
  prog.textContent = parts.length
    ? parts.map(p => p.label + ' ' + p.read + '/' + p.total).join(' · ')
    : 'No article progress yet';
  panel.appendChild(prog);

  const reads = readSet();
  const walk = (nodes, lvl) => {
    for (const n of nodes || []) {
      const isArticle = n.kind === 'article'
        || (n.articleId || '').startsWith('chap-')
        || (n.articleId || '').startsWith('bits-bytes');
      if (spineState.unreadOnly && isArticle && reads.has(n.articleId)) {
        if (n.children && n.children.length) walk(n.children, lvl + 1);
        continue;
      }
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'toc-row lvl' + Math.min(lvl, 2) + (reads.has(n.articleId) ? ' read' : '');
      if (isArticle) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'read-toggle';
        cb.checked = reads.has(n.articleId);
        cb.title = 'Mark read';
        cb.onclick = ev => {
          ev.stopPropagation();
          toggleRead(n.articleId, cb.checked, n.href);
        };
        a.appendChild(cb);
      }
      const lab = document.createElement('span');
      lab.className = 'lab';
      lab.textContent = n.label;
      a.appendChild(lab);
      a.onclick = ev => {
        ev.preventDefault();
        jumpSpineHref(n.href);
        rememberContinue(n.articleId, n.href);
      };
      panel.appendChild(a);
      if (n.children && n.children.length) walk(n.children, lvl + 1);
    }
  };
  walk(man.toc || [], 1);
}

async function toggleRead(articleId, read, href) {
  if (!spineState || !articleId) return;
  try {
    const res = await fetch('/api/read-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookKey: spineState.bookKey,
        articleId,
        read,
        continue: true,
        href: href || '',
      }),
    });
    const data = await res.json();
    if (!spineState.manifest.read) spineState.manifest.read = {};
    spineState.manifest.read = Object.assign({}, spineState.manifest.read, data.book || {});
    // Refresh progress from server spine endpoint lightly
    const reads = readSet();
    if (read) reads.add(articleId); else reads.delete(articleId);
    // recompute progress client-side
    const parts = [];
    for (const n of spineState.manifest.toc || []) {
      const arts = (n.children || []).filter(c =>
        c.kind === 'article' || (c.articleId || '').startsWith('chap-')
        || (c.articleId || '').startsWith('bits-bytes'));
      if (!arts.length) continue;
      parts.push({
        label: n.label,
        read: arts.filter(a => reads.has(a.articleId)).length,
        total: arts.length,
      });
    }
    spineState.manifest.progress = parts;
    renderSpineToc();
  } catch (e) {
    window.onerror('read-state failed: ' + e.message, '', 0);
  }
}

async function rememberContinue(articleId, href) {
  if (!spineState || !articleId) return;
  try {
    await fetch('/api/read-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookKey: spineState.bookKey,
        articleId,
        read: readSet().has(articleId),
        continue: true,
        href,
      }),
    });
  } catch (_) { /* ignore */ }
}

function registerThemes() {
  if (readerMode === 'spine') {
    if (spineState && spineState.ready) loadSpineChapter();
    return;
  }
  if (!rendition) return;
  const fs = document.getElementById('font-size').value;
  const light = {
    body: { 'line-height': '1.6 !important', 'text-align': 'left' },
    p: { 'line-height': '1.6 !important' },
    'img, svg': { 'max-width': '100% !important', 'height': 'auto !important' },
    figure: { 'break-inside': 'avoid', 'page-break-inside': 'avoid' },
    a: { 'color': 'inherit', 'text-decoration': 'none' },
  };
  const dark = JSON.parse(JSON.stringify(light));
  dark.body['color'] = '#cfcfcf !important';
  dark.body['background'] = '#151515 !important';
  ['p', 'h1', 'h2', 'h3', 'li', 'figcaption', 'blockquote'].forEach(
    t => { dark[t] = Object.assign({}, dark[t], { 'color': '#cfcfcf !important' }); });
  rendition.themes.register('light', light);
  rendition.themes.register('dark', dark);
  rendition.themes.fontSize(fs + '%');
  rendition.themes.select(document.getElementById('chk-dark').checked ? 'dark' : 'light');
}

function setDevice(name) {
  device = name;
  const d = DEVICES[name];
  const root = document.documentElement.style;
  root.setProperty('--frame-w', d.w);
  root.setProperty('--frame-h', d.h);
  document.getElementById('device-label').textContent = d.label;
  document.getElementById('colour-note').style.display = d.colourNote ? 'block' : 'none';
  for (const key of Object.keys(DEVICES)) {
    document.getElementById(DEVICES[key].button).classList.toggle('active', key === name);
  }
  const chk = document.getElementById('chk-eink');
  chk.checked = d.einkDefault;
  document.getElementById('device-frame').classList.toggle('eink', chk.checked);
  const empty = document.getElementById('empty-msg');
  if (empty.style.display !== 'none') empty.innerHTML = d.empty;
  if (readerMode === 'spine' && spineState && spineState.ready) {
    layoutSpinePages();
  }
}

document.getElementById('dev-clara').onclick = () => setDevice('clara');
document.getElementById('dev-libra').onclick = () => setDevice('libra');
document.getElementById('btn-prev').onclick = () => {
  if (!canTurn()) return;
  if (readerMode === 'spine') spinePrev();
  else rendition.prev();
};
document.getElementById('btn-next').onclick = () => {
  if (!canTurn()) return;
  if (readerMode === 'spine') spineNext();
  else rendition.next();
};
document.getElementById('font-size').onchange = registerThemes;
document.getElementById('chk-dark').onchange = registerThemes;
document.getElementById('chk-eink').onchange = e => {
  document.getElementById('device-frame').classList.toggle('eink', e.target.checked);
};
document.getElementById('btn-toc').onclick = () =>
  document.getElementById('toc-panel').classList.toggle('open');

/* ---- Sync ---- */
async function openSync() {
  renderChecklist();
  const dev = document.getElementById('sync-device');
  dev.textContent = 'Checking device…';
  dev.classList.remove('ok');
  try {
    const res = await fetch('/api/device');
    const d = await res.json();
    deviceMounted = !!d.mounted;
    if (d.mounted) {
      dev.textContent = 'Kobo mounted at ' + d.mount + ' · free ' + fmtSize(d.free_bytes);
      dev.classList.add('ok');
    } else {
      dev.textContent = 'No Kobo — ' + (d.error || 'not mounted') + '. Dry-run still shows the plan.';
    }
  } catch (e) {
    deviceMounted = false;
    dev.textContent = 'Device check failed: ' + e.message;
  }
  updateConfirm();
}

function renderChecklist() {
  const box = document.getElementById('sync-list');
  box.innerHTML = '';
  if (!lastLib) {
    box.textContent = 'Library not loaded yet.';
    return;
  }
  for (const shelf of lastLib.shelves) {
    const head = document.createElement('div');
    head.style.cssText = 'font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:#79818c;margin:4px 0';
    head.textContent = shelf.name + ' · ' + shelf.books.length;
    box.appendChild(head);
    for (const b of shelf.books) {
      const lab = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.value = b.path;
      const t = document.createElement('span');
      t.textContent = b.title;
      const sz = document.createElement('span');
      sz.className = 'sz';
      sz.textContent = fmtSize(b.size);
      lab.append(cb, t, sz);
      box.appendChild(lab);
    }
  }
}

function checkedPaths() {
  return Array.from(document.querySelectorAll('#sync-list input:checked')).map(cb => cb.value);
}

function updateConfirm() {
  const btn = document.getElementById('btn-sync');
  const items = lastPlan || [];
  const ok = deviceMounted &&
    items.some(i => i.status === 'new') &&
    !items.some(i => i.status === 'rejected');
  btn.disabled = !ok;
}

async function dryRun() {
  const planBox = document.getElementById('sync-plan');
  planBox.textContent = 'Planning…';
  document.getElementById('btn-sync').disabled = true;
  try {
    const res = await fetch('/api/sync/dry-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: checkedPaths() }),
    });
    const data = await res.json();
    deviceMounted = !!(data.device && data.device.mounted);
    lastPlan = data.plan || [];
    renderPlan();
  } catch (e) {
    planBox.textContent = 'Dry-run failed: ' + e.message;
  }
  updateConfirm();
}

function renderPlan() {
  const planBox = document.getElementById('sync-plan');
  planBox.innerHTML = '';
  if (!lastPlan.length) {
    planBox.textContent = 'Nothing selected.';
    return;
  }
  for (const i of lastPlan) {
    const row = document.createElement('div');
    row.className = 'prow';
    const pill = document.createElement('span');
    pill.className = 'pill ' + i.status;
    pill.textContent = i.status;
    const dest = document.createElement('span');
    dest.className = 'dest';
    dest.textContent = (i.dest_name || i.source) + ' · ' + fmtSize(i.size);
    dest.title = (i.source || '') + '\n→ ' + (i.dest || '') + '\n' + (i.note || '');
    row.append(pill, dest);
    planBox.appendChild(row);
  }
  const note = document.createElement('div');
  note.style.cssText = 'font-size:11px;color:#79818c;margin-top:4px';
  note.textContent = 'present = on device; differs → whole sync aborts. Copy-only: nothing deleted.';
  planBox.appendChild(note);
}

async function confirmSync() {
  const logBox = document.getElementById('sync-log');
  const resBox = document.getElementById('sync-results');
  logBox.style.display = 'block';
  logBox.textContent = '';
  resBox.innerHTML = '';
  document.getElementById('sync-eject').style.display = 'none';
  document.getElementById('btn-sync').disabled = true;
  document.getElementById('btn-dryrun').disabled = true;
  let job;
  try {
    const res = await fetch('/api/sync/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: checkedPaths(), confirm: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      logBox.textContent = 'Sync refused: ' + (data.error || res.status);
      document.getElementById('btn-dryrun').disabled = false;
      updateConfirm();
      return;
    }
    job = data.job;
  } catch (e) {
    logBox.textContent = 'Sync start failed: ' + e.message;
    document.getElementById('btn-dryrun').disabled = false;
    updateConfirm();
    return;
  }
  if (pollTimer) clearInterval(pollTimer);
  let seen = 0;
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/jobs/' + encodeURIComponent(job));
      const j = await res.json();
      const lines = j.log || [];
      for (; seen < lines.length; seen++) logBox.textContent += lines[seen] + '\n';
      logBox.scrollTop = logBox.scrollHeight;
      if (j.status === 'done' || j.status === 'error') {
        clearInterval(pollTimer);
        pollTimer = null;
        document.getElementById('btn-dryrun').disabled = false;
        renderResults(j.result || {});
        if (j.status === 'done') document.getElementById('sync-eject').style.display = 'block';
        openSync();
      }
    } catch (e) {
      logBox.textContent += '[poll failed: ' + e.message + ']\n';
    }
  }, 1000);
}

function renderResults(result) {
  const resBox = document.getElementById('sync-results');
  resBox.innerHTML = '';
  if (result.error) {
    const p = document.createElement('p');
    p.style.color = '#f85149';
    p.textContent = 'Failed: ' + result.error;
    resBox.appendChild(p);
  }
  for (const b of result.per_book || []) {
    const row = document.createElement('div');
    row.className = 'prow';
    row.style.cssText = 'display:flex;gap:6px;padding:2px 0;align-items:baseline';
    const pill = document.createElement('span');
    pill.className = 'pill ' + b.status;
    pill.textContent = b.status;
    const t = document.createElement('span');
    t.textContent = (b.title || b.dest_name || '') + (b.note ? ' — ' + b.note : '');
    row.append(pill, t);
    resBox.appendChild(row);
  }
}

document.getElementById('btn-dryrun').onclick = dryRun;
document.getElementById('btn-sync').onclick = confirmSync;

async function loadZipToc() {
  try {
    const nav = await book.loaded.navigation;
    const panel = document.getElementById('toc-panel');
    panel.innerHTML = '';
    nav.toc.forEach(ch => {
      const a = document.createElement('a');
      a.textContent = ch.label.trim();
      a.className = 'toc-row lvl1';
      a.href = '#';
      a.onclick = ev => { ev.preventDefault(); rendition.display(ch.href); };
      panel.appendChild(a);
      (ch.subitems || []).forEach(sub => {
        const sa = document.createElement('a');
        sa.textContent = sub.label.trim();
        sa.className = 'toc-row lvl2';
        sa.href = '#';
        sa.onclick = ev => { ev.preventDefault(); rendition.display(sub.href); };
        panel.appendChild(sa);
      });
    });
  } catch (e) {
    window.onerror('toc failed: ' + e.message, '', 0);
  }
}

/* ---- Ingest ---- */
function ingestStatus(msg) {
  document.getElementById('ingest-status').textContent = msg;
}

function formatIngestResult(data) {
  if (!data || typeof data !== 'object') return String(data);
  if (data.partial === 'vault-kept') {
    const title = data.title ? data.title + ' — ' : '';
    const domain = data.domain || 'library';
    return title + 'in the ' + domain + ' vault, but Hung Library rebuild failed.';
  }
  if (data.ok === false) {
    if (Array.isArray(data.errors) && data.errors.length) {
      const first = data.errors[0].error || 'Cook failed.';
      const extra = data.errors.length > 1 ? ' (+' + (data.errors.length - 1) + ' more)' : '';
      return first + extra;
    }
    return data.error || 'Ingest failed.';
  }
  if (Array.isArray(data.drafts) && data.drafts.length) {
    const n = data.drafts.length;
    const title = data.drafts[0].title || (data.drafts[0].path || '').split('/').pop();
    return n === 1 ? ('Draft ready: ' + title) : (n + ' drafts ready (first: ' + title + ')');
  }
  if (data.ok && data.path) {
    const name = String(data.path).split('/').pop();
    return (data.title ? data.title + ' — ' : '') + 'saved ' + name;
  }
  if (data.error) return data.error;
  return 'Done.';
}

async function refreshInbox() {
  const box = document.getElementById('inbox-list');
  try {
    const res = await fetch('/api/inbox');
    const data = await res.json();
    const items = data.items || [];
    box.innerHTML = '';
    if (!items.length) {
      box.innerHTML = '<p style="font-size:12px;color:#79818c">No drafts yet.</p>';
      document.getElementById('btn-promote').disabled = true;
      selectedInboxPath = null;
      return;
    }
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'row';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = it.title || it.name;
      name.title = it.path;
      const sz = document.createElement('span');
      sz.className = 'sz';
      sz.textContent = fmtSize(it.size);
      row.append(name, sz);
      row.onclick = () => {
        selectedInboxPath = it.path;
        document.getElementById('btn-promote').disabled = false;
        box.querySelectorAll('.row').forEach(r => { r.style.background = ''; });
        row.style.background = '#37404c';
      };
      box.appendChild(row);
    }
  } catch (e) {
    box.textContent = 'Inbox unreachable: ' + e.message;
  }
}

document.getElementById('btn-ingest-url').onclick = async () => {
  const url = document.getElementById('ingest-url').value.trim();
  if (!url) return;
  ingestStatus('Fetching ' + url + '…');
  document.getElementById('btn-ingest-url').disabled = true;
  try {
    const res = await fetch('/api/ingest/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    ingestStatus(formatIngestResult(data));
    await refreshInbox();
  } catch (e) {
    ingestStatus('Failed: ' + e.message);
  }
  document.getElementById('btn-ingest-url').disabled = false;
};

document.getElementById('btn-ingest-yt').onclick = async () => {
  const url = document.getElementById('ingest-yt').value.trim();
  if (!url) return;
  ingestStatus('TalkToBook fetching YouTube…');
  try {
    const res = await fetch('/api/ingest/youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    ingestStatus(formatIngestResult(data));
    await refreshInbox();
  } catch (e) {
    ingestStatus('Failed: ' + e.message);
  }
};

document.getElementById('btn-ingest-tr').onclick = async () => {
  const text = document.getElementById('ingest-tr').value;
  if (text.trim().length < 20) return;
  ingestStatus('TalkToBook processing transcript…');
  try {
    const res = await fetch('/api/ingest/transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, filename: 'pasted-transcript.md' }),
    });
    const data = await res.json();
    ingestStatus(formatIngestResult(data));
    await refreshInbox();
  } catch (e) {
    ingestStatus('Failed: ' + e.message);
  }
};

document.getElementById('btn-promote').onclick = async () => {
  if (!selectedInboxPath) return;
  const domain = document.getElementById('promote-domain').value;
  if (!confirm('Cook draft into _hq/vault/library/' + domain + '/ ?')) return;
  ingestStatus('Cooking…');
  try {
    const res = await fetch('/api/ingest/cook-to-book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: selectedInboxPath, domain, confirm: true }),
    });
    const data = await res.json();
    ingestStatus(formatIngestResult(data));
  } catch (e) {
    ingestStatus('Failed: ' + e.message);
  }
};

document.getElementById('btn-cook').onclick = async () => {
  const mode = prompt('Cook: url | path | dump', 'dump');
  if (!mode) return;
  let body = {};
  if (mode === 'dump') body = { dump: true };
  else if (mode === 'url') {
    const url = prompt('URL (Defuddle):', '');
    if (!url) return;
    body = { url };
  } else if (mode === 'path') {
    const path = prompt('File path (AnyDoc):', '');
    if (!path) return;
    body = { path };
  } else {
    ingestStatus('Use url, path, or dump.');
    return;
  }
  ingestStatus('Cooking…');
  try {
    const res = await fetch('/api/ingest/cook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    ingestStatus(formatIngestResult(data));
    await refreshInbox();
  } catch (e) {
    ingestStatus('Failed: ' + e.message);
  }
};

document.getElementById('btn-build-epub').onclick = async () => {
  if (!confirm('Rebuild Hung Library EPUB to Drive library/generated/?')) return;
  ingestStatus('Building operator EPUB (may take a while)…');
  document.getElementById('btn-build-epub').disabled = true;
  try {
    const res = await fetch('/api/build-epub', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    const data = await res.json();
    ingestStatus(formatIngestResult(data));
    await loadLibrary();
  } catch (e) {
    ingestStatus('Failed: ' + e.message);
  }
  document.getElementById('btn-build-epub').disabled = false;
};

document.addEventListener('keydown', e => {
  if (!canTurn()) return;
  if (e.key === 'ArrowLeft') {
    if (readerMode === 'spine') spinePrev();
    else rendition.prev();
  }
  if (e.key === 'ArrowRight') {
    if (readerMode === 'spine') spineNext();
    else rendition.next();
  }
});

document.body.addEventListener('dragover', e => e.preventDefault());
document.body.addEventListener('drop', e => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (!f || !f.name.endsWith('.epub')) return;
  showView('preview');
  document.getElementById('empty-msg').style.display = 'none';
  errBox.style.display = 'none';
  errBox.textContent = '';
  destroyReaders();
  readerMode = 'zip';
  document.getElementById('viewer').style.display = 'block';
  document.getElementById('spine-host').style.display = 'none';
  setTurning(false);
  book = ePub(f);
  rendition = book.renderTo('viewer', {
    width: '100%', height: '100%',
    flow: 'paginated', spread: 'none', minSpreadWidth: 40000,
  });
  rendition.display().then(() => {
    registerThemes();
    loadZipToc();
    setTurning(true);
  }).catch(err => window.onerror('render failed: ' + err.message, '', 0));
});

setDevice('clara');
loadLibrary();
if (params.get('open')) showView('preview');
