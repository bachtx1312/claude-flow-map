import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DesignCore, loadDesign, loadDesignPack, flowCodes } from '../skills/design-map/template/design.mjs';

const T = path.join(path.dirname(fileURLToPath(import.meta.url)), '../skills/design-map/template');
const file = path.join(T, 'design.example.js');
const example = () => loadDesign(file);

test('the example design passes the check against its flow map with nothing to warn about', () => {
  const { errors, warnings } = DesignCore.check(example(), null, flowCodes(example(), file));
  assert.deepEqual([...errors, ...warnings], []);
});

test('the check names broken links: a part no option draws, an unknown option, a flow step that does not exist, an unknown change-log code', () => {
  const d = example();
  d.screens[0].parts.push({ id: 'bulk', code: 'M1.6', title: 'Bulk approve', qs: ['U4'] });
  d.screens[0].chosen = 'C';
  d.screens[1].step = 'N99';
  d.changelog[0].items.push({ kind: 'code', text: 'x', refs: ['M9'] });
  const { errors } = DesignCore.check(d, null, flowCodes(d, file));
  assert.ok(errors.some((e) => e.includes('part bulk: no option has an element with data-ui="bulk"')));
  assert.ok(errors.some((e) => e.includes('chosen C is not one of its options')));
  assert.ok(errors.some((e) => e.includes('step N99 is not a step code of the flow map')));
  assert.ok(errors.some((e) => e.includes('ref M9')));
});

test('a screen with one option counts as chosen, and only the chosen option\'s parts count as work to build', () => {
  const d = example();
  let M = DesignCore.model(d);
  assert.equal(M.chosen(d.screens[1]), 'A');
  assert.equal(M.live.length, 8, 'nothing chosen on M1: every part counts');
  d.screens[0].chosen = 'B';
  d.screens[0].decided = 'B (Mai, 23/10/2026)';
  M = DesignCore.model(d);
  assert.deepEqual(M.live.filter((p) => d.screens[0].parts.includes(p)).map((p) => p.code), ['M1.2', 'M1.3', 'M1.4', 'M1.5'], 'B has no queue');
});

test('the summary lists what is left to choose and open questions under their part, and skips decided ones', () => {
  const text = DesignCore.summary(example());
  assert.match(text, /M1 Agent reviews a refund \(flow N5\) \[to choose: A Queue beside the request, B One request at a time; recommended A/);
  assert.match(text, /M1\.3 AI risk flag\n\s+U1 /);
  assert.doesNotMatch(text, /U5 Photo tiles/);
  assert.match(text, /General\n\s+G1 /);
});

test('mockups that try to run code get a warning; the page strips it', () => {
  const d = example();
  d.screens[1].options[0].html.push("<img src='x' onerror='alert(1)'>");
  assert.ok(DesignCore.check(d).warnings.some((w) => w.includes('mockups are static')));
});

test('the Vietnamese pack translates every label and only labels the page knows', () => {
  const vi = loadDesignPack('vi');
  assert.deepEqual(Object.keys(vi).filter((k) => !(k in DesignCore.STRINGS)), []);
  assert.deepEqual(Object.keys(DesignCore.STRINGS).filter((k) => !(k in vi)), []);
});

test('a build gives a page with its title, the scripts intact and the data beside it', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'design-map-'));
  execFileSync(process.execPath, [path.join(T, 'design.mjs'), 'build', file, out], { stdio: 'pipe' });
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(html.slice(0, 200), /<title>Refund screens<\/title>/);
  assert.doesNotMatch(html, /\{\{(TITLE|SCRIPTS)\}\}/);
  assert.ok(html.includes("'<code>$1</code>'"), 'replacement patterns in render.js survive the build');
  assert.ok(fs.existsSync(path.join(out, 'design.data.js')) && fs.existsSync(path.join(out, 'preview.html')));
});

test('a design data file that holds code instead of JSON is refused, not run', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-map-')), f = path.join(dir, 'design.data.js');
  fs.writeFileSync(f, 'window.DESIGN = (() => { globalThis.ran = true; return {}; })();\n');
  assert.throws(() => loadDesign(f), /window\.DESIGN = is not strict JSON/);
  assert.equal(globalThis.ran, undefined);
});
