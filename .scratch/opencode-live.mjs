/** Read-only Go check using the configured key; secrets stay in memory/headers. */
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const yaml = readFileSync(process.env.HOME + '/.dsh/.credentials.yaml', 'utf8')
const scalar = /^  OPENCODE_GO_API_KEY:\s*(.+)$/m.exec(yaml)?.[1]?.trim()
if (!scalar) throw new Error('OPENCODE_GO_API_KEY is not configured')
const key = scalar.startsWith('"') ? JSON.parse(scalar)
  : scalar.startsWith("'") ? scalar.slice(1, -1).replaceAll("''", "'") : scalar
const bundled = await build({
  stdin: { contents: "export { providerBalance } from './src/host/balance'", resolveDir: new URL('../', import.meta.url).pathname },
  bundle: true, platform: 'node', format: 'esm', write: false,
})
const { providerBalance } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const balance = await providerBalance(() => undefined, {}, 'opencode-go', undefined, async () => key, 'OPENCODE_GO_API_KEY')
console.log(JSON.stringify(balance).replaceAll(key, '[redacted]'))
if (balance.status !== 'ready') process.exitCode = 1
