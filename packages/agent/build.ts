import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const outdir = resolve(import.meta.dir, 'dist')
rmSync(outdir, { recursive: true, force: true })

const result = await Bun.build({
  entrypoints: [
    resolve(import.meta.dir, 'src/index.ts'),
    resolve(import.meta.dir, 'src/cli.ts'),
  ],
  outdir,
  target: 'node',
  format: 'esm',
  sourcemap: 'external',
})

if (!result.success) {
  for (const log of result.logs)
    console.error(log)
  process.exit(1)
}

console.log(`Built @statushq/agent to ${outdir}.`)
