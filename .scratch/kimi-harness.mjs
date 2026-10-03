/** Standalone Kimi contract/transport/render checks; no real credentials/network. */
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({
  stdin: {
    contents: `export { parseKimiUsage } from './src/host/kimi';
      export { balanceTarget, consoleLink } from './src/host/links';
      export { providerBalance } from './src/host/balance';
      export { createPayloadLoader } from './src/host/collect';
      export { initReact } from './src/client/react';
      export { BalanceBlock } from './src/client/ui/balance';
      export { translate } from './src/client/i18n';`,
    resolveDir: new URL('../', import.meta.url).pathname,
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
})
const { parseKimiUsage, balanceTarget, consoleLink, providerBalance, createPayloadLoader, initReact, BalanceBlock, translate } =
  await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))

const reset = '2026-10-05T08:00:00.123456789Z'
const modern = {
  usages: {
    limit_5h: { used_ratio: '0.25', reset_time: reset },
    limit_7d: { used_ratio: 0 },
    limit_month_total: { used_ratio: 1 },
    limit_month_code: { used_ratio: 0.625 },
  },
  boosterWallet: {
    balance: { type: 'BOOSTER', amount: '2500000000', amountLeft: '1250000000' },
    monthlyChargeLimit: { currency: 'CNY', priceInCents: '5000' },
  },
}
const parsed = parseKimiUsage(modern)
assert.equal(parsed.status, 'ready')
assert.deepEqual(parsed.quotas.map((q) => q.remainingPercent), [75, 100, 0, 37.5])
assert.equal(parsed.quotas[0].resetAt, reset)
assert.deepEqual(parsed.wallets, [{ currency: 'CNY', balance: '12.50000000', toppedUp: '25.00000000', kind: 'extra-usage' }])

const legacy = {
  usage: { limit: '100', remaining: '80', resetTime: reset },
  limits: [
    { window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: 100, used: 40, reset_at: reset } },
    { window: { duration: 7, timeUnit: 'TIME_UNIT_DAY' }, detail: { limit: 100, remaining: 80 } },
    { name: 'Daily quota', window: { duration: 1, timeUnit: 'TIME_UNIT_DAY' }, limit: 50, remaining: 25 },
  ],
}
const old = parseKimiUsage(legacy)
assert.deepEqual(old.quotas.map((q) => [q.id, q.remainingPercent]), [['weekly', 80], ['five-hour', 60], ['limit-3', 50]])
assert.equal(old.quotas[1].windowSeconds, 18000)
assert.equal(old.quotas[2].name, 'Daily quota')
assert.deepEqual(old.wallets, [])
assert.equal(parseKimiUsage({ ...legacy, usages: modern.usages }).quotas.length, 5)
assert.equal(parseKimiUsage({ usages: { limit_7d: { used_ratio: 1.1 } } }).quotas[0].remainingPercent, 0)
for (const used_ratio of [null, true, '', ' ', 'bad', -1, Infinity]) {
  assert.equal(parseKimiUsage({ usages: { limit_7d: { used_ratio } } }).status, 'failed')
}
assert.equal(parseKimiUsage({ usage: { limit: 100 } }).status, 'failed')
assert.equal(parseKimiUsage({ usage: { limit: 0, remaining: 0 } }).status, 'failed')
assert.equal(parseKimiUsage({ usage: { limit: 1e-300, used: 1e300 } }).status, 'failed')
assert.equal(parseKimiUsage({ boosterWallet: { balance: { type: 'BOOSTER', amount: '2500000000' } } }).status, 'failed')
assert.equal(parseKimiUsage({ boosterWallet: { balance: { type: 'BOOSTER', amountLeft: '0' } } }).wallets[0].balance, '0.00000000')
for (const data of [null, [], {}, { error: 'upstream' }]) assert.equal(parseKimiUsage(data).status, 'failed')
console.log('PASS current/legacy schemas, precision, missing/invalid fields, depleted quota')

for (const [id, base, expected] of [
  ['kimi-coding', undefined, 'https://api.kimi.com/coding/v1/usages'],
  ['kimi-coding', 'https://api.kimi.com/coding/', 'https://api.kimi.com/coding/v1/usages'],
  ['custom', 'https://api.kimi.ai/coding/v1/', 'https://api.kimi.ai/coding/v1/usages'],
  ['kimi-coding', 'https://proxy.example/prefix/coding/v1', 'https://proxy.example/prefix/coding/v1/usages'],
]) assert.deepEqual(balanceTarget(id, base), { kind: 'kimi-coding', url: expected })
for (const base of ['https://api.moonshot.cn/v1', 'https://api.kimi.com/v1', 'https://api.kimi.com.example/coding/v1']) {
  assert.equal(balanceTarget('moonshot', base).kind, 'unsupported')
}
assert.equal(balanceTarget('kimi-coding', 'bad-url').kind, 'unsupported')
assert.equal(consoleLink('kimi-coding', undefined), 'https://www.kimi.com/code/console')
assert.equal(consoleLink('custom', 'https://api.kimi.ai/coding'), 'https://www.kimi.ai/code/console')
console.log('PASS default, regional, Anthropic, custom bases and separate Open Platform routes')

let requests = 0
let status = 200
let responseData = modern
const key = 'fixture-secret-do-not-log'
const service = (name) => name === 'subprocess' ? {
  resolveExecutable: async () => '/mock/node',
  spawn(spec) {
    requests++
    assert.ok(!JSON.stringify(spec.argv).includes(key))
    const request = JSON.parse(spec.stdio.stdin.data)
    assert.equal(request.headers.Authorization, 'Bearer ' + key)
    assert.equal(request.url, 'https://api.kimi.com/coding/v1/usages')
    assert.ok(request.timeoutMs > 0)
    return {
      done: Promise.resolve({ exitCode: 0 }),
      collected: { stdout: { readFrom: () => ({ text: JSON.stringify({ status, body: JSON.stringify(responseData) }) }) } },
    }
  },
} : undefined
const query = (label = 'KIMI_CODING_API_KEY', resolve = async () => key) =>
  providerBalance(service, {}, 'kimi-coding', undefined, resolve, label, undefined)
assert.equal((await query()).status, 'ready')
assert.equal((await query('KIMI_CODING_API_KEY', async () => undefined)).status, 'no-credential')
for (const code of [401, 403, 429, 500]) {
  status = code
  const failed = await query()
  assert.equal(failed.status, 'failed')
  assert.ok(!JSON.stringify(failed).includes(key))
  assert.ok(failed.link)
}
status = 200
responseData = {}
assert.equal((await query()).status, 'failed')
console.log('PASS bounded subprocess, stdin-only credentials, authentication/rate/server errors')

const originalFetch = globalThis.fetch
try {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.kimi.com/coding/v1/usages')
    assert.equal(options.headers.Authorization, 'Bearer ' + key)
    assert.ok(options.signal instanceof AbortSignal)
    return new Response(JSON.stringify(modern), { status: 200 })
  }
  assert.equal((await providerBalance(() => undefined, {}, 'kimi-coding', undefined, async () => key, 'key')).status, 'ready')
} finally { globalThis.fetch = originalFetch }
console.log('PASS fetch fallback with authentication and timeout')

responseData = legacy
for (const record of [false, true]) {
  const services = {
    llm: {
      listProviders: () => [{ id: 'kimi-coding' }],
      listConfigurableProviders: () => [{ provider: 'kimi-coding', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'kimi-coding'] }],
      listModels: () => [{ id: 'kimi-for-coding', name: 'Kimi' }],
    },
    settings: { describe: () => [{ ns: 'llm-pi-ai', value: { providers: { 'kimi-coding': record ? {} : { apiKeyEnv: 'KIMI_CODING_API_KEY' } } } }] },
    credentials: {
      describe: async () => ({ configured: true }), resolve: async () => key,
      describeRecord: async () => ({ configured: record, kind: 'api-key' }),
      readRecord: async () => ({ kind: 'api-key', key }),
    },
  }
  const loader = createPayloadLoader({ options: { includeModelDetails: false }, service: (name) => services[name] ?? service(name) })
  const payload = await loader(true)
  assert.equal(payload.providers[0].balance.status, 'ready')
  assert.equal(payload.providers[0].balance.quotas[0].remainingPercent, 80)
  assert.ok(!JSON.stringify(payload).includes(key))
  const before = requests
  await loader(true)
  assert.equal(requests, before)
  assert.equal((await loader(false)).providers[0].models.length, 0)
}
console.log('PASS payload collection with reference/record credentials, summaries and cache')

initReact({
  createElement: (type, props, ...children) => typeof type === 'function'
    ? type(props) : { type, props, children: children.flat(Infinity).filter((item) => item != null) },
})
const elements = (node) => {
  if (node === null || typeof node !== 'object') return []
  return [node, ...(node.children ?? []).flatMap(elements)]
}
const times = (node) => elements(node).filter((entry) => entry.type === 'time')
for (const lang of ['zh', 'en']) {
  const t = (key, values) => translate(lang, key, values)
  const rendered = BalanceBlock({ balance: parsed, t })
  const tree = JSON.stringify(rendered)
  assert.ok(tree.includes(t('quota-weekly')) && tree.includes(t('quota-month-total')))
  assert.ok(tree.includes(t('extraUsage')) && tree.includes('12.50'))
  assert.ok(tree.includes(t('quotaRemaining', { percent: '75%' })))
  assert.doesNotMatch(tree, /已用 |% used/, 'used percentage is not repeated')
  const bars = elements(rendered).filter((node) => node.props?.role === 'progressbar')
  assert.deepEqual(bars.map((node) => node.props['aria-valuenow']), [75, 100, 0, 37.5])
  assert.deepEqual(bars.map((node) => node.children[0].props.style.width), ['75%', '100%', '0%', '37.5%'])
  assert.equal(bars[0].props['aria-label'], t('quota-five-hour'))
  assert.equal(bars[0].props['aria-valuetext'], t('quotaRemaining', { percent: '75%' }))
  assert.deepEqual(elements(rendered).filter((node) => node.props?.className === 'dmu-quota').map((node) => node.props['data-level']),
    ['high', 'high', 'low', 'medium'])
  for (const [remainingPercent, expectedLevel] of [[0, 'low'], [19.9, 'low'], [20, 'medium'], [49.9, 'medium'], [50, 'high'], [100, 'high']]) {
    const quotaTree = BalanceBlock({ balance: { status: 'ready', quotas: [{ ...parsed.quotas[0], remainingPercent }] }, t })
    assert.equal(elements(quotaTree).find((node) => node.props?.className === 'dmu-quota').props['data-level'], expectedLevel)
  }
  assert.notEqual(t('quotaReset', { time: '' }), 'quotaReset', 'reset copy must be translated')
  const resetTimes = times(rendered)
  assert.equal(resetTimes.length, 1, 'only the window with a reset time shows one')
  assert.equal(resetTimes[0].props.dateTime, reset)
  const expectedTime = process.env.TZ === 'Asia/Shanghai' ? '2026-10-05 16:00'
    : process.env.TZ === 'UTC' ? '2026-10-05 08:00' : undefined
  if (expectedTime) assert.equal(resetTimes[0].children.join(''), t('quotaReset', { time: expectedTime }))
  assert.ok(resetTimes[0].props.title.includes('2026'), 'tooltip includes the full local timestamp')
  const quotaOnly = JSON.stringify(BalanceBlock({ balance: old, t }))
  assert.ok(!quotaOnly.includes(t('balanceUnavailable')) && !quotaOnly.includes(t('extraUsage')))
  assert.equal(times(BalanceBlock({ balance: old, t })).length, 2, 'legacy window reset times also render')
  for (const resetAt of [undefined, '', 'invalid-date']) {
    const missingTime = BalanceBlock({ balance: { status: 'ready', quotas: [{ ...parsed.quotas[0], resetAt }] }, t })
    assert.equal(times(missingTime).length, 0, 'missing or invalid reset times are hidden')
    assert.ok(JSON.stringify(missingTime).includes(t('quotaRemaining', { percent: '75%' })))
  }
}
console.log('PASS Chinese/English rendering, remaining progress/thresholds/accessibility, reset times, quota-only and extra-usage balances')
