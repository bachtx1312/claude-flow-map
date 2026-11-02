#!/usr/bin/env node
// flow-map CLI for one flow.data.js:
//   node flow.mjs check   <flow.data.js>            errors (exit 1) and warnings
//   node flow.mjs summary <flow.data.js>            plain-text overview: open questions, what is not built, scenarios, the last change
//   node flow.mjs build   <flow.data.js> <outDir>   check, then write <outDir>/index.html to publish, flow.data.js to publish beside it, preview.html to open locally
//   node flow.mjs translations <flow.data.js> <lang>  the texts <lang> has no translation for, as JSON to fill in and merge into translations.<lang>
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(f, 'utf8');

// core.js and i18n.js are our own browser scripts that write to window; run them in a context of their own.
const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ['i18n.js', 'core.js']) vm.runInContext(read(path.join(here, f)), ctx, { filename: f });
const { FlowCore, I18n } = ctx.window;
export { FlowCore, I18n };
export const I18N_JS = path.join(here, 'i18n.js');

// flow.data.js is parsed, never run: it may come from someone else's artifact. Shape: comment lines, then `window.FLOW =` and strict JSON.
// The design-map skill reads its design.data.js (`window.DESIGN =`) the same way.
export function loadFlow(file, name = 'FLOW') {
  const src = read(file);
  const m = new RegExp(`window\\.${name}\\s*=`).exec(src);
  if (!m || src.slice(0, m.index).split('\n').some((l) => l.trim() && !l.trim().startsWith('//'))) throw new Error(`${file}: expected only // comment lines, then window.${name} = {…}`);
  try { return JSON.parse(src.slice(m.index + m[0].length).trim().replace(/;$/, '')); }
  catch (e) { throw new Error(`${file}: the part after window.${name} = is not strict JSON (${e.message})`); }
}

// Labels: the bundled pack (in `bundled`/strings), then a project pack in strings/ beside the data file or one folder up; later keys win.
export function loadPack(lang, dataFile, bundled = here) {
  if (!lang || lang === 'en') return null;
  const dirs = [bundled, ...(dataFile ? [path.dirname(path.dirname(path.resolve(dataFile))), path.dirname(path.resolve(dataFile))] : [])];
  const packs = dirs.map((d) => path.join(d, 'strings', `${lang}.json`)).filter((f) => fs.existsSync(f)).map((f) => JSON.parse(read(f)));
  return packs.length ? Object.assign({}, ...packs) : null;
}

// One label pack per language of the content: the source `lang`, then each language in `translations`.
export const loadPacks = (data, dataFile, bundled = here) => Object.fromEntries(I18n.langs(data).map((l) => [l, loadPack(l, dataFile, bundled)]));

// The check once per language, since each has its own label pack; a problem found in several languages is reported once. design-map uses it too.
export function checkLangs(data, packs, check) {
  const all = I18n.langs(data).map((l) => check(I18n.localize(data, l), packs[l]));
  const nopack = I18n.langs(data).filter((l) => l !== 'en' && !packs[l]).map((l) => `language ${l}: no label pack (strings/${l}.json), so its labels show in English`);
  return { errors: [...new Set(all.flatMap((r) => r.errors))], warnings: [...new Set([...all.flatMap((r) => r.warnings), ...nopack, ...I18n.gaps(data)])] };
}

// The translations command: what is left to translate, as a JSON object of source text to "".
export function untranslated(data, lang) {
  if (lang === (data?.lang ?? 'en')) throw new Error(`${lang} is the source language; translations are for the others`);
  return JSON.stringify(Object.fromEntries(I18n.missing(data, lang).map((s) => [s, ''])), null, 2);
}

function report({ errors, warnings }) {
  for (const e of errors) console.error(`error: ${e}`);
  for (const w of warnings) console.error(`warning: ${w}`);
  console.error(`${errors.length} errors, ${warnings.length} warnings`);
}

function build(file, out) {
  const flow = loadFlow(file), packs = loadPacks(flow, file);
  const result = checkLangs(flow, packs, FlowCore.check);
  report(result);
  if (result.errors.length) process.exit(1);
  const noMarkup = (s) => String(s).replace(/[<&"]/g, '');
  const packJs = `window.FLOW_STRINGS = ${JSON.stringify(packs).replace(/</g, '\\u003c')};\n`;
  const scripts = `<script>\n${packJs}${read(I18N_JS)}\n${read(path.join(here, 'core.js'))}\n${read(path.join(here, 'render.js'))}\n</script>\n`;
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
  if (!file || !['check', 'summary', 'build', 'translations'].includes(cmd) || (['build', 'translations'].includes(cmd) && !out)) {
    console.error('Usage: flow.mjs check|summary <flow.data.js>  |  flow.mjs build <flow.data.js> <outDir>  |  flow.mjs translations <flow.data.js> <lang>');
    process.exit(2);
  }
  if (cmd === 'build') build(file, out);
  else {
    const flow = loadFlow(file), packs = loadPacks(flow, file);
    if (cmd === 'summary') console.log([FlowCore.summary(flow, packs[I18n.langs(flow)[0]]), ...I18n.gaps(flow).map((g) => `  warning: ${g}`)].join('\n'));
    else if (cmd === 'translations') console.log(untranslated(flow, out));
    else { const r = checkLangs(flow, packs, FlowCore.check); report(r); process.exit(r.errors.length ? 1 : 0); }
  }
}
