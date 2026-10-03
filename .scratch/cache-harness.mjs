/** Cache behaviour checks with mocked services, Remote, hooks, and clock. */
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const built = await build({
  stdin: {
    contents: [
      "export { createPayloadLoader } from './src/host/collect';",
      "export { createReader, usePayload } from './src/client/data';",
      "export { initReact } from './src/client/react';",
      "export { retainBalances, mergeProviderPayload, CACHE_TTL_MS, CACHE_RETRY_MS } from './src/cache';",
      "export { apply } from './src/index';",
    ].join('\n'),
    resolveDir: new URL('../', import.meta.url).pathname,
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
  external: ['@deepseek-ai/*'],
})
const source = built.outputFiles[0].text.replace(/^import \{ defineTool \}.*$/m, 'const defineTool = (options) => options')
const { createPayloadLoader, createReader, usePayload, initReact, retainBalances, mergeProviderPayload, apply, CACHE_TTL_MS, CACHE_RETRY_MS } =
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const OriginalDate = globalThis.Date
let now = OriginalDate.now()
globalThis.Date = class extends OriginalDate {
  constructor(...args) { super(...(args.length ? args : [now])) }
  static now() { return now }
}
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const readyAccount = (balance = '10.00') => ({ status: 'ready', value: [{ currency: 'CNY', balance }] })
let balanceReads = 0
let catalogReads = 0
let accountGate
let accountResult = readyAccount()
let brokenLookup = false
let brokenReads = 0
const services = {
  llm: {
    listProviders: () => [{ id: 'deepseek-account' }],
    listModels: () => { catalogReads++; return [{ id: 'model', name: 'Model' }] },
  },
  settings: { describe: () => [] },
  deepseekAccount: { getBalance: () => {
    balanceReads++
    return accountGate?.promise ?? Promise.resolve(accountResult)
  } },
}
const service = (name) => {
  if (brokenLookup && name === 'settings') { brokenReads++; throw new Error('collection-failed') }
  return services[name]
}
const loader = createPayloadLoader({ options: { includeModelDetails: false }, service })

try {
  accountGate = deferred()
  const summaryRead = loader(false)
  const detailRead = loader(true)
  const refreshRead = loader(true, undefined, true)
  await flush()
  assert.equal(balanceReads, 1, 'cold summary/detail/refresh share one query')
  now += CACHE_TTL_MS * 2 // a slow collection must still get a complete TTL
  accountGate.resolve(readyAccount())
  const [summary, detail, refreshed] = await Promise.all([summaryRead, detailRead, refreshRead])
  accountGate = undefined
  assert.equal(summary.detail, false)
  assert.equal(summary.providers[0].models.length, 0)
  assert.equal(detail.providers[0].models.length, 1)
  assert.equal(summary.fetchedAt, detail.fetchedAt)
  assert.equal(refreshed.fetchedAt, detail.fetchedAt)
  assert.equal(detail.cacheRemainingMs, CACHE_TTL_MS)
  now += CACHE_TTL_MS - 1
  await loader(false)
  const almostExpired = await loader(true)
  assert.equal(almostExpired.cacheRemainingMs, 1)
  assert.equal(balanceReads, 1)
  assert.equal(catalogReads, 1)
  now++
  await Promise.all([loader(true), loader(false)])
  assert.equal(balanceReads, 2, 'expiry causes one shared collection')
  await loader(true, undefined, true)
  assert.equal(balanceReads, 3, 'manual refresh bypasses fresh cache')
  console.log('PASS Host canonical cache, projections, completion-based TTL, expiry, and force refresh')

  accountGate = deferred()
  const controller = new AbortController()
  const cancelled = loader(true, controller.signal, true)
  const survivor = loader(false)
  await flush()
  controller.abort(new Error('cancelled-caller'))
  await assert.rejects(cancelled, /cancelled-caller/)
  accountGate.resolve(readyAccount('11.00'))
  assert.equal((await survivor).providers[0].balance.wallets[0].balance, '11.00')
  accountGate = undefined
  const alreadyCancelled = new AbortController()
  alreadyCancelled.abort()
  const beforeCancelled = balanceReads
  await assert.rejects(loader(true, alreadyCancelled.signal))
  assert.equal(balanceReads, beforeCancelled)
  console.log('PASS cancelling one Host caller leaves the shared query intact')

  const previous = await loader(true)
  accountResult = { status: 'failed' }
  now++
  const stale = await loader(true, undefined, true)
  const staleBalance = stale.providers[0].balance
  assert.equal(staleBalance.status, 'ready')
  assert.equal(staleBalance.wallets[0].balance, '11.00')
  assert.equal(staleBalance.fetchedAt, previous.fetchedAt)
  assert.ok(staleBalance.refreshError)
  assert.equal(stale.cacheRemainingMs, CACHE_RETRY_MS)
  const beforeRetry = balanceReads
  now += CACHE_RETRY_MS - 1
  await loader(false)
  assert.equal(balanceReads, beforeRetry)
  now++
  accountResult = readyAccount('12.00')
  const recovered = await loader(true)
  assert.equal(recovered.providers[0].balance.refreshError, undefined)
  assert.equal(recovered.providers[0].balance.wallets[0].balance, '12.00')
  accountResult = null
  assert.equal((await loader(true, undefined, true)).providers[0].balance.status, 'not-signed-in')
  const changed = { ...stale, providers: stale.providers.map((p) => ({ ...p, baseURL: 'https://new.example', balance: { status: 'failed' } })) }
  assert.equal(retainBalances(previous, changed).providers[0].balance.status, 'failed')
  const twoProviders = retainBalances(undefined, {
    ...previous,
    providers: [previous.providers[0], { ...previous.providers[0], id: 'second-account' }],
  })
  const scopedTime = new Date(now + 1_000).toISOString()
  const scopedUpdate = retainBalances(twoProviders, {
    ...twoProviders, fetchedAt: scopedTime,
    providers: [{ ...twoProviders.providers[0], balance: { status: 'ready', wallets: [] } }],
  })
  const merged = mergeProviderPayload(twoProviders, scopedUpdate)
  const failedSecond = retainBalances(merged, {
    ...merged, fetchedAt: new Date(now + 2_000).toISOString(),
    providers: [{ ...merged.providers[1], balance: { status: 'failed', message: 'offline' } }],
  })
  assert.equal(failedSecond.providers[0].balance.fetchedAt, previous.providers[0].balance.fetchedAt,
    'refreshing another provider must not change the retained balance age')
  console.log('PASS failed provider retains timestamped balance, retry cooldown, recovery, logout, and account isolation')

  brokenLookup = true
  now += CACHE_TTL_MS
  await assert.rejects(loader(true), /collection-failed/)
  await assert.rejects(loader(false), /collection-failed/)
  assert.equal(brokenReads, 1)
  await assert.rejects(loader(true, undefined, true), /collection-failed/)
  assert.equal(brokenReads, 2, 'force bypasses failure cooldown')
  now += CACHE_RETRY_MS
  await assert.rejects(loader(true), /collection-failed/)
  assert.equal(brokenReads, 3)
  brokenLookup = false
  accountResult = readyAccount()
  await loader(true, undefined, true)
  console.log('PASS Host collection failures back off and permit manual retry')

  let command, tool
  apply({
    get: (name) => services[name],
    commands: { register: (value) => { command = value } },
    tools: { register: (value) => { tool = value } },
  }, { includeModelDetails: false })
  const beforeCommand = balanceReads
  await command.handler({ rawInput: 'summary' })
  await command.handler({ rawInput: 'detail' })
  await tool.execute({}, {})
  assert.equal(balanceReads, beforeCommand + 1)
  await command.handler({ rawInput: 'refresh' })
  assert.equal(balanceReads, beforeCommand + 2)
  console.log('PASS slash command refresh and model tool use the same cache')

  const makePayload = (amount = '10.00', remainingMs = CACHE_TTL_MS) => ({
    ok: true, command: 'dsh-models-usage', detail: true,
    fetchedAt: new Date().toISOString(), cacheRemainingMs: remainingMs,
    counts: { providers: 1, activeProviders: 1, models: 1 },
    providers: [{
      id: 'demo', displayName: 'Demo', active: true, declared: true, credential: null,
      balance: { status: 'ready', wallets: [{ currency: 'CNY', balance: amount, kind: 'topped-up' }] },
      modelCount: 1, models: [{ id: 'model', name: 'Model' }],
    }],
  })
  let remoteGate
  let remotePayload = makePayload()
  let remoteError
  const calls = []
  const ctx = { remote: { commands: { execute: async (...args) => {
    calls.push(args)
    assert.equal(args.length, 3)
    assert.deepEqual(args[2], [])
    const value = remoteGate ? await remoteGate.promise : remotePayload
    if (remoteError) throw new Error(remoteError)
    return { ok: true, value: { result: { kind: 'success', text: JSON.stringify(value) } } }
  } } } }
  const read = createReader(ctx)
  const events = []
  const unsubscribe = read.subscribe(() => events.push(read.snapshot()))
  remoteGate = deferred()
  const coldSummary = read('s1', false)
  const coldDetail = read('s2', true)
  const coldForce = read('s2', true, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][1], '/dsh-models-usage detail')
  remoteGate.resolve(remotePayload)
  const [clientSummary, clientDetail] = await Promise.all([coldSummary, coldDetail, coldForce])
  remoteGate = undefined
  assert.equal(clientSummary.payload.providers[0].models.length, 0)
  assert.equal(clientDetail.payload.providers[0].models.length, 1)
  await read('s3', true)
  assert.equal(calls.length, 1, 'session switches reuse account cache')
  assert.equal((await read(undefined, true)).error, 'no-session')
  assert.equal(read.snapshot().kind, 'ready')
  assert.equal(calls.length, 1)
  console.log('PASS client coalescing, summary/detail sharing, session reuse, and no-session guard')

  now += CACHE_TTL_MS
  remoteGate = deferred()
  const background = read('s1', true)
  const duringUpdate = read.snapshot()
  assert.equal(duringUpdate.kind, 'ready')
  assert.equal(duringUpdate.refreshing, true)
  assert.equal(duringUpdate.payload.fetchedAt, remotePayload.fetchedAt)
  remotePayload = makePayload('20.00')
  remoteGate.resolve(remotePayload)
  await background
  remoteGate = undefined
  assert.equal(read.snapshot().payload.providers[0].balance.wallets[0].balance, '20.00')
  assert.equal(read.snapshot().refreshing, false)
  assert.ok(events.some((event) => event.kind === 'ready' && event.refreshing))
  remotePayload = makePayload('30.00')
  await read('s1', false, true)
  assert.equal(calls.at(-1)[1], '/dsh-models-usage refresh')
  assert.equal(read.snapshot().payload.providers[0].balance.wallets[0].balance, '30.00')
  console.log('PASS background refresh retains old data, broadcasts state, and manual refresh bypasses both caches')

  now += CACHE_TTL_MS
  remoteError = 'offline'
  const oldTime = read.snapshot().payload.fetchedAt
  assert.equal((await read('s1', true)).ok, false)
  assert.equal(read.snapshot().kind, 'ready')
  assert.equal(read.snapshot().refreshError, 'offline')
  assert.equal(read.snapshot().payload.fetchedAt, oldTime)
  const failedCalls = calls.length
  now += CACHE_RETRY_MS - 1
  await read('s2', true)
  assert.equal(calls.length, failedCalls)
  await read('s2', true, true)
  assert.equal(calls.length, failedCalls + 1)
  now += CACHE_RETRY_MS
  remoteError = undefined
  remotePayload = makePayload('40.00', 1_000)
  await read('s2', true)
  assert.equal(read.snapshot().refreshError, undefined)
  now += 999
  await read('s2', true)
  const freshCalls = calls.length
  now++
  remotePayload = makePayload()
  await read('s2', true)
  assert.equal(calls.length, freshCalls + 1, 'Host remaining TTL is not renewed to 60 seconds')
  unsubscribe()
  const unsubscribedEvents = events.length
  await read('s2', true, true)
  assert.equal(events.length, unsubscribedEvents)
  console.log('PASS client failures retain data, retry cooldown, force retry, remaining TTL, and subscription cleanup')

  let hooks
  let hookIndex
  let effects
  const React = {
    useState(initial) {
      const store = hooks, index = hookIndex++
      if (!store[index]) store[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [store[index].value, (next) => { store[index].value = typeof next === 'function' ? next(store[index].value) : next }]
    },
    useRef(initial) {
      const index = hookIndex++
      if (!hooks[index]) hooks[index] = { current: initial }
      return hooks[index]
    },
    useEffect(fn, deps) {
      const store = hooks, index = hookIndex++
      const previous = store[index]
      if (!previous || deps.some((dep, at) => !Object.is(dep, previous.deps[at]))) {
        effects.push(() => { previous?.cleanup?.(); store[index] = { deps, cleanup: fn() } })
      }
    },
  }
  initReact(React)
  const mount = (detail) => {
    const store = []
    return {
      render(sessionId = 's1', token = 0) {
        hooks = store; hookIndex = 0; effects = []
        const state = usePayload(read, sessionId, detail, token)
        for (const effect of effects) effect()
        return state
      },
      unmount() { for (const hook of store) hook?.cleanup?.() },
    }
  }
  const panel = mount(true)
  const summaryView = mount(false)
  const beforeMount = calls.length
  assert.equal(panel.render().kind, 'ready', 'cached data is available on first render')
  assert.equal(summaryView.render().payload.providers[0].models.length, 0)
  panel.unmount()
  const remounted = mount(true)
  assert.equal(remounted.render('another-session').kind, 'ready')
  assert.equal(calls.length, beforeMount)
  assert.equal(remounted.render(undefined).kind, 'ready') // omitted argument uses the default session
  assert.equal(remounted.render('').error, 'no-session')
  assert.equal(calls.length, beforeMount)
  remoteGate = deferred()
  remounted.render('s1', 1)
  assert.equal(read.snapshot().refreshing, true)
  assert.equal(calls.at(-1)[1], '/dsh-models-usage refresh')
  assert.equal(summaryView.render().refreshing, true)
  remoteGate.resolve(makePayload('50.00'))
  await flush()
  remoteGate = undefined
  assert.equal(summaryView.render().payload.providers[0].balance.wallets[0].balance, '50.00')
  const afterManual = calls.length
  remounted.unmount()
  const reopened = mount(true)
  assert.equal(reopened.render().kind, 'ready')
  assert.equal(calls.length, afterManual, 'remounting after refresh does not force another query')
  reopened.unmount()
  summaryView.unmount()
  console.log('PASS hooks show cache immediately, survive remounts, guard sessions, and share manual refresh state')
  console.log('All cache checks pass')
} finally {
  globalThis.Date = OriginalDate
}
