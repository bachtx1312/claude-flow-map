// Draws a design map from window.DESIGN with DesignCore: screen tabs, option cards, the mockup with question callouts and arrows, the parts table, every question and the change log.
// drawDesign(lang) fills the page in one language; I18n.boot at the end calls it again on a clean page when the viewer switches language.
function drawDesign(lang) {
  const design = window.DESIGN && I18n.localize(window.DESIGN, lang);
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  if (!design) { $('screenHead').append(el('p', 'warn', 'design.data.js did not load, or it does not set window.DESIGN.')); return; }

  const S = DesignCore.strings(design, window.DESIGN_STRINGS?.[lang]);
  const tr = (k, v) => DesignCore.fmt(S[k] ?? k, v);
  const M = DesignCore.model(design, S);
  const { screens, questions } = M;
  const svgNS = 'http://www.w3.org/2000/svg';
  const motion = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

  // Text fields accept **bold**, `code` and [label](https://…); everything else is escaped.
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const rich = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const richEl = (tag, cls, s) => { const e = el(tag, cls); e.innerHTML = rich(s); return e; };
  const list = (items) => { const ul = el('ul'); (items ?? []).forEach((t) => ul.append(el('li', null, t))); return ul; };
  const openQ = (id) => questions[id] && !questions[id].decided;

  document.documentElement.lang = lang;
  document.title = design.title;
  document.querySelectorAll('[data-s]').forEach((e) => { e.textContent = S[e.dataset.s] ?? ''; });
  document.querySelectorAll('[data-s-aria]').forEach((e) => e.setAttribute('aria-label', S[e.dataset.sAria] ?? ''));

  // Fonts the mockups use load into the page: @font-face does not work inside a shadow root, but fonts of the page do.
  (design.fonts ?? []).filter((u) => /^https:\/\/fonts\.googleapis\.com\//.test(u) && !document.querySelector(`link[href="${CSS.escape(u)}"]`)).forEach((u) => { const l = el('link'); l.rel = 'stylesheet'; l.href = u; document.head.append(l); });

  function header() {
    const set = (id, text, html) => { const e = $(id); if (!text) { e.hidden = true; return; } if (html) e.innerHTML = rich(text); else e.textContent = text; };
    set('eyebrow', design.eyebrow);
    set('title', design.title);
    set('lead', design.lead, true);
    const links = $('links');
    if (design.flowMap?.url) links.append(richEl('span', null, `${S.flow_link}: [${design.flowMap.url}](${design.flowMap.url})`));
    (design.links ?? []).forEach((l) => links.append(richEl('span', null, l)));
    links.hidden = !links.childElementCount;
    const box = $('facts');
    const add = (s) => box.append(richEl('span', 'fact', s));
    add(tr('fact_screens', { n: screens.length, chosen: M.nChosen }));
    add(tr('fact_q', { d: M.decided, n: Object.keys(questions).length }));
    add(tr('fact_parts', { built: M.count.built, n: M.live.length }));
    if (design.asOf) add(tr('fact_asof', { date: design.asOf }));
  }

  // ---- The mockup: drawn in a shadow root so its CSS and the page's never mix, inert because it is a picture,
  // and stripped of anything that runs, whatever the data holds.
  const host = el('div');
  const shadow = host.attachShadow({ mode: 'open' });
  host.inert = true;
  $('mockFrame').append(host);
  const BASE = ':host { all: initial; display: block; } *, *::before, *::after { box-sizing: border-box; }\n';
  // Literal colours: the mockup may define its own --ok or --miss.
  const OUTLINE = { built: '2px solid #1f7a4d', partial: '2px dashed #a05a00', planned: '2px dashed #b4232c', mock: '2px dotted #2f6db5' };
  const hlStyle = el('style'), stStyle = el('style');
  const sel = (id) => `[data-ui="${CSS.escape(id)}"]`;
  const lit = (id) => (id ? `${sel(id)} { outline: 3px solid #e0582a !important; outline-offset: 3px; }` : '');

  function clean(html) {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    doc.querySelectorAll('script, iframe, frame, object, embed, link, meta, base').forEach((n) => n.remove());
    doc.querySelectorAll('*').forEach((n) => [...n.attributes].forEach((a) => { if (/^on/i.test(a.name) || a.name === 'srcdoc' || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name); }));
    return [...doc.body.childNodes];
  }

  let cur = null, showStatus = false;

  function drawMock(s, o) {
    shadow.replaceChildren(el('style', null, BASE + DesignCore.text(design.css) + '\n' + DesignCore.text(o.css)), stStyle, hlStyle, ...clean(DesignCore.text(o.html)));
    host.style.width = `${s.width ?? 1280}px`;
    $('mockFrame').setAttribute('aria-label', tr('mock_label', { code: s.code, opt: o.id }));
    statusStyle();
  }

  function statusStyle() {
    stStyle.textContent = showStatus ? (cur.s.parts ?? []).map((p) => `${sel(p.id)} { outline: ${OUTLINE[DesignCore.statusOf(p)]}; outline-offset: 2px; }`).join('\n') : '';
    document.querySelectorAll('.st-key').forEach((e) => { e.hidden = !showStatus; });
  }

  // Wider mockups shrink to the column; CSS zoom keeps layout and getBoundingClientRect in the zoomed pixels the arrows need.
  function fit() {
    if (!host.isConnected) return;
    const col = $('mockFrame').parentElement, cs = getComputedStyle(col);
    const room = col.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    host.style.zoom = String(Math.min(1, room / (cur.s.width ?? 1280)));
  }

  function questionCard(id, at) {
    const q = questions[id];
    const c = el('div', 'q');
    c.dataset.qid = id;
    c.append(el('span', 'id', id));
    if (at) c.append(el('span', 'at', at));
    c.append(el('span', 'text', q.q));
    if (q.opts) c.append(el('span', 'opts', q.opts));
    if (q.rec) c.append(el('span', 'rec', S.q_rec + q.rec));
    if (q.decided) { c.classList.add('decided'); c.append(el('span', 'dec', S.q_dec + q.decided)); }
    return c;
  }

  // ---- Screen, options and callouts
  function head(s) {
    const h = $('screenHead');
    h.replaceChildren();
    const title = el('h2');
    title.id = 'screenTitle';
    title.append(el('span', 'nm', s.code), document.createTextNode(' ' + s.title));
    h.append(title);
    if (s.brief) h.append(richEl('p', 'sub', s.brief));
    const chips = el('div', 'chips');
    if (s.step) {
      const c = el(design.flowMap?.url ? 'a' : 'span', 'chip', tr('screen_step', { code: s.step }));
      if (design.flowMap?.url) { c.href = design.flowMap.url; c.target = '_blank'; c.rel = 'noopener'; }
      chips.append(c);
    }
    if (s.where) chips.append(el('span', 'chip', tr('screen_where', { where: s.where })));
    if (chips.childElementCount) h.append(chips);
    const opts = s.options ?? [];
    if (opts.length < 2) return;
    const c = el('div', 'choice');
    if (s.chosen) { c.classList.add('decided'); c.textContent = S.choose_dec + (s.decided ?? s.chosen); }
    else {
      const answer = opts.map((o) => `${s.code} ${o.id}`).join('" / "');
      c.append(el('span', 'ask', tr(design.owner ? 'choose_open' : 'choose_open_anon', { owner: design.owner, answer })));
      if (s.rec) c.append(el('span', 'rec', `${S.choose_rec}${s.rec.option}${s.rec.why ? ' · ' + s.rec.why : ''}`));
    }
    h.append(c);
  }

  function optionCards(s, o) {
    const box = $('options');
    box.replaceChildren();
    box.hidden = (s.options ?? []).length < 2;
    for (const x of s.options ?? []) {
      const card = el('div', 'opt' + (x.id === o.id ? ' on' : '') + (s.chosen && x.id !== s.chosen ? ' passed' : ''));
      const top = el('button', 'top');
      top.type = 'button';
      top.setAttribute('aria-pressed', String(x.id === o.id));
      top.append(el('span', 'letter', x.id), el('span', 'name', x.name ?? ''));
      if (s.chosen === x.id) top.append(el('span', 'badge chosen', S.opt_chosen));
      else if (!s.chosen && s.rec?.option === x.id) top.append(el('span', 'badge rec', S.opt_rec));
      card.append(top);
      if (x.idea) card.append(richEl('p', null, x.idea));
      if (x.pros?.length) card.append(el('span', 'k', S.opt_pros), list(x.pros));
      if (x.cons?.length) card.append(el('span', 'k', S.opt_cons), list(x.cons));
      card.addEventListener('click', () => show(s, x.id));
      box.append(card);
    }
  }

  function light(c, on) {
    c.classList.toggle('on', on);
    c.arrow?.classList.toggle('on', on);
    hlStyle.textContent = on ? lit(c.dataset.part) : '';
  }

  // The gutter holds the screen's own questions first, then those of each part this option draws.
  function drawNotes(s, o) {
    const notes = $('notes');
    notes.replaceChildren();
    const here = new Set(M.partsIn(s, o).map((p) => p.id));
    const items = [...(s.qs ?? []).map((id) => ({ id, p: null })), ...(s.parts ?? []).filter((p) => here.has(p.id)).flatMap((p) => (p.qs ?? []).map((id) => ({ id, p })))];
    for (const { id, p } of items.filter((it) => questions[it.id])) {
      const c = questionCard(id, p ? M.named(p) : S.q_screen);
      c.dataset.part = p?.id ?? '';
      c.tabIndex = 0;
      for (const [ev, on] of [['mouseenter', true], ['mouseleave', false], ['focus', true], ['blur', false]]) c.addEventListener(ev, () => light(c, on));
      notes.append(c);
    }
    const away = (s.parts ?? []).filter((p) => !here.has(p.id) && p.qs?.length);
    $('elsewhere').hidden = !away.length;
    $('elsewhere').textContent = tr('q_elsewhere', { opt: o.id, list: away.map((p) => `${p.code} (${p.qs.join(', ')})`).join('; ') });
  }

  function defs() {
    const d = document.createElementNS(svgNS, 'defs');
    d.innerHTML = ['', 'decided'].map((k) => `<marker id="ah${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="mk ${k}" d="M0 0L10 5L0 10z"/></marker>`).join('');
    return d;
  }

  // Pins on the parts that carry questions; on a wide screen each callout also moves level with its part and an arrow joins them.
  let pins = [];
  function place() {
    if (!cur || !host.isConnected || $('screenSec').hidden) return;
    const stage = $('stage'), svg = $('arrows'), notes = $('notes');
    svg.replaceChildren(defs());
    pins.forEach((p) => p.remove());
    pins = [];
    const base = stage.getBoundingClientRect(), frame = $('mockFrame').getBoundingClientRect();
    const box = (id) => {
      const n = id && shadow.querySelector(sel(id));
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return { x: r.left - base.left, y: r.top - base.top, r: Math.min(r.right, frame.right) - base.left, h: r.height };
    };
    const cards = [...notes.children];
    for (const id of new Set(cards.map((c) => c.dataset.part).filter(Boolean))) {
      const b = box(id), mine = cards.filter((c) => c.dataset.part === id);
      if (!b) continue;
      const pin = el('button', 'pin' + (mine.every((c) => c.classList.contains('decided')) ? ' decided' : ''), mine.map((c) => c.dataset.qid).join(' '));
      pin.type = 'button';
      pin.style.left = `${b.r}px`;
      pin.style.top = `${b.y}px`;
      pin.addEventListener('click', () => { mine[0].scrollIntoView({ behavior: motion(), block: 'nearest' }); mine[0].focus({ preventScroll: true }); });
      stage.append(pin);
      pins.push(pin);
    }
    const wide = getComputedStyle(svg).display !== 'none';
    notes.classList.toggle('placed', wide);
    if (!wide) { notes.style.height = ''; cards.forEach((c) => { c.style.top = ''; }); return; }
    const nb = notes.getBoundingClientRect(), top0 = nb.top - base.top, left0 = nb.left - base.left;
    const aim = (b) => b.y + Math.min(b.h / 2, 24);
    const order = cards.map((c) => ({ c, b: box(c.dataset.part) })).sort((a, z) => (a.b ? aim(a.b) : -1) - (z.b ? aim(z.b) : -1));
    let y = 0;
    for (const { c, b } of order) {
      const t = Math.max(y, b ? aim(b) - top0 - 14 : y);
      c.style.top = `${t}px`;
      y = t + c.offsetHeight + 10;
      if (!b) continue;
      const x1 = left0 - 4, y1 = top0 + t + 14, x2 = b.r + 4, y2 = aim(b), k = Math.max(24, (x1 - x2) / 2);
      const path = document.createElementNS(svgNS, 'path');
      const decided = c.classList.contains('decided');
      path.setAttribute('class', 'arrow' + (decided ? ' decided' : ''));
      path.setAttribute('d', `M${x1} ${y1} C${x1 - k} ${y1}, ${x2 + k} ${y2}, ${x2} ${y2}`);
      path.setAttribute('marker-end', `url(#ah${decided ? 'decided' : ''})`);
      svg.append(path);
      c.arrow = path;
    }
    notes.style.height = `${y}px`;
  }

  function partsTable(s, o) {
    const t = $('parts');
    t.replaceChildren();
    const here = new Set(M.partsIn(s, o).map((p) => p.id));
    const hr = el('tr');
    ['part_code', 'part_name', 'part_status', 'part_note', 'part_qs'].forEach((k) => hr.append(el('th', null, S[k])));
    const thead = el('thead'), tbody = el('tbody');
    thead.append(hr);
    for (const p of s.parts ?? []) {
      const row = el('tr', here.has(p.id) ? '' : 'absent');
      const name = el('td', null, p.title);
      if (p.where) name.append(el('div', 'src', p.where));
      const st = DesignCore.statusOf(p);
      const cells = [el('td'), name, el('td'), el('td', null, here.has(p.id) ? p.statusNote ?? '' : tr('part_missing', { opt: o.id })), el('td', null, (p.qs ?? []).join(', '))];
      cells[0].append(el('span', 'code', p.code));
      cells[2].append(el('span', `st ${st}`, S['status_' + st]));
      row.append(...cells);
      if (here.has(p.id)) {
        row.tabIndex = 0;
        row.addEventListener('click', () => flashPart(p.id));
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flashPart(p.id); } });
      }
      tbody.append(row);
    }
    t.append(thead, tbody);
  }

  let flashT;
  function flashPart(id) {
    $('stage').scrollIntoView({ behavior: motion(), block: 'start' });
    hlStyle.textContent = lit(id);
    clearTimeout(flashT);
    flashT = setTimeout(() => { hlStyle.textContent = ''; }, 1600);
  }

  // A screen opens on the option asked for, else the chosen one, else the recommended one.
  function show(s, oid) {
    const o = M.option(s, oid) ?? M.option(s, M.chosen(s)) ?? M.option(s, s.rec?.option) ?? s.options[0];
    cur = { s, o };
    document.querySelectorAll('#screenNav button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === s.id)));
    head(s);
    optionCards(s, o);
    drawMock(s, o);
    drawNotes(s, o);
    partsTable(s, o);
    fit();
    place();
  }

  function screenNav() {
    for (const s of screens) {
      const b = el('button');
      b.type = 'button';
      b.dataset.id = s.id;
      b.setAttribute('aria-pressed', 'false');
      const open = M.qsOf(s).filter(openQ).length, choose = !M.chosen(s);
      b.append(el('b', null, s.code), el('span', null, s.title));
      if (choose || open) b.append(el('i', 'open', choose ? tr('nav_choose', { n: s.options?.length ?? 0 }) : tr('nav_open', { n: open })));
      b.addEventListener('click', () => show(s));
      $('screenNav').append(b);
    }
  }

  // ---- Every question, by screen; a question code opens its screen on an option that draws its part.
  function goQuestion(id) {
    const own = M.ownerOf(id);
    if (!own) return;
    const has = (oid) => { const o = M.option(own.s, oid); return o && (!own.p || M.partsIn(own.s, o).some((p) => p.id === own.p.id)); };
    const oid = [cur?.s === own.s ? cur.o.id : null, M.chosen(own.s), ...own.s.options.map((o) => o.id)].find(has);
    showPage('design');
    show(own.s, oid);
    const c = [...$('notes').children].find((n) => n.dataset.qid === id);
    if (!c) return;
    c.scrollIntoView({ behavior: motion(), block: 'center' });
    c.classList.add('flash');
    setTimeout(() => c.classList.remove('flash'), 1600);
  }

  function goCode(code) {
    if (questions[code]) return goQuestion(code);
    const x = M.byCode[code];
    if (!x) return;
    showPage('design');
    if (x.options) { show(x.screen); $('screenSec').scrollIntoView({ behavior: motion() }); return; }
    const s = x.screen, oid = [cur?.s === s ? cur.o.id : null, M.chosen(s), ...s.options.map((o) => o.id)].find((id) => { const o = M.option(s, id); return o && M.partsIn(s, o).some((p) => p.id === x.id); });
    show(s, oid);
    flashPart(x.id);
  }

  function questionList() {
    const box = $('qlist');
    const group = (ids, s) => {
      ids = ids.filter((id) => questions[id]);
      if (!ids.length) return;
      const g = el('div', 'qgroup'), h = el('div', 'qgroup-head'), grid = el('div', 'qgrid');
      if (s) { const b = el('button', null, `${s.code} ${s.title}`); b.type = 'button'; b.addEventListener('click', () => { show(s); $('screenSec').scrollIntoView({ behavior: motion() }); }); h.append(b); }
      else h.append(el('h3', null, S.q_general));
      for (const id of ids) {
        const own = M.ownerOf(id);
        const c = questionCard(id, own && tr('q_at', { where: own.p ? M.named(own.p) : S.q_screen }));
        if (own) {
          c.tabIndex = 0;
          c.addEventListener('click', () => goQuestion(id));
          c.addEventListener('keydown', (e) => { if (e.key === 'Enter') goQuestion(id); });
        }
        grid.append(c);
      }
      g.append(h, grid);
      box.append(g);
    };
    screens.forEach((s) => group(M.qsOf(s), s));
    group(M.general);
  }

  // The list shows open, decided or all questions; a group with nothing left to show is hidden.
  function filterQuestions(f) {
    document.querySelectorAll('#qFilter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
    document.querySelectorAll('#qlist .q').forEach((c) => { const d = Boolean(questions[c.dataset.qid].decided); c.hidden = f === 'open' ? d : f === 'decided' ? !d : false; });
    document.querySelectorAll('#qlist .qgroup').forEach((g) => { g.hidden = ![...g.querySelectorAll('.q')].some((c) => !c.hidden); });
  }

  // ---- The change log
  function logList() {
    const box = $('logList');
    (design.changelog ?? []).forEach((d) => {
      const day = el('div', 'log-day'), ul = el('ul');
      day.append(el('h3', null, d.day));
      d.items.forEach((it) => {
        const li = el('li');
        li.append(el('span', `tag ${it.kind}`, S['log_' + it.kind] ?? it.kind), document.createTextNode(it.text));
        if (it.refs?.length) {
          const refs = el('div');
          it.refs.forEach((r) => { const b = el('button', 'ref', r); b.type = 'button'; b.addEventListener('click', () => goCode(r)); refs.append(b); });
          li.append(refs);
        }
        ul.append(li);
      });
      day.append(ul);
      box.append(day);
    });
  }

  // The design and the change log are two pages of one artifact; #changelog opens the log. Callouts are placed once the design page shows, since hidden boxes cannot be measured.
  function showPage(p) {
    document.querySelectorAll('.wrap > section').forEach((s) => { s.hidden = p === 'log' ? s.id !== 'logPage' : s.id === 'logPage'; });
    document.querySelectorAll('.pagenav button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.page === p)));
    try { history.replaceState(null, '', p === 'log' ? '#changelog' : location.pathname + location.search); } catch {}
    if (p === 'design' && cur) { fit(); place(); }
  }

  header();
  screenNav();
  questionList();
  filterQuestions('open');
  logList();
  document.querySelectorAll('.pagenav button').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));
  document.querySelectorAll('#qFilter button').forEach((b) => b.addEventListener('click', () => filterQuestions(b.dataset.f)));
  const toggle = $('statusToggle');
  toggle.addEventListener('click', () => { showStatus = !showStatus; toggle.setAttribute('aria-pressed', String(showStatus)); statusStyle(); });
  showPage(location.hash === '#changelog' ? 'log' : 'design');
  show(screens[0]);
  // Re-place when the width changes, fonts arrive or a mockup image loads; height changes come from place() itself.
  let lastW = 0;
  new ResizeObserver(([e]) => { if (e.contentRect.width !== lastW) { lastW = e.contentRect.width; fit(); place(); } }).observe($('stage'));
  document.fonts?.ready.then(place);
  shadow.addEventListener('load', place, true);
}
I18n.boot(window.DESIGN, drawDesign, 'design-map:lang');
