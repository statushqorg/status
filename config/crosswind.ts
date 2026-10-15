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
