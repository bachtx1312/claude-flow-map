#!/usr/bin/env node
// flow-map CLI for one flow.data.js:
//   node flow.mjs check   <flow.data.js>            errors (exit 1) and warnings
//   node flow.mjs summary <flow.data.js>            plain-text overview: open questions, what is not built, scenarios, the last change
//   node flow.mjs build   <flow.data.js> <outDir>   check, then write <outDir>/index.html to publish, flow.data.js to publish beside it, preview.html to open locally
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(f, 'utf8');

// core.js is our own browser script that writes to window; run it in a context of its own.
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(read(path.join(here, 'core.js')), ctx, { filename: 'core.js' });
const { FlowCore } = ctx.window;
export { FlowCore };

// flow.data.js is parsed, never run: it may come from someone else's artifact. Shape: comment lines, then `window.FLOW =` and strict JSON.
export function loadFlow(file) {
  const src = read(file);
  const m = /window\.FLOW\s*=/.exec(src);
  if (!m || src.slice(0, m.index).split('\n').some((l) => l.trim() && !l.trim().startsWith('//'))) throw new Error(`${file}: expected only // comment lines, then window.FLOW = {…}`);
  try { return JSON.parse(src.slice(m.index + m[0].length).trim().replace(/;$/, '')); }
  catch (e) { throw new Error(`${file}: the part after window.FLOW = is not strict JSON (${e.message})`); }
}

// Labels: the bundled pack, then a project pack in strings/ beside the data file or one folder up; later keys win.
export function loadPack(lang, dataFile) {
  if (!lang || lang === 'en') return null;
  const dirs = [here, ...(dataFile ? [path.dirname(path.dirname(path.resolve(dataFile))), path.dirname(path.resolve(dataFile))] : [])];
  const packs = dirs.map((d) => path.join(d, 'strings', `${lang}.json`)).filter((f) => fs.existsSync(f)).map((f) => JSON.parse(read(f)));
  return packs.length ? Object.assign({}, ...packs) : null;
}

function report({ errors, warnings }) {
  for (const e of errors) console.error(`error: ${e}`);
  for (const w of warnings) console.error(`warning: ${w}`);
  console.error(`${errors.length} errors, ${warnings.length} warnings`);
}

function build(file, out) {
  const flow = loadFlow(file), pack = loadPack(flow?.lang, file);
  const result = FlowCore.check(flow, pack);
  report(result);
  if (result.errors.length) process.exit(1);
  const noMarkup = (s) => String(s).replace(/[<&"]/g, '');
  const packJs = pack ? `window.FLOW_STRINGS = ${JSON.stringify(pack).replace(/</g, '\\u003c')};\n` : '';
  const scripts = `<script>\n${packJs}${read(path.join(here, 'core.js'))}\n${read(path.join(here, 'render.js'))}\n</script>\n`;
  // Function replacements: the scripts contain "$1", which a replacement string would expand.
  const page = read(path.join(here, 'page.html')).replace('{{TITLE}}', () => noMarkup(flow.title)).replace('{{SCRIPTS}}', () => scripts);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), page);
  if (path.resolve(file) !== path.resolve(out, 'flow.data.js')) fs.copyFileSync(file, path.join(out, 'flow.data.js'));
  // The artifact host wraps index.html in a document skeleton; preview.html adds the same skeleton for a local browser.
  fs.writeFileSync(path.join(out, 'preview.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>body{margin:0}</style></head><body>\n${page}</body></html>\n`);
  console.log(`Built ${path.join(out, 'index.html')}
Publish: Artifact file_path ${path.join(out, 'index.html')}, files {"flow.data.js": "${path.join(out, 'flow.data.js')}"}${flow.url ? `, url ${flow.url}` : ''}
Preview: ${path.join(out, 'preview.html')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, file, out] = process.argv.slice(2);
  if (!file || !['check', 'summary', 'build'].includes(cmd) || (cmd === 'build' && !out)) {
    console.error('Usage: flow.mjs check|summary <flow.data.js>  |  flow.mjs build <flow.data.js> <outDir>');
    process.exit(2);
  }
  if (cmd === 'build') build(file, out);
  else {
    const flow = loadFlow(file), pack = loadPack(flow?.lang, file);
    if (cmd === 'summary') console.log(FlowCore.summary(flow, pack));
    else { const r = FlowCore.check(flow, pack); report(r); process.exit(r.errors.length ? 1 : 0); }
  }
}
