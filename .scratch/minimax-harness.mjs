/** Official MiniMax account/plan contracts, both protocols/regions and scoped refresh. No network. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const bundled = await build({
  stdin: { contents: `export { parseMiniMaxBalance, parseMiniMaxUsage } from './src/host/minimax';
    export { balanceTarget, consoleLink } from './src/host/links';
    export { providerBalance } from './src/host/balance';
    export { initReact } from './src/client/react';
    export { BalanceBlock } from './src/client/ui/balance';
    export { translate } from './src/client/i18n';
    export { BUILTIN_PROVIDER_QUERY_SUPPORT, BUILTIN_PROVIDER_QUERY_SUPPORT_GROUPS } from './src/balance-support';`, resolveDir: root.pathname },
  bundle: true, platform: 'node', format: 'esm', write: false,
})
const { parseMiniMaxBalance, parseMiniMaxUsage, balanceTarget, consoleLink, providerBalance,
  initReact, BalanceBlock, translate, BUILTIN_PROVIDER_QUERY_SUPPORT, BUILTIN_PROVIDER_QUERY_SUPPORT_GROUPS } =
  await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))

const envelope = { status_code: 0, status_msg: 'success' }
const now = 1_791_090_000_000
const general = {
  model_name: 'general', start_time: now - 3_600_000, end_time: now + 14_400_000, remains_time: 14_400_000,
  current_interval_total_count: 0, current_interval_usage_count: 0, current_interval_remaining_percent: 85.25,
  current_weekly_total_count: 0, current_weekly_usage_count: 0, current_weekly_remaining_percent: 69,
  weekly_start_time: now - 86_400_000, weekly_end_time: now + 518_400_000, weekly_remains_time: 518_400_000,
}
const fixture = { base_resp: envelope, model_remains: [general] }
const parsed = parseMiniMaxUsage(fixture, now)
assert.equal(parsed.status, 'ready')
assert.equal(parsed.wallets.length, 0)
assert.deepEqual(parsed.quotas.map((q) => [q.period, q.remainingPercent, q.usedPercent]), [['five-hour', 85.25, 14.75], ['weekly', 69, 31]])
assert.equal(parsed.quotas[0].limit, undefined, '0/0 counts are not rendered as zero quota')
assert.equal(parsed.quotas[0].resetAt, new Date(general.end_time).toISOString())
assert.equal(parsed.quotas[1].resetAt, new Date(general.weekly_end_time).toISOString())
const countdowns = parseMiniMaxUsage({ model_remains: [{ ...general, end_time: undefined, weekly_end_time: undefined }] }, now)
assert.deepEqual(countdowns.quotas.map((q) => q.resetAt), parsed.quotas.map((q) => q.resetAt))
const invalidTimes = parseMiniMaxUsage({ model_remains: [{ ...general, end_time: Infinity, remains_time: 'bad', weekly_end_time: -1, weekly_remains_time: null }] }, now)
assert.ok(invalidTimes.quotas.every((q) => q.resetAt === undefined))

const countRow = { model_name: 'MiniMax-M2.7', current_interval_total_count: 100, current_interval_usage_count: 7 }
const legacy = parseMiniMaxUsage({ model_remains: [countRow] })
assert.equal(legacy.quotas[0].remaining, 7, 'legacy usage_count is remaining')
assert.equal(legacy.quotas[0].used, 93)
const consumed = parseMiniMaxUsage({ model_remains: [{ ...countRow, current_interval_remaining_percent: 93 }] })
assert.equal(consumed.quotas[0].remaining, 93, 'new consumed-count interpretation agrees with official percent')
assert.equal(consumed.quotas[0].used, 7)
const mismatch = parseMiniMaxUsage({ model_remains: [{ ...countRow, current_interval_remaining_percent: 60 }] })
assert.equal(mismatch.quotas[0].remainingPercent, 60)
assert.equal(mismatch.quotas[0].limit, undefined, 'inconsistent counts are omitted')
const resources = parseMiniMaxUsage({ ...fixture, model_remains: [general,
  { model_name: 'video', current_interval_status: 3, current_weekly_status: 2 }, general] })
assert.equal(resources.quotas.length, 4, 'resource pools remain distinct; repeated rows are deduplicated')
assert.equal(resources.quotas[2].unlimited, true)
assert.equal(resources.quotas[3].remainingPercent, 0)
const boosted = parseMiniMaxUsage({ model_remains: [{ ...general, current_weekly_remaining_percent: 90, weekly_boost_permille: 1500 }] })
assert.equal(boosted.quotas[1].remainingPercent, 135)
assert.match(parseMiniMaxUsage({ base_resp: { status_code: 2062, status_msg: 'no active token plan subscription' } }).message, /未检测到有效/)
for (const value of [null, {}, [], { base_resp: { status_code: 1004 }, model_remains: [general] },
  { base_resp: { status_code: null }, model_remains: [general] }, { model_remains: [] },
  { model_remains: [{ current_interval_total_count: 0, current_interval_usage_count: 0 }] }]) {
  assert.equal(parseMiniMaxUsage(value).status, 'failed')
}
for (const value of [null, true, '', ' ', Infinity, 'invalid', '0x10', -1]) {
  assert.equal(parseMiniMaxUsage({ model_remains: [{ current_interval_remaining_percent: value }] }).status, 'failed')
}
console.log('PASS percent and legacy counts, resource windows, millisecond reset times, boosts, unlimited and errors')

const walletFixture = { base_resp: envelope, available_amount: '49.58894000', cash_balance: '-1.00001',
  voucher_balance: '50.58895', credit_balance: '3.00', owed_amount: '1.00' }
const wallet = parseMiniMaxBalance(walletFixture, 'CNY')
assert.deepEqual(wallet.wallets[0], { currency: 'CNY', balance: '49.58894000', cash: '-1.00001', voucher: '50.58895', credit: '3.00', owed: '1.00', kind: 'account' })
assert.equal(parseMiniMaxBalance(walletFixture, 'USD').wallets[0].currency, 'USD')
for (const available of [0, '0', -1]) {
  const result = parseMiniMaxBalance({ base_resp: envelope, available_amount: available }, 'CNY')
  assert.equal(result.status, 'ready')
  assert.equal(result.isAvailable, false)
  assert.equal(result.wallets[0].voucher, undefined)
}
for (const field of ['available_amount', 'cash_balance', 'voucher_balance', 'credit_balance', 'owed_amount']) {
  for (const value of [null, true, '', ' ', Infinity, '0x10', 'bad']) {
    assert.equal(parseMiniMaxBalance({ ...walletFixture, [field]: value }, 'CNY').status, 'failed')
  }
}
assert.equal(parseMiniMaxBalance({ available_amount: 10 }, 'CNY').status, 'failed')
assert.equal(parseMiniMaxBalance({ ...walletFixture, base_resp: { status_code: 1004 } }, 'USD').status, 'failed')
console.log('PASS account available amount, unscaled precision, cash/voucher/credit/debt and missing/invalid balances')

for (const [id, base, kind, apiRoot] of [
  ['minimax', undefined, 'minimax', 'https://api.minimax.io'],
  ['minimax-cn', undefined, 'minimax-cn', 'https://api.minimaxi.com'],
  ['custom', 'https://api.minimax.io/v1/', 'minimax', 'https://api.minimax.io'],
  ['custom', 'https://api.minimaxi.com/anthropic', 'minimax-cn', 'https://api.minimaxi.com'],
  ['custom', 'https://api.minimax.cn/anthropic/v1?foo=1#hash', 'minimax-cn', 'https://api.minimax.cn'],
  ['minimax-cn', 'https://api.minimax.io/anthropic', 'minimax', 'https://api.minimax.io'],
  ['minimax', 'https://proxy.example/prefix/anthropic/', 'minimax', 'https://proxy.example/prefix'],
  ['minimax-cn', 'https://proxy.example/prefix/anthropic/v1', 'minimax-cn', 'https://proxy.example/prefix'],
  ['minimax-cn', 'https://proxy.example/prefix/v1', 'minimax-cn', 'https://proxy.example/prefix'],
  ['minimax', 'https://proxy.example/prefix', 'minimax', 'https://proxy.example/prefix'],
]) {
  assert.deepEqual(balanceTarget(id, base), { kind, url: apiRoot + '/v1/token_plan/remains', balanceURL: apiRoot + '/account/query_balance' })
}
for (const [id, base] of [['custom', undefined], ['custom', 'https://api.minimax.io.example/v1'],
  ['custom', 'https://proxy.example/anthropic'], ['minimax', 'file:///v1'], ['minimax-cn', 'bad']]) {
  assert.equal(balanceTarget(id, base).kind, 'unsupported')
}
assert.match(consoleLink('minimax-cn', undefined), /^https:\/\/platform\.minimax\.cn\//)
assert.match(consoleLink('minimax', undefined), /^https:\/\/platform\.minimax\.io\//)
console.log('PASS regional defaults, OpenAI/Anthropic custom routes and proxy prefixes')

let status = 200, data = fixture, requests = []
const subscriptionKey = 'fixture-subscription-key-never-log'
const accountKey = 'sk-api-fixture-key-never-log'
const subprocess = {
  resolveExecutable: async () => '/mock/node',
  spawn(spec) {
    assert.ok(!JSON.stringify(spec.argv).includes(subscriptionKey) && !JSON.stringify(spec.argv).includes(accountKey))
    const request = JSON.parse(spec.stdio.stdin.data)
    requests.push(request)
    assert.equal(request.method, 'GET')
    assert.equal(request.headers['Content-Type'], 'application/json')
    assert.ok(request.timeoutMs > 0 && request.timeoutMs <= 15_000)
    return { done: Promise.resolve({ exitCode: 0 }), collected: {
      stdout: { readFrom: () => ({ text: JSON.stringify({ status, body: JSON.stringify(data) }) }) },
    } }
  },
}
const query = (id, key = subscriptionKey) => providerBalance(
  (name) => name === 'subprocess' ? subprocess : undefined, {}, id, undefined, async () => key, undefined,
)
for (const id of ['minimax', 'minimax-cn']) {
  data = fixture
  assert.equal((await query(id)).status, 'ready')
  assert.match(requests.at(-1).url, /\/v1\/token_plan\/remains$/)
  data = walletFixture
  assert.equal((await query(id, accountKey)).wallets[0].currency, id === 'minimax-cn' ? 'CNY' : 'USD')
  assert.match(requests.at(-1).url, /\/account\/query_balance$/)
  assert.equal(requests.at(-1).headers.Authorization, 'Bearer ' + accountKey)
}
const beforeMissing = requests.length
assert.equal((await providerBalance((name) => name === 'subprocess' ? subprocess : undefined,
  {}, 'minimax', undefined, async () => undefined, undefined)).status, 'no-credential')
assert.equal((await query('minimax', '')).status, 'no-credential')
assert.equal(requests.length, beforeMissing)
for (status of [401, 403, 429, 500]) assert.equal((await query('minimax')).status, 'failed')
status = 200
data = { base_resp: { status_code: 1004 }, model_remains: [general] }
assert.equal((await query('minimax')).status, 'failed')
const fetchBefore = globalThis.fetch
globalThis.fetch = async (url, opts) => {
  assert.equal(url, 'https://api.minimax.io/v1/token_plan/remains')
  assert.equal(opts.headers.Authorization, 'Bearer ' + subscriptionKey)
  return { status: 200, text: async () => JSON.stringify(fixture) }
}
try {
  assert.equal((await providerBalance(() => undefined, {}, 'minimax', undefined, async () => subscriptionKey, undefined)).status, 'ready')
} finally { globalThis.fetch = fetchBefore }
console.log('PASS key-type endpoint selection, stdin-only keys, HTTP/business failures and fetch fallback')

const host = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  .replace(/import\s*\{\s*defineTool\s*\}\s*from\s*["']@deepseek-ai\/dsh-tools["'];?/, 'const defineTool = (v) => v;')
const { apply } = await import('data:text/javascript;base64,' + Buffer.from(host).toString('base64'))
for (const record of [false, true]) {
  const commands = [], asked = []
  const ids = ['minimax', 'minimax-cn', 'custom-openai']
  const services = {
    llm: {
      listProviders: () => ids.map((id) => ({ id })),
      listConfigurableProviders: () => ids.map((id) => ({ provider: id, settingsNs: 'llm-pi-ai', settingsPath: ['providers', id] })),
      listModels: (id) => { asked.push(id); return [{ id: 'model' }] },
    },
    settings: { describe: () => [{ ns: 'llm-pi-ai', value: { providers: Object.fromEntries(ids.map((id) =>
      [id, { ...(record ? {} : { apiKeyEnv: 'MINIMAX_API_KEY' }), ...(id === 'custom-openai' ? { baseURL: 'https://api.minimax.io/v1' } : {}) }])) } }] },
    credentials: {
      describe: async () => ({ configured: true }), resolve: async () => subscriptionKey,
      describeRecord: async () => ({ configured: record, kind: 'api-key' }),
      readRecord: async () => ({ kind: 'api-key', key: subscriptionKey }),
    },
    subprocess,
  }
  apply({ get: (name) => services[name], commands: { register: (c) => commands.push(c) }, tools: { register() {} } }, { includeModelDetails: false })
  const run = async (rawInput) => JSON.parse((await commands[0].handler({ rawInput })).text)
  data = fixture
  for (const id of ids) {
    asked.length = 0; requests = []
    const scoped = await run('refresh provider=' + id)
    assert.deepEqual(scoped.providers.map((p) => p.id), [id])
    assert.deepEqual(asked, [id])
    assert.equal(requests.length, 1)
    assert.equal(scoped.providers[0].balance.status, 'ready')
    assert.ok(!JSON.stringify(scoped).includes(subscriptionKey))
  }
  await run('detail')
  const beforeCached = requests.length
  await run('summary')
  assert.equal(requests.length, beforeCached)
  asked.length = 0; status = 500
  const retained = await run('refresh provider=minimax-cn')
  assert.deepEqual(asked, ['minimax-cn'])
  assert.equal(retained.providers.length, 1)
  assert.equal(retained.providers[0].balance.status, 'ready')
  assert.match(retained.providers[0].balance.refreshError, /HTTP 500/)
  assert.deepEqual(retained.providers[0].balance.quotas.map((q) => q.remainingPercent), [85.25, 69])
  status = 200
}
console.log('PASS built Host reference/record credentials, scoped refresh, caching and retaining old quotas')

initReact({ createElement: (type, props, ...children) => typeof type === 'function'
  ? type(props) : { type, props, children: children.flat(Infinity).filter((child) => child != null) } })
const flatten = (node) => typeof node === 'string' ? node : (node?.children ?? []).map(flatten).join(' ')
const walk = (node, visit) => { if (node && typeof node === 'object') { visit(node); (node.children ?? []).forEach((child) => walk(child, visit)) } }
for (const lang of ['zh', 'en']) {
  const t = (key, values) => translate(lang, key, values)
  const quotaText = flatten(BalanceBlock({ balance: resources, t }))
  assert.match(quotaText, lang === 'zh' ? /通用/ : /General/)
  assert.match(quotaText, lang === 'zh' ? /视频/ : /Video/)
  assert.match(quotaText, lang === 'zh' ? /不限量/ : /Unlimited/)
  assert.match(quotaText, lang === 'zh' ? /周额度/ : /Weekly quota/)
  const boostedTree = BalanceBlock({ balance: boosted, t })
  assert.match(flatten(boostedTree), /135%/)
  walk(boostedTree, (node) => { if (node.props?.role === 'progressbar') assert.ok(node.props['aria-valuenow'] <= 100) })
  const balanceText = flatten(BalanceBlock({ balance: wallet, t }))
  assert.match(balanceText, /¥49\.59/)
  assert.match(balanceText, lang === 'zh' ? /授信余额/ : /Credit balance/)
  assert.match(balanceText, lang === 'zh' ? /欠款/ : /Amount owed/)
  for (const id of ['minimax', 'minimax-cn']) {
    const support = BUILTIN_PROVIDER_QUERY_SUPPORT.find((p) => p.id === id)
    assert.equal(support.status, 'supported')
    for (const field of ['name', 'details', 'credential']) assert.notEqual(t(support[field]), support[field])
  }
}
assert.equal(BUILTIN_PROVIDER_QUERY_SUPPORT.length, 43)
assert.equal(new Set(BUILTIN_PROVIDER_QUERY_SUPPORT.map((p) => p.id)).size, 43)
assert.deepEqual(BUILTIN_PROVIDER_QUERY_SUPPORT_GROUPS.find((g) => g.id === 'minimax').providers.map((p) => p.id), ['minimax', 'minimax-cn'])
console.log('PASS zh/en balances, resource labels, boosts and support catalog')
