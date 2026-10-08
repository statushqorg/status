# resources/stores

Client-side stores live here. `config/ui.ts` pins `storesDir` to this path and
the store loader resolves `path.resolve(root, storesDir)` at boot, so the
directory must exist even while empty — same reason as
`resources/components/README.md`.

Nothing lives here yet by design: this app is server-rendered with plain
scripts, a decision documented in
`resources/views/dashboard/monitors/index.stx`'s header.

The `:for expected an array` warning behind that decision was re-tested on
stx 0.2.399 and diagnosed (2026-10-08): `:for` is expanded client-side and
cannot see a `<script server>` binding, which is the only form that fails.
Every signal form works, including a server array wrapped in `state()`. So a
real store is no longer gated on anything upstream, just on the work itself.
Upstream report: stacksjs/stx#2051.
