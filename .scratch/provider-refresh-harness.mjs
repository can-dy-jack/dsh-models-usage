/** Scoped Host queries and shared client-cache/UI refresh checks. No live APIs. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const bundled = await build({
  stdin: {
    contents: `export { createReader } from './src/client/data';
      export { initReact } from './src/client/react';
      export { ModelsUsagePanel } from './src/client/ui/panel';`,
    resolveDir: root.pathname, loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
})
const { createReader, initReact, ModelsUsagePanel } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
)
const hostSource = readFileSync(new URL('lib/index.js', root), 'utf8')
  .replace(/^import \{ defineTool \}.*$/m, 'const defineTool = (options) => options')
const { apply } = await import('data:text/javascript;base64,' + Buffer.from(hostSource).toString('base64'))
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
const realNow = Date.now
let now = realNow()
Date.now = () => now

try {
  const ids = ['deepseek-account', 'openrouter', 'Custom Route/Case']
  const asked = []
  const commands = []
  let accountCalls = 0
  let creditCalls = 0
  let creditStatus = 200
  let accountBalance = '10'
  let modelCount = 1
  let balanceGate
  const services = {
    llm: {
      listProviders: () => ids.map((id) => ({ id })),
      listConfigurableProviders: () => ids.map((provider) => ({ provider, settingsNs: 'llm-pi-ai', settingsPath: ['providers', provider] })),
      listModels: (id) => {
        asked.push(id)
        return Array.from({ length: id === ids[0] ? modelCount : 1 }, (_, index) => ({ id: id + '-' + index }))
      },
    },
    credentials: {
      describeRecord: () => ({ configured: true, kind: 'api-key' }),
      readRecord: () => ({ kind: 'api-key', key: 'mock-key' }),
    },
    // Built-in OpenRouter uses its default base; an explicit URL must not be required.
    settings: { describe: () => [{ ns: 'llm-pi-ai', value: { providers: { openrouter: {} } } }] },
    deepseekAccount: {
      getBalance: async () => {
        accountCalls++
        if (balanceGate) await balanceGate.promise
        return { status: 'ready', value: [{ currency: 'CNY', balance: accountBalance }] }
      },
    },
    subprocess: {
      resolveExecutable: () => '/mock/node',
      spawn: (spec) => {
        const request = JSON.parse(spec.stdio.stdin.data)
        assert.equal(request.url, 'https://openrouter.ai/api/v1/credits')
        assert.equal(request.headers.Authorization, 'Bearer mock-key')
        assert.ok(!spec.argv.join(' ').includes('mock-key'))
        creditCalls++
        return {
          done: Promise.resolve({ exitCode: 0 }),
          collected: { stdout: { readFrom: () => ({ text: JSON.stringify({ status: creditStatus, body: JSON.stringify({ data: { total_credits: 20, total_usage: 5 } }) }) }) } },
        }
      },
    },
  }
  apply({ get: (name) => services[name], commands: { register: (command) => commands.push(command) }, tools: { register() {} } }, { includeModelDetails: false })
  const run = (rawInput) => commands[0].handler({ rawInput })
  const initial = JSON.parse((await run('detail')).text)
  assert.equal(initial.providers.length, 3)
  assert.equal(accountCalls, 1)
  assert.equal(creditCalls, 1)
  assert.equal(initial.providers.find((provider) => provider.id === 'openrouter').balance.status, 'ready')
  now += 30_000
  asked.length = 0
  accountBalance = '8'
  modelCount = 2
  const scoped = JSON.parse((await run('refresh provider=deepseek-account')).text)
  assert.deepEqual(asked, [ids[0]])
  assert.equal(accountCalls, 2)
  assert.equal(creditCalls, 1)
  assert.equal(scoped.providers.length, 1)
  assert.equal(scoped.providers[0].balance.wallets[0].balance, '8')
  const merged = JSON.parse((await run('detail')).text)
  assert.equal(merged.counts.models, 4)
  assert.equal(merged.providers[0].modelCount, 2)
  assert.deepEqual(merged.providers.find((provider) => provider.id === ids[1]), initial.providers.find((provider) => provider.id === ids[1]))
  assert.ok(merged.cacheRemainingMs <= 30_000)
  creditStatus = 500
  const retained = JSON.parse((await run('refresh provider=openrouter')).text).providers[0]
  assert.equal(retained.balance.status, 'ready')
  assert.equal(retained.balance.fetchedAt, initial.providers.find((provider) => provider.id === ids[1]).balance.fetchedAt)
  assert.match(retained.balance.refreshError, /HTTP 500/)
  creditStatus = 200
  asked.length = 0
  assert.equal((await run('refresh provider=missing')).kind, 'error')
  assert.deepEqual(asked, [])
  assert.equal((await run('refresh provider=' + encodeURIComponent(ids[2]))).kind, 'success')
  assert.deepEqual(asked, [ids[2]])
  balanceGate = deferred()
  const a = run('refresh provider=deepseek-account')
  const b = run('summary refresh provider=deepseek-account')
  await flush()
  assert.equal(accountCalls, 3)
  balanceGate.resolve()
  const [fullDetail, summary] = await Promise.all([a, b])
  balanceGate = undefined
  assert.equal(JSON.parse(fullDetail.text).providers[0].models.length, 2)
  assert.equal(JSON.parse(summary.text).providers[0].models.length, 0)
  now += 30_001
  asked.length = 0
  await run('detail')
  assert.equal(asked.length, 3, 'scoped refresh did not renew unrelated Host entries')
  balanceGate = deferred()
  const beforeConcurrent = accountCalls
  const fullRefresh = run('refresh')
  await flush()
  const joinFull = run('refresh provider=deepseek-account')
  await flush()
  assert.equal(accountCalls, beforeConcurrent + 1)
  balanceGate.resolve()
  const [fullResult, scopedResult] = await Promise.all([fullRefresh, joinFull])
  balanceGate = undefined
  assert.equal(JSON.parse(fullResult.text).providers.length, 3)
  assert.equal(JSON.parse(scopedResult.text).providers.length, 1)
  assert.equal(accountCalls, beforeConcurrent + 1, 'scoped refresh shares an already running full query')
  console.log('PASS Host scope, cache merge, case-preserving IDs, deduplication and freshness')

  const calls = []
  const gates = new Map()
  const envelope = (payload) => ({ ok: true, value: { result: { kind: 'success', text: JSON.stringify(payload) } } })
  const clientInitial = { ...initial, providers: ids.map((id) => initial.providers.find((provider) => provider.id === id)), fetchedAt: new Date(now).toISOString(), cacheRemainingMs: 60_000 }
  const read = createReader({ remote: { commands: { execute: (...args) => {
    assert.equal(args.length, 3)
    assert.deepEqual(args[2], [])
    calls.push(args)
    const match = / provider=(.*)$/.exec(args[1])
    if (!match) return Promise.resolve(envelope(clientInitial))
    const gate = deferred()
    gates.set(decodeURIComponent(match[1]), gate)
    return gate.promise
  } } } })
  let notifications = 0
  read.subscribe(() => { notifications++ })
  await read('session-1', true)
  await read('session-2', false)
  assert.equal(calls.length, 1)
  initReact({
    Fragment: 'fragment',
    createElement: (type, props, ...children) => typeof type === 'function'
      ? type(props) : { type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child != null && child !== false) },
    useState: (initial) => [initial, () => {}], useRef: (current) => ({ current }), useEffect() {},
  })
  const nodes = (tree) => {
    if (!tree || typeof tree !== 'object') return []
    return [tree, ...(tree.children ?? []).flatMap(nodes)]
  }
  const byClass = (tree, name) => nodes(tree).filter((node) => node.props?.className?.split(' ').includes(name))
  const panel = () => ModelsUsagePanel({ read, lang: 'zh', diag: '', sessionId: 'session-1' })
  let tree = panel()
  assert.equal(byClass(tree, 'dmu-providerRefresh').length, 3)
  byClass(tree, 'dmu-providerRefresh')[0].props.onClick()
  const duplicate = read.refreshProvider('session-1', ids[0])
  tree = panel()
  assert.equal(calls.length, 2)
  assert.equal(calls[1][0], 'session-1')
  assert.equal(calls[1][1], '/dsh-models-usage refresh provider=deepseek-account')
  const buttons = byClass(tree, 'dmu-providerRefresh')
  assert.equal(buttons[0].props.disabled, true)
  assert.equal(buttons[1].props.disabled, false)
  assert.ok(buttons[0].props.className.includes('is-refreshing'))
  assert.equal(byClass(tree, 'dmu-card')[0].props['aria-busy'], true)
  assert.equal(byClass(tree, 'dmu-button').find((button) => button.children.includes('刷新')).props.disabled, true)
  buttons[1].props.onClick()
  assert.equal(calls.length, 3)
  const update = (id, balance, count) => {
    const provider = clientInitial.providers.find((entry) => entry.id === id)
    return { ...clientInitial, fetchedAt: new Date(now).toISOString(), providers: [{ ...provider, modelCount: count, models: Array.from({ length: count }, (_, i) => ({ id: 'updated-' + i, name: 'Updated' })), balance: { status: 'ready', wallets: [{ currency: 'CNY', balance, kind: 'account' }] } }] }
  }
  gates.get(ids[1]).resolve(envelope(update(ids[1], '14', 3)))
  await flush()
  assert.equal(read.snapshot().providerRefreshes[ids[0]].refreshing, true)
  gates.get(ids[0]).resolve(envelope(update(ids[0], '7', 2)))
  await duplicate
  const state = read.snapshot()
  assert.equal(state.payload.providers.length, 3)
  assert.equal(state.payload.counts.models, 6)
  assert.equal(state.payload.providers[0].balance.wallets[0].balance, '7')
  assert.equal(state.payload.providers[1].balance.wallets[0].balance, '14')
  assert.deepEqual(state.payload.providers[2], clientInitial.providers[2])
  const balances = JSON.stringify(byClass(panel(), 'dmu-balance'))
  assert.match(balances, /7\.00/)
  assert.match(balances, /14\.00/)
  const fail = read.refreshProvider('session-1', ids[0])
  gates.get(ids[0]).resolve({ ok: true, value: { result: { kind: 'error', text: 'mock failure' } } })
  assert.equal((await fail).ok, false)
  assert.equal(read.snapshot().payload, state.payload)
  assert.equal(read.snapshot().providerRefreshes[ids[0]].error, 'mock failure')
  assert.match(JSON.stringify(byClass(panel(), 'dmu-error')), /mock failure/)
  const retry = read.refreshProvider('session-1', ids[0])
  gates.get(ids[0]).resolve(envelope(update(ids[0], '6', 2)))
  assert.equal((await retry).ok, true)
  assert.equal(read.snapshot().providerRefreshes[ids[0]], undefined)
  const wrongScope = read.refreshProvider('session-1', ids[0])
  gates.get(ids[0]).resolve(envelope(clientInitial))
  assert.equal((await wrongScope).error, 'invalid-provider-response')
  const mismatchMessage = JSON.stringify(byClass(panel(), 'dmu-error'))
  assert.match(mismatchMessage, /请重启 Harness/)
  assert.doesNotMatch(mismatchMessage, /invalid-provider-response/)
  const oldOtherTime = read.snapshot().payload.providers[1].balance.fetchedAt
  now += 1_000
  const balanceFailure = read.refreshProvider('session-1', ids[1])
  const failedUpdate = update(ids[1], '0', 3)
  failedUpdate.providers[0].balance = { status: 'failed', message: 'balance failure' }
  gates.get(ids[1]).resolve(envelope(failedUpdate))
  assert.equal((await balanceFailure).ok, true)
  assert.equal(read.snapshot().payload.providers[1].balance.fetchedAt, oldOtherTime)
  assert.equal(read.snapshot().payload.providers[1].balance.wallets[0].balance, '14')
  const before = calls.length
  assert.equal((await read.refreshProvider(undefined, ids[0])).error, 'no-session')
  assert.equal(calls.length, before)
  now += 60_001
  await read('session-1', true)
  assert.equal(calls.length, before + 1, 'scoped refresh did not renew unrelated client entries')
  assert.ok(notifications > 5)
  console.log('PASS card controls, isolated/concurrent refreshes, panel updates, errors/retry and freshness')
} finally {
  Date.now = realNow
}
