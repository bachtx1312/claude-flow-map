// Content in several languages, shared by flow-map and design-map (page and CLI).
// The data is written once, in `lang`. `translations` maps each other language's texts by their source text:
// {"en": {"Kiểm tra đơn hàng": "Check the order"}}. A question keeps one id and one answer; only its words are translated.
(function (root) {
  // Values that are ids, codes, dates, links, code paths, product screen names or mockup markup: never translated.
  const SKIP = new Set(['id', 'code', 'kind', 'status', 'url', 'lang', 'start', 'asOf', 'refs', 'retired', 'blockedBy', 'checked', 'reviewed', 'day', 'qs', 'path',
    'where', 'screen', 'owner', 'html', 'css', 'fonts', 'file', 'option', 'chosen', 'step', 'width', 'strings', 'translations']);
  const langs = (data) => [data?.lang ?? 'en', ...Object.keys(data?.translations ?? {})];

  // Calls fn(text, where) on every translatable text and returns the data with each text replaced by fn's result.
  // Edges are [from, to, label, opts]: only the label is text.
  function mapTexts(data, fn) {
    const walk = (v, at, key) => {
      if (typeof v === 'string') return /\p{L}/u.test(v) && !/^https?:\/\//.test(v) ? fn(v, at) : v;
      if (Array.isArray(v)) return v.map((x, i) => (key === 'edges' && Array.isArray(x) ? x.map((y, j) => (j === 2 ? walk(y, `${at}[${i}][2]`) : y)) : walk(x, `${at}[${i}]`, key)));
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SKIP.has(k) ? x : walk(x, at ? `${at}.${k}` : k, k)]));
      return v;
    };
    return walk(data, '', '');
  }

  // The data as one language sees it. A text with no translation shows in the source language; one-off label overrides belong to the source language.
  function localize(data, lang) {
    const dict = data?.translations?.[lang];
    if (!dict) return data;
    return { ...mapTexts(data, (s) => dict[s] ?? s), strings: {}, lang };
  }

  // Source texts that `lang` has no translation for, once each, in data order.
  function missing(data, lang) {
    const dict = data?.translations?.[lang] ?? {}, out = new Set();
    mapTexts(data, (s) => { if (!(s in dict)) out.add(s); return s; });
    return [...out];
  }

  // For check: texts not translated yet, and translations whose source text is gone (it was reworded, so its key no longer matches).
  function gaps(data) {
    const out = [];
    for (const [l, dict] of Object.entries(data?.translations ?? {})) {
      const used = new Set(), miss = [];
      mapTexts(data, (s, at) => { if (s in dict) used.add(s); else miss.push(at); return s; });
      if (miss.length) out.push(`translations.${l}: ${miss.length} texts are not translated (${miss.slice(0, 3).join(', ')}${miss.length > 3 ? ', …' : ''})`);
      const stale = Object.keys(dict).filter((k) => !used.has(k));
      if (stale.length) out.push(`translations.${l}: ${stale.length} entries match no text, so their source was reworded or removed: ${stale.slice(0, 3).map((s) => JSON.stringify(s)).join(', ')}${stale.length > 3 ? ', …' : ''}`);
    }
    return out;
  }

  const name = (l) => { try { const n = new Intl.DisplayNames([l], { type: 'language' }).of(l); return n[0].toLocaleUpperCase(l) + n.slice(1); } catch { return l; } };

  // The page: draw(lang) fills .wrap. Each language button redraws a clean copy of it, so nothing of the last language lingers;
  // the viewer's choice is remembered in this browser only.
  function boot(data, draw, key) {
    const ls = langs(data), blank = document.querySelector('.wrap').cloneNode(true);
    let saved = null;
    try { saved = localStorage.getItem(key); } catch {}
    const show = (lang, again) => {
      if (again) document.querySelector('.wrap').replaceWith(blank.cloneNode(true));
      draw(lang);
      const nav = document.getElementById('langNav');
      if (!nav || ls.length < 2) return;
      nav.hidden = false;
      for (const l of ls) {
        const b = document.createElement('button');
        b.type = 'button';
        b.lang = l;
        b.textContent = name(l);
        b.setAttribute('aria-pressed', String(l === lang));
        b.addEventListener('click', () => { if (l === lang) return; try { localStorage.setItem(key, l); } catch {} show(l, true); });
        nav.append(b);
      }
    };
    show(ls.includes(saved) ? saved : ls[0]);
  }

  root.I18n = { langs, localize, missing, gaps, boot };
})(typeof window !== 'undefined' ? window : globalThis);
