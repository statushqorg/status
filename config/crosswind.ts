/**
 * Crosswind (utility CSS) config.
 * @see https://github.com/cwcss/crosswind
 *
 * `theme.extend` is deep-merged onto Crosswind's defaults, so the standard
 * palette (red-500, etc.) stays intact — these just add the app's design-system
 * tokens as named utilities, mapped to the CSS variables `paletteCss()` below
 * declares. Prefer these over `[var(--…)]` arbitrary values: `bg-surface`,
 * `border-subtle`, `text-muted`, `text-success`, `font-display`,
 * `rounded-card`, and so on.
 */

/**
 * The design tokens, declared once.
 *
 * stx-standards rule 3 / §11.2: a custom property belongs in this file and
 * nowhere else. They were in THREE `<style>` blocks --
 * partials/app-head.stx, partials/marketing-head.stx and layouts/auth.stx --
 * each with its own copy of the same palette, and app-head's comment said in
 * so many words that they "must stay in sync if the brand changes".
 *
 * They had not quite stayed in sync. Diffed value by value rather than read:
 * app and marketing were byte-identical but for `--violet`, which only
 * marketing declared; auth matched on every colour except that its light
 * `--danger-soft` was `0.08` where the other two said `0.09`, and it was
 * missing --success, --success-soft, --amber, --amber-soft, --shadow and
 * --font-mono entirely. The rest of auth's apparent drift was whitespace --
 * `rgba(11,15,13,0.1)` against `rgba(11, 15, 13, 0.1)`.
 *
 * So this is the marketing copy, which is the superset, and the one real
 * change is auth's `--danger-soft` moving by 0.01 of alpha.
 *
 * Unscoped, unlike the chrome that reads it: there is one palette and the
 * three copies were never meant to differ.
 */
function paletteCss(): string {
  return `:root {
  color-scheme: light;
  --bg: #fbfbfa;
  --surface: #ffffff;
  --surface-2: #f2f3f1;
  --fg: #0b0f0d;
  --muted: #5c6864;
  --border: rgba(11, 15, 13, 0.1);
  --border-strong: rgba(11, 15, 13, 0.18);
  --accent: #2563eb;
  --accent-fg: #ffffff;
  --accent-soft: rgba(37, 99, 235, 0.09);
  --success: #059669;
  --success-soft: rgba(5, 150, 105, 0.12);
  --violet: #6d5efc;
  --amber: #d97706;
  --amber-soft: rgba(217, 119, 6, 0.12);
  --danger: #dc2626;
  --danger-soft: rgba(220, 38, 38, 0.09);
  --shadow: 0 20px 50px -18px rgba(11, 15, 13, 0.22);
  --radius: 16px;
  --radius-sm: 10px;
  --font-display: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}

@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #080b0a;
    --surface: #101413;
    --surface-2: #161b19;
    --fg: #f2f5f3;
    --muted: #97a39d;
    --border: rgba(255, 255, 255, 0.08);
    --border-strong: rgba(255, 255, 255, 0.15);
    --accent: #60a5fa;
    --accent-fg: #071630;
    --accent-soft: rgba(96, 165, 250, 0.14);
    --success: #2fe6a6;
    --success-soft: rgba(47, 230, 166, 0.14);
    --violet: #a196ff;
    --amber: #fbbf24;
    --amber-soft: rgba(251, 191, 36, 0.13);
    --danger: #f87171;
    --danger-soft: rgba(248, 113, 113, 0.12);
    --shadow: 0 24px 60px -16px rgba(0, 0, 0, 0.55);
  }
}

html[data-theme="dark"] {
  color-scheme: dark;
  --bg: #080b0a;
  --surface: #101413;
  --surface-2: #161b19;
  --fg: #f2f5f3;
  --muted: #97a39d;
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.15);
  --accent: #60a5fa;
  --accent-fg: #071630;
  --accent-soft: rgba(96, 165, 250, 0.14);
  --success: #2fe6a6;
  --success-soft: rgba(47, 230, 166, 0.14);
  --violet: #a196ff;
  --amber: #fbbf24;
  --amber-soft: rgba(251, 191, 36, 0.13);
  --danger: #f87171;
  --danger-soft: rgba(248, 113, 113, 0.12);
  --shadow: 0 24px 60px -16px rgba(0, 0, 0, 0.55);
}`
}

/**
 * The dashboard's stylesheet: 157 rules, from partials/app-head.stx.
 *
 * ## Why it is scoped, and why the scope is written once
 *
 * A preflight reaches every page, and this app gives the same class name
 * different meanings on different surfaces. Forty names are declared in more
 * than one of the fourteen blocks -- `.button`, `.brand`, `.panel`, `.field`,
 * `.pill`, `.dot`, `.section` among them -- and the marketing site's `.button`
 * is not the dashboard's. So each sheet carries the layout group it belongs
 * to, which stx emits into <head> as `<meta name="stx-layout-group">` from the
 * layout's filename, and which the router keeps fresh across navigations.
 *
 * The prefix is written ONCE, with native CSS nesting, rather than pasted onto
 * 157 selectors. Checked against the installed engine rather than assumed: a
 * preflight's text is passed through verbatim, nesting and all.
 *
 * Three kinds of rule cannot be nested under an `html` prefix, because they
 * are rooted at or above it, so they are spelled out above the block:
 * `html { background }` becomes the prefix itself; the `[data-theme]` and
 * `:not([data-theme="light"])` theme-toggle rules attach their attribute to
 * it; and `*` becomes `prefix, prefix *`, because `*` matched html and body
 * and a nested one would not.
 *
 * ## What does NOT change
 *
 * The cascade. This block was hoisted into <head> ahead of the generated
 * sheet, so it already lost to every utility and already beat the engine's
 * own reset. A layered preflight sits in exactly the same two relationships,
 * and the per-page dashboard blocks that are still in their views stay
 * unlayered and later, so they still win over it.
 */
function appCss(): string {
  return `html:has(meta[name="stx-layout-group"][content="default"]), html:has(meta[name="stx-layout-group"][content="default"]) * { box-sizing: border-box; }
html:has(meta[name="stx-layout-group"][content="default"]) { background: var(--bg); }
html:has(meta[name="stx-layout-group"][content="default"])[data-theme="dark"] .theme-toggle .icon-moon { display: none; }
html:has(meta[name="stx-layout-group"][content="default"])[data-theme="dark"] .theme-toggle .icon-sun { display: block; }
@media (prefers-color-scheme: dark) {
html:has(meta[name="stx-layout-group"][content="default"]):not([data-theme="light"]) .theme-toggle .icon-moon { display: none; }
html:has(meta[name="stx-layout-group"][content="default"]):not([data-theme="light"]) .theme-toggle .icon-sun { display: block; }
}

html:has(meta[name="stx-layout-group"][content="default"]) {
    body {
      min-width: 320px;
      min-height: 100vh;
      margin: 0;
      color: var(--fg);
      background: var(--bg);
      font-family: var(--font-body);
      font-size: 15px;
      transition: background-color 0.2s ease, color 0.2s ease;
    }
    a { color: inherit; text-decoration: none; }
    ::selection { background: var(--accent-soft); }
    .app-shell {
      width: min(1180px, calc(100% - 40px));
      margin: 0 auto;
    }

    /* ------------------------------------------------------------------ */

    /* Navigation (mirrors the marketing .site-nav)                        */

    /* ------------------------------------------------------------------ */
    .app-nav {
      position: sticky;
      top: 0;
      z-index: 40;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--bg) 78%, transparent);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }
    .app-nav-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 64px;
      gap: 1rem;
    }
    .brand {
      display: inline-flex;
      gap: 0.6rem;
      align-items: center;
      min-width: 0;
    }
    .brand-mark {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 8px;
      color: var(--accent-fg);
      background: var(--accent);
    }
    .brand-mark svg { width: 16px; height: 16px; }
    .brand-name {
      font-family: var(--font-display);
      font-size: 1.08rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      line-height: 1;
    }
    .app-links {
      display: flex;
      gap: 0.35rem;
      align-items: center;
    }
    .app-links a {
      padding: 0.45rem 0.9rem;
      border-radius: 999px;
      color: var(--muted);
      font-size: 0.9rem;
      font-weight: 500;
    }
    .app-links a:hover { color: var(--fg); background: var(--surface-2); }
    .app-links a.active {
      color: var(--accent);
      font-weight: 600;
      background: var(--accent-soft);
    }

    /* Overview only counts when you are actually ON /dashboard.
       The router re-derives these classes on the client after every
       navigation and its rule is \`cur.startsWith(href)\`, so "/dashboard"
       matches every dashboard route and Overview lit up next to whichever
       section you were really in -- two highlighted tabs, everywhere.
       It adds \`exact-active\` alongside \`active\` when the paths match
       exactly, so requiring both here narrows Overview to its own page
       while every other tab keeps the prefix match that (correctly) lights
       Monitors on /dashboard/monitors/new.
       Done in CSS rather than with data-stx-active-class on the link:
       StxLink emits its own default active-class attributes, and an
       override added on the element lands SECOND, where the HTML parser
       ignores it. */
    .app-links a[href="/dashboard"].active:not(.exact-active) {
      color: var(--muted);
      font-weight: 500;
      background: transparent;
    }
    .app-nav-right {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      min-width: 0;
    }
    .app-user {
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--muted);
      font-size: 0.82rem;
    }
    .app-nav-right form { display: contents; }
    .theme-toggle {
      display: inline-grid;
      place-items: center;
      width: 36px;
      height: 36px;
      flex: 0 0 auto;
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--fg);
      background: var(--surface);
      cursor: pointer;
    }
    .theme-toggle:hover { border-color: var(--border-strong); }
    .theme-toggle svg { width: 16px; height: 16px; }
    .theme-toggle .icon-sun { display: none; }

    /* ------------------------------------------------------------------ */

    /* Buttons (marketing .button, plus a danger variant)                  */

    /* ------------------------------------------------------------------ */
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-height: 40px;
      padding: 0 1.05rem;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      color: var(--fg);
      font: inherit;
      font-size: 0.88rem;
      font-weight: 600;
      background: var(--surface);
      cursor: pointer;
      white-space: nowrap;
    }
    .button:hover { border-color: var(--fg); }
    .button:active { transform: translateY(1px); }
    .button.primary {
      border-color: var(--accent);
      color: var(--accent-fg);
      background: var(--accent);
    }
    .button.primary:hover { filter: brightness(1.05); border-color: var(--accent); }
    .button.danger {
      border-color: transparent;
      color: var(--danger);
      background: var(--danger-soft);
    }
    .button.danger:hover { border-color: var(--danger); }
    .button.sm { min-height: 32px; padding: 0 0.75rem; font-size: 0.8rem; }

    /* ------------------------------------------------------------------ */

    /* Page header                                                         */

    /* ------------------------------------------------------------------ */
    .page-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 1.5rem;
      flex-wrap: wrap;
      padding: 2.25rem 0 1.5rem;
    }
    .page-head h1 {
      margin: 0 0 0.35rem;
      font-family: var(--font-display);
      font-size: clamp(1.5rem, 2.6vw, 1.9rem);
      font-weight: 600;
      letter-spacing: -0.015em;
      line-height: 1.1;
    }
    .page-head .meta {
      margin: 0;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .page-head .meta .mono { font-family: var(--font-mono); font-size: 0.82rem; }
    .page-head .actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
    .crumb {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.6rem;
      color: var(--muted);
      font-size: 0.82rem;
      font-weight: 500;
    }
    .crumb a:hover { color: var(--accent); }

    /* ------------------------------------------------------------------ */

    /* Stat cards                                                          */

    /* ------------------------------------------------------------------ */
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0.9rem;
      margin: 0 0 1.5rem;
    }
    .stat-card {
      padding: 1rem 1.15rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
    }
    .stat-card dt {
      margin: 0 0 0.4rem;
      color: var(--muted);
      font-size: 0.76rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .stat-card dd {
      margin: 0;
      font-family: var(--font-display);
      font-size: 1.65rem;
      font-weight: 600;
      line-height: 1;
    }
    .stat-card dd small {
      color: var(--muted);
      font-family: var(--font-body);
      font-size: 0.78rem;
      font-weight: 500;
    }
    .stat-card .ok { color: var(--success); }
    .stat-card .warn { color: var(--amber); }
    .stat-card .bad { color: var(--danger); }

    /* ------------------------------------------------------------------ */

    /* Filter chips                                                        */

    /* ------------------------------------------------------------------ */
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1.25rem;
      margin: 0 0 1.25rem;
    }
    .filter-group {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .filter-group .lbl {
      margin-right: 0.35rem;
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .chip {
      display: inline-block;
      padding: 0.32rem 0.8rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--muted);
      font-size: 0.8rem;
      font-weight: 500;
      background: var(--surface);
    }
    .chip:hover { color: var(--fg); border-color: var(--border-strong); }
    .chip.active {
      color: var(--accent-fg);
      border-color: var(--accent);
      background: var(--accent);
      font-weight: 600;
    }

    /* ------------------------------------------------------------------ */

    /* Data cards, tables, rows                                            */

    /* ------------------------------------------------------------------ */
    .card {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      overflow: hidden;
    }
    .card + .card { margin-top: 1.25rem; }
    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.9rem 1.25rem;
      border-bottom: 1px solid var(--border);
    }
    .card-head h2, .card-head h3 {
      margin: 0;
      font-family: var(--font-display);
      font-size: 0.98rem;
      font-weight: 600;
    }
    .card-head .sub { color: var(--muted); font-size: 0.82rem; }
    .card-body { padding: 1.25rem; }
    .card-foot {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem 1rem;
      padding: 0 1.25rem 1.25rem;
    }
    .card-foot form { margin: 0; }
    .card-foot .sub {
      flex: 1 1 18rem;
      margin: 0;
      color: var(--muted);
      font-size: 0.85rem;
      line-height: 1.5;
    }
    .card-copy {
      margin: 0 0 0.75rem;
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.6;
    }
    .card-copy:last-child { margin-bottom: 0; }
    .code-block + .card-copy, details > .card-copy { margin-top: 0.75rem; }

    /* Row-list table: a header row + link rows, marketing preview-card DNA */
    .rows { display: block; }
    .trow {
      display: grid;
      gap: 1rem;
      align-items: center;
      padding: 0.85rem 1.25rem;
      border-bottom: 1px solid var(--border);
    }
    .trow:last-child { border-bottom: 0; }
    .rows .thead {
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--surface-2);
      border-bottom: 1px solid var(--border);
    }
    a.trow:hover { background: var(--surface-2); }
    .tcell { min-width: 0; }
    .tcell .name { font-weight: 600; font-size: 0.92rem; }
    .tcell .sub {
      color: var(--muted);
      font-family: var(--font-mono);
      font-size: 0.76rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tcell.num {
      text-align: right;
      font-family: var(--font-mono);
      font-size: 0.82rem;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }
    .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Status pills: the homepage's status-dot language, as a labeled pill */
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.28rem 0.7rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .pill .dot { width: 7px; height: 7px; border-radius: 999px; flex: 0 0 auto; }
    .pill-up { color: var(--success); background: var(--success-soft); }
    .pill-up .dot { background: var(--success); }
    .pill-degraded { color: var(--amber); background: var(--amber-soft); }
    .pill-degraded .dot { background: var(--amber); }
    .pill-down { color: var(--danger); background: var(--danger-soft); }
    .pill-down .dot { background: var(--danger); }
    .pill-unknown { color: var(--muted); background: var(--surface-2); }
    .pill-unknown .dot { background: var(--border-strong); }

    /* Uptime bars (public status page DNA) */
    .uptime-bars { display: flex; gap: 2px; align-items: stretch; height: 30px; }
    .uptime-bars span { flex: 1 1 0; min-width: 1px; border-radius: 2px; background: var(--success); opacity: 0.85; }
    .uptime-bars span.warn { background: var(--amber); }
    .uptime-bars span.down { background: var(--danger); }
    .uptime-bars span.unknown { background: var(--border-strong); opacity: 0.45; }
    .spark { display: flex; align-items: flex-end; gap: 2px; height: 22px; }
    .spark span { width: 3px; border-radius: 1px; background: var(--success); opacity: 0.55; }

    /* ------------------------------------------------------------------ */

    /* Forms                                                               */

    /* ------------------------------------------------------------------ */
    .field { margin-bottom: 1rem; }
    .field label, .field .label {
      display: block;
      margin-bottom: 0.35rem;
      font-size: 0.82rem;
      font-weight: 600;
    }

    /* Help text is muted and small wherever it appears. This used to be scoped
       to \`.field .help\`, so the copy under a card — the alert-routing note, the
       assertions explainer, the delete warning — matched body text in size and
       contrast and shouted over the thing it was explaining. The margin stays
       field-scoped: outside a field the surrounding layout owns the spacing. */
    .help { color: var(--muted); font-size: 0.8rem; line-height: 1.55; }
    .field .help { margin-top: 0.35rem; }
    .input, .select, .textarea {
      width: 100%;
      min-height: 42px;
      padding: 0.55rem 0.85rem;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      color: var(--fg);
      font: inherit;
      font-size: 0.9rem;
      background: var(--bg);
    }
    .textarea { min-height: 0; }
    .input::placeholder, .textarea::placeholder { color: var(--muted); opacity: 0.75; }
    .input:focus, .select:focus, .textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }
    .form-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }

    /* ------------------------------------------------------------------ */

    /* Readouts, code blocks, dialogs                                      */

    /* ------------------------------------------------------------------ */

    /* These began as monitors/[id].stx page styles and were copied onto the
       server pages and settings/cloud by markup alone. A view's <style> is
       not shared, so they rendered bare there. Anything two pages use lives
       here; tests/unit/dashboard-styles.test.ts holds that line. */
    .subhead {
      margin: 0 0 0.6rem;
      color: var(--muted);
      font-size: 0.76rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .kv {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem 1.25rem;
      margin: 0;
    }
    .kv dt {
      margin: 0 0 0.35rem;
      color: var(--muted);
      font-size: 0.76rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .kv dd {
      margin: 0;
      font-size: 0.92rem;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .kv dd.big { font-family: var(--font-display); font-size: 1.65rem; }

    /* The marketing site's oss-code surface: intentionally dark in both themes. */
    .code-block {
      margin: 0;
      padding: 1rem;
      border-radius: var(--radius-sm);
      background: #0d1210;
      color: #8ce8bb;
      font-family: var(--font-mono);
      font-size: 0.78rem;
      line-height: 1.6;
      overflow-x: auto;
    }

    /* Copy affordance for .code-block. The wrapper and the button are attached by
       the script at the end of this partial, not written into the five call sites
       across the two views that have them — a copy button cannot do anything
       without JS, so building it in JS costs nothing and keeps the markup to the
       command itself. Colours are the code surface's own, not the page tokens:
       .code-block is deliberately dark in both themes, so a panel-coloured button
       would sit on it as a light patch. */
    .code-wrap { position: relative; }
    .code-wrap > .code-block { padding-right: 4.75rem; }
    .copy-btn {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      padding: 0.3rem 0.55rem;
      border-radius: var(--radius-sm);
      border: 1px solid rgba(140, 232, 187, 0.28);
      background: rgba(13, 18, 16, 0.92);
      color: #8ce8bb;
      font-family: var(--font-mono);
      font-size: 0.68rem;
      line-height: 1;
      cursor: pointer;
      transition: border-color 0.12s ease, background-color 0.12s ease;
    }
    .copy-btn:hover { border-color: rgba(140, 232, 187, 0.62); background: rgba(140, 232, 187, 0.12); }
    .copy-btn:focus-visible { outline: 2px solid #8ce8bb; outline-offset: 2px; }

    /* Dialog shell and chrome, shared by every dashboard dialog. Styled through
       the same tokens as the cards, so it inherits both themes rather than
       needing a second palette. */
    .dlg {
      width: min(46rem, calc(100vw - 2rem));
      padding: 0;
      border: 1px solid var(--border);
      border-radius: var(--radius, 14px);
      background: var(--surface);
      color: var(--fg);
      box-shadow: 0 24px 60px -20px rgba(11, 15, 13, 0.4);
    }

    /* Closed dialogs stay out of the flow whatever the UA stylesheet says. */
    .dlg:not([open]) { display: none; }
    .dlg::backdrop { background: rgba(11, 15, 13, 0.55); }
    .dlg form { margin: 0; }
    .dlg-head {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem;
      padding: 1.1rem 1.25rem; border-bottom: 1px solid var(--border);
    }
    .dlg-head h3 { margin: 0; font-size: 1.05rem; }
    .dlg-head .sub { display: block; margin-top: 0.2rem; font-size: 0.85rem; color: var(--muted); }
    .dlg-x {
      display: inline-flex; align-items: center; justify-content: center; flex: none;
      width: 32px; height: 32px; padding: 0; cursor: pointer;
      border: 1px solid transparent; border-radius: 8px;
      background: transparent; color: var(--muted);
    }
    .dlg-x:hover { border-color: var(--border); color: var(--fg); background: var(--surface-2); }
    .dlg-x svg { width: 17px; height: 17px; }

    /* Long lists scroll inside the dialog rather than pushing its footer past
       the bottom of the viewport. */
    .dlg-body { padding: 1.25rem; max-height: min(60vh, 32rem); overflow-y: auto; }
    .dlg-foot {
      display: flex; align-items: center; justify-content: flex-end; gap: 0.6rem;
      padding: 0.9rem 1.25rem; border-top: 1px solid var(--border); background: var(--surface-2);
      border-bottom-left-radius: inherit; border-bottom-right-radius: inherit;
    }

    /* Flash banners (post-redirect feedback) */
    .flash {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin: 0 0 1.25rem;
      padding: 0.8rem 1.1rem;
      border: 1px solid var(--accent);
      border-radius: var(--radius-sm);
      color: var(--accent);
      font-size: 0.88rem;
      font-weight: 500;
      background: var(--accent-soft);
    }
    .flash.error { border-color: var(--danger); color: var(--danger); background: var(--danger-soft); }

    /* Type tags: quiet bordered labels so the type column reads as metadata */
    .tag {
      display: inline-block;
      padding: 0.18rem 0.55rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      background: var(--surface-2);
      white-space: nowrap;
    }

    /* Mini check-history ticks for table rows (newest on the right) */
    .ticks { display: inline-flex; gap: 2px; align-items: stretch; height: 16px; }
    .ticks span { width: 4px; border-radius: 1px; background: var(--success); opacity: 0.8; }
    .ticks span.warn { background: var(--amber); }
    .ticks span.down { background: var(--danger); }
    .ticks span.unknown { background: var(--border-strong); opacity: 0.5; }
    .mono { font-family: var(--font-mono); }

    /* Floating chart tooltip, driven by .chart-hit rects (see the script
       at the end of this partial). */
    .chart-tip {
      position: fixed;
      z-index: 70;
      display: none;
      padding: 0.4rem 0.65rem;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      color: var(--fg);
      background: var(--surface);
      box-shadow: var(--shadow);
      font-family: var(--font-mono);
      font-size: 0.76rem;
      pointer-events: none;
      white-space: nowrap;
    }
    .chart-hit { cursor: crosshair; }
    .app-foot {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 2rem 0 2.5rem;
      color: var(--muted);
      font-size: 0.8rem;
    }
  @media (max-width: 860px) {
      .app-shell { width: min(100% - 32px, 720px); }
      .app-nav-inner { flex-wrap: wrap; padding: 0.5rem 0; }
      .app-links {
        order: 3;
        width: 100%;
        overflow-x: auto;
        padding-bottom: 0.25rem;
        overscroll-behavior-inline: contain;
        scroll-padding-inline: 0.25rem;
        scroll-snap-type: inline proximity;
        scrollbar-width: none;
      }
      .app-links::-webkit-scrollbar { display: none; }
      .app-links a {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        scroll-snap-align: start;
      }
      .brand { min-height: 44px; }
      .theme-toggle { width: 44px; height: 44px; }
      .dlg-x { width: 44px; height: 44px; }
      .button, .button.sm, .team-switch > summary, .team-switch-item, .chip {
        min-height: 44px;
      }
      .chip { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; }

      /* 16px is the floor below which iOS Safari zooms a focused field. */
      .input, .select, .textarea { min-height: 44px; font-size: 16px; }
      .app-user { display: none; }
      .page-head { flex-direction: column; align-items: flex-start; }

      /* Fixed column tracks can't fit a phone; tables scroll in-frame. */
      .card.scroll-x { overflow-x: auto; }
      .card.scroll-x .trow { min-width: 780px; }
  }
}`
}

/**
 * The marketing site's stylesheet: 219 rules, from
 * partials/marketing-head.stx.
 *
 * Scoped to TWO groups, because two layouts include this partial: `home` is
 * index.stx, which includes it directly, and `marketing` is
 * layouts/marketing.stx, which every feature, comparison and docs page
 * extends. `:has()` takes a selector list, so that is one prefix rather than
 * two sheets.
 *
 * Everything else works the way `appCss()` above explains -- the prefix
 * written once with nesting, the html-rooted rules spelled out above the
 * block, `*` expanded to cover html and body. The two keyframes stay global:
 * a name is not scoped by anything, and `brand-beat` and `brand-ping` are
 * this app's alone.
 *
 * index.stx still has a <style> block of its own, 99 rules on top of these.
 * It is the `home` group's, and it declares nineteen names this sheet also
 * declares -- `.section`, `.feature-grid`, `.cta-band`, `.left` among them --
 * so the two have to move together or not at all. They move together.
 */
function marketingCss(): string {
  return `html:has(meta[name="stx-layout-group"][content="home"], meta[name="stx-layout-group"][content="marketing"]), html:has(meta[name="stx-layout-group"][content="home"], meta[name="stx-layout-group"][content="marketing"]) * { box-sizing: border-box; }
html:has(meta[name="stx-layout-group"][content="home"], meta[name="stx-layout-group"][content="marketing"]) {
    background: var(--bg);
    overflow-x: hidden;
    scroll-behavior: smooth;
  }
@keyframes brand-ping {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent); }
    70%, 100% { box-shadow: 0 0 0 9px transparent; }
  }
@keyframes brand-beat {
    0%, 45%, 100% { transform: scale(1); }
    10% { transform: scale(1.16); }
    20% { transform: scale(1); }
    30% { transform: scale(1.1); }
    40% { transform: scale(1); }
  }
html:has(meta[name="stx-layout-group"][content="home"], meta[name="stx-layout-group"][content="marketing"])[data-theme="dark"] .theme-toggle .icon-moon { display: none; }
html:has(meta[name="stx-layout-group"][content="home"], meta[name="stx-layout-group"][content="marketing"])[data-theme="dark"] .theme-toggle .icon-sun { display: block; }
@media (prefers-color-scheme: dark) {
html:has(meta[name="stx-layout-group"][content="home"], meta[name="stx-layout-group"][content="marketing"]):not([data-theme="light"]) .theme-toggle .icon-moon { display: none; }
html:has(meta[name="stx-layout-group"][content="home"], meta[name="stx-layout-group"][content="marketing"]):not([data-theme="light"]) .theme-toggle .icon-sun { display: block; }
}

html:has(meta[name="stx-layout-group"][content="home"], meta[name="stx-layout-group"][content="marketing"]) {
    body {
      min-width: 320px;
      min-height: 100vh;
      margin: 0;
      overflow-x: hidden;
      color: var(--fg);
      background: var(--bg);
      font-family: var(--font-body);
      transition: background-color 0.2s ease, color 0.2s ease;
    }
    a { color: inherit; text-decoration: none; }
    img { max-width: 100%; display: block; }
    ::selection { background: var(--accent-soft); }
    .site-shell {
      width: min(1180px, calc(100% - 40px));
      margin: 0 auto;
    }

    /* ------------------------------------------------------------------ */

    /* Navigation                                                          */

    /* ------------------------------------------------------------------ */
    .site-nav {
      position: sticky;
      top: 0;
      z-index: 40;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--bg) 78%, transparent);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }
    .nav-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 66px;
      gap: 1rem;
    }
    .brand {
      display: inline-flex;
      gap: 0.6rem;
      align-items: center;
      min-width: 0;
    }
    .brand-mark {
      position: relative;
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 8px;
      color: var(--accent-fg);
      background: var(--accent);
    }

    /* Live "pulse": a radar ring emanates from the mark while the waveform
       gives a double heartbeat, so the logo reads as an active signal rather
       than a static tile. Disabled under reduced-motion. */
    .brand-mark::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      animation: brand-ping 2.6s cubic-bezier(0, 0, 0.2, 1) infinite;
    }
    .brand-mark svg { width: 16px; height: 16px; transform-origin: center; animation: brand-beat 2.6s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) {
      .brand-mark::after, .brand-mark svg { animation: none; }
  }
    .brand-name {
      font-family: var(--font-display);
      font-size: 1.12rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      line-height: 1;
    }
    .nav-links {
      display: flex;
      gap: 1.75rem;
      align-items: center;
      color: var(--muted);
      font-size: 0.9rem;
      font-weight: 500;
    }
    .nav-links a:hover { color: var(--fg); }
    .nav-links a[aria-current="true"] { color: var(--fg); }

    /* ------------------------------------------------------------------ */

    /* Mega menu (Features / Use cases hover panels)                       */

    /* ------------------------------------------------------------------ */
    .nav-item { position: relative; display: inline-flex; align-items: center; }
    .nav-item > a { display: inline-flex; align-items: center; gap: 0.28rem; }
    .nav-item > a .caret {
      width: 13px; height: 13px; opacity: 0.7;
      transition: transform 0.18s ease;
    }
    .nav-item:hover > a .caret,
    .nav-item:focus-within > a .caret { transform: rotate(180deg); }
    .nav-mega {
      position: absolute;
      top: 100%;
      left: 0;                        /* open rightward from the trigger's left edge */
      padding-top: 12px;              /* transparent bridge so hover survives the gap */
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      z-index: 60;
    }
    .nav-item:hover > .nav-mega,
    .nav-item:focus-within > .nav-mega {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }
    .nav-mega-inner {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
      padding: 1.1rem;
      transform: translateY(6px);
      transition: transform 0.18s ease;
    }
    .nav-item:hover > .nav-mega .nav-mega-inner,
    .nav-item:focus-within > .nav-mega .nav-mega-inner { transform: translateY(0); }
    .nav-mega.features .nav-mega-inner {
      display: grid;
      grid-template-columns: repeat(3, minmax(150px, 1fr));
      gap: 0.4rem 1.75rem;
      width: min(90vw, 620px);
    }
    .nav-mega.usecases .nav-mega-inner {
      display: grid;
      grid-template-columns: repeat(2, minmax(210px, 1fr));
      gap: 0.2rem 0.5rem;
      width: min(90vw, 500px);
    }
    .mega-group h5 {
      margin: 0.15rem 0 0.35rem;
      color: var(--muted);
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .mega-group a {
      display: block;
      padding: 0.32rem 0;
      color: var(--fg);
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1.2;
    }
    .mega-group a:hover { color: var(--accent); }
    .mega-link {
      display: grid;
      gap: 0.1rem;
      padding: 0.5rem 0.6rem;
      border-radius: var(--radius-sm);
    }
    .mega-link:hover { background: var(--surface-2); }
    .mega-link strong { color: var(--fg); font-size: 0.88rem; font-weight: 600; }
    .mega-link span { color: var(--muted); font-size: 0.78rem; line-height: 1.35; }
    .mega-foot {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem 1rem;
      margin-top: 0.6rem;
      padding-top: 0.7rem;
      border-top: 1px solid var(--border);
    }
    .mega-foot .mega-foot-links { display: flex; flex-wrap: wrap; gap: 0.35rem 1.1rem; }
    .mega-foot .mega-foot-links a { color: var(--muted); font-size: 0.82rem; font-weight: 500; }
    .mega-foot .mega-foot-links a:hover { color: var(--fg); }
    .mega-foot .mega-all {
      display: inline-flex; align-items: center; gap: 0.3rem;
      color: var(--accent); font-size: 0.82rem; font-weight: 600;
    }
    .mega-foot .mega-all svg { width: 14px; height: 14px; }
    .nav-right {
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }

    /* Phone menu: a pure-CSS disclosure, no JS. Hidden until the desktop links
       go away at 900px, in the responsive block below. */
    .nav-menu { display: none; position: relative; }
    .nav-menu > summary {
      list-style: none;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    .nav-menu > summary::-webkit-details-marker { display: none; }
    .nav-menu > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .burger, .burger::before, .burger::after {
      display: block;
      width: 18px;
      height: 1.5px;
      background: var(--fg);
      transition: transform 0.2s ease, opacity 0.2s ease;
    }
    .burger { position: relative; }
    .burger::before { content: ""; position: absolute; top: -5px; }
    .burger::after { content: ""; position: absolute; top: 5px; }
    .nav-menu[open] .burger { background: transparent; }
    .nav-menu[open] .burger::before { transform: translateY(5px) rotate(45deg); }
    .nav-menu[open] .burger::after { transform: translateY(-5px) rotate(-45deg); }

    /* Bounded by the visible viewport: the 66px bar, the 12px gap and 12px of
       breathing room. The list is longer than a phone, so it scrolls in place;
       the page behind it is locked in the responsive block. */
    .nav-menu-panel {
      position: absolute;
      right: 0;
      top: calc(100% + 12px);
      z-index: 50;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      min-width: 248px;
      max-height: calc(100dvh - 90px);
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 0.6rem;
      background: var(--surface);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.22);
    }
    .nav-menu-panel a {
      padding: 0.6rem 0.7rem;
      border-radius: var(--radius-sm);
      color: var(--muted);
      font-size: 0.95rem;
      text-decoration: none;
    }
    .nav-menu-panel a:hover, .nav-menu-panel a[aria-current="true"] { color: var(--fg); background: var(--surface-2); }
    .nav-menu-panel .button { margin-top: 0.35rem; justify-content: center; }
    .nav-menu-group {
      padding: 0.7rem 0.7rem 0.25rem;
      color: var(--muted);
      font-family: var(--font-mono);
      font-size: 0.68rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .theme-toggle {
      display: inline-grid;
      place-items: center;
      width: 38px;
      height: 38px;
      flex: 0 0 auto;
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--fg);
      background: var(--surface);
      cursor: pointer;
    }
    .theme-toggle:hover { border-color: var(--border-strong); }
    .theme-toggle svg { width: 17px; height: 17px; }
    .theme-toggle .icon-sun { display: none; }

    /* ------------------------------------------------------------------ */

    /* Buttons                                                             */

    /* ------------------------------------------------------------------ */
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-height: 44px;
      padding: 0 1.2rem;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      color: var(--fg);
      font: inherit;
      font-size: 0.92rem;
      font-weight: 600;
      background: var(--surface);
      cursor: pointer;
      white-space: nowrap;
    }
    .button:hover { border-color: var(--fg); }
    .button:active { transform: translateY(1px); }
    .button svg { width: 17px; height: 17px; }
    .button.primary {
      border-color: var(--accent);
      color: var(--accent-fg);
      background: var(--accent);
    }
    .button.primary:hover { filter: brightness(1.05); border-color: var(--accent); }
    .button.wide { width: 100%; }

    /* ------------------------------------------------------------------ */

    /* Page hero (marketing subpages)                                      */

    /* ------------------------------------------------------------------ */
    .page-hero {
      max-width: 46rem;
      padding: clamp(3rem, 7vw, 5.5rem) 0 clamp(1.5rem, 3vw, 2.5rem);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      margin-bottom: 1.5rem;
      padding: 0.4rem 0.85rem;
      border: 1px solid var(--border-strong);
      border-radius: 999px;
      color: var(--muted);
      font-size: 0.8rem;
      font-weight: 600;
    }
    .badge .dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }
    .page-title {
      margin: 0 0 1.15rem;
      font-family: var(--font-display);
      font-size: clamp(2.1rem, 4.4vw, 3.3rem);
      font-weight: 600;
      letter-spacing: -0.02em;
      line-height: 1.08;
    }
    .page-title .accent-word { color: var(--accent); }
    .page-lead {
      max-width: 40rem;
      margin: 0;
      color: var(--muted);
      font-size: 1.12rem;
      line-height: 1.65;
    }
    .page-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.85rem;
      margin-top: 2rem;
    }

    /* ------------------------------------------------------------------ */

    /* Sections                                                            */

    /* ------------------------------------------------------------------ */
    .section { padding: clamp(3rem, 6vw, 5rem) 0; }
    .section-head {
      max-width: 42rem;
      margin: 0 auto 2.75rem;
      text-align: center;
    }
    .section-head.left {
      margin: 0 0 2.5rem;
      text-align: left;
    }
    .eyebrow {
      display: block;
      margin-bottom: 0.75rem;
      color: var(--accent);
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .section-title {
      margin: 0 0 0.85rem;
      font-family: var(--font-display);
      font-size: clamp(1.7rem, 3vw, 2.4rem);
      font-weight: 600;
      letter-spacing: -0.015em;
      line-height: 1.15;
    }
    .section-copy {
      margin: 0;
      color: var(--muted);
      font-size: 1.05rem;
      line-height: 1.65;
    }
    .section-copy a {
      color: var(--fg);
      font-weight: 600;
      border-bottom: 1px solid var(--border-strong);
    }
    .section-copy a:hover { color: var(--accent); border-color: var(--accent); }

    /* Split row: text beside a panel. Cap consecutive use at two (see the
       design pre-flight); break runs with checklists, bands, or grids. */
    .split-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: clamp(2rem, 5vw, 4.5rem);
      align-items: center;
      padding: clamp(2rem, 4vw, 3rem) 0;
    }
    .split-row.flip > .split-panel { order: -1; }
    .split-copy h2, .split-copy h3 {
      margin: 0 0 0.75rem;
      font-family: var(--font-display);
      font-size: clamp(1.4rem, 2.4vw, 1.9rem);
      font-weight: 600;
      letter-spacing: -0.01em;
      line-height: 1.2;
    }
    .split-copy p {
      margin: 0 0 1rem;
      color: var(--muted);
      font-size: 1rem;
      line-height: 1.65;
    }
    .split-copy p:last-child { margin-bottom: 0; }
    .split-copy a {
      color: var(--fg);
      font-weight: 600;
      border-bottom: 1px solid var(--border-strong);
    }
    .split-copy a:hover { color: var(--accent); border-color: var(--accent); }

    /* ------------------------------------------------------------------ */

    /* Panels: product-style data cards (mirror the real dashboard UI)     */

    /* ------------------------------------------------------------------ */
    .panel {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .panel-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--border);
    }
    .panel-top strong {
      font-family: var(--font-display);
      font-size: 0.95rem;
      font-weight: 600;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--success);
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .pill .dot { width: 6px; height: 6px; border-radius: 999px; background: var(--success); }
    .pill.warn { color: var(--amber); }
    .pill.warn .dot { background: var(--amber); }
    .pill.down { color: #ef4444; }
    .pill.down .dot { background: #ef4444; }
    .panel-list { padding: 0.5rem; display: grid; gap: 0.15rem; }
    .panel-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.85rem 0.85rem;
      border-radius: 10px;
    }
    .panel-row:hover { background: var(--surface-2); }
    .panel-row-main {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
    }
    .panel-row-main .dot {
      flex: 0 0 auto;
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--success);
      box-shadow: 0 0 0 4px var(--success-soft);
    }
    .panel-row-main .dot.warn { background: var(--amber); box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.12); }
    .panel-row-main .dot.down { background: #ef4444; box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.12); }
    .panel-row-name { font-size: 0.9rem; font-weight: 600; }
    .panel-row-sub {
      font-family: var(--font-mono);
      font-size: 0.74rem;
      color: var(--muted);
    }
    .panel-row-meta {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex: 0 0 auto;
      font-size: 0.78rem;
      color: var(--muted);
    }
    .panel-body { padding: 1.25rem; }
    .spark {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 22px;
    }
    .spark span {
      width: 3px;
      border-radius: 1px;
      background: var(--success);
      opacity: 0.55;
    }
    .uptime-bars {
      display: flex;
      gap: 2px;
      align-items: stretch;
      height: 30px;
    }
    .uptime-bars span {
      flex: 1 1 0;
      min-width: 1px;
      border-radius: 2px;
      background: var(--success);
      opacity: 0.75;
    }
    .uptime-bars span.warn { background: var(--amber); }
    .uptime-bars span.down { background: #ef4444; }

    /* Dark terminal/code panel (multiline sibling of the homepage oss-code) */
    .code-panel {
      padding: 1.25rem 1.5rem;
      border-radius: var(--radius);
      color: #8ce8bb;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      line-height: 1.7;
      background: #0d1210;
      overflow-x: auto;
    }
    .code-panel .cmt { color: #5c6864; }
    .code-panel .str { color: #c5b3ff; }
    .code-panel pre { margin: 0; font: inherit; }

    /* ------------------------------------------------------------------ */

    /* Cards & grids                                                       */

    /* ------------------------------------------------------------------ */
    .feature-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1.25rem;
    }
    .feature-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .feature-card {
      padding: 1.85rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
    }
    a.feature-card { transition: border-color 0.15s ease; }
    a.feature-card:hover { border-color: var(--accent); }
    .feature-icon {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      margin-bottom: 1.35rem;
      border-radius: 11px;
      color: var(--accent);
      background: var(--accent-soft);
    }
    .feature-icon svg { width: 22px; height: 22px; }
    .feature-card h3 {
      margin: 0 0 0.5rem;
      font-family: var(--font-display);
      font-size: 1.1rem;
      font-weight: 600;
    }
    .feature-card p {
      margin: 0;
      color: var(--muted);
      font-size: 0.95rem;
      line-height: 1.6;
    }
    .feature-card .card-more {
      display: inline-block;
      margin-top: 1rem;
      color: var(--accent);
      font-size: 0.88rem;
      font-weight: 600;
    }

    /* Checklist: dense fact rows without card chrome */
    .check-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem 2.5rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .check-list li {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      font-size: 0.95rem;
      line-height: 1.55;
      color: var(--muted);
    }
    .check-list li strong { color: var(--fg); font-weight: 600; }
    .check-list svg {
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      margin-top: 0.15rem;
      color: var(--accent);
    }

    /* ------------------------------------------------------------------ */

    /* Comparison table                                                    */

    /* ------------------------------------------------------------------ */
    .compare-scroll {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
    }
    .compare-table {
      width: 100%;
      min-width: 760px;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    .compare-table th,
    .compare-table td {
      padding: 0.8rem 1rem;
      border-bottom: 1px solid var(--border);
      text-align: center;
      white-space: nowrap;
    }
    .compare-table tr:last-child th,
    .compare-table tr:last-child td { border-bottom: 0; }
    .compare-table thead th {
      position: sticky;
      top: 0;
      background: var(--surface-2);
      font-family: var(--font-display);
      font-size: 0.88rem;
      font-weight: 600;
      z-index: 1;
    }
    .compare-table th[scope="row"] {
      text-align: left;
      font-weight: 500;
      color: var(--muted);
      white-space: normal;
      min-width: 180px;
    }
    .compare-table th[scope="row"] a {
      color: inherit;
      border-bottom: 1px dashed var(--border-strong);
    }
    .compare-table th[scope="row"] a:hover { color: var(--accent); border-color: var(--accent); }
    .compare-table .col-us {
      background: var(--accent-soft);
      font-weight: 600;
    }
    .compare-table thead .col-us { color: var(--accent); }
    .compare-table .group-row th {
      padding-top: 1.4rem;
      color: var(--fg);
      font-family: var(--font-display);
      font-weight: 600;
      font-size: 0.85rem;
    }
    .cell-yes { color: var(--accent); font-weight: 700; }
    .cell-no { color: var(--muted); opacity: 0.55; }
    .cell-part { color: var(--amber); font-size: 0.82rem; font-weight: 600; }
    .table-note {
      margin: 0.85rem 0 0;
      color: var(--muted);
      font-size: 0.82rem;
    }

    /* Verdict cards ("choose X if...") */
    .verdict-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1.25rem;
    }
    .verdict-card {
      padding: 1.6rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
    }
    .verdict-card.lead {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
    }
    .verdict-card h3 {
      margin: 0 0 0.35rem;
      font-family: var(--font-display);
      font-size: 1.05rem;
      font-weight: 600;
    }
    .verdict-card .verdict-tag {
      display: block;
      margin-bottom: 0.85rem;
      color: var(--muted);
      font-size: 0.8rem;
    }
    .verdict-card p {
      margin: 0;
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.6;
    }

    /* ------------------------------------------------------------------ */

    /* Bands                                                               */

    /* ------------------------------------------------------------------ */
    .note-band {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 2rem;
      align-items: center;
      padding: clamp(2rem, 5vw, 3rem);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: linear-gradient(135deg, var(--surface), var(--surface-2));
    }
    .note-band h2 {
      margin: 0 0 0.75rem;
      font-family: var(--font-display);
      font-size: clamp(1.5rem, 2.6vw, 2rem);
      font-weight: 600;
    }
    .note-band p {
      max-width: 38rem;
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
    }
    .note-band .oss-code {
      padding: 1rem 1.25rem;
      border-radius: var(--radius-sm);
      color: #8ce8bb;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      white-space: nowrap;
      background: #0d1210;
    }
    .cta-band {
      padding: clamp(3rem, 7vw, 5rem) clamp(1.5rem, 4vw, 3rem);
      border-radius: var(--radius);
      color: #ffffff;
      text-align: center;
      background-color: #2563eb;
      background-image: linear-gradient(135deg, var(--accent), var(--violet));
    }
    .cta-band h2 {
      margin: 0 0 0.85rem;
      font-family: var(--font-display);
      font-size: clamp(1.7rem, 3.2vw, 2.5rem);
      font-weight: 600;
    }
    .cta-band p {
      margin: 0 0 1.75rem;
      font-size: 1.05rem;
      opacity: 0.92;
    }
    .cta-band .button.primary {
      border-color: #ffffff;
      color: #0b0f0d;
      background: #ffffff;
    }
    .cta-band .actions {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 0.85rem;
    }
    .cta-band .button:not(.primary) {
      border-color: rgba(255, 255, 255, 0.5);
      color: #ffffff;
      background: transparent;
    }

    /* ------------------------------------------------------------------ */

    /* FAQ                                                                 */

    /* ------------------------------------------------------------------ */
    .faq-list {
      max-width: 44rem;
      margin: 0 auto;
      display: grid;
      gap: 0.75rem;
    }
    .faq-item {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface);
      overflow: hidden;
    }
    .faq-item summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.1rem 1.35rem;
      list-style: none;
      font-weight: 600;
      cursor: pointer;
    }
    .faq-item summary::-webkit-details-marker { display: none; }
    .faq-item summary::after {
      content: "+";
      flex: 0 0 auto;
      color: var(--muted);
      font-family: var(--font-display);
      font-size: 1.3rem;
    }
    .faq-item[open] summary::after { content: "\\2013"; }
    .faq-item p {
      margin: 0;
      padding: 0 1.35rem 1.25rem;
      color: var(--muted);
      line-height: 1.6;
    }

    /* ------------------------------------------------------------------ */

    /* Footer                                                              */

    /* ------------------------------------------------------------------ */
    .site-footer {
      margin-top: 1rem;
      padding: 3rem 0 2.5rem;
      border-top: 1px solid var(--border);
    }
    .footer-grid {
      display: grid;
      grid-template-columns: 1.4fr repeat(4, 1fr);
      gap: 2rem;
      margin-bottom: 2.5rem;
    }
    .footer-brand p {
      max-width: 20rem;
      margin-top: 0.85rem;
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.6;
    }
    .footer-col h4 {
      margin: 0 0 1rem;
      color: var(--muted);
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .footer-col ul {
      display: grid;
      gap: 0.65rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .footer-col a { font-size: 0.92rem; color: var(--fg); }
    .footer-col a:hover { color: var(--accent); }
    .footer-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding-top: 1.75rem;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.85rem;
    }
    .footer-social { display: flex; gap: 0.75rem; }
    .footer-social a {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--muted);
    }
    .footer-social a:hover { color: var(--fg); border-color: var(--border-strong); }
    .footer-social svg { width: 17px; height: 17px; }

    /* ------------------------------------------------------------------ */

    /* Responsive                                                          */

    /* ------------------------------------------------------------------ */
  @media (max-width: 900px) {
      .site-shell { width: min(100% - 32px, 720px); }
      .split-row { grid-template-columns: minmax(0, 1fr); }
      .split-row.flip > .split-panel { order: 0; }
      .feature-grid,
      .feature-grid.two,
      .verdict-grid,
      .check-list {
        grid-template-columns: minmax(0, 1fr);
      }
      .note-band { grid-template-columns: minmax(0, 1fr); }
      .note-band .oss-code { white-space: normal; word-break: break-all; }
      .footer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .nav-links { display: none; }
      .nav-menu { display: block; }
      body:has(.nav-menu[open]) { overflow: hidden; }
  }
  @media (max-width: 560px) {
      .page-actions,
      .cta-band .actions {
        flex-direction: column;
        align-items: stretch;
      }
      .footer-grid { grid-template-columns: minmax(0, 1fr); }
      .footer-bottom {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75rem;
      }
      .nav-right { gap: 0.4rem; }
      .nav-right a.button:not(.primary) { display: none; }
      .nav-right .button.primary { padding: 0 0.85rem; font-size: 0.85rem; }
      .brand-name { font-size: 1rem; }
  }
}`
}

/**
 * The homepage's own 99 rules, from index.stx.
 *
 * Its header called them "homepage-scale overrides", and they are: nineteen
 * of the names here are also declared by `marketingCss()` -- `.section`,
 * `.feature-grid`, `.cta-band`, `.left`, `.section-title` among them -- and
 * the view's comment asked that they stay AFTER the include for exactly that
 * reason. They still do: this entry follows that one, and the `home` group is
 * a subset of the two that one covers, so on the homepage both apply and
 * these win, which is what the include order did.
 *
 * index.stx is a document-owning page rather than a fragment, so its rules
 * reach for `body[data-site-mode=…]`; those nest cleanly, since body is below
 * the prefix rather than at it.
 */
function homeCss(): string {
  return `@keyframes mode-in {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}

html:has(meta[name="stx-layout-group"][content="home"]) {
  body[data-site-mode="coming-soon"] .site-content {
    display: none;
  }
  body[data-site-mode="coming-soon"].site-mode-unlocked .site-content {
    display: block;
  }
  body[data-site-mode="coming-soon"].site-mode-unlocked .mode-screen,
  body:not([data-site-mode="coming-soon"]) .mode-screen {
    display: none;
  }
  .mode-screen {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2rem;
  }
  .mode-card {
    position: relative;
    width: min(680px, 100%);
    padding: clamp(2.25rem, 6vw, 4rem);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    text-align: center;
  }
  .mode-content > * {
    animation: mode-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .mode-content > *:nth-child(2) { animation-delay: 0.05s; }
  .mode-content > *:nth-child(3) { animation-delay: 0.1s; }
  .mode-content > *:nth-child(4) { animation-delay: 0.15s; }
  @media (prefers-reduced-motion: reduce) {
    .mode-content > * { animation: none; }
  }
  .mode-title {
    margin: 0 0 0.75rem;
    font-family: var(--font-display);
    font-size: clamp(2rem, 5vw, 3rem);
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .mode-lead {
    margin: 0 0 0.75rem;
    color: var(--accent);
    font-weight: 600;
    font-size: 1.05rem;
  }
  .mode-copy {
    max-width: 32rem;
    margin: 0 auto;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1.6;
  }
  .mode-subscribe {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin: 1.75rem auto 0;
    max-width: 26rem;
  }
  .mode-subscribe input {
    flex: 1 1 12rem;
    min-height: 46px;
    padding: 0 1rem;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    color: var(--fg);
    font: inherit;
    font-size: 0.95rem;
    background: var(--bg);
  }
  .mode-subscribe input::placeholder { color: var(--muted); opacity: 0.75; }
  .mode-subscribe input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .mode-subscribe button {
    flex: 0 0 auto;
    min-height: 46px;
  }
  .mode-meta {
    display: flex;
    justify-content: center;
    margin-top: 1.5rem;
  }
  .mode-textlink {
    color: var(--muted);
    font-weight: 600;
    font-size: 0.9rem;
    border-bottom: 1px solid var(--border-strong);
    padding-bottom: 1px;
  }
  .mode-textlink:hover { color: var(--accent); border-color: var(--accent); }
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(380px, 0.95fr);
    gap: clamp(2rem, 4vw, 4rem);
    align-items: center;
    padding: clamp(3rem, 8vw, 6.5rem) 0 clamp(2rem, 4vw, 3rem);
  }
  .hero-title {
    margin: 0 0 1.15rem;
    font-family: var(--font-display);
    font-size: clamp(2.4rem, 5vw, 3.9rem);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.05;
  }
  .hero-title .accent-word { color: var(--accent); }
  .hero-copy {
    max-width: 38rem;
    margin: 0;
    color: var(--muted);
    font-size: 1.15rem;
    line-height: 1.65;
  }
  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem;
    margin-top: 2rem;
  }
  .hero-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 2rem;
    margin-top: 2.75rem;
    padding-top: 1.75rem;
    border-top: 1px solid var(--border);
  }
  .hero-stat strong {
    display: block;
    font-family: var(--font-display);
    font-size: 1.4rem;
    font-weight: 600;
  }
  .hero-stat span {
    display: block;
    margin-top: 0.15rem;
    color: var(--muted);
    font-size: 0.82rem;
  }
  .preview-card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .preview-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
  }
  .preview-top strong {
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 600;
  }
  .preview-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--success);
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .preview-pill .dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--success);
  }
  .preview-list {
    padding: 0.5rem;
    display: grid;
    gap: 0.15rem;
  }
  .preview-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 0.85rem;
    border-radius: 10px;
  }
  .preview-row:hover { background: var(--surface-2); }
  .preview-row-main {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }
  .preview-row-main .dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--success);
    box-shadow: 0 0 0 4px var(--success-soft);
  }
  .preview-row-name {
    font-size: 0.9rem;
    font-weight: 600;
  }
  .preview-row-url {
    font-family: var(--font-mono);
    font-size: 0.74rem;
    color: var(--muted);
  }
  .preview-row-meta {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex: 0 0 auto;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .preview-chart {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 22px;
  }
  .preview-chart span {
    width: 3px;
    border-radius: 1px;
    background: var(--success);
    opacity: 0.55;
  }


  /* Homepage-scale overrides of the shared .section* rules */
  .section {
    padding: clamp(3.5rem, 7vw, 6rem) 0;
  }
  .section-head {
    max-width: 40rem;
    margin: 0 auto 3rem;
    text-align: center;
  }
  .section-head.left {
    margin: 0 0 3rem;
    text-align: left;
  }
  .section-title {
    margin: 0 0 0.85rem;
    font-family: var(--font-display);
    font-size: clamp(1.8rem, 3vw, 2.5rem);
    font-weight: 600;
    letter-spacing: -0.015em;
    line-height: 1.15;
  }
  .section-copy {
    margin: 0;
    color: var(--muted);
    font-size: 1.08rem;
    line-height: 1.65;
  }
  .steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2rem;
  }
  .step em {
    display: block;
    margin-bottom: 0.75rem;
    color: var(--border-strong);
    font-family: var(--font-display);
    font-style: normal;
    font-size: 2.1rem;
    font-weight: 600;
  }
  .step h3 {
    margin: 0 0 0.5rem;
    font-family: var(--font-display);
    font-size: 1.12rem;
    font-weight: 600;
  }
  .step p {
    margin: 0;
    color: var(--muted);
    line-height: 1.6;
  }
  .showcase {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .showcase-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.85rem 1.1rem;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }
  .showcase-bar .traffic-dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: var(--border-strong);
  }
  .showcase-url {
    margin-left: 0.5rem;
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.78rem;
  }
  .showcase-body {
    padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1.25rem, 4vw, 3rem);
  }
  .showcase-banner {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    margin-bottom: 1.5rem;
    padding: 1rem 1.25rem;
    border-radius: var(--radius-sm);
    color: var(--success);
    font-weight: 600;
    background: var(--success-soft);
  }
  .showcase-banner .dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: var(--success);
  }
  .showcase-grid {
    display: grid;
    gap: 0.25rem;
  }
  .showcase-row {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.9rem 0;
    border-bottom: 1px solid var(--border);
  }
  .showcase-row:last-child { border-bottom: 0; }
  .showcase-row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .showcase-row-main {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }
  .showcase-row-main .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--success);
  }
  .showcase-uptime {
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }


  /* Uptime-history strip: a row of thin day-bars, mostly green with the
     odd amber/red blip. Decorative (the % label carries the real info),
     so it's aria-hidden in the markup. */
  .showcase-ticks {
    display: flex;
    gap: 2px;
    align-items: stretch;
    height: 26px;
  }
  .showcase-tick {
    flex: 1 1 0;
    min-width: 1px;
    border-radius: 2px;
    opacity: 0.9;
  }
  .oss-band {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2rem;
    align-items: center;
    padding: clamp(2rem, 5vw, 3rem);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: linear-gradient(135deg, var(--surface), var(--surface-2));
  }
  .oss-band h2 {
    margin: 0 0 0.75rem;
    font-family: var(--font-display);
    font-size: clamp(1.5rem, 2.6vw, 2rem);
    font-weight: 600;
  }
  .oss-band p {
    max-width: 34rem;
    margin: 0;
    color: var(--muted);
    line-height: 1.6;
  }
  .oss-code {
    padding: 1rem 1.25rem;
    border-radius: var(--radius-sm);
    color: #8ce8bb;
    font-family: var(--font-mono);
    font-size: 0.85rem;
    white-space: nowrap;
    background: #0d1210;
  }
  .pricing-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.5rem;
    max-width: 52rem;
    margin: 0 auto;
  }
  .price-card {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 2rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .price-card.highlighted {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent), var(--shadow);
  }
  .price-card.highlighted::before {
    content: "Most popular";
    position: absolute;
    top: -12px;
    left: 2rem;
    padding: 0.3rem 0.8rem;
    border-radius: 999px;
    color: var(--accent-fg);
    font-size: 0.72rem;
    font-weight: 700;
    background: var(--accent);
  }
  .price-name {
    margin: 0 0 0.5rem;
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 600;
  }
  .price-value {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    margin-bottom: 0.75rem;
  }
  .price-value strong {
    font-family: var(--font-display);
    font-size: 2.5rem;
    font-weight: 600;
  }
  .price-value span { color: var(--muted); font-size: 0.9rem; }
  .price-desc {
    margin: 0 0 1.5rem;
    color: var(--muted);
    font-size: 0.92rem;
    line-height: 1.55;
  }
  .price-features {
    display: grid;
    gap: 0.65rem;
    margin: 0 0 2rem;
    padding: 0;
    list-style: none;
  }
  .price-features li {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    font-size: 0.9rem;
  }
  .price-features svg {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    margin-top: 0.1rem;
    color: var(--accent);
  }
  .price-card .button { margin-top: auto; }


  /* Homepage footer has 4 blocks; the shared rule assumes 5 */
  .footer-grid {
    display: grid;
    grid-template-columns: 1.4fr repeat(3, 1fr);
    gap: 2rem;
    margin-bottom: 2.5rem;
  }
  @media (max-width: 900px) {
    .hero {
      grid-template-columns: minmax(0, 1fr);
      padding: 2.5rem 0 2rem;
    }
    .hero-stats {
      gap: 1.5rem;
    }
    .feature-grid,
    .steps {
      grid-template-columns: minmax(0, 1fr);
    }
    .oss-band,
    .pricing-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .oss-code {
      white-space: normal;
      word-break: break-all;
    }
  }
  @media (max-width: 560px) {
    .hero-actions,
    .cta-band .actions {
      flex-direction: column;
      align-items: stretch;
    }
  }
}`
}

export default {
  content: [
    './resources/views/**/*.{stx,html}',
    './resources/**/*.{stx,html}',
    './storage/framework/defaults/resources/views/**/*.{stx,html}',
    './storage/framework/defaults/resources/components/**/*.{stx,html}',
    // The framework's error-page views used to be scanned from the vendored
    // tree. @stacksjs/error-handling now renders them from JS and ships its
    // own error-page-styles, so there is no .stx left to scan -- the package
    // contains none. Nothing to repoint this glob at; it is simply gone.
  ],
  preflight: true,
  minify: false,
  preflights: [
    { getCSS: paletteCss },
    { getCSS: appCss },
    { getCSS: marketingCss },
    { getCSS: homeCss },
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces & text
        canvas: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        // Borders — a subtle default and a stronger one (border-subtle / border-strong)
        subtle: 'var(--border)',
        strong: 'var(--border-strong)',
        // Brand accent
        accent: 'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
        'accent-soft': 'var(--accent-soft)',
        // Status
        success: 'var(--success)',
        'success-soft': 'var(--success-soft)',
        amber: 'var(--amber)',
        'amber-soft': 'var(--amber-soft)',
        danger: 'var(--danger)',
        'danger-soft': 'var(--danger-soft)',
      
        // --- @stacksjs/components' token vocabulary ------------------------
        // The shipped components are written against their own semantic names
        // (text-fg, bg-surface, border-line-strong, ...) used 300+ times across
        // the 102 components. This palette already satisfied `surface`, `fg`
        // and `accent`; the rest resolved to nothing, so a component that
        // imposes no colour of its own rendered half-styled - text fell back to
        // inherit and panels had no background.
        //
        // Note `line` rather than reusing `subtle`/`strong`: those already mean
        // border colours here, but the library spells them line/line-strong and
        // a component cannot be told otherwise.
        //
        // Purely additive - none of these names appear in this app's markup, so
        // no existing element changes. Does NOT fix <Button variant="primary">,
        // which hard-codes bg-blue-500 - stacksjs/stx#1993. See status#20.
        'surface-sunken': 'var(--bg)',
        'surface-raised': 'color-mix(in srgb, var(--accent) 8%, var(--surface))',
        'fg-strong': 'var(--fg)',
        /*
         * The library asks for four steps of quiet text - fg, fg-muted,
         * fg-soft, fg-subtle - and this palette has TWO: --fg and --muted. So the
         * three quiet roles all take the same value, and that is a statement
         * rather than an oversight.
         *
         * The other four HQ apps have a third text step and point fg-soft at
         * it, because <Breadcrumb> paints separators with fg-soft and links
         * with fg-muted, and equal values make a divider as loud as the labels
         * it divides. There is nothing to point at here. Inventing a third
         * grey with color-mix would be a design decision, not a mapping, so it
         * stays a deliberate collapse until this palette grows one.
         */
        'fg-muted': 'var(--muted)',
        'fg-soft': 'var(--muted)',
        'fg-subtle': 'var(--muted)',
        line: 'var(--border)',
        'line-strong': 'var(--border-strong)',
        'accent-solid': 'var(--accent)',
        /*
         * `panel` is @stacksjs/components' role name for a raised surface —
         * <EmptyState variant="panel"> is `bg-panel rounded-panel ring-1
         * ring-line`. Aliased to the same vars this app's own `.empty` rule
         * already uses (surface + border + radius) so a component renders
         * identically to the hand-written markup it replaces, rather than
         * losing its background to an undefined utility.
         */
        panel: 'var(--surface)',

        /*
         * The rest of that vocabulary, added 2026-10-09 so <Badge> and the other
         * role-styled components render in this palette.
         *
         * These have to be theme.colors entries rather than `--stx-*` declarations
         * in a preflight. stx resolves each role as `var(--stx-<name>, <light
         * value>)` and emits its own :root/.dark block of defaults; a preflight
         * lands in @layer tc-base and that block is unlayered, so the preflight
         * loses whatever its specificity. Replacing the colour outright skips the
         * variable entirely. (Measured in bughq: a preflight left every soft
         * variant on the library's light colours at ~1.05:1 in dark mode.)
         *
         * That matters here because this app themes with [data-theme] and no
         * `dark` class, so the `.dark` half of stx's defaults never matches and
         * every library component would otherwise keep its LIGHT values in dark.
         *
         * Unlike bughq, this palette has a real amber, so `warning` is a genuine
         * third status hue rather than a neutral stand-in. `info` and `secondary`
         * still are: there is no cyan or purple here, and a light-mode default
         * that cannot re-theme is worse than a deliberate neutral.
         */
        page: 'var(--bg)',
        content: 'var(--fg)',
        field: 'var(--surface)',
        'field-hover': 'var(--surface-2)',
        'surface-hover': 'var(--surface-2)',
        'line-hover': 'var(--border-strong)',
        link: 'var(--accent)',
        'link-hover': 'var(--accent)',
        'accent-ink': 'var(--accent-fg)',
        'accent-soft-ink': 'var(--accent)',
        'accent-solid-hover': 'var(--accent)',
        'success-ink': 'var(--bg)',
        'success-solid': 'var(--success)',
        'success-soft-ink': 'var(--success)',
        'danger-ink': 'var(--bg)',
        'danger-solid': 'var(--danger)',
        'danger-soft-ink': 'var(--danger)',
        warning: 'var(--amber)',
        'warning-ink': 'var(--bg)',
        'warning-solid': 'var(--amber)',
        'warning-soft': 'var(--amber-soft)',
        'warning-soft-ink': 'var(--amber)',
        info: 'var(--muted)',
        'info-ink': 'var(--bg)',
        'info-soft': 'var(--surface-2)',
        'info-soft-ink': 'var(--muted)',
        secondary: 'var(--muted)',
        'secondary-ink': 'var(--bg)',
        'secondary-soft': 'var(--surface-2)',
        'secondary-soft-ink': 'var(--muted)',
        inverse: 'var(--fg)',
        'inverse-ink': 'var(--bg)',

        // The remaining roles. Omitted on the first pass because nothing in
        // this app used them yet, which was the wrong test: an unmapped role
        // does not fall back to this palette, it falls back to stx's own light
        // value, and the `.dark` half of that never matches a [data-theme] app.
        // So any component reaching for one of these would have rendered a
        // light chip on a dark page the moment it was adopted.
        'surface-raised-hover': 'color-mix(in srgb, var(--fg) 6%, var(--surface-2))',
        'surface-sunken-hover': 'color-mix(in srgb, var(--fg) 6%, var(--bg))',
        'success-solid-hover': 'color-mix(in srgb, var(--success) 92%, var(--fg))',
        'danger-solid-hover': 'color-mix(in srgb, var(--danger) 92%, var(--fg))',
        'warning-solid-hover': 'color-mix(in srgb, var(--amber) 92%, var(--fg))',
        'info-solid': 'var(--muted)',
        'info-solid-hover': 'var(--fg)',
        'secondary-solid': 'var(--muted)',
        'secondary-solid-hover': 'var(--fg)',
        // The danger-* detail roles, used by the library's destructive inputs
        // and confirm dialogs for their text, hairline and focus ring.
        'danger-fg': 'var(--danger)',
        'danger-fg-subtle': 'color-mix(in srgb, var(--danger) 70%, var(--surface))',
        'danger-line': 'color-mix(in srgb, var(--danger) 34%, transparent)',
        'danger-focus': 'color-mix(in srgb, var(--danger) 45%, transparent)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        card: 'var(--radius)',
        // The library's shape roles, same mechanism as the colours: they resolve
        // as `var(--stx-radius-*, <stock>)` and the stock control radius is
        // 0.375rem, which is not this app's.
        control: 'var(--radius-sm)',
        pill: '999px',
        'card-sm': 'var(--radius-sm)',
        // Same alias as the `panel` colour above: the component library's
        // radius role name, pointed at this app's existing radius.
        panel: 'var(--radius)',
      },
    },
  },
}
