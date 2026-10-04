/** Official regional balances, credential transport, scoped Host refresh and UI. No network. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const bundled = await build({
  stdin: { contents: `export { parseMoonshotBalance } from './src/host/moonshot';
    export { balanceTarget, consoleLink } from './src/host/links';
    export { providerBalance } from './src/host/balance';
    export { initReact } from './src/client/react';
    export { BalanceBlock } from './src/client/ui/balance';
    export { translate } from './src/client/i18n';
    export { BUILTIN_PROVIDER_QUERY_SUPPORT } from './src/balance-support';`, resolveDir: root.pathname },
  bundle: true, platform: 'node', format: 'esm', write: false,
})
const { parseMoonshotBalance, balanceTarget, consoleLink, providerBalance, initReact, BalanceBlock, translate, BUILTIN_PROVIDER_QUERY_SUPPORT } =
  await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))

const fixture = { code: 0, status: true, scode: '0x0', data: {
  available_balance: 49.58894, cash_balance: 3.00001, voucher_balance: 46.58893,
} }
const parsed = parseMoonshotBalance(fixture, 'CNY')
assert.equal(parsed.status, 'ready')
assert.deepEqual(parsed.wallets, [{ currency: 'CNY', balance: '49.58894', cash: '3.00001', voucher: '46.58893', kind: 'account' }])
assert.equal(parseMoonshotBalance(fixture, 'USD').wallets[0].currency, 'USD')
const debt = parseMoonshotBalance({ ...fixture, data: { available_balance: 2, cash_balance: -1, voucher_balance: 2 } }, 'CNY')
assert.equal(debt.wallets[0].balance, '2', 'cash debt does not reduce the API available balance a second time')
assert.equal(debt.wallets[0].cash, '-1')
for (const value of [0, '0', -1, '0.0000001']) {
  const result = parseMoonshotBalance({ ...fixture, data: { available_balance: value } }, 'CNY')
  assert.equal(result.status, 'ready')
  assert.equal(result.wallets[0].balance, String(value))
  assert.equal(result.isAvailable, Number(value) > 0)
  assert.equal(result.wallets[0].cash, undefined)
  assert.equal(result.wallets[0].voucher, undefined, 'missing breakdowns are not filled with zero')
}
for (const value of [null, true, '', ' ', 'invalid', Infinity, '0x10']) {
  for (const field of ['available_balance', 'cash_balance', 'voucher_balance']) {
    assert.equal(parseMoonshotBalance({ ...fixture, data: { ...fixture.data, [field]: value } }, 'CNY').status, 'failed')
  }
}
for (const response of [null, [], {}, { ...fixture, code: 1 }, { ...fixture, status: false },
  { data: fixture.data }, { ...fixture, data: {} }, { ...fixture, data: { ...fixture.data, voucher_balance: -1 } }]) {
  assert.equal(parseMoonshotBalance(response, 'CNY').status, 'failed')
}
console.log('PASS official envelope, currencies, precision, debt, zero and missing/invalid fields')

for (const [id, base, kind, url] of [
  ['moonshotai-cn', undefined, 'moonshot-cn', 'https://api.moonshot.cn/v1/users/me/balance'],
  ['moonshotai', undefined, 'moonshot', 'https://api.moonshot.ai/v1/users/me/balance'],
  ['custom', 'https://api.moonshot.cn/v1/?ignored=1#hash', 'moonshot-cn', 'https://api.moonshot.cn/v1/users/me/balance'],
  ['custom', 'https://api.moonshot.ai', 'moonshot', 'https://api.moonshot.ai/v1/users/me/balance'],
  ['moonshotai-cn', 'https://api.moonshot.ai/v1', 'moonshot', 'https://api.moonshot.ai/v1/users/me/balance'],
  ['moonshotai', 'https://proxy.example/prefix/v1/', 'moonshot', 'https://proxy.example/prefix/v1/users/me/balance'],
  ['moonshotai-cn', 'https://proxy.example/prefix', 'moonshot-cn', 'https://proxy.example/prefix/v1/users/me/balance'],
]) assert.deepEqual(balanceTarget(id, base), { kind, url })
for (const [id, base] of [['custom', undefined], ['custom', 'https://api.moonshot.cn.example/v1'],
  ['custom', 'https://sub.moonshot.ai/v1'], ['moonshotai', 'file:///v1'], ['moonshotai-cn', 'invalid']]) {
  assert.equal(balanceTarget(id, base).kind, 'unsupported')
}
assert.equal(balanceTarget('custom', 'https://api.kimi.com/coding/v1').kind, 'kimi-coding')
assert.equal(balanceTarget('kimi-coding', undefined).kind, 'kimi-coding')
assert.equal(consoleLink('moonshotai-cn', undefined), 'https://platform.moonshot.cn/console/info')
assert.equal(consoleLink('moonshotai', undefined), 'https://platform.moonshot.ai/console/info')
assert.equal(consoleLink('moonshotai-cn', 'https://api.moonshot.ai/v1'), 'https://platform.moonshot.ai/console/info')
console.log('PASS default, official and proxy routing, region overrides and separate Kimi Code queries')

const key = 'fixture-moonshot-key-never-log'
let status = 200, data = fixture, requests = []
const subprocess = {
  resolveExecutable: async () => '/mock/node',
  spawn(spec) {
    assert.ok(!JSON.stringify(spec.argv).includes(key))
    const request = JSON.parse(spec.stdio.stdin.data)
    requests.push(request)
    assert.equal(request.method, 'GET')
    assert.equal(request.headers.Authorization, 'Bearer ' + key)
    assert.ok(request.timeoutMs > 0 && request.timeoutMs <= 15_000)
    return { done: Promise.resolve({ exitCode: 0 }), collected: {
      stdout: { readFrom: () => ({ text: JSON.stringify({ status, body: JSON.stringify(data) }) }) },
    } }
  },
}
const query = (resolve = async () => key) => providerBalance(
  (name) => name === 'subprocess' ? subprocess : undefined, {}, 'moonshotai-cn', undefined, resolve, 'MOONSHOT_API_KEY',
)
assert.equal((await query()).wallets[0].currency, 'CNY')
assert.equal(requests[0].url, 'https://api.moonshot.cn/v1/users/me/balance')
const beforeMissing = requests.length
assert.equal((await query(async () => undefined)).status, 'no-credential')
assert.equal(requests.length, beforeMissing)
assert.equal((await providerBalance((name) => name === 'subprocess' ? subprocess : undefined,
  {}, 'moonshotai-cn', undefined, async () => undefined, undefined)).status, 'no-credential')
assert.equal(requests.length, beforeMissing, 'a route without a credential reference still reports a missing key without querying')
for (const code of [401, 403, 429, 500]) {
  status = code
  const failed = await query()
  assert.equal(failed.status, 'failed')
  assert.ok(failed.link)
  assert.ok(!JSON.stringify(failed).includes(key))
}
status = 200; data = { ...fixture, status: false }
assert.equal((await query()).status, 'failed')
data = fixture
const originalFetch = globalThis.fetch
try {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.moonshot.ai/v1/users/me/balance')
    assert.equal(options.headers.Authorization, 'Bearer ' + key)
    assert.ok(options.signal instanceof AbortSignal)
    return new Response(JSON.stringify(fixture), { status: 200 })
  }
  assert.equal((await providerBalance(() => undefined, {}, 'moonshotai', undefined, async () => key, 'key')).wallets[0].currency, 'USD')
} finally { globalThis.fetch = originalFetch }
console.log('PASS stdin-only credential transport, missing credentials, HTTP errors and fetch fallback')

const host = readFileSync(new URL('lib/index.js', root), 'utf8')
  .replace(/^import \{ defineTool \}.*$/m, 'const defineTool = (options) => options')
const { apply } = await import('data:text/javascript;base64,' + Buffer.from(host).toString('base64'))
for (const record of [false, true]) {
  const commands = [], asked = []
  let accounts = 0
  const ids = ['moonshotai-cn', 'moonshotai']
  const services = {
    llm: {
      listProviders: () => [{ id: 'deepseek-account' }, ...ids.map((id) => ({ id }))],
      listConfigurableProviders: () => ids.map((id) => ({ provider: id, settingsNs: 'llm-pi-ai', settingsPath: ['providers', id] })),
      listModels: (id) => { asked.push(id); return [{ id: 'model' }] },
    },
    settings: { describe: () => [{ ns: 'llm-pi-ai', value: { providers: Object.fromEntries(ids.map((id) =>
      [id, record ? {} : { apiKeyEnv: 'MOONSHOT_API_KEY' }])) } }] },
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
  for (const id of ids) {
    asked.length = 0; requests = []
    const scoped = await run('refresh provider=' + id)
    assert.deepEqual(scoped.providers.map((p) => p.id), [id])
    assert.deepEqual(asked, [id])
    assert.equal(accounts, 0)
    assert.equal(requests.length, 1)
    assert.equal(scoped.providers[0].balance.wallets[0].currency, id.endsWith('-cn') ? 'CNY' : 'USD')
    assert.ok(!JSON.stringify(scoped).includes(key))
  }
  await run('detail')
  const beforeCached = requests.length
  await run('summary')
  assert.equal(requests.length, beforeCached)
  asked.length = 0; status = 500
  const retained = await run('refresh provider=moonshotai-cn')
  assert.deepEqual(asked, ['moonshotai-cn'])
  assert.equal(retained.providers.length, 1)
  assert.equal(retained.providers[0].balance.status, 'ready')
  assert.match(retained.providers[0].balance.refreshError, /HTTP 500/)
  assert.deepEqual(retained.providers[0].balance.wallets, parsed.wallets)
  status = 200
}
console.log('PASS built Host reference/record credentials, scoped refresh, caching and retaining old balances')

initReact({ createElement: (type, props, ...children) => typeof type === 'function'
  ? type(props) : { type, props, children: children.flat(Infinity).filter((child) => child != null) } })
const text = (node) => typeof node === 'string' ? node : (node?.children ?? []).map(text).join(' ')
for (const lang of ['zh', 'en']) {
  const t = (key, values) => translate(lang, key, values)
  const rendered = text(BalanceBlock({ balance: debt, t }))
  assert.match(rendered, /¥2\.00/)
  assert.match(rendered, /¥-1\.00/)
  assert.match(rendered, lang === 'zh' ? /现金余额/ : /Cash balance/)
  assert.match(rendered, lang === 'zh' ? /代金券余额/ : /Voucher balance/)
  for (const id of ['moonshotai', 'moonshotai-cn']) {
    const support = BUILTIN_PROVIDER_QUERY_SUPPORT.find((p) => p.id === id)
    assert.equal(support.status, 'supported')
    for (const field of ['name', 'details', 'credential']) assert.notEqual(t(support[field]), support[field])
  }
}
assert.equal(BUILTIN_PROVIDER_QUERY_SUPPORT.length, 43)
assert.equal(new Set(BUILTIN_PROVIDER_QUERY_SUPPORT.map((p) => p.id)).size, 43)
console.log('PASS real balance components in zh/en, debt/voucher labels and support catalog')
