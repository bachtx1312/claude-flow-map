// Draws a flow map from window.FLOW with FlowCore: the state graph (ELK), the inspector, the step view, scenarios, questions, notes and the change log.
(function () {
  const flow = window.FLOW;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  if (!flow) { $('inspector').append(el('p', 'warn', 'flow.data.js did not load, or it does not set window.FLOW.')); return; }

  const S = FlowCore.strings(flow, window.FLOW_STRINGS);
  const tr = (k, v) => FlowCore.fmt(S[k] ?? k, v);
  const M = FlowCore.model(flow, S);
  const { byId, nodes, questions, scenarios } = M;
  const EDGES = M.edges;
  const svgNS = 'http://www.w3.org/2000/svg';
  const motion = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const canvas = $('canvas'), inspector = $('inspector'), focusEl = $('focus'), scroller = $('canvasScroll');

  // Text fields accept **bold**, `code` and [label](https://…); everything else is escaped.
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const rich = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const richEl = (tag, cls, s) => { const e = el(tag, cls); e.innerHTML = rich(s); return e; };
  const statusLabel = (s) => S['status_' + s] ?? '';

  document.documentElement.lang = flow.lang ?? 'en';
  document.querySelectorAll('[data-s]').forEach((e) => { e.textContent = S[e.dataset.s] ?? ''; });
  document.querySelectorAll('[data-s-aria]').forEach((e) => e.setAttribute('aria-label', S[e.dataset.sAria] ?? ''));
  document.querySelectorAll('[data-s-ph]').forEach((e) => e.setAttribute('placeholder', S[e.dataset.sPh] ?? ''));

  function header() {
    const set = (id, text, html) => { const e = $(id); if (!text) { e.hidden = true; return; } if (html) e.innerHTML = rich(text); else e.textContent = text; };
    set('eyebrow', flow.eyebrow);
    set('title', flow.title);
    set('lead', flow.lead, true);
    set('context', flow.context, true);
    set('logNote', flow.changelogNote, true);
    const links = $('links');
    (flow.links ?? []).forEach((l) => links.append(richEl('span', null, l)));
    links.hidden = !links.childElementCount;
    const box = $('facts');
    const add = (s) => box.append(richEl('span', 'fact', s));
    add(tr('fact_steps', { n: M.real.length, ...M.count }));
    add(tr('fact_scen', { n: scenarios.length }));
    add(tr('fact_q', { d: M.decided, n: Object.keys(questions).length }));
    (flow.facts ?? []).forEach(add);
    if (flow.asOf) add(tr('fact_asof', { date: flow.asOf }));
  }

  function done() {
    const dod = flow.dod ?? [];
    $('done').textContent = dod.length ? S.done_title : S.progress;
    const box = $('dod'), meterCard = box.firstElementChild;
    meterCard.querySelector('h3').hidden = !dod.length;
    dod.forEach((d) => {
      const card = el('div');
      card.append(el('h3', null, d.title));
      const ul = el('ul');
      d.items.forEach((t) => ul.append(richEl('li', null, t)));
      card.append(ul);
      box.insertBefore(card, meterCard);
    });
    const real = M.real.length, built = M.count.built + M.count.mock, pct = (x, total) => `${total ? (100 * x) / total : 0}%`;
    $('meterNodes').innerHTML = `<div class="row"><span>${esc(S.meter_steps)}</span><b>${built} / ${real}</b></div><div class="bar"><i style="width:${pct(built, real)};background:var(--ok)"></i><i style="width:${pct(M.count.partial, real)};background:var(--wait)"></i></div>`;
    $('meterScen').innerHTML = `<div class="row"><span>${esc(S.meter_scen)}</span><b>${M.checked} / ${scenarios.length}</b></div><div class="bar"><i style="width:${pct(M.checked, scenarios.length)};background:var(--ok)"></i></div>`;
    const problems = [
      M.uncovered.length ? tr('uncovered', { list: M.uncovered.map((e) => `${M.codeOf(e.from)} → ${M.codeOf(e.to)}`).join('; ') }) : '',
      M.broken.length ? tr('broken', { list: M.broken.map((b) => `${b.sc}: ${M.codeOf(b.a)} → ${M.codeOf(b.b)}`).join('; ') }) : '',
    ].filter(Boolean);
    if (problems.length) { $('uncovered').hidden = false; $('uncovered').textContent = problems.join('. '); }
  }

  // ---- The map: build every box first, measure it, then let ELK place it, so long or CJK text never overlaps.
  const W = { ai: 250, code: 244, pause: 244, terminal: 160 };
  const SW = 290;
  const nodeEls = {}, groupEls = {}, edgeEls = [];
  const group = (id) => new Set([id, ...(byId[id].steps ?? []).map((st) => st.id)]);
  const at = (id) => byId[id].parent ?? id;
  const sameNode = (a, b) => byId[a].parent && byId[a].parent === byId[b].parent;
  const ownQs = (n) => M.openQs(n.qs).filter((id) => !(n.steps ?? []).some((st) => st.qs?.includes(id)));
  const reviewed = (e) => Boolean(e.reviewed);
  // A green tube under a reviewed edge: a wide green stroke, then a paper one, so only two thin green sides show.
  const casing = (svg, d) => ['out', 'in'].map((k) => { const c = document.createElementNS(svgNS, 'path'); c.setAttribute('d', d); c.setAttribute('class', `edge-case ${k}`); svg.appendChild(c); return c; });
  const markers = (ids) => `<defs>${ids.map(([id, cls]) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="mk ${cls}" d="M0,0 L10,5 L0,10 z"/></marker>`).join('')}</defs>`;

  function nodeButton(n) {
    const b = el('button', `node ${n.kind} ${n.status ?? ''}${n.steps ? ' head' : ''}`);
    b.type = 'button';
    b.setAttribute('aria-label', `${n.code ?? n.title}: ${n.title}${n.status ? ', ' + statusLabel(n.status) : ''}${M.covered(n.id) ? S.covered_aria : ''}`);
    if (n.kind === 'terminal') b.append(el('span', 'nm', n.title));
    else {
      const top = el('span', 'top');
      top.append(el('span', `badge ${n.kind}`, S['kind_' + n.kind]), el('span', 'nm', n.code));
      if (n.status !== 'built') top.append(el('span', `st ${n.status}`, statusLabel(n.status)));
      b.append(top, el('span', 'ds', n.title));
      const mt = n.kind === 'ai' ? n.meta ?? n.who : n.who ?? n.meta;
      if (mt) b.append(el('span', 'mt', mt));
      if (ownQs(n).length) b.append(el('span', 'qn', tr('q_needs', { list: ownQs(n).join(', ') })));
    }
    if (!n.steps && M.covered(n.id)) b.classList.add('covered');
    b.addEventListener('click', () => select(n.id, false));
    nodeEls[n.id] = b;
    return b;
  }

  function stepButton(st) {
    const b = el('button', `node step ${st.status}${M.covered(st.id) ? ' covered' : ''}`);
    b.type = 'button';
    b.setAttribute('aria-label', `${st.code}: ${st.q}, ${statusLabel(st.status)}${M.covered(st.id) ? S.covered_aria : ''}`);
    const top = el('span', 'top');
    top.append(el('span', 'nm', st.code));
    if (st.status !== 'built') top.append(el('span', `st ${st.status}`, statusLabel(st.status)));
    b.append(top, el('span', 'ds', st.q));
    if (st.inputs?.length) b.append(el('span', 'mt', tr('inputs', { list: st.inputs.join('; ') })));
    if (M.openQs(st.qs).length) b.append(el('span', 'qn', tr('q_needs', { list: M.openQs(st.qs).join(', ') })));
    b.addEventListener('click', () => select(st.id, false));
    nodeEls[st.id] = b;
    return b;
  }

  const measure = (b, w) => { b.classList.add('measure'); b.style.width = w + 'px'; canvas.appendChild(b); const h = b.offsetHeight; b.classList.remove('measure'); return h; };

  const ELK_OPTS = {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.padding': '[top=24,left=24,bottom=24,right=24]',
    'elk.spacing.nodeNode': '32',
    'elk.layered.spacing.nodeNodeBetweenLayers': '36',
    'elk.spacing.edgeNode': '16',
    'elk.spacing.edgeEdge': '8',
    'elk.layered.spacing.edgeNodeBetweenLayers': '10',
    'elk.layered.spacing.edgeEdgeBetweenLayers': '8',
    'elk.spacing.edgeLabel': '4',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  };

  // Each step gets ports: in on top, the next step below, one port per branch on the side facing its target; fixed sides keep the steps in one column.
  function elkGraph(size, west = new Set()) {
    const port = (id, side) => ({ id, layoutOptions: { 'elk.port.side': side } });
    const stepNode = (st) => ({
      id: st.id, width: SW, height: size.h[st.id], layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' },
      ports: [port(st.id + ':in', 'NORTH'), port(st.id + ':next', 'SOUTH'), ...EDGES.flatMap((e) => (e.from === st.id && !sameNode(e.from, e.to) ? [port(`${st.id}:o${e.i}`, west.has(e.i) ? 'WEST' : 'EAST')] : []))],
    });
    // An edge from outside into a node's first step ends on the node's border, so it never crosses the node's title.
    const end = (id, i, out, other) => (byId[id].kind !== 'step' ? id : !out ? (byId[byId[id].parent].steps[0].id === id ? byId[id].parent : id + ':in') : sameNode(id, other) ? id + ':next' : `${id}:o${i}`);
    return {
      id: 'root',
      layoutOptions: ELK_OPTS,
      children: nodes.map((n) => (n.steps
        ? { id: n.id, layoutOptions: { 'elk.padding': `[top=${size.head[n.id] + 18},left=14,bottom=14,right=14]`, 'elk.layered.spacing.nodeNodeBetweenLayers': '22', 'elk.layered.spacing.edgeNodeBetweenLayers': '4' }, children: n.steps.map(stepNode) }
        : { id: n.id, width: W[n.kind] ?? 244, height: size.h[n.id] })),
      // Labels between two steps are drawn beside the arrow, not laid out, so the steps stay close.
      edges: EDGES.map((e) => ({ id: 'e' + e.i, sources: [end(e.from, e.i, true, e.to)], targets: [end(e.to, e.i, false, e.from)], labels: e.label && !sameNode(e.from, e.to) ? [{ text: e.label, width: size.label[e.i].w + 8, height: size.label[e.i].h + 4 }] : [] })),
    };
  }

  function path(points, r = 10) {
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1], q = points[i], b = points[i + 1];
      const d1 = Math.hypot(q.x - a.x, q.y - a.y), d2 = Math.hypot(b.x - q.x, b.y - q.y);
      const k = Math.min(r, d1 / 2, d2 / 2);
      if (!k) continue;
      d += ` L${q.x - ((q.x - a.x) / d1) * k},${q.y - ((q.y - a.y) / d1) * k} Q${q.x},${q.y} ${q.x + ((b.x - q.x) / d2) * k},${q.y + ((b.y - q.y) / d2) * k}`;
    }
    const last = points[points.length - 1];
    return d + ` L${last.x},${last.y}`;
  }

  // An edge into a node with steps ends on ELK's wider box; move its last leg to the middle of the drawn frame.
  function intoFrame(pts, frame) {
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    const x = frame.x + frame.width / 2;
    if (Math.abs(x - last.x) < 1) return pts;
    if (pts.length > 2 && prev.x === last.x) return [...pts.slice(0, -2), { x, y: prev.y }, { x, y: last.y }];
    const midY = (prev.y + last.y) / 2;
    return [...pts.slice(0, -1), { x: prev.x, y: midY }, { x, y: midY }, { x, y: last.y }];
  }

  let svg, labels;
  function buildAndMeasure() {
    svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = markers([['arr', ''], ['arrPlan', 'plan'], ['arrOn', 'on']]);
    canvas.appendChild(svg);
    const size = { h: {}, head: {}, label: {} };
    nodes.forEach((n) => {
      const b = nodeButton(n);
      if (!n.steps) { size.h[n.id] = measure(b, W[n.kind] ?? 244); return; }
      size.head[n.id] = measure(b, SW + 8);
      n.steps.forEach((st) => { size.h[st.id] = measure(stepButton(byId[st.id]), SW); });
    });
    labels = EDGES.map((e) => {
      if (!e.label) return null;
      const l = el('span', 'elabel measure' + (M.isPlan(e) ? ' plan' : '') + (reviewed(e) ? ' ok' : ''), e.label);
      canvas.appendChild(l);
      size.label[e.i] = { w: l.offsetWidth, h: l.offsetHeight };
      l.classList.remove('measure');
      return l;
    });
    return size;
  }

  function draw(res, size) {
    canvas.style.width = res.width + 'px';
    canvas.style.height = res.height + 'px';
    svg.setAttribute('width', res.width); svg.setAttribute('height', res.height);
    const shapes = {}, edges = {}, frames = {};
    // ELK gives shapes relative to their parent and edges relative to their container.
    const origin = { root: { x: 0, y: 0 } };
    const walk = (n, ox, oy) => {
      (n.children ?? []).forEach((c) => { shapes[c.id] = { ...c, x: ox + c.x, y: oy + c.y }; origin[c.id] = shapes[c.id]; walk(c, ox + c.x, oy + c.y); });
      (n.edges ?? []).forEach((e) => { edges[e.id] = e; });
    };
    walk(res, 0, 0);
    const place = (node, box, cx = box.x + box.width / 2, cy = box.y + box.height / 2, w = box.width) => { node.style.left = cx + 'px'; node.style.top = cy + 'px'; node.style.width = w + 'px'; };
    nodes.forEach((n) => {
      const box = shapes[n.id], b = nodeEls[n.id];
      if (n.steps) {
        // The frame hugs the column of steps; branch lanes run just outside it.
        const rows = n.steps.map((st) => shapes[st.id]);
        const x1 = Math.min(...rows.map((r) => r.x)) - 12, x2 = Math.max(...rows.map((r) => r.x + r.width)) + 12, y2 = Math.max(...rows.map((r) => r.y + r.height)) + 12;
        const frame = { x: x1, y: box.y, width: x2 - x1, height: y2 - box.y };
        const wrap = el('div', `group ${n.kind} ${n.status}${M.covered(n.id) ? ' covered' : ''}`);
        place(wrap, frame);
        wrap.style.height = frame.height + 'px';
        canvas.insertBefore(wrap, svg);
        groupEls[n.id] = wrap;
        frames[n.id] = frame;
        place(b, frame, frame.x + frame.width / 2, frame.y + 8 + size.head[n.id] / 2, frame.width - 16);
        n.steps.forEach((st) => { const sb = nodeEls[st.id]; place(sb, shapes[st.id]); sb.style.minHeight = shapes[st.id].height + 'px'; });
        return;
      }
      place(b, box);
      b.style.minHeight = box.height + 'px';
    });
    EDGES.forEach((e) => {
      const r = edges['e' + e.i], o = origin[r.container] ?? origin.root;
      const raw = r.sections.flatMap((sec, k) => [...(k ? [] : [sec.startPoint]), ...(sec.bendPoints ?? []), sec.endPoint]).map((q) => ({ x: q.x + o.x, y: q.y + o.y }));
      const into = byId[e.to].parent && !sameNode(e.from, e.to) && byId[byId[e.to].parent].steps[0].id === e.to ? frames[byId[e.to].parent] : null;
      const pts = into ? intoFrame(raw, into) : raw;
      const plan = M.isPlan(e);
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', path(pts));
      p.setAttribute('class', 'edge' + (plan ? ' plan' : e.label ? ' cond' : ''));
      p.setAttribute('marker-end', plan ? 'url(#arrPlan)' : 'url(#arr)');
      const cases = reviewed(e) ? casing(svg, p.getAttribute('d')) : [];
      svg.appendChild(p);
      const lab = labels[e.i], l = r.labels?.[0];
      if (lab && l) { lab.style.left = o.x + l.x + l.width / 2 + 'px'; lab.style.top = o.y + l.y + l.height / 2 + 'px'; }
      else if (lab) { lab.classList.add('side'); lab.style.left = pts[0].x + 'px'; lab.style.top = (pts[0].y + pts[pts.length - 1].y) / 2 + 'px'; }
      edgeEls.push({ ...e, plan, path: p, cases, lab });
    });
  }

  // ---- Step view: the chosen step, where it comes from above, and each branch drawn to its target on the right.
  const FX = { pad: 24, node: 400, gap: 200, target: 260, head: 62, row: 56, plain: 74, rowGap: 12, tH: 46, tGap: 10, chip: 210, chipH: 46 };
  let mode = 'map', current = null;

  function focus(id) {
    const n = byId[at(id)], ids = group(n.id), rows = n.steps ? n.steps.map((st) => byId[st.id]) : [n];
    const exits = (r) => EDGES.filter((e) => (n.steps ? e.from === r.id : ids.has(e.from)) && !ids.has(e.to));
    const inc = EDGES.filter((e) => ids.has(e.to) && !ids.has(e.from));
    focusEl.replaceChildren();
    const fsvg = document.createElementNS(svgNS, 'svg');
    fsvg.innerHTML = markers([['fa', ''], ['fp', 'plan']]);
    focusEl.appendChild(fsvg);
    const put = (node, x, y, w, h) => { Object.assign(node.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }); focusEl.appendChild(node); return node; };
    const curve = (x1, y1, x2, y2, e, down) => {
      const p = document.createElementNS(svgNS, 'path');
      const k = down ? (y2 - y1) / 2 : (x2 - x1) / 2;
      p.setAttribute('d', down ? `M${x1},${y1} C${x1},${y1 + k} ${x2},${y2 - k} ${x2},${y2}` : `M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}`);
      const plan = M.isPlan(e);
      p.setAttribute('class', 'fline' + (plan ? ' plan' : e.label ? ' cond' : ''));
      p.setAttribute('marker-end', plan ? 'url(#fp)' : 'url(#fa)');
      if (reviewed(e)) casing(fsvg, p.getAttribute('d'));
      fsvg.appendChild(p);
    };
    const card = (cls, title, sub, target) => {
      const b = el('button', cls + (M.covered(target) ? ' covered' : ''));
      b.type = 'button';
      b.dataset.id = target;
      b.append(el('b', null, title), sub);
      b.title = title;
      b.addEventListener('click', () => select(target, false));
      return b;
    };
    const subOf = (text, status) => { const sp = el('span', null, text); if (status && status !== 'built') sp.appendChild(el('em', status, ' · ' + statusLabel(status).toLowerCase())); return sp; };
    const width = FX.pad * 2 + FX.node + FX.gap + FX.target;
    const nodeX = FX.pad, tx = FX.pad + FX.node + FX.gap;
    let y = FX.pad;

    if (inc.length) {
      const per = Math.max(1, Math.floor((width - FX.pad * 2 + 14) / (FX.chip + 14)));
      const nodeTop = y + Math.ceil(inc.length / per) * (FX.chipH + 12) - 12 + 44;
      inc.forEach((e, i) => {
        const src = byId[e.from], cx = nodeX + (i % per) * (FX.chip + 14), cy = y + Math.floor(i / per) * (FX.chipH + 12);
        put(card(`ftarget ${src.kind === 'step' ? 'code' : src.kind} ${src.status ?? ''}`, src.kind === 'step' ? byId[src.parent].title : src.title, subOf(e.label ? tr('if', { label: e.label }) : src.code ?? ''), e.from), cx, cy, FX.chip, FX.chipH);
        curve(cx + FX.chip / 2, cy + FX.chipH, nodeX + FX.node / 2, nodeTop - 2, e, true);
      });
      y = nodeTop;
    }

    const top = y;
    if (n.steps) {
      put(el('div', `fbox ${n.status}${M.covered(n.id) ? ' covered' : ''}`), nodeX, top, FX.node, 0);
      const head = put(el('button', 'fhead'), nodeX, top, FX.node, FX.head);
      head.type = 'button';
      head.dataset.id = n.id;
      head.append(el('b', null, n.title), el('span', null, tr('group_rule', { code: n.code })));
      head.addEventListener('click', () => select(n.id, false));
      y += FX.head;
    }
    rows.forEach((r) => {
      const out = exits(r), rowH = n.steps ? FX.row : FX.plain;
      const tb = out.length ? out.length * (FX.tH + FX.tGap) - FX.tGap : 0, bh = Math.max(rowH, tb);
      const rowTop = y + (bh - rowH) / 2, tTop = y + (bh - tb) / 2;
      const rx = n.steps ? nodeX + 12 : nodeX, rw = n.steps ? FX.node - 24 : FX.node;
      const title = n.steps ? `${r.code} ${r.q}` : r.title;
      const sub = n.steps ? tr('inputs', { list: r.brief ?? (r.inputs ?? []).join('; ') }) : [S['kind_' + r.kind], r.kind === 'ai' ? r.meta : r.who].filter(Boolean).join(' · ');
      const row = put(card(`frow ${n.steps ? 'step' : r.kind} ${r.status ?? ''}`, title, subOf(sub, r.status), r.id), rx, rowTop, rw, rowH);
      if (M.openQs(r.qs).length) row.appendChild(el('i', null, M.openQs(r.qs).join(', ')));
      out.forEach((e, j) => {
        const t = byId[e.to], ty = tTop + j * (FX.tH + FX.tGap);
        put(card(`ftarget ${t.kind} ${t.status ?? ''}`, t.title, subOf(t.code ?? '', t.status), e.to), tx, ty, FX.target, FX.tH);
        curve(rx + rw, rowTop + rowH / 2, tx - 2, ty + FX.tH / 2, e, false);
        if (e.label) { const l = el('span', 'flabel' + (M.isPlan(e) ? ' plan' : ''), e.label); l.style.left = tx - 12 + 'px'; l.style.top = ty + FX.tH / 2 - 4 + 'px'; focusEl.appendChild(l); }
      });
      y += bh + FX.rowGap;
    });
    y -= FX.rowGap;
    const boxEl = focusEl.querySelector('.fbox');
    if (boxEl) { boxEl.style.height = y - top + 12 + 'px'; y += 12; }
    focusEl.style.width = width + 'px';
    focusEl.style.height = y + FX.pad + 'px';
    fsvg.setAttribute('width', width); fsvg.setAttribute('height', y + FX.pad);
  }

  // ---- Pan and zoom of the whole-flow map. CSS zoom keeps layout, scrolling and scrollIntoView working in zoomed px.
  let zoom = 1;
  function setZoom(z, px = scroller.clientWidth / 2, py = scroller.clientHeight / 2) {
    z = Math.min(2, Math.max(0.25, z));
    const cx = (scroller.scrollLeft + px) / zoom, cy = (scroller.scrollTop + py) / zoom;
    zoom = z;
    canvas.style.zoom = z;
    scroller.scrollLeft = cx * z - px;
    scroller.scrollTop = cy * z - py;
    $('zoomReset').textContent = Math.round(z * 100) + '%';
  }
  function fitZoom() {
    setZoom(Math.min(1, (scroller.clientWidth - 24) / parseFloat(canvas.style.width), (scroller.clientHeight - 24) / parseFloat(canvas.style.height)));
    scroller.scrollTo({ top: 0, left: 0 });
  }
  function panZoom() {
    scroller.title = S.zoom_hint;
    $('zoomIn').addEventListener('click', () => setZoom(zoom * 1.25));
    $('zoomOut').addEventListener('click', () => setZoom(zoom / 1.25));
    $('zoomReset').addEventListener('click', () => setZoom(1));
    $('zoomFit').addEventListener('click', fitZoom);
    // Trackpad pinch arrives as a wheel event with ctrlKey; plain wheel keeps scrolling.
    scroller.addEventListener('wheel', (e) => {
      if (mode !== 'map' || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = scroller.getBoundingClientRect();
      setZoom(zoom * Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    scroller.addEventListener('keydown', (e) => {
      if (mode !== 'map' || e.target !== scroller) return;
      const k = { '+': 1.25, '=': 1.25, '-': 0.8 }[e.key];
      if (k) { e.preventDefault(); setZoom(zoom * k); } else if (e.key === '0') { e.preventDefault(); fitZoom(); }
    });
    // Drag anywhere, nodes included; a drag past 5 px swallows the click that ends it. Touch keeps native scrolling.
    let drag = null, dragged = false;
    scroller.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.pointerType === 'touch') return;
      drag = { x: e.clientX, y: e.clientY, l: scroller.scrollLeft, t: scroller.scrollTop, id: e.pointerId };
      dragged = false;
    });
    scroller.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!dragged && Math.hypot(dx, dy) < 5) return;
      if (!dragged) { dragged = true; scroller.setPointerCapture(drag.id); scroller.classList.add('panning'); }
      scroller.scrollLeft = drag.l - dx;
      scroller.scrollTop = drag.t - dy;
    });
    const end = () => { drag = null; scroller.classList.remove('panning'); };
    scroller.addEventListener('pointerup', end);
    scroller.addEventListener('pointercancel', end);
    scroller.addEventListener('click', (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
  }

  function setMode(m) {
    mode = m;
    canvas.hidden = m !== 'map';
    $('zoomTools').hidden = m !== 'map';
    scroller.classList.toggle('step', m !== 'map');
    focusEl.hidden = m !== 'step';
    $('modeStep').setAttribute('aria-pressed', String(m === 'step'));
    $('modeMap').setAttribute('aria-pressed', String(m === 'map'));
    if (m === 'step' && current) select(current, false);
    if (m === 'map' && current) nodeEls[current].scrollIntoView({ block: 'center', inline: 'center' });
  }

  // ---- Inspector
  const list = (items) => { const ul = el('ul'); (items ?? []).forEach((t) => ul.appendChild(el('li', null, t))); return ul; };
  const stage = (key, items, mid) => { const s = el('div', 'stage' + (mid ? ' mid' : '')); s.append(el('span', 'k', key), list(items)); return s; };

  function questionCard(id) {
    const q = questions[id];
    const c = el('div', 'q');
    c.dataset.qid = id;
    c.append(el('span', 'id', id), el('span', 'text', q.q));
    if (q.opts) c.append(el('span', 'opts', q.opts));
    if (q.rec) c.append(el('span', 'rec', S.q_rec + q.rec));
    if (q.decided) { c.classList.add('decided'); c.append(el('span', 'dec', S.q_dec + q.decided)); }
    return c;
  }

  function render(n) {
    inspector.replaceChildren();
    const head = el('div', 'ins-head');
    const name = el('div', 'ins-name');
    if (n.kind !== 'terminal') name.append(el('span', `badge ${n.kind}`, S['kind_' + n.kind]));
    name.append(el('span', 'nm', n.kind === 'terminal' ? n.title : `${n.code} · ${n.id}`));
    if (n.status) name.append(el('span', `st ${n.status}`, statusLabel(n.status)));
    head.append(name, el('p', null, n.title));
    const meta = el('div', 'ins-meta');
    if (n.meta) meta.append(el('span', 'chip', n.meta));
    if (n.who) meta.append(el('span', 'chip', n.who));
    if (meta.childElementCount) head.append(meta);
    const screen = n.screen ?? byId[n.parent]?.screen;
    if (screen) { const w = el('div', 'where'); w.append(el('span', null, tr('ins_where', { screen }))); head.append(w); }
    inspector.append(head);
    if (n.statusNote) inspector.append(el('p', `status-note ${n.status}`, n.statusNote));

    const qs = n.kind === 'step' ? n.qs ?? [] : M.allQs(n.id);
    [[flow.owner ? tr('ins_open', { owner: flow.owner }) : S.ins_open_anon, M.openQs(qs)], [S.ins_decided, qs.filter((id) => questions[id]?.decided)]].forEach(([title, ids]) => {
      if (!ids.length) return;
      const box = el('div', 'qs');
      box.append(el('h4', null, title));
      ids.forEach((id) => box.append(questionCard(id)));
      inspector.append(box);
    });

    const pipe = el('div', 'pipe');
    const checks = n.steps ? [stage(S.code_checks, n.steps.map((st) => `${st.code} ${st.q}`))] : [];
    if (n.kind === 'ai') pipe.append(stage(S.ai_read, n.state), ...checks, stage(S.ai_prompt, n.prompt, true), stage(S.ai_model, n.model, true), stage(S.ai_output, n.output, true), stage(S.ai_write, n.writes));
    else if (n.kind === 'step') pipe.append(stage(S.step_q, [n.q]), stage(S.step_in, n.inputs), stage(S.step_parent, [M.named(n.parent)]));
    else if (n.kind === 'code') pipe.append(stage(S.code_read, n.reads), ...checks, stage(S.code_does, n.does), stage(S.code_write, n.writes));
    else if (n.kind === 'pause') pipe.append(stage(S.pause_who, [n.who]), ...checks, stage(S.pause_options, n.options), stage(S.pause_resume, [n.resume]), stage(S.pause_write, n.writes));
    else pipe.append(stage(S.terminal_what, n.what));
    // An empty stage says nothing; drop it.
    pipe.querySelectorAll('.stage').forEach((s) => { if (!s.querySelector('li')?.textContent) s.remove(); });
    inspector.append(pipe);

    const ids = group(n.id);
    const addEdges = (title, list, pick) => {
      if (!list.length) return;
      const box = el('div', 'next');
      box.append(el('h4', null, title));
      list.forEach((e) => {
        const target = pick(e);
        const bt = el('button');
        bt.type = 'button';
        bt.append(el('span', 'cond', (byId[e.from].kind === 'step' && byId[e.from].parent === n.id ? `${byId[e.from].code}: ` : '') + (e.label ? tr('if', { label: e.label }) : S.always)), el('span', 'to', M.named(target)));
        bt.addEventListener('click', () => select(target, true));
        box.append(bt);
      });
      inspector.append(box);
    };
    addEdges(S.next, EDGES.filter((e) => ids.has(e.from) && !ids.has(e.to)), (e) => e.to);
    addEdges(S.from, EDGES.filter((e) => ids.has(e.to) && !ids.has(e.from)), (e) => e.from);
    if (n.where) inspector.append(el('span', 'src', n.where));
    inspector.append(el('span', 'hint', S.hint));
  }

  function highlight(isOn, onNodes, cls) {
    edgeEls.forEach((e) => {
      const on = isOn(e);
      e.path.classList.toggle('on', on); e.path.classList.toggle('dim', !on);
      e.path.setAttribute('marker-end', e.plan ? 'url(#arrPlan)' : on ? 'url(#arrOn)' : 'url(#arr)');
      e.cases.forEach((c) => c.classList.toggle('dim', !on));
      if (e.lab) { e.lab.classList.toggle('on', on); e.lab.classList.toggle('dim', !on); }
    });
    Object.entries(nodeEls).forEach(([k, b]) => { b.classList.remove('onpath', 'sel'); if (cls && onNodes.has(k)) b.classList.add(cls); b.classList.toggle('dim', !onNodes.has(k)); });
  }

  function select(id, scroll) {
    if (!edgeEls.length) return render(byId[id]);
    const ids = group(id);
    const touching = new Set([...ids, byId[id].parent].filter(Boolean));
    edgeEls.forEach((e) => { if (ids.has(e.from) || ids.has(e.to)) { touching.add(e.from); touching.add(e.to); } });
    highlight((e) => ids.has(e.from) || ids.has(e.to), touching, null);
    Object.entries(nodeEls).forEach(([k, b]) => { b.classList.toggle('sel', k === id); b.setAttribute('aria-pressed', k === id ? 'true' : 'false'); });
    document.querySelectorAll('.scen button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    render(byId[id]);
    current = id;
    if (mode === 'step') {
      focus(id);
      focusEl.querySelectorAll('[data-id]').forEach((b) => b.classList.toggle('sel', b.dataset.id === id && !b.classList.contains('ftarget')));
      scroller.scrollTo({ top: 0, left: 0 });
      return;
    }
    if (scroll) nodeEls[id].scrollIntoView({ block: 'center', inline: 'center', behavior: motion() });
  }

  // Terminals have no status of their own; they count as built.
  const isBuilt = (id) => (byId[id].status ?? 'built') === 'built';
  function fadeBuilt(on) {
    Object.entries(nodeEls).forEach(([k, b]) => b.classList.toggle('fade', on && isBuilt(k)));
    edgeEls.forEach((e) => {
      const fade = on && !e.plan && isBuilt(e.from) && isBuilt(e.to);
      e.path.classList.toggle('fade', fade);
      e.cases.forEach((c) => c.classList.toggle('fade', fade));
      if (e.lab) e.lab.classList.toggle('fade', fade);
    });
  }

  // ---- Questions, in flow order; a question shows once, under the first node that holds it.
  function questionList() {
    const root = $('qlist'), seen = new Set();
    const addGroup = (label, ids, nodeId) => {
      const g = el('div', 'qgroup'), head = el('div', 'qgroup-head');
      if (nodeId) {
        const go = el('button', null, byId[nodeId].code);
        go.type = 'button';
        go.addEventListener('click', () => { showPage('flow'); select(nodeId, true); $('graph').scrollIntoView({ behavior: motion() }); });
        head.append(go);
      }
      head.append(el('span', 'sub', label));
      const grid = el('div', 'qgrid');
      ids.forEach((id) => grid.append(questionCard(id)));
      g.append(head, grid);
      root.append(g);
    };
    nodes.forEach((n) => {
      const ids = M.allQs(n.id).filter((id) => !seen.has(id));
      ids.forEach((id) => seen.add(id));
      if (ids.length) addGroup(n.title, ids, n.id);
    });
    const rest = M.general.filter((id) => !seen.has(id));
    if (rest.length) addGroup(S.q_general, rest, null);
  }

  // The list shows open, decided or all questions; a group with nothing left to show is hidden.
  function filterQuestions(f) {
    document.querySelectorAll('#qFilter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
    document.querySelectorAll('#qlist .q').forEach((c) => { const isDone = Boolean(questions[c.dataset.qid]?.decided); c.hidden = f === 'open' ? isDone : f === 'decided' ? !isDone : false; });
    document.querySelectorAll('#qlist .qgroup').forEach((g) => { g.hidden = !g.querySelector('.q:not([hidden])'); });
  }

  const flash = (elm) => { elm.classList.add('flash'); setTimeout(() => elm.classList.remove('flash'), 1600); };

  // A step code (N6, N1.2) opens that step; a question code opens the step that owns it.
  function findCode(raw) {
    const v = raw.trim().toUpperCase();
    const msg = $('findMsg');
    if (!v) { msg.textContent = ''; return; }
    const codeKey = Object.keys(M.byCode).find((k) => k.toUpperCase() === v);
    const qKey = Object.keys(questions).find((k) => k.toUpperCase() === v);
    const owner = codeKey ? M.byCode[codeKey] : qKey ? M.ownerOf(qKey) : null;
    if (!owner) {
      const card = qKey && document.querySelector(`#qlist .q[data-qid="${CSS.escape(qKey)}"]`);
      if (card) { filterQuestions('all'); card.scrollIntoView({ block: 'center' }); flash(card); msg.textContent = tr('find_general', { code: qKey }); return; }
      msg.textContent = tr('find_none', { code: raw.trim() });
      return;
    }
    select(owner, false);
    $('graph').scrollIntoView();
    if (mode === 'map' && edgeEls.length) {
      const box = groupEls[byId[owner].parent] ?? nodeEls[owner];
      scroller.scrollLeft = parseFloat(box.style.left) * zoom - scroller.clientWidth / 2;
      scroller.scrollTop = parseFloat(box.style.top) * zoom - scroller.clientHeight / 2;
    }
    msg.textContent = codeKey ? M.named(owner) : tr('find_at', { code: qKey, where: M.codeOf(owner) });
    const card = qKey && inspector.querySelector(`.q[data-qid="${CSS.escape(qKey)}"]`);
    if (card) { card.scrollIntoView({ block: 'nearest' }); flash(card); }
  }

  // ---- Scenarios
  function showScenario(sc, button) {
    if (mode !== 'map') setMode('map');
    document.querySelectorAll('.scen button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    const pairs = new Set(M.pairs(sc).map(([a, b]) => `${a}>${b}`));
    if (edgeEls.length) highlight((e) => pairs.has(`${e.from}>${e.to}`), new Set(sc.path.flatMap((id) => [id, byId[id]?.parent].filter(Boolean))), 'onpath');
    const st = M.scenarioStatus(sc);
    inspector.replaceChildren();
    const head = el('div', 'ins-head'), name = el('div', 'ins-name');
    name.append(el('span', 'nm', sc.id), el('span', `st ${st.k}`, st.label));
    head.append(name, el('p', null, sc.name));
    inspector.append(head, el('p', `status-note ${st.k === 'blocked' ? 'planned' : st.k === 'checked' ? 'built' : 'partial'}`, st.text));
    const steps = sc.path.map((id, i) => {
      const e = i ? EDGES.find((x) => x.from === sc.path[i - 1] && x.to === id) : null;
      return `${e?.label ? tr('if', { label: e.label }) + ' → ' : ''}${M.named(id)}`;
    });
    const pipe = el('div', 'pipe');
    pipe.append(stage(S.scen_how, [sc.how]), stage(S.scen_path, steps));
    inspector.append(pipe, el('span', 'hint', S.scen_hint));
    $('graph').scrollIntoView({ behavior: motion() });
    const first = nodeEls[sc.path[0]];
    if (first && edgeEls.length) { scroller.scrollLeft = parseFloat(first.style.left) - scroller.clientWidth / 2; scroller.scrollTop = parseFloat(first.style.top) - 80; }
  }

  function scenarioList() {
    const root = $('scenList');
    scenarios.forEach((sc) => {
      const st = M.scenarioStatus(sc);
      const b = el('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      const mid = el('span');
      mid.append(el('span', 'sname', sc.name), el('br'), el('span', 'spath', sc.path.map(M.codeOf).join(' → ')));
      b.append(el('span', 'sid', sc.id), mid, el('span', `st ${st.k}`, st.label));
      b.addEventListener('click', () => { showPage('flow'); showScenario(sc, b); });
      root.append(b);
    });
  }

  // ---- Notes and the change log
  function notes() {
    (flow.notes ?? []).forEach((nt, i) => {
      const s = el('section'), h = el('h2', null, nt.title);
      h.id = 'note-' + i;
      s.setAttribute('aria-labelledby', h.id);
      s.append(h);
      if (nt.text) s.append(richEl('p', 'sub', nt.text));
      if (nt.items) { const ul = el('ul'); nt.items.forEach((t) => ul.append(richEl('li', null, t))); s.append(ul); }
      if (nt.rows) {
        const wrap = el('div', 'table-scroll'), table = el('table'), thead = el('thead'), tbody = el('tbody'), hr = el('tr');
        (nt.head ?? []).forEach((c) => hr.append(richEl('th', null, c)));
        if (hr.childElementCount) thead.append(hr);
        nt.rows.forEach((row) => { const tr = el('tr'); row.forEach((c) => tr.append(richEl('td', null, c))); tbody.append(tr); });
        table.append(thead, tbody);
        wrap.append(table);
        s.append(wrap);
      }
      $('logPage').before(s);
    });
  }

  function logList() {
    const box = $('logList');
    (flow.changelog ?? []).forEach((d) => {
      const day = el('div', 'log-day'), ul = el('ul');
      day.append(el('h3', null, d.day));
      d.items.forEach((it) => {
        const li = el('li');
        li.append(el('span', `tag ${it.kind}`, S['log_' + it.kind] ?? it.kind), document.createTextNode(it.text));
        if (it.refs?.length) {
          const refs = el('div');
          it.refs.forEach((r) => { const b = el('button', 'ref', r); b.type = 'button'; b.addEventListener('click', () => { showPage('flow'); findCode(r); }); refs.append(b); });
          li.append(refs);
        }
        ul.append(li);
      });
      day.append(ul);
      box.append(day);
    });
  }

  // The flow and the change log are two pages of one artifact; #changelog opens the log. The map is laid out the first time the flow page shows, since hidden boxes cannot be measured.
  let layout = null;
  function showPage(p) {
    document.querySelectorAll('.wrap > section').forEach((s) => { s.hidden = p === 'log' ? s.id !== 'logPage' : s.id === 'logPage'; });
    document.querySelectorAll('.pagenav button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.page === p)));
    try { history.replaceState(null, '', p === 'log' ? '#changelog' : location.pathname + location.search); } catch {}
    if (p === 'flow') layout ??= lay();
  }

  const startId = () => flow.start ?? nodes.find((n) => n.kind !== 'terminal')?.id ?? nodes[0].id;

  function lay() {
    if (!window.ELK) { inspector.append(el('p', 'warn', S.err_elk)); return Promise.resolve(); }
    const elk = new ELK();
    let size;
    return (document.fonts?.ready ?? Promise.resolve()).then(() => {
      size = buildAndMeasure();
      return elk.layout(elkGraph(size));
    }).then((first) => {
      // First pass tells which side each branch's target lies on; the second pass puts the branch's port on that side.
      const x = {};
      const walk = (n, ox) => (n.children ?? []).forEach((c) => { x[c.id] = ox + c.x + c.width / 2; walk(c, ox + c.x); });
      walk(first, 0);
      const west = new Set(EDGES.filter((e) => byId[e.from].kind === 'step' && !sameNode(e.from, e.to) && x[e.to] < x[byId[e.from].parent]).map((e) => e.i));
      return elk.layout(elkGraph(size, west));
    }).then((res) => {
      draw(res, size);
      setMode('map');
      const id = startId();
      select(id, false);
      // The map is wider than the frame: open on the first step, not on its empty left edge.
      const first = groupEls[at(id)] ?? nodeEls[id];
      scroller.scrollLeft = parseFloat(first.style.left) - scroller.clientWidth / 2;
      scroller.scrollTop = Math.max(0, parseFloat(first.style.top) - first.offsetHeight / 2 - 120);
    }).catch((err) => { console.error('Layout failed', err); inspector.append(el('p', 'warn', S.err_layout)); });
  }

  header();
  done();
  panZoom();
  questionList();
  filterQuestions('open');
  scenarioList();
  notes();
  logList();
  document.querySelectorAll('.pagenav button').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));
  document.querySelectorAll('#qFilter button').forEach((b) => b.addEventListener('click', () => filterQuestions(b.dataset.f)));
  $('findForm').addEventListener('submit', (e) => { e.preventDefault(); findCode($('findInput').value); });
  $('modeStep').addEventListener('click', () => setMode('step'));
  $('modeMap').addEventListener('click', () => setMode('map'));
  const toggle = $('fadeBuilt');
  toggle.addEventListener('click', () => { const on = toggle.getAttribute('aria-pressed') !== 'true'; toggle.setAttribute('aria-pressed', String(on)); fadeBuilt(on); });
  // Full screen uses the browser API where allowed (an artifact iframe may block it); the .full class alone still fills the viewport.
  const graphSec = $('graphSection'), fullBtn = $('fullScreen');
  const isFull = () => graphSec.classList.contains('full');
  fullBtn.title = S.full;
  function setFull(on) {
    graphSec.classList.toggle('full', on);
    fullBtn.setAttribute('aria-pressed', String(on));
    if (on) graphSec.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen();
  }
  fullBtn.addEventListener('click', () => setFull(!isFull()));
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && isFull()) setFull(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isFull()) setFull(false); });
  showPage(location.hash === '#changelog' ? 'log' : 'flow');
})();
