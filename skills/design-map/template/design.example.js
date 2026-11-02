// Example design.data.js: two screens of the shop's refund flow (flow-map's flow.example.js), cut small but using every field.
// The field reference is in SKILL.md, "Data shape". After the assignment the file is strict JSON
// (double quotes, no comments, no trailing commas): the CLI parses it and never runs it. Mockup HTML uses single-quoted attributes so it needs no escaping.
window.DESIGN = {
  "title": "Refund screens",
  "eyebrow": "Shopfront · UI design",
  "lead": "The screens of the refund flow. Where the brainstorm left more than one direction, each direction is an option to choose from; each open question points at the part of the screen its answer changes.",
  "url": null,
  "lang": "en",
  "strings": {},
  "owner": "Mai",
  "asOf": "22/10/2026",
  "flowMap": { "url": null, "file": "../../flow-map/template/flow.example.js" },
  "links": ["Brainstorm notes: [refund console thread](https://example.com/refund-console-notes)"],
  "fonts": ["https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"],
  "css": [
    ":host { --ink: #1b1f3b; --muted: #5f6577; --line: #e2e4ea; --soft: #f5f6f9; --brand: #2b59c3; --on-brand: #ffffff; --ok: #1f7a4d; --warn: #8a4b00; --bad: #b4232c; font: 400 14px/1.5 Inter, system-ui, sans-serif; color: var(--ink); background: #ffffff; }",
    "h1 { font-size: 22px; margin: 0; } h2 { font-size: 15px; margin: 0; } p { margin: 0; }",
    ".muted { color: var(--muted); }",
    ".btn { font: inherit; font-weight: 600; min-height: 44px; padding: 0 18px; border-radius: 10px; border: 1.5px solid var(--brand); background: var(--brand); color: var(--on-brand); }",
    ".btn.ghost { background: #ffffff; color: var(--brand); }",
    ".ph { display: grid; place-items: center; background: var(--soft); border: 1px dashed var(--line); border-radius: 8px; color: var(--muted); font-size: 12px; }",
    ".risk { display: flex; gap: 10px; align-items: baseline; padding: 10px 14px; border-radius: 10px; }",
    ".risk.high { background: #fdecec; color: var(--bad); }",
    ".flag { font-style: normal; font-size: 12px; font-weight: 600; }",
    ".flag.high { color: var(--bad); } .flag.mid { color: var(--warn); } .flag.low { color: var(--ok); }"
  ],
  "screens": [
    {
      "id": "review",
      "code": "M1",
      "title": "Agent reviews a refund",
      "step": "N5",
      "where": "Support console › Refunds",
      "width": 1180,
      "brief": "An agent works through the requests the AI did not approve. The brainstorm agreed on what the agent must see (**reason, photos, risk**) but split on how they move through the queue.",
      "rec": { "option": "A", "why": "Agents in the thread switch between requests to compare repeat customers; a list beside the request keeps that one click away." },
      "qs": ["U4"],
      "options": [
        {
          "id": "A",
          "name": "Queue beside the request",
          "idea": "The waiting requests stay listed on the left; the selected one fills the right.",
          "pros": ["Agents compare requests from the same customer", "Sorting and filtering have a natural home"],
          "cons": ["Less room for the photos", "Needs a wide screen"],
          "css": [
            ".console { display: grid; grid-template-rows: auto 1fr; min-height: 640px; }",
            ".bar { display: flex; gap: 16px; align-items: baseline; padding: 14px 24px; border-bottom: 1px solid var(--line); }",
            ".split { display: grid; grid-template-columns: 340px 1fr; }",
            ".queue { display: grid; align-content: start; gap: 4px; padding: 12px; border-right: 1px solid var(--line); background: var(--soft); }",
            ".row { display: grid; gap: 2px; text-align: left; font: inherit; padding: 10px 12px; border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--ink); }",
            ".row.on { background: #ffffff; border-color: var(--line); }",
            ".row span { color: var(--muted); font-size: 13px; }",
            ".detail { display: grid; align-content: start; gap: 18px; padding: 24px 28px; }",
            ".evidence { display: grid; gap: 8px; } .photos { display: grid; grid-template-columns: repeat(2, 160px); gap: 10px; } .photos .ph { height: 120px; }",
            ".decide { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; justify-content: space-between; padding-top: 16px; border-top: 1px solid var(--line); }",
            ".decide label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); } .decide select { font: inherit; min-height: 40px; min-width: 240px; border: 1px solid var(--line); border-radius: 8px; padding: 0 10px; }",
            ".btns { display: flex; gap: 10px; }"
          ],
          "html": [
            "<div class='console'>",
            "  <header class='bar'><b>Support console</b><span class='muted'>Refunds · 14 waiting</span></header>",
            "  <div class='split'>",
            "    <nav class='queue' data-ui='queue' aria-label='Refund requests'>",
            "      <button class='row on'><b>#4821 · Wireless earbuds</b><span>Damaged · 39.00 USD · 2 h ago</span><i class='flag high'>High risk</i></button>",
            "      <button class='row'><b>#4818 · Desk lamp</b><span>Wrong item · 24.50 USD · 5 h ago</span><i class='flag low'>Low risk</i></button>",
            "      <button class='row'><b>#4807 · Running shoes</b><span>Changed mind · 89.00 USD · 1 day ago</span><i class='flag mid'>Medium risk</i></button>",
            "    </nav>",
            "    <main class='detail'>",
            "      <div><h1>#4821 · Wireless earbuds</h1><p class='muted'>[Customer name] · delivered 3 days ago · 39.00 USD</p></div>",
            "      <section class='evidence' data-ui='evidence'><h2>Reason: Damaged</h2><p>“The left earbud does not charge and the case is cracked.”</p><div class='photos'><div class='ph'>Photo 1</div><div class='ph'>Photo 2</div></div></section>",
            "      <section class='risk high' data-ui='risk'><b>High risk</b><span>3 refunds on this account in 30 days</span></section>",
            "      <div class='decide' data-ui='decide'><label>Reason if rejected<select><option>Pick a reason</option></select></label><div class='btns'><button class='btn ghost'>Reject</button><button class='btn'>Approve 39.00 USD</button></div></div>",
            "    </main>",
            "  </div>",
            "</div>"
          ]
        },
        {
          "id": "B",
          "name": "One request at a time",
          "idea": "The agent sees one request, full width, and moves to the next after deciding.",
          "pros": ["Big photos, nothing else to look at", "Works on a laptop screen"],
          "cons": ["No way to compare requests", "Skipping a hard request needs its own button"],
          "css": [
            ".console { display: grid; grid-template-rows: auto 1fr; min-height: 640px; }",
            ".bar { display: flex; gap: 16px; align-items: baseline; justify-content: space-between; padding: 14px 24px; border-bottom: 1px solid var(--line); }",
            ".progress a { color: var(--brand); }",
            ".single { display: grid; align-content: start; gap: 20px; max-width: 760px; width: 100%; margin: 0 auto; padding: 28px 24px; }",
            ".evidence { display: grid; gap: 10px; } .photos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } .photos .ph { height: 220px; }",
            ".decide { display: grid; grid-template-columns: 1fr 2fr; gap: 12px; }"
          ],
          "html": [
            "<div class='console'>",
            "  <header class='bar'><b>Support console</b><span class='progress muted' data-ui='progress'>Request 1 of 14 · <a href='#'>Skip for now</a></span></header>",
            "  <main class='single'>",
            "    <div><h1>#4821 · Wireless earbuds</h1><p class='muted'>[Customer name] · delivered 3 days ago · 39.00 USD</p></div>",
            "    <section class='evidence' data-ui='evidence'><h2>Reason: Damaged</h2><p>“The left earbud does not charge and the case is cracked.”</p><div class='photos'><div class='ph'>Photo 1</div><div class='ph'>Photo 2</div></div></section>",
            "    <section class='risk high' data-ui='risk'><b>High risk</b><span>3 refunds on this account in 30 days</span></section>",
            "    <div class='decide' data-ui='decide'><button class='btn ghost'>Reject…</button><button class='btn'>Approve 39.00 USD and go to the next</button></div>",
            "  </main>",
            "</div>"
          ]
        }
      ],
      "parts": [
        { "id": "queue", "code": "M1.1", "title": "Queue of waiting requests", "qs": ["U3"] },
        { "id": "evidence", "code": "M1.2", "title": "Reason and photos" },
        { "id": "risk", "code": "M1.3", "title": "AI risk flag", "qs": ["U1"] },
        { "id": "decide", "code": "M1.4", "title": "Approve or reject", "qs": ["U2"] },
        { "id": "progress", "code": "M1.5", "title": "Place in the queue and skip" }
      ]
    },
    {
      "id": "form",
      "code": "M2",
      "title": "Customer asks for a refund",
      "step": "N2",
      "where": "My orders › Refund",
      "width": 390,
      "brief": "The form already ships; this screen tracks the photo changes while they are coded.",
      "options": [
        {
          "id": "A",
          "name": "Current form",
          "html": [
            "<div class='phone'>",
            "  <header class='top'><span aria-hidden='true'>‹</span><b>Refund</b></header>",
            "  <p class='muted'>Order #4821 · Wireless earbuds</p>",
            "  <fieldset class='reasons' data-ui='reason'><legend>Why do you want a refund?</legend><div class='chips'><button class='chip on' aria-pressed='true'>Damaged</button><button class='chip' aria-pressed='false'>Wrong item</button><button class='chip' aria-pressed='false'>Not as described</button><button class='chip' aria-pressed='false'>Changed mind</button></div></fieldset>",
            "  <div class='field' data-ui='photos'><b>Photos</b><span class='muted'>Required for damaged items · up to 3</span><div class='tiles'><div class='ph'>Photo</div><button class='add' aria-label='Add a photo'>+</button><div class='ph'></div></div></div>",
            "  <div class='actions'><button class='btn' data-ui='send'>Send request</button><button class='btn ghost'>Cancel</button></div>",
            "</div>"
          ],
          "css": [
            ".phone { display: grid; gap: 18px; padding: 16px 20px 28px; min-height: 760px; align-content: start; }",
            ".top { display: flex; gap: 12px; align-items: center; font-size: 17px; min-height: 44px; }",
            ".reasons { border: 0; margin: 0; padding: 0; display: grid; gap: 10px; } .reasons legend { font-weight: 600; padding: 0; margin-bottom: 10px; }",
            ".chips { display: flex; flex-wrap: wrap; gap: 8px; }",
            ".chip { font: inherit; min-height: 44px; padding: 0 14px; border-radius: 999px; border: 1.5px solid var(--line); background: #ffffff; color: var(--ink); }",
            ".chip.on { border-color: var(--brand); background: #e9effb; color: var(--brand); font-weight: 600; }",
            ".field { display: grid; gap: 4px; } .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 6px; } .tiles > * { height: 96px; }",
            ".add { font: 600 24px/1 Inter, system-ui, sans-serif; border: 1.5px dashed var(--brand); border-radius: 8px; background: #ffffff; color: var(--brand); }",
            ".actions { display: grid; gap: 10px; margin-top: 8px; }"
          ]
        }
      ],
      "parts": [
        { "id": "reason", "code": "M2.1", "title": "Reason chips", "status": "built", "where": "web/refund/ReasonChips.tsx" },
        { "id": "photos", "code": "M2.2", "title": "Photo tiles", "status": "partial", "statusNote": "Upload and the three tiles work; the “required for damaged” line waits for the flow's R3.", "where": "web/refund/PhotoTiles.tsx", "qs": ["U5"] },
        { "id": "send", "code": "M2.3", "title": "Send button", "status": "built", "where": "web/refund/RefundForm.tsx" }
      ]
    }
  ],
  "questions": {
    "U1": { "q": "Does the agent see why the AI flagged the risk, or only the level?", "opts": "Level only · level and the signal that set it", "rec": "Level and signal: agents in the thread said they do not trust a bare “high”." },
    "U2": { "q": "When rejecting, does the agent pick a reason from a list or type one?", "opts": "List · free text · list with “Other”", "rec": "List with “Other”: the customer gets a clear message and the list stays short." },
    "U3": { "q": "Is the queue sorted by oldest first or by risk?", "opts": "Oldest first · highest risk first", "rec": "Oldest first, so no customer waits past the promise; risk shows as a flag on each row." },
    "U4": { "q": "Can an agent approve several requests at once?", "opts": "No · yes, for low-risk requests", "rec": "No for now: one at a time until the low-risk rule (flow R2) has a month of data." },
    "U5": { "q": "Photo tiles: three fixed slots or a list that grows?", "opts": "Three fixed slots · growing list", "rec": "Three fixed slots: the limit is visible before the customer starts.", "decided": "Three fixed slots (Mai, 21/10/2026)" },
    "G1": { "q": "Do the support console screens follow the app's dark theme?", "opts": "Yes · light only for now", "rec": "Light only for now: the console has no dark tokens yet." }
  },
  "changelog": [
    {
      "day": "22/10/2026",
      "items": [
        { "kind": "design", "text": "Drew M1 from the brainstorm: options A (queue beside) and B (one at a time).", "refs": ["M1", "U1", "U2", "U3", "U4"] },
        { "kind": "code", "text": "Photo tiles coded; the “required for damaged” line is still missing.", "refs": ["M2.2"] }
      ]
    },
    {
      "day": "21/10/2026",
      "items": [
        { "kind": "decide", "text": "Three fixed photo slots.", "refs": ["U5", "M2.2"] },
        { "kind": "design", "text": "First version: the refund form as it ships.", "refs": ["M2"] }
      ]
    }
  ],
  "retired": []
};
