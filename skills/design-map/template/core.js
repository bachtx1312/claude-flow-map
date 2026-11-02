// Pure design-map logic shared by the page (render.js) and the CLI (design.mjs): labels, lookups, derived state and the data checks.
// No DOM here, so the CLI and the tests run it in Node.
(function (root) {
  // English is the base language; a pack in strings/<lang>.json or DESIGN.strings overrides any key.
  const STRINGS = {
    status_built: 'BUILT', status_partial: 'PARTIAL', status_planned: 'NOT BUILT', status_mock: 'MOCKED',
    page_nav: 'Pages', page_design: 'Design', page_log: 'Change log',
    fact_screens: '**{n}** screens, **{chosen}** with a chosen design',
    fact_q: '**{d}** / **{n}** questions decided',
    fact_parts: '**{built}** / **{n}** UI parts built',
    fact_asof: 'matches the code on **{date}**',
    flow_link: 'Flow map',
    screens_label: 'Screens', nav_choose: '{n} options to choose from', nav_open: 'open questions: {n}', screen_step: 'Flow step {code}', screen_where: 'Where: {where}',
    options_label: 'Design options', opt_rec: 'RECOMMENDED', opt_chosen: 'CHOSEN', opt_pros: 'For', opt_cons: 'Against',
    choose_open: 'For {owner} to choose: answer "{answer}"', choose_open_anon: 'To choose: answer "{answer}"',
    choose_rec: 'Recommended: ', choose_dec: 'Decided: ',
    mock_label: 'Mockup of {code}, option {opt}',
    status_show: 'Show build status',
    legend_q: 'question on this part', legend_built: 'built', legend_partial: 'partial', legend_planned: 'not built', legend_mock: 'mocked',
    q_screen: 'Whole screen', q_elsewhere: 'Questions on parts option {opt} does not have: {list}',
    parts_title: 'UI parts', parts_sub: 'Every part a question points at or the code builds. Select one to find it on the mockup.',
    part_code: 'Code', part_name: 'Part', part_status: 'Status', part_note: 'Note', part_qs: 'Questions',
    part_missing: 'not in option {opt}',
    q_title: 'Questions to decide',
    q_sub: 'Answer by code, for example "M1 B, U1 agreed". On the mockup, each question points at the part its answer changes.',
    q_filter: 'Filter questions', q_open: 'Open', q_decided: 'Decided', q_all: 'All', q_general: 'General',
    q_rec: 'Recommended: ', q_dec: 'Decided: ', q_at: 'at {where}',
    log_title: 'Change log',
    log_lead: 'Every decision, design change, code change, review or deploy. Newest first; select a code to open it.',
    log_decide: 'DECISION', log_design: 'DESIGN', log_code: 'CODE', log_review: 'REVIEW', log_deploy: 'DEPLOY',
  };
  const STATUSES = ['built', 'partial', 'planned', 'mock'];
  const LOG_KINDS = ['decide', 'design', 'code', 'review', 'deploy'];

  const strings = (design, pack) => ({ ...STRINGS, ...(pack ?? {}), ...(design.strings ?? {}) });
  const fmt = (s, vars = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  // html and css may be one string or a list of lines.
  const text = (v) => (Array.isArray(v) ? v.join('\n') : v ?? '');
  const uiIds = (html) => [...text(html).matchAll(/data-ui\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
  const statusOf = (p) => p.status ?? 'planned';

  // Everything the page and the CLI derive from the data, so both count the same way.
  function model(design, S = strings(design)) {
    const screens = design.screens ?? [];
    const questions = design.questions ?? {};
    const parts = screens.flatMap((s) => (s.parts ?? []).map((p) => ({ ...p, screen: s })));
    const byCode = Object.fromEntries([...screens.map((s) => ({ ...s, screen: s })), ...parts].filter((x) => x.code).map((x) => [x.code, x]));
    // A screen with one option has nothing to choose.
    const chosen = (s) => s.chosen ?? (s.options?.length === 1 ? s.options[0].id : null);
    const option = (s, id) => s.options?.find((o) => o.id === id);
    const partsIn = (s, o) => { const ids = new Set(uiIds(o.html)); return (s.parts ?? []).filter((p) => ids.has(p.id)); };
    const ownerOf = (qid) => {
      for (const s of screens) {
        const p = (s.parts ?? []).find((x) => x.qs?.includes(qid));
        if (p) return { s, p };
        if (s.qs?.includes(qid)) return { s };
      }
      return null;
    };
    const qsOf = (s) => [...new Set([...(s.qs ?? []), ...(s.parts ?? []).flatMap((p) => p.qs ?? [])])];
    const general = Object.keys(questions).filter((id) => !ownerOf(id));
    const named = (x) => `${x.code} ${x.title}`;
    // The parts that get built: those in the chosen option, or every part while nothing is chosen.
    const live = screens.flatMap((s) => { const o = option(s, chosen(s)); return o ? partsIn(s, o) : s.parts ?? []; });
    const count = Object.fromEntries(STATUSES.map((k) => [k, live.filter((p) => statusOf(p) === k).length]));
    const decided = Object.values(questions).filter((q) => q.decided).length;
    const nChosen = screens.filter((s) => chosen(s)).length;
    return { S, screens, questions, parts, byCode, chosen, option, partsIn, ownerOf, qsOf, general, named, live, count, decided, nChosen };
  }

  // Data errors stop a build; warnings are gaps the owner should know about. flowCodes: the step codes of the linked flow map, when the CLI could read it.
  function check(design, pack, flowCodes) {
    const errors = [], warnings = [];
    if (!design || typeof design !== 'object') return { errors: ['window.DESIGN is not set'], warnings };
    if (!design.title) errors.push('title is missing');
    if (!Array.isArray(design.screens) || !design.screens.length) return { errors: [...errors, 'screens is empty'], warnings };
    const M = model(design);
    const ids = new Set(), codes = new Set();
    const code = (where, c) => { if (!c) errors.push(`${where}: code is missing`); else if (codes.has(c)) errors.push(`${where}: code ${c} is used twice`); codes.add(c); };
    const asks = (where, qs) => { for (const q of qs ?? []) if (!M.questions[q]) errors.push(`${where}: question ${q} is not in questions`); };
    for (const s of design.screens) {
      const where = `screen ${s.id}`;
      if (!s.id) { errors.push('a screen has no id'); continue; }
      if (ids.has(s.id)) errors.push(`${where}: id is used twice`);
      ids.add(s.id);
      code(where, s.code);
      if (!s.title) errors.push(`${where}: title is missing`);
      asks(where, s.qs);
      if (s.step && flowCodes && !flowCodes.has(s.step)) errors.push(`${where}: step ${s.step} is not a step code of the flow map`);
      const options = s.options ?? [];
      if (!options.length) { errors.push(`${where}: options is empty`); continue; }
      const oids = new Set(), drawn = new Set();
      for (const o of options) {
        if (!o.id) { errors.push(`${where}: an option has no id`); continue; }
        if (oids.has(o.id)) errors.push(`${where}: option ${o.id} is used twice`);
        oids.add(o.id);
        if (!text(o.html).trim()) errors.push(`${where} option ${o.id}: html is missing`);
        if (/<(script|iframe|object|embed)\b|\son\w+\s*=|javascript:/i.test(text(o.html))) warnings.push(`${where} option ${o.id}: the page removes scripts, frames and event handlers; mockups are static`);
        uiIds(o.html).forEach((id) => drawn.add(id));
      }
      if (s.chosen && !oids.has(s.chosen)) errors.push(`${where}: chosen ${s.chosen} is not one of its options`);
      if (s.chosen && !s.decided) warnings.push(`${where}: chosen ${s.chosen} has no decided (the answer, who and when)`);
      if (s.rec && !oids.has(s.rec.option)) errors.push(`${where}: rec.option ${s.rec.option} is not one of its options`);
      if (options.length > 1 && !s.rec) warnings.push(`${where}: no recommendation (rec) between its options`);
      const pids = new Set();
      for (const p of s.parts ?? []) {
        const pw = `${where} part ${p.id}`;
        if (!p.id) { errors.push(`${where}: a part has no id`); continue; }
        if (pids.has(p.id)) errors.push(`${pw}: id is used twice`);
        pids.add(p.id);
        code(pw, p.code);
        if (!p.title) errors.push(`${pw}: title is missing`);
        if (!STATUSES.includes(statusOf(p))) errors.push(`${pw}: status must be one of ${STATUSES.join(', ')}`);
        if (p.status === 'mock' && !p.statusNote) warnings.push(`${pw}: a mocked part must say what it stands in for and when it is replaced (statusNote)`);
        asks(pw, p.qs);
        // A question's arrow points at this element; a part no option draws leaves the arrow pointing nowhere.
        if (!drawn.has(p.id)) errors.push(`${pw}: no option has an element with data-ui="${p.id}"`);
      }
      for (const id of drawn) if (!pids.has(id)) warnings.push(`${where}: data-ui="${id}" is not one of its parts`);
    }
    for (const [id, q] of Object.entries(M.questions)) {
      if (!q.q) errors.push(`question ${id}: q is missing`);
      if (!q.rec) warnings.push(`question ${id}: no recommendation (rec)`);
    }
    // A removed screen or part's code moves to retired: old change-log lines still resolve, and the code is never handed out again.
    const retired = design.retired ?? [];
    for (const c of retired) if (codes.has(c)) errors.push(`retired code ${c} is still used`);
    for (const day of design.changelog ?? []) for (const it of day.items ?? []) {
      if (!LOG_KINDS.includes(it.kind)) errors.push(`change log ${day.day}: kind ${it.kind} must be one of ${LOG_KINDS.join(', ')}`);
      for (const r of it.refs ?? []) if (!M.byCode[r] && !M.questions[r] && !retired.includes(r)) errors.push(`change log ${day.day}: ref ${r} is not a screen or part code, retired code or question`);
    }
    for (const k of Object.keys({ ...(pack ?? {}), ...(design.strings ?? {}) })) if (!(k in STRINGS)) warnings.push(`strings: unknown key ${k}`);
    return { errors, warnings };
  }

  // A plain-text overview for Claude: what is left to choose, which questions are open on which part, what is not built, what changed last.
  function summary(design, pack, flowCodes) {
    const M = model(design, strings(design, pack));
    const out = [`${design.title}${design.url ? ` · ${design.url}` : ''}`];
    const c = M.count;
    out.push(`Screens: ${M.screens.length} (${M.nChosen} chosen) · UI parts: ${M.live.length} (${c.built} built, ${c.partial} partial, ${c.planned} not built, ${c.mock} mocked) · Questions decided: ${M.decided}/${Object.keys(M.questions).length}${design.asOf ? ` · matches code on ${design.asOf}` : ''}`);
    out.push(`\nScreens:\n${M.screens.map((s) => {
      const opts = (s.options ?? []).map((o) => `${o.id} ${o.name ?? ''}`.trim()).join(', ');
      const state = M.chosen(s) ? `chosen ${M.chosen(s)}` : `to choose: ${opts}${s.rec ? `; recommended ${s.rec.option}: ${s.rec.why ?? ''}` : ''}`;
      return `  ${M.named(s)}${s.step ? ` (flow ${s.step})` : ''} [${state}]`;
    }).join('\n')}`);
    const line = (id) => { const q = M.questions[id]; return `    ${id} ${q.q}\n       recommended: ${q.rec ?? '-'}`; };
    const open = [];
    for (const s of M.screens) {
      const own = (s.qs ?? []).filter((id) => M.questions[id] && !M.questions[id].decided);
      if (own.length) open.push(`  ${M.named(s)}\n${own.map(line).join('\n')}`);
      for (const p of s.parts ?? []) {
        const ids = (p.qs ?? []).filter((id) => M.questions[id] && !M.questions[id].decided);
        if (ids.length) open.push(`  ${M.named(p)}\n${ids.map(line).join('\n')}`);
      }
    }
    const gen = M.general.filter((id) => !M.questions[id].decided);
    if (gen.length) open.push(`  General\n${gen.map(line).join('\n')}`);
    out.push(open.length ? `\nOpen questions:\n${open.join('\n')}` : '\nOpen questions: none');
    const notBuilt = M.live.filter((p) => statusOf(p) !== 'built');
    if (notBuilt.length) out.push(`\nNot built yet:\n${notBuilt.map((p) => `  ${M.named(p)} [${statusOf(p)}]${p.statusNote ? ` - ${p.statusNote}` : ''}`).join('\n')}`);
    const { errors, warnings } = check(design, pack, flowCodes);
    if (errors.length || warnings.length) out.push(`\nProblems:\n${[...errors.map((e) => `  error: ${e}`), ...warnings.map((w) => `  warning: ${w}`)].join('\n')}`);
    const last = design.changelog?.[0];
    if (last) out.push(`\nLatest change (${last.day}):\n${last.items.map((it) => `  [${it.kind}] ${it.text}`).join('\n')}`);
    return out.join('\n');
  }

  root.DesignCore = { STRINGS, STATUSES, LOG_KINDS, strings, fmt, text, uiIds, statusOf, model, check, summary };
})(typeof window !== 'undefined' ? window : globalThis);
