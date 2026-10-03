/** Official Go contract, credential transport, scoped Host commands and rendering. No network. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const bundled = await build({
  stdin: {
    contents: `export { parseOpenCodeGoUsage } from './src/host/opencode';
      export { balanceTarget, consoleLink } from './src/host/links';
      export { providerBalance } from './src/host/balance';
      export { initReact } from './src/client/react';
      export { BalanceBlock } from './src/client/ui/balance';
      export { translate } from './src/client/i18n';
      export { SUPPORTED_BALANCE_QUERIES } from './src/balance-support';`,
    resolveDir: root.pathname,
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
})
const { parseOpenCodeGoUsage, balanceTarget, consoleLink, providerBalance, initReact, BalanceBlock, translate, SUPPORTED_BALANCE_QUERIES } =
  await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const reset = '2026-10-10T08:00:00Z'
const fixture = { usage: {
  rolling: { status: 'ok', percent: 25, resetsAt: reset },
  weekly: { status: 'ok', percent: 62.5, resetsAt: reset },
  monthly: { status: 'rate-limited', percent: 100, resetsAt: reset },
} }
const parsed = parseOpenCodeGoUsage(fixture)
assert.equal(parsed.status, 'ready')
assert.deepEqual(parsed.quotas.map((q) => [q.id, q.usedPercent, q.remainingPercent, q.resetAt]),
  [['five-hour', 25, 75, reset], ['weekly', 62.5, 37.5, reset], ['monthly', 100, 0, reset]])
assert.deepEqual(parsed.wallets, [], 'Go percentages do not fabricate a Zen wallet')
for (const percent of [0, '0', '100', 110]) {
  const result = parseOpenCodeGoUsage({ usage: { monthly: { status: 'ok', percent, resetsAt: 'invalid' } } })
  assert.equal(result.status, 'ready')
  assert.equal(result.quotas.length, 1, 'missing windows are not filled')
  assert.equal(result.quotas[0].remainingPercent, Math.max(0, 100 - Number(percent)))
  assert.equal(result.quotas[0].resetAt, undefined)
}
for (const percent of [null, true, '', ' ', 'bad', -1, Infinity]) {
  assert.equal(parseOpenCodeGoUsage({ usage: { rolling: { status: 'ok', percent } } }).status, 'failed')
}
for (const data of [null, [], {}, { usage: {} }, { usage: { rolling: { percent: 20 } } },
  { usage: { monthly: { status: 'unknown', percent: 0 } } }, { type: 'error', error: { type: 'EntitlementError' } }]) {
  assert.equal(parseOpenCodeGoUsage(data).status, 'failed')
}
console.log('PASS official percentages, depleted/partial windows, reset validation, malformed responses and no fabricated wallet')

for (const [id, base, expected] of [
  ['opencode-go', undefined, 'https://opencode.ai/zen/go/v1/usage'],
  ['opencode-go', 'https://opencode.ai/zen/go/v1/', 'https://opencode.ai/zen/go/v1/usage'],
  ['custom', 'https://opencode.ai/zen/go', 'https://opencode.ai/zen/go/v1/usage'],
  ['opencode-go', 'https://proxy.example/prefix/go/v1/?test=1#ignored', 'https://proxy.example/prefix/go/v1/usage'],
]) assert.deepEqual(balanceTarget(id, base), { kind: 'opencode-go', url: expected })
for (const [id, base] of [
  ['opencode', 'https://opencode.ai/zen/v1'], ['opencode-go', 'https://opencode.ai/zen/v1'],
  ['custom', 'https://opencode.ai.example/zen/go/v1'], ['opencode-go', 'bad-url'],
  ['opencode-go', 'file:///zen/go/v1'], ['custom', undefined],
]) assert.equal(balanceTarget(id, base).kind, 'unsupported')
assert.equal(consoleLink('opencode-go', undefined), 'https://opencode.ai/workspace')
assert.equal(consoleLink('opencode', 'https://opencode.ai/zen/v1'), 'https://opencode.ai/workspace')
console.log('PASS default/official/proxy endpoints and separate Zen routes')

const key = 'fixture-go-key-never-log'
let status = 200
let data = fixture
let requests = 0
const subprocess = {
  resolveExecutable: async () => '/mock/node',
  spawn(spec) {
    requests++
    assert.ok(!JSON.stringify(spec.argv).includes(key))
    const request = JSON.parse(spec.stdio.stdin.data)
    assert.equal(request.url, 'https://opencode.ai/zen/go/v1/usage')
    assert.equal(request.method, 'GET')
    assert.equal(request.headers.Authorization, 'Bearer ' + key)
    assert.ok(request.timeoutMs > 0 && request.timeoutMs <= 15_000)
    return {
      done: Promise.resolve({ exitCode: 0 }),
      collected: { stdout: { readFrom: () => ({ text: JSON.stringify({ status, body: JSON.stringify(data) }) }) } },
    }
  },
}
const query = (resolve = async () => key) => providerBalance(
  (name) => name === 'subprocess' ? subprocess : undefined, {}, 'opencode-go', undefined, resolve, 'OPENCODE_GO_API_KEY',
)
assert.equal((await query()).status, 'ready')
const beforeMissing = requests
assert.equal((await query(async () => undefined)).status, 'no-credential')
assert.equal(requests, beforeMissing)
for (const code of [401, 403, 429, 500]) {
  status = code
  const failed = await query()
  assert.equal(failed.status, 'failed')
  assert.ok(!JSON.stringify(failed).includes(key))
  assert.ok(failed.link)
  if (code === 403) assert.match(failed.message, /订阅/)
}
status = 200
data = {}
assert.equal((await query()).status, 'failed')
data = fixture
const originalFetch = globalThis.fetch
try {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://opencode.ai/zen/go/v1/usage')
    assert.equal(options.headers.Authorization, 'Bearer ' + key)
    assert.ok(options.signal instanceof AbortSignal)
    return new Response(JSON.stringify(fixture), { status: 200 })
  }
  assert.equal((await providerBalance(() => undefined, {}, 'opencode-go', undefined, async () => key, 'key')).status, 'ready')
} finally { globalThis.fetch = originalFetch }
console.log('PASS bounded stdin-only credential transport, missing credentials, HTTP errors and fetch fallback')

const host = readFileSync(new URL('lib/index.js', root), 'utf8')
  .replace(/^import \{ defineTool \}.*$/m, 'const defineTool = (options) => options')
const { apply } = await import('data:text/javascript;base64,' + Buffer.from(host).toString('base64'))
for (const record of [false, true]) {
  const commands = []
  const asked = []
  let accounts = 0
  const services = {
    llm: {
      listProviders: () => [{ id: 'deepseek-account' }, { id: 'opencode-go' }],
      listConfigurableProviders: () => [{ provider: 'opencode-go', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'opencode-go'] }],
      listModels: (id) => { asked.push(id); return [{ id: 'model' }] },
    },
    settings: { describe: () => [{ ns: 'llm-pi-ai', value: { providers: {
      'opencode-go': record ? {} : { apiKeyEnv: 'OPENCODE_GO_API_KEY' },
    } } }] },
    credentials: {
      describe: async () => ({ configured: true }), resolve: async () => key,
      describeRecord: async () => ({ configured: record, kind: 'api-key' }),
      readRecord: async () => ({ kind: 'api-key', key }),
    },
    deepseekAccount: { getBalance: async () => { accounts++; return { status: 'ready', value: [] } } },
    subprocess,
  }
  apply({ get: (name) => services[name], commands: { register: (c) => commands.push(c) }, tools: { register() {} } }, { includeModelDetails: false })
  const run = async (rawInput) => JSON.parse((await commands[0].handler({ rawInput })).text)
  const scoped = await run('refresh provider=opencode-go')
  assert.deepEqual(scoped.providers.map((p) => p.id), ['opencode-go'])
  assert.deepEqual(asked, ['opencode-go'])
  assert.equal(accounts, 0)
  assert.deepEqual(scoped.providers[0].balance.quotas.map((q) => q.remainingPercent), [75, 37.5, 0])
  assert.ok(!JSON.stringify(scoped).includes(key))
  await run('detail')
  const beforeCached = requests
  await run('summary')
  assert.equal(requests, beforeCached)
  asked.length = 0
  status = 500
  const retained = await run('refresh provider=opencode-go')
  assert.deepEqual(asked, ['opencode-go'])
  assert.equal(retained.providers.length, 1)
  assert.equal(retained.providers[0].balance.status, 'ready')
  assert.match(retained.providers[0].balance.refreshError, /HTTP 500/)
  assert.equal(retained.providers[0].balance.quotas[0].remainingPercent, 75)
  status = 200
}
console.log('PASS built Host reference/record credentials, scoped refresh, caching and retaining old quota after failure')

initReact({ createElement: (type, props, ...children) => typeof type === 'function'
  ? type(props) : { type, props, children: children.flat(Infinity).filter((child) => child != null) } })
const nodes = (node) => !node || typeof node !== 'object' ? [] : [node, ...(node.children ?? []).flatMap(nodes)]
const support = SUPPORTED_BALANCE_QUERIES.find((query) => query.id === 'opencode-go')
assert.ok(support)
for (const lang of ['zh', 'en']) {
  const t = (key, values) => translate(lang, key, values)
  const tree = BalanceBlock({ balance: parsed, t })
  const bars = nodes(tree).filter((node) => node.props?.role === 'progressbar')
  assert.deepEqual(bars.map((node) => node.props['aria-valuenow']), [75, 37.5, 0])
  assert.equal(bars[2].props['aria-label'], t('quota-monthly'))
  assert.notEqual(t('quota-monthly'), 'quota-monthly')
  assert.equal(nodes(tree).filter((node) => node.type === 'time').length, 3)
  assert.equal(nodes(tree).filter((node) => node.props?.className === 'dmu-wallet').length, 0)
  for (const key of [support.name, support.details, support.credential]) assert.notEqual(t(key), key)
}
console.log('PASS Chinese/English monthly quota, remaining progress, resets and shared support catalog')
