/**
 * Crosswind (utility CSS) config.
 * @see https://github.com/cwcss/crosswind
 *
 * `theme.extend` is deep-merged onto Crosswind's defaults, so the standard
 * palette (red-500, etc.) stays intact — these just add the app's design-system
 * tokens as named utilities, mapped to the CSS variables defined in
 * resources/views/partials/app-head.stx. Prefer these over `[var(--…)]`
 * arbitrary values: `bg-surface`, `border-subtle`, `text-muted`, `text-success`,
 * `font-display`, `rounded-card`, and so on.
 */
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
