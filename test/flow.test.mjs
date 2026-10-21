import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FlowCore, loadFlow, loadPack } from '../skills/flow-map/template/flow.mjs';

const T = path.join(path.dirname(fileURLToPath(import.meta.url)), '../skills/flow-map/template');
const example = () => loadFlow(path.join(T, 'flow.example.js'));

test('the example flow passes the check with nothing to warn about', () => {
  const { errors, warnings } = FlowCore.check(example());
  assert.deepEqual([...errors, ...warnings], []);
});

test('a scenario through a step that is not built cannot be checked yet, whatever it claims', () => {
  const flow = example();
  flow.scenarios.find((sc) => sc.id === 'S5').checked = '21/10/2026';
  const M = FlowCore.model(flow);
  assert.equal(M.scenarioStatus(flow.scenarios.find((sc) => sc.id === 'S5')).k, 'blocked');
  assert.equal(M.scenarioStatus(flow.scenarios.find((sc) => sc.id === 'S1')).k, 'checked');
});

test('the check names broken links: a missing step, a scenario that jumps, an unknown change-log code, a branch no scenario walks', () => {
  const flow = example();
  flow.edges.push(['notify', 'archive']);
  flow.scenarios.push({ id: 'S9', name: 'Jump', path: ['co_owner', 'notify'], how: '-' });
  flow.changelog[0].items.push({ kind: 'code', text: 'x', refs: ['N99'] });
  flow.edges.push(['request_form', '__end__', 'Cancel']);
  const { errors, warnings } = FlowCore.check(flow);
  assert.ok(errors.some((e) => e.includes('archive is not a node')));
  assert.ok(errors.some((e) => e.includes('scenario S9: no edge from co_owner to notify')));
  assert.ok(errors.some((e) => e.includes('ref N99')));
  assert.ok(warnings.some((w) => w.includes('N2 -> Done (Cancel) has no scenario')));
});

test('the summary lists open questions under their step and skips decided ones', () => {
  const text = FlowCore.summary(example());
  assert.match(text, /N4 Approve small low-risk refunds\n\s+R2 /);
  assert.doesNotMatch(text, /R1 How long/);
  assert.match(text, /General\n\s+G1 /);
});

test('the Vietnamese pack only uses label keys the page knows', () => {
  assert.deepEqual(Object.keys(loadPack('vi')).filter((k) => !(k in FlowCore.STRINGS)), []);
  assert.deepEqual(Object.keys(FlowCore.STRINGS).filter((k) => !(k in loadPack('vi'))), [], 'every label is translated');
});

test('a build gives a page with its title, the scripts intact and the data beside it', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-map-'));
  execFileSync(process.execPath, [path.join(T, 'flow.mjs'), 'build', path.join(T, 'flow.example.js'), out], { stdio: 'pipe' });
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(html.slice(0, 200), /<title>Refund request flow<\/title>/);
  assert.doesNotMatch(html, /\{\{(TITLE|SCRIPTS)\}\}/);
  assert.ok(html.includes("'<code>$1</code>'"), 'replacement patterns in render.js survive the build');
  assert.ok(fs.existsSync(path.join(out, 'flow.data.js')) && fs.existsSync(path.join(out, 'preview.html')));
});

const tmpFile = (name, text) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-map-')); const f = path.join(dir, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };

test('a data file that holds code instead of JSON is refused, not run', () => {
  const f = tmpFile('flow.data.js', 'window.FLOW = (() => { globalThis.ran = true; return {}; })();\n');
  assert.throws(() => loadFlow(f), /not strict JSON/);
  assert.equal(globalThis.ran, undefined);
  assert.throws(() => loadFlow(tmpFile('flow.data.js', 'globalThis.ran = true;\nwindow.FLOW = {};\n')), /only \/\/ comment lines/);
});

test('a project language pack beside the data overrides the bundled one', () => {
  const f = tmpFile('flows/refund/flow.data.js', 'window.FLOW = {};\n');
  fs.mkdirSync(path.join(path.dirname(f), 'strings'));
  fs.writeFileSync(path.join(path.dirname(f), 'strings', 'vi.json'), JSON.stringify({ q_title: 'Việc cần chốt' }));
  const pack = loadPack('vi', f);
  assert.equal(pack.q_title, 'Việc cần chốt');
  assert.equal(pack.page_flow, 'Luồng', 'labels the project pack leaves out still come from the bundled pack');
});

test('a removed step keeps its old change-log lines valid, and its code cannot be reused', () => {
  const flow = example();
  flow.changelog[0].items.push({ kind: 'map', text: 'Removed N8', refs: ['N8'] });
  flow.retired = ['N8'];
  assert.deepEqual([...FlowCore.check(flow).errors], []);
  flow.retired = ['N7'];
  assert.ok(FlowCore.check(flow).errors.some((e) => e.includes('retired code N7 is still used')));
});
