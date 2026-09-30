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
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        card: 'var(--radius)',
        'card-sm': 'var(--radius-sm)',
      },
    },
  },
}
