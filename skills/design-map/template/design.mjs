#!/usr/bin/env node
// design-map CLI for one design.data.js:
//   node design.mjs check   <design.data.js>            errors (exit 1) and warnings
//   node design.mjs summary <design.data.js>            plain-text overview: what is left to choose, open questions by part, what is not built, the last change
//   node design.mjs build   <design.data.js> <outDir>   check, then write <outDir>/index.html to publish, design.data.js to publish beside it, preview.html to open locally
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { FlowCore, loadFlow, loadPack } from '../../flow-map/template/flow.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(f, 'utf8');

// core.js is our own browser script that writes to window; run it in a context of its own.
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(read(path.join(here, 'core.js')), ctx, { filename: 'core.js' });
const { DesignCore } = ctx.window;
export { DesignCore };

// Parsed like flow.data.js, never run.
export const loadDesign = (file) => loadFlow(file, 'DESIGN');
export const loadDesignPack = (lang, dataFile) => loadPack(lang, dataFile, here);

// The step codes of the linked flow map, so `step: "N2"` can be checked; null when no flow file is linked.
export function flowCodes(design, file) {
  const rel = design?.flowMap?.file;
  if (!rel) return null;
  const f = path.resolve(path.dirname(file), rel);
  if (!fs.existsSync(f)) throw new Error(`${file}: flowMap.file ${rel} does not exist`);
  return new Set(Object.keys(FlowCore.model(loadFlow(f)).byCode));
}

function report({ errors, warnings }) {
  for (const e of errors) console.error(`error: ${e}`);
  for (const w of warnings) console.error(`warning: ${w}`);
  console.error(`${errors.length} errors, ${warnings.length} warnings`);
}

function build(file, out) {
  const design = loadDesign(file), pack = loadDesignPack(design?.lang, file);
  const result = DesignCore.check(design, pack, flowCodes(design, file));
  report(result);
  if (result.errors.length) process.exit(1);
  const noMarkup = (s) => String(s).replace(/[<&"]/g, '');
  const packJs = pack ? `window.DESIGN_STRINGS = ${JSON.stringify(pack).replace(/</g, '\\u003c')};\n` : '';
  const scripts = `<script>\n${packJs}${read(path.join(here, 'core.js'))}\n${read(path.join(here, 'render.js'))}\n</script>\n`;
  // Function replacements: the scripts contain "$1", which a replacement string would expand.
  const page = read(path.join(here, 'page.html')).replace('{{TITLE}}', () => noMarkup(design.title)).replace('{{SCRIPTS}}', () => scripts);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), page);
  if (path.resolve(file) !== path.resolve(out, 'design.data.js')) fs.copyFileSync(file, path.join(out, 'design.data.js'));
  // The artifact host wraps index.html in a document skeleton; preview.html adds the same skeleton for a local browser.
  fs.writeFileSync(path.join(out, 'preview.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>body{margin:0}</style></head><body>\n${page}</body></html>\n`);
  console.log(`Built ${path.join(out, 'index.html')}
Publish: Artifact file_path ${path.join(out, 'index.html')}, files {"design.data.js": "${path.join(out, 'design.data.js')}"}${design.url ? `, url ${design.url}` : ''}
Preview: ${path.join(out, 'preview.html')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, file, out] = process.argv.slice(2);
  if (!file || !['check', 'summary', 'build'].includes(cmd) || (cmd === 'build' && !out)) {
    console.error('Usage: design.mjs check|summary <design.data.js>  |  design.mjs build <design.data.js> <outDir>');
    process.exit(2);
  }
  if (cmd === 'build') build(file, out);
  else {
    const design = loadDesign(file), pack = loadDesignPack(design?.lang, file), codes = flowCodes(design, file);
    if (cmd === 'summary') console.log(DesignCore.summary(design, pack, codes));
    else { const r = DesignCore.check(design, pack, codes); report(r); process.exit(r.errors.length ? 1 : 0); }
  }
}
