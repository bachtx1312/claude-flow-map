// Pure flow-map logic shared by the page (render.js) and the CLI (flow.mjs): labels, lookups, derived state and the data checks.
// No DOM here, so the CLI and the tests run it in Node.
(function (root) {
  // English is the base language; a pack in strings/<lang>.json or FLOW.strings overrides any key.
  const STRINGS = {
    kind_ai: 'AI', kind_code: 'CODE', kind_pause: 'WAIT', kind_step: 'CHECK',
    status_built: 'BUILT', status_partial: 'PARTIAL', status_planned: 'NOT BUILT', status_mock: 'MOCKED',
    page_nav: 'Pages', page_flow: 'Flow', page_log: 'Change log',
    fact_steps: '**{n}** steps: **{built}** built, **{partial}** partial, **{planned}** not built, **{mock}** mocked',
    fact_scen: '**{n}** test scenarios',
    fact_q: '**{d}** / **{n}** questions decided',
    fact_asof: 'matches the code on **{date}**',
    done_title: 'When the flow is done', progress: 'Progress',
    meter_steps: 'Steps built or mocked', meter_scen: 'Scenarios checked',
    uncovered: 'Branches with no scenario: {list}', broken: 'Scenarios that jump between unconnected steps: {list}',
    graph_title: 'State graph',
    graph_region: 'State graph; select a step to see its details',
    legend_ai: 'AI (billed per call)', legend_code: 'Code', legend_pause: 'Waits for a person', legend_planned: 'Not built', legend_mock: 'Mocked',
    legend_covered: 'All questions decided', legend_always: 'always goes on', legend_cond: 'conditional', legend_plan: 'branch not built', legend_reviewed: 'code reviewed',
    find_ph: 'Find: N4, A1', find_label: 'Find a step or question by its code',
    find_none: 'No {code}', find_general: '{code} is a general question', find_at: '{code} is at {where}',
    view_label: 'View', view_map: 'Whole flow', view_step: 'Step by step', fade: 'Fade what is built', full: 'Full screen',
    zoom_label: 'Zoom', zoom_in: 'Zoom in', zoom_out: 'Zoom out', zoom_reset: 'Actual size', zoom_fit: 'Fit', zoom_hint: 'Drag to move; Ctrl or ⌘ and scroll to zoom',
    scen_title: 'Test scenarios',
    scen_sub: 'Each scenario is a path through the branches. Select one to highlight it on the graph. Its state comes from the steps on its path: a path through a step that is not built cannot be checked yet.',
    q_title: 'Questions to decide',
    q_sub: 'In flow order. Answer by code, for example "A1 agreed, B3 filter by resolution". Every question carries a recommendation.',
    q_filter: 'Filter questions', q_open: 'Open', q_decided: 'Decided', q_all: 'All', q_general: 'General',
    q_rec: 'Recommended: ', q_dec: 'Decided: ', q_needs: 'to decide: {list}',
    ins_open: 'For {owner} to decide', ins_open_anon: 'To decide', ins_decided: 'Decided',
    ins_where: 'Where: {screen}',
    ai_read: '1 · READS STATE', ai_prompt: '2 · PROMPT', ai_model: '3 · MODEL', ai_output: '4 · CHECKS OUTPUT', ai_write: '5 · WRITES STATE',
    step_q: 'CHECK', step_in: 'INPUTS', step_parent: 'PART OF',
    code_read: 'READS STATE', code_checks: 'CHECKS, IN ORDER', code_does: 'RULES IN CODE', code_write: 'WRITES STATE',
    pause_who: 'WAITS FOR', pause_options: 'WHAT THE PERSON DOES', pause_resume: 'GOES ON WHEN', pause_write: 'WRITES STATE',
    terminal_what: 'WHAT IT IS',
    next: 'Goes to', from: 'Comes from', if: 'if {label}', always: 'always',
    hint: 'Select another step on the graph, or a branch above, to go on.',
    inputs: 'Inputs: {list}', group_rule: '{code} · stops at the first check that leads out',
    covered_aria: ', all questions decided',
    scen_how: 'HOW TO CHECK', scen_path: 'PATH', scen_hint: 'Select a step on the graph to see inside it.',
    sc_blocked: 'CAN’T CHECK YET', sc_blocked_q: 'Waits for the code of {code}', sc_blocked_by: 'Waits for: {list}',
    sc_checked: 'CHECKED', sc_checked_on: 'Checked on {date}',
    sc_partly: 'PARTLY CHECKABLE', sc_partly_text: 'Partly built: {list}',
    sc_unchecked: 'NOT CHECKED', sc_unchecked_text: 'Every step on the path is built; not checked yet',
    log_title: 'Change log',
    log_lead: 'Every decision, code change, review or deploy of part of the flow. Newest first; select a code to open it on the graph.',
    log_decide: 'DECISION', log_code: 'CODE', log_review: 'REVIEW', log_deploy: 'DEPLOY', log_map: 'MAP',
    err_layout: 'The graph could not be laid out. Reload the page to try again.',
    err_elk: 'The graph library did not load. Reload the page to try again.',
  };
  const KINDS = ['ai', 'code', 'pause', 'terminal'];
  const STATUSES = ['built', 'partial', 'planned', 'mock'];
  const LOG_KINDS = ['decide', 'code', 'review', 'deploy', 'map'];

  const strings = (flow, pack) => ({ ...STRINGS, ...(pack ?? {}), ...(flow.strings ?? {}) });
  const fmt = (s, vars = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

  // Everything the page and the CLI derive from the data, so both count the same way.
  function model(flow, S = strings(flow)) {
    const nodes = flow.nodes ?? [];
    const steps = nodes.flatMap((n) => (n.steps ?? []).map((st) => ({ ...st, kind: 'step', parent: n.id, title: st.q })));
    const byId = Object.fromEntries([...nodes, ...steps].map((n) => [n.id, n]));
    const byCode = Object.fromEntries([...nodes, ...steps].filter((n) => n.code).map((n) => [n.code, n.id]));
    const questions = flow.questions ?? {};
    const scenarios = flow.scenarios ?? [];
    const edges = (flow.edges ?? []).map(([from, to, label, opts], i) => ({ i, from, to, label: label || '', plan: Boolean(opts?.plan), reviewed: opts?.reviewed ?? null }));

    const openQs = (ids = []) => ids.filter((id) => !questions[id]?.decided);
    // A node's questions include its steps'; a question sits on the step it decides.
    const allQs = (id) => { const n = byId[id]; return [...new Set([...(n?.qs ?? []), ...(n?.steps ?? []).flatMap((st) => st.qs ?? [])])]; };
    const covered = (id) => { const qs = allQs(id); return qs.length > 0 && !openQs(qs).length; };
    const planned = (id) => byId[id]?.status === 'planned';
    const isPlan = (e) => e.plan || planned(e.from) || planned(e.to);
    const named = (id) => { const n = byId[id]; return n?.code ? `${n.code} ${n.title}` : n?.title ?? id; };
    const codeOf = (id) => byId[id]?.code ?? byId[id]?.title ?? id;
    const ownerOf = (qid) => (steps.find((st) => st.qs?.includes(qid)) ?? nodes.find((n) => n.qs?.includes(qid)))?.id ?? null;
    const general = Object.keys(questions).filter((id) => !ownerOf(id));
    const pairs = (sc) => sc.path.slice(1).map((b, i) => [sc.path[i], b]);
    const hasEdge = (a, b) => edges.some((e) => e.from === a && e.to === b);

    // Order matters: a missing step blocks the check even if someone ticked it before.
    function scenarioStatus(sc) {
      const ids = [...new Set(sc.path)].filter((id) => byId[id] && byId[id].kind !== 'terminal');
      const blockers = ids.filter(planned);
      const partial = ids.filter((id) => byId[id].status === 'partial');
      if (sc.blockedBy) return { k: 'blocked', label: S.sc_blocked, text: fmt(S.sc_blocked_q, { code: sc.blockedBy }) };
      if (blockers.length) return { k: 'blocked', label: S.sc_blocked, text: fmt(S.sc_blocked_by, { list: blockers.map(named).join(', ') }) };
      if (sc.checked) return { k: 'checked', label: S.sc_checked, text: fmt(S.sc_checked_on, { date: sc.checked }) };
      if (partial.length) return { k: 'partly', label: S.sc_partly, text: fmt(S.sc_partly_text, { list: partial.map(named).join(', ') }) };
      return { k: 'unchecked', label: S.sc_unchecked, text: S.sc_unchecked_text };
    }

    const real = nodes.filter((n) => n.kind !== 'terminal');
    const count = Object.fromEntries(STATUSES.map((s) => [s, real.filter((n) => n.status === s).length]));
    const walked = new Set(scenarios.flatMap((sc) => pairs(sc).map(([a, b]) => `${a}>${b}`)));
    const uncovered = edges.filter((e) => !walked.has(`${e.from}>${e.to}`));
    const broken = scenarios.flatMap((sc) => pairs(sc).filter(([a, b]) => !hasEdge(a, b)).map(([a, b]) => ({ sc: sc.id, a, b })));
    const decided = Object.values(questions).filter((q) => q.decided).length;
    const checked = scenarios.filter((sc) => scenarioStatus(sc).k === 'checked').length;

    return { S, nodes, steps, byId, byCode, questions, scenarios, edges, openQs, allQs, covered, planned, isPlan, named, codeOf, ownerOf, general, pairs, scenarioStatus, real, count, uncovered, broken, decided, checked };
  }

  // Data errors stop a build; warnings are gaps the owner should know about.
  function check(flow, pack) {
    const errors = [], warnings = [];
    if (!flow || typeof flow !== 'object') return { errors: ['window.FLOW is not set'], warnings };
    if (!flow.title) errors.push('title is missing');
    if (!Array.isArray(flow.nodes) || !flow.nodes.length) return { errors: [...errors, 'nodes is empty'], warnings };
    const M = model(flow);
    const seen = new Set(), codes = new Set();
    for (const n of [...flow.nodes, ...M.steps]) {
      const where = n.parent ? `step ${n.id} of ${n.parent}` : `node ${n.id}`;
      if (!n.id) { errors.push(`a ${n.parent ? 'step' : 'node'} has no id`); continue; }
      if (seen.has(n.id)) errors.push(`${where}: id is used twice`);
      seen.add(n.id);
      if (!n.parent && !KINDS.includes(n.kind)) errors.push(`${where}: kind must be one of ${KINDS.join(', ')}`);
      if (n.kind !== 'terminal' && !STATUSES.includes(n.status)) errors.push(`${where}: status must be one of ${STATUSES.join(', ')}`);
      if (n.kind !== 'terminal' && !n.code) errors.push(`${where}: code is missing`);
      if (n.code && codes.has(n.code)) errors.push(`${where}: code ${n.code} is used twice`);
      if (n.code) codes.add(n.code);
      if (!n.title) errors.push(`${where}: ${n.parent ? 'q' : 'title'} is missing`);
      for (const q of n.qs ?? []) if (!M.questions[q]) errors.push(`${where}: question ${q} is not in questions`);
      if (n.status === 'mock' && !n.statusNote) warnings.push(`${where}: a mocked step must say what it stands in for and when it is replaced (statusNote)`);
    }
    for (const e of M.edges) {
      for (const end of [e.from, e.to]) if (!M.byId[end]) errors.push(`edge ${e.i} (${e.from} -> ${e.to}): ${end} is not a node or step`);
    }
    for (const [id, q] of Object.entries(M.questions)) {
      if (!q.q) errors.push(`question ${id}: q is missing`);
      if (!q.rec) warnings.push(`question ${id}: no recommendation (rec)`);
    }
    const sids = new Set();
    for (const sc of M.scenarios) {
      if (sids.has(sc.id)) errors.push(`scenario ${sc.id}: id is used twice`);
      sids.add(sc.id);
      for (const id of sc.path ?? []) if (!M.byId[id]) errors.push(`scenario ${sc.id}: ${id} is not a node or step`);
    }
    for (const b of M.broken) if (M.byId[b.a] && M.byId[b.b]) errors.push(`scenario ${b.sc}: no edge from ${b.a} to ${b.b}`);
    // A removed step's code moves to retired: old change-log lines still resolve, and the code is never handed out again.
    const retired = flow.retired ?? [];
    for (const c of retired) if (codes.has(c)) errors.push(`retired code ${c} is still used by a step`);
    for (const day of flow.changelog ?? []) for (const it of day.items ?? []) {
      if (!LOG_KINDS.includes(it.kind)) errors.push(`change log ${day.day}: kind ${it.kind} must be one of ${LOG_KINDS.join(', ')}`);
      for (const r of it.refs ?? []) if (!M.byCode[r] && !M.questions[r] && !retired.includes(r)) errors.push(`change log ${day.day}: ref ${r} is not a step code, retired code or question`);
    }
    if (flow.start && !M.byId[flow.start]) errors.push(`start ${flow.start} is not a node or step`);
    for (const k of Object.keys({ ...(pack ?? {}), ...(flow.strings ?? {}) })) if (!(k in STRINGS)) warnings.push(`strings: unknown key ${k}`);
    for (const e of M.uncovered) warnings.push(`branch ${M.codeOf(e.from)} -> ${M.codeOf(e.to)}${e.label ? ` (${e.label})` : ''} has no scenario`);
    return { errors, warnings };
  }

  // A plain-text overview for Claude: what is open, what blocks which scenario, what changed last.
  function summary(flow, pack) {
    const M = model(flow, strings(flow, pack));
    const out = [`${flow.title}${flow.url ? ` · ${flow.url}` : ''}`];
    const c = M.count;
    out.push(`Steps: ${M.real.length} (${c.built} built, ${c.partial} partial, ${c.planned} not built, ${c.mock} mocked) · Scenarios checked: ${M.checked}/${M.scenarios.length} · Questions decided: ${M.decided}/${Object.keys(M.questions).length}${flow.asOf ? ` · matches code on ${flow.asOf}` : ''}`);
    const line = (id) => { const q = M.questions[id]; return `    ${id} ${q.q}\n       recommended: ${q.rec ?? '-'}`; };
    const open = [], seen = new Set();
    for (const n of M.nodes) {
      const ids = M.openQs(M.allQs(n.id)).filter((id) => !seen.has(id));
      ids.forEach((id) => seen.add(id));
      if (ids.length) open.push(`  ${M.named(n.id)}\n${ids.map(line).join('\n')}`);
    }
    const gen = M.openQs(M.general);
    if (gen.length) open.push(`  General\n${gen.map(line).join('\n')}`);
    out.push(open.length ? `\nOpen questions:\n${open.join('\n')}` : '\nOpen questions: none');
    const notBuilt = [...M.nodes, ...M.steps].filter((n) => n.status && n.status !== 'built');
    if (notBuilt.length) out.push(`\nNot built yet:\n${notBuilt.map((n) => `  ${M.named(n.id)} [${n.status}]${n.statusNote ? ` - ${n.statusNote}` : ''}`).join('\n')}`);
    out.push(`\nScenarios:\n${M.scenarios.map((sc) => { const st = M.scenarioStatus(sc); return `  ${sc.id} ${sc.name} [${st.k}] ${st.text}`; }).join('\n')}`);
    const { errors, warnings } = check(flow, pack);
    if (errors.length || warnings.length) out.push(`\nProblems:\n${[...errors.map((e) => `  error: ${e}`), ...warnings.map((w) => `  warning: ${w}`)].join('\n')}`);
    const last = flow.changelog?.[0];
    if (last) out.push(`\nLatest change (${last.day}):\n${last.items.map((it) => `  [${it.kind}] ${it.text}`).join('\n')}`);
    return out.join('\n');
  }

  root.FlowCore = { STRINGS, KINDS, STATUSES, LOG_KINDS, strings, fmt, model, check, summary };
})(typeof window !== 'undefined' ? window : globalThis);
