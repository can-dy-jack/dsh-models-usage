/** Official GLM Coding Plan contracts, transport, scoped Host refresh and UI. No network. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const bundle = await build({
  stdin: { contents: `export { parseZaiUsage } from './src/host/zai';
    export { providerBalance } from './src/host/balance';
    export { balanceTarget, consoleLink } from './src/host/links';
    export { initReact } from './src/client/react';
    export { translate } from './src/client/i18n';
    export { BalanceBlock } from './src/client/ui/balance';
    export { BUILTIN_PROVIDER_QUERY_SUPPORT, BUILTIN_PROVIDER_QUERY_SUPPORT_GROUPS } from './src/balance-support';`,
    resolveDir: root.pathname, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false,
})
const { parseZaiUsage, providerBalance, balanceTarget, consoleLink, initReact, translate, BalanceBlock,
  BUILTIN_PROVIDER_QUERY_SUPPORT, BUILTIN_PROVIDER_QUERY_SUPPORT_GROUPS } =
  await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const reset = Date.parse('2026-10-10T08:00:00Z')
const legacy = { code: 200, success: true, data: { limits: [
  { type: 'TIME_LIMIT', unit: 5, number: 1, percentage: 8, usage: 1000, currentValue: 82, remaining: 918, nextResetTime: reset },
  { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 37, nextResetTime: reset },
  { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 25 },
] } }
const credits = { code: 200, success: true, data: { limits: [
  { type: 'CREDIT_LIMIT', unit: 3, number: 5, percentage: 3, usage: 2000, currentValue: 71, remaining: 1929, nextResetTime: reset },
  { type: 'CREDIT_LIMIT', unit: 6, number: 1, percentage: 1, usage: 10000, currentValue: 71, remaining: 9929 },
] } }
const parsed = parseZaiUsage(legacy)
assert.equal(parsed.status, 'ready')
assert.deepEqual(parsed.quotas.map((q) => [q.id, q.usedPercent, q.remainingPercent]),
  [['five-hour', 37, 63], ['weekly', 25, 75], ['mcp-monthly', 8, 92]])
assert.equal(parsed.quotas[0].resetAt, '2026-10-10T08:00:00.000Z')
assert.equal(parsed.quotas[1].resetAt, undefined, 'no guessed weekly reset')
assert.deepEqual(parsed.wallets, [], 'plan quota is not a cash balance')
const creditUsage = parseZaiUsage(credits)
assert.equal(creditUsage.quotas[0].usedPercent, 3, 'official rounded percentage takes precedence over counters')
assert.equal(creditUsage.quotas[0].remaining, 1929)
assert.deepEqual(creditUsage.quotas.map((q) => q.id), ['five-hour', 'weekly'])
const entry = (values) => ({ limits: [{ type: 'TOKENS_LIMIT', unit: 3, number: 5, ...values }] })
assert.equal(parseZaiUsage(entry({ usage: 100, currentValue: 25 })).quotas[0].remainingPercent, 75)
assert.equal(parseZaiUsage(entry({ percentage: 100 })).quotas[0].remainingPercent, 0)
assert.equal(parseZaiUsage(entry({ percentage: '0' })).quotas[0].remainingPercent, 100)
assert.equal(parseZaiUsage(entry({ percentage: 120 })).quotas[0].remainingPercent, 0)
for (const percentage of [null, true, '', ' ', 'bad', -1, Infinity]) {
  assert.equal(parseZaiUsage(entry({ percentage, usage: 100, currentValue: 0 })).status, 'failed')
}
for (const data of [null, [], {}, { data: {} }, { limits: [] }, { limits: [{ type: 'UNKNOWN', percentage: 0 }] },
  entry({ unit: 42, percentage: 0 }), entry({ number: 2, percentage: 0 }), entry({ unit: 'bad', percentage: 0 }),
  { ...legacy, success: false }, { ...credits, code: 401 }]) assert.equal(parseZaiUsage(data).status, 'failed')
for (const time of [undefined, null, 0, Date.now() / 1000, Infinity, 'bad']) {
  assert.equal(parseZaiUsage(entry({ percentage: 0, nextResetTime: time })).quotas[0].resetAt, undefined)
}
assert.equal(parseZaiUsage({ limits: [{ type: 'TOKENS_LIMIT', percentage: 5 }] }).quotas[0].id, 'five-hour')
for (const limits of [[...legacy.data.limits, ...credits.data.limits], [...credits.data.limits, ...legacy.data.limits]]) {
  const quotas = parseZaiUsage({ limits }).quotas
  assert.equal(quotas.length, 3)
  assert.equal(quotas[0].usedPercent, 3, 'credit windows replace legacy token windows in either order')
}
console.log('PASS legacy Token, Credits and MCP windows, official percentages, optional resets, errors and no fabricated cash')

const endpoint = 'https://api.z.ai/api/monitor/usage/quota/limit'
const cnEndpoint = 'https://open.bigmodel.cn/api/monitor/usage/quota/limit'
for (const [id, base, kind, url] of [
  ['zai', undefined, 'zai', endpoint], ['zai-coding-cn', undefined, 'zai-cn', cnEndpoint],
  ['custom', 'https://api.z.ai/api/coding/paas/v4', 'zai', endpoint],
  ['custom', 'https://api.z.ai/api/anthropic/v1/?ignored=1#ignored', 'zai', endpoint],
  ['custom', 'https://open.bigmodel.cn/api/anthropic', 'zai-cn', cnEndpoint],
  ['custom', 'https://dev.bigmodel.cn/api/coding/paas/v4', 'zai-cn', 'https://dev.bigmodel.cn/api/monitor/usage/quota/limit'],
  ['zai', 'https://open.bigmodel.cn/api/coding/paas/v4', 'zai-cn', cnEndpoint],
  ['zai-coding-cn', 'https://api.z.ai/api/anthropic', 'zai', endpoint],
  ['zai', 'https://proxy.example/gateway/api/coding/paas/v4/', 'zai', 'https://proxy.example/gateway/api/monitor/usage/quota/limit'],
  ['zai-coding-cn', 'https://proxy.example/gateway/api/anthropic/v1', 'zai-cn', 'https://proxy.example/gateway/api/monitor/usage/quota/limit'],
  ['zai', 'https://proxy.example/gateway/v1', 'zai', 'https://proxy.example/gateway/api/monitor/usage/quota/limit'],
]) assert.deepEqual(balanceTarget(id, base), { kind, url })
for (const [id, base] of [
  ['zai', 'https://api.z.ai/api/paas/v4'], ['custom', 'https://open.bigmodel.cn/api/paas/v4'],
  ['custom', 'https://api.z.ai/'], ['custom', 'https://api.z.ai.example/api/anthropic'],
  ['custom', 'https://proxy.example/api/coding/paas/v4'], ['zai', 'file:///api/anthropic'], ['zai', 'bad-url'],
  ['zai', 'https://proxy.example/api/paas/v4'],
]) assert.equal(balanceTarget(id, base).kind, 'unsupported')
assert.equal(consoleLink('zai', undefined), 'https://z.ai/manage-apikey/coding-plan/personal/usage')
assert.equal(consoleLink('zai-coding-cn', undefined), 'https://bigmodel.cn/usercenter/glm-coding/usage')
assert.equal(consoleLink('custom', 'https://api.z.ai/api/paas/v4'), 'https://z.ai/manage-apikey/billing')
console.log('PASS regional defaults, OpenAI/Anthropic bases, explicit proxies and unsupported PAYG routes')

const key = 'mock-zai-secret-never-log'
let status = 200, data = credits
const requests = []
const subprocess = {
  resolveExecutable: () => '/mock/node',
  spawn: (spec) => {
    assert.ok(!JSON.stringify(spec.argv).includes(key))
    const request = JSON.parse(spec.stdio.stdin.data)
    assert.equal(request.headers.Authorization, key, 'official plugin uses raw Authorization')
    assert.equal(request.headers['Accept-Language'], 'en-US,en')
    assert.equal(request.method, 'GET')
    assert.ok(request.timeoutMs > 0 && request.timeoutMs <= 15000)
    requests.push(request.url)
    return { done: Promise.resolve({ exitCode: 0 }), collected: { stdout: {
      readFrom: () => ({ text: JSON.stringify({ status, body: JSON.stringify(data) }) }),
    } } }
  },
}
const query = (id = 'zai', base, resolve = async () => key) => providerBalance(
  (name) => name === 'subprocess' ? subprocess : undefined, {}, id, base, resolve, undefined,
)
assert.equal((await query()).status, 'ready')
assert.equal(requests.at(-1), endpoint)
assert.equal((await query('zai-coding-cn')).status, 'ready')
assert.equal(requests.at(-1), cnEndpoint)
const before = requests.length
assert.equal((await query('zai', undefined, async () => undefined)).status, 'no-credential')
const unsupported = await query('zai', 'https://api.z.ai/api/paas/v4', async () => { throw new Error('must not resolve PAYG key') })
assert.equal(unsupported.status, 'unsupported')
assert.equal(unsupported.messageKey, 'supportZaiApiUnsupportedDetails')
assert.equal(requests.length, before)
for (const code of [401, 403, 429, 500]) {
  status = code
  const failure = await query()
  assert.equal(failure.status, 'failed')
  assert.ok(!JSON.stringify(failure).includes(key))
}
status = 200; data = { code: 401, success: false, msg: key }
assert.ok(!(await query()).message.includes(key), 'raw business error text is never exposed')
data = credits
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  assert.equal(url, endpoint); assert.equal(init.headers.Authorization, key)
  return new Response(JSON.stringify(credits), { status: 200 })
}
try {
  assert.equal((await providerBalance(() => undefined, {}, 'zai', undefined, async () => key, undefined)).status, 'ready')
} finally { globalThis.fetch = realFetch }
console.log('PASS stdin-only raw API key, regional transport, missing credentials, HTTP/business errors and fetch fallback')

const source = readFileSync(new URL('lib/index.js', root), 'utf8')
  .replace(/^import \{ defineTool \}.*$/m, 'const defineTool = (options) => options')
const { apply } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
for (const record of [false, true]) {
  const ids = ['zai', 'zai-coding-cn', 'custom-anthropic', 'custom-payg']
  const asked = [], commands = []
  const services = {
    llm: {
      listProviders: () => ids.map((id) => ({ id })),
      listConfigurableProviders: () => ids.map((id) => ({ provider: id, settingsNs: 'llm-pi-ai', settingsPath: ['providers', id] })),
      listModels: (id) => { asked.push(id); return [{ id: 'glm-model' }] },
    },
    settings: { describe: () => [{ ns: 'llm-pi-ai', value: { providers: Object.fromEntries(ids.map((id) => [id, {
      ...(record ? {} : { apiKeyEnv: 'ZAI_API_KEY' }),
      ...(id === 'custom-anthropic' ? { baseURL: 'https://open.bigmodel.cn/api/anthropic' } : {}),
      ...(id === 'custom-payg' ? { baseURL: 'https://api.z.ai/api/paas/v4' } : {}),
    }])) } }] },
    credentials: {
      describe: async () => ({ configured: true }), resolve: async () => key,
      describeRecord: async () => ({ configured: record, kind: 'api-key' }), readRecord: async () => ({ kind: 'api-key', key }),
    }, subprocess,
  }
  apply({ get: (name) => services[name], commands: { register: (c) => commands.push(c) }, tools: { register() {} } }, { includeModelDetails: false })
  const run = async (rawInput) => JSON.parse((await commands[0].handler({ rawInput })).text)
  for (const id of ids) {
    asked.length = 0; requests.length = 0
    const payload = await run('refresh provider=' + id)
    assert.deepEqual(payload.providers.map((p) => p.id), [id])
    assert.deepEqual(asked, [id])
    assert.equal(payload.providers[0].balance.status, id === 'custom-payg' ? 'unsupported' : 'ready')
    assert.equal(requests.length, id === 'custom-payg' ? 0 : 1)
    assert.ok(!JSON.stringify(payload).includes(key))
  }
  await run('detail')
  const cachedRequests = requests.length
  await run('summary')
  assert.equal(requests.length, cachedRequests)
  asked.length = 0; status = 500
  const retained = await run('refresh provider=zai-coding-cn')
  assert.deepEqual(asked, ['zai-coding-cn'])
  assert.equal(retained.providers.length, 1)
  assert.equal(retained.providers[0].balance.status, 'ready')
  assert.match(retained.providers[0].balance.refreshError, /HTTP 500/)
  assert.equal(retained.providers[0].balance.quotas[0].remainingPercent, 97)
  status = 200
}
console.log('PASS built Host reference/record credentials, scoped refresh, caching and retaining previous quotas')

initReact({ createElement: (type, props, ...children) => typeof type === 'function'
  ? type(props) : { type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child != null) } })
const flatten = (node) => typeof node === 'string' ? node : (node?.children ?? []).map(flatten).join(' ')
const walk = (node, visit) => { if (node && typeof node === 'object') { visit(node); (node.children ?? []).forEach((child) => walk(child, visit)) } }
for (const lang of ['zh', 'en']) {
  const t = (key, values) => translate(lang, key, values)
  const tree = BalanceBlock({ balance: parsed, t })
  assert.match(flatten(tree), lang === 'zh' ? /MCP 月额度/ : /Monthly MCP quota/)
  assert.match(flatten(tree), /63%/)
  let progresses = 0, times = 0
  walk(tree, (node) => { if (node.props.role === 'progressbar') progresses++; if (node.type === 'time') times++ })
  assert.equal(progresses, 3); assert.equal(times, 2)
  const unsupportedTree = BalanceBlock({ balance: unsupported, t })
  walk(unsupportedTree, (node) => { if (node.type === 'span') assert.equal(node.props.title, t('supportZaiApiUnsupportedDetails')) })
  for (const id of ['zai', 'zai-coding-cn']) {
    const support = BUILTIN_PROVIDER_QUERY_SUPPORT.find((p) => p.id === id)
    assert.equal(support.status, 'supported')
    for (const field of ['name', 'details', 'credential']) assert.notEqual(t(support[field]), support[field])
  }
}
assert.equal(BUILTIN_PROVIDER_QUERY_SUPPORT.length, 43)
assert.equal(new Set(BUILTIN_PROVIDER_QUERY_SUPPORT.map((p) => p.id)).size, 43)
assert.deepEqual(BUILTIN_PROVIDER_QUERY_SUPPORT_GROUPS.find((g) => g.id === 'zai').providers.map((p) => p.id), ['zai', 'zai-coding-cn'])
console.log('PASS zh/en quota labels, reset times, unsupported cash explanation and provider support catalog')
