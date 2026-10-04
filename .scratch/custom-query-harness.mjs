/** User-defined balance/usage queries: paths, mapping, templates, store, commands, Host override and editor UI. No network. */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const bundled = await build({
  stdin: { contents: `export * from './src/custom-query';
    export { customBalance, testCustomQuery, redact } from './src/host/custom';
    export { initReact } from './src/client/react';
    export { translate } from './src/client/i18n';
    export { CustomQueryModal } from './src/client/ui/custom-query';
    export { retainBalances } from './src/cache';`, resolveDir: root.pathname, loader: 'tsx' },
  bundle: true, platform: 'node', format: 'esm', write: false, jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
})
const lib = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const { getPath, expandItems, parsePath, validateCustomQuery, mapCustomResponse, renderRequest, templateVariables,
  normalizeReset, encodeCommandJson, decodeCommandJson, customBalance, testCustomQuery, retainBalances } = lib

// ─── Paths ────────────────────────────────────────────────────────────────
const doc = { code: 0, data: { list: [{ v: 1, n: 'a' }, { v: 2, n: 'b' }], 'odd key': { x: 9 }, nested: { arr: [[5]] } } }
assert.equal(getPath(doc, 'data.list[1].n'), 'b')
assert.equal(getPath(doc, 'data["odd key"].x'), 9)
assert.equal(getPath(doc, 'data.nested.arr[0][0]'), 5)
assert.equal(getPath(doc, 'data.list.1.v'), 2, 'numeric dot segments index arrays')
assert.equal(getPath(doc, ''), doc)
assert.equal(getPath(doc, 'data.missing.x'), undefined)
assert.equal(getPath(doc, 'data.list[*].v'), undefined, '[*] only expands in itemsPath')
assert.deepEqual(expandItems(doc, 'data.list[*]').map((item) => item.n), ['a', 'b'])
assert.deepEqual(expandItems(doc, 'data.list[*].v'), [1, 2])
assert.deepEqual(expandItems(doc, undefined), [doc])
for (const bad of ['a..b', '.a', 'a.', 'a[', 'a[x]']) assert.equal(parsePath(bad), undefined, bad)
console.log('PASS dot paths, brackets, quoted keys and [*] expansion')

// ─── Validation ───────────────────────────────────────────────────────────
const base = {
  enabled: true,
  request: { method: 'GET', url: '{{baseURL}}/user/balance', headers: [{ name: 'Authorization', value: 'Bearer {{apiKey}}' }], query: [] },
  wallets: [{ itemsPath: 'balance_infos[*]', balance: { path: 'total_balance' }, currency: { path: 'currency' } }],
  quotas: [],
}
assert.equal(validateCustomQuery(base).ok, true)
for (const [patch, pattern] of [
  [{ request: { ...base.request, url: 'file:///etc/passwd' } }, /http/],
  [{ request: { ...base.request, url: 'https://x/{{secret}}' } }, /未知占位符/],
  [{ request: { ...base.request, method: 'DELETE' } }, /GET \/ POST/],
  [{ wallets: [], quotas: [] }, /至少/],
  [{ wallets: [{ balance: { path: 'a[*]' } }] }, /路径无效/],
  [{ quotas: [{ name: { fixed: 'x' } }] }, /百分比/],
  [{ wallets: Array.from({ length: 21 }, () => ({ balance: { path: 'a' } })) }, /最多/],
]) {
  const result = validateCustomQuery({ ...base, ...patch })
  assert.equal(result.ok, false)
  assert.match(result.errors.join(' '), pattern)
}
const normalized = validateCustomQuery({ ...base, request: { ...base.request, headers: [{ name: ' X ', value: '1' }, { name: '', value: '' }] }, wallets: [{ balance: { path: ' a ' }, divisor: '1' }] })
assert.deepEqual(normalized.query.request.headers, [{ name: 'X', value: '1' }])
assert.deepEqual(normalized.query.wallets, [{ balance: { path: 'a' } }], 'trims paths and drops a no-op divisor')
console.log('PASS validation: protocols, placeholders, methods, rule limits and normalization')

// ─── Templates ────────────────────────────────────────────────────────────
const now = new Date('2026-10-04T08:30:00Z')
const vars = templateVariables({ providerId: 'ark', baseURL: 'https://api.example.com/v1/', apiKey: 'k e/y"', now })
assert.equal(vars.baseURL, 'https://api.example.com/v1')
assert.equal(vars.origin, 'https://api.example.com')
assert.equal(vars['monthStart.iso'], '2026-10-01T00:00:00.000Z')
assert.equal(vars.today, '2026-10-04')
const rendered = renderRequest(validateCustomQuery({
  ...base,
  request: { method: 'POST', url: '{{baseURL}}/usage?key={{apiKey}}', headers: [{ name: 'Authorization', value: 'Bearer {{apiKey}}' }],
    query: [{ name: 'from', value: '{{monthStart.iso}}' }], body: '{"key":"{{apiKey}}","n":1,"list":["{{today}}"]}' },
}).query, vars)
// Appending query rows re-serializes the query as form encoding (space → +).
assert.equal(rendered.url, 'https://api.example.com/v1/usage?key=k+e%2Fy%22&from=2026-10-01T00%3A00%3A00.000Z')
assert.equal(new URL(rendered.url).searchParams.get('key'), 'k e/y"')
assert.equal(rendered.headers.Authorization, 'Bearer k e/y"')
assert.equal(rendered.headers['Content-Type'], 'application/json')
assert.deepEqual(JSON.parse(rendered.body), { key: 'k e/y"', n: 1, list: ['2026-10-04'] }, 'JSON bodies stay valid with escaped values')
assert.throws(() => renderRequest(base, { ...vars, apiKey: undefined }), /apiKey/)
assert.deepEqual(decodeCommandJson(encodeCommandJson({ s: '中文 + / =' })), { s: '中文 + / =' })
assert.doesNotMatch(encodeCommandJson({ s: 'x'.repeat(100) + ' ' }), /[\s+/=]/)
console.log('PASS templates: URL/header/JSON escaping, dates, missing values and command encoding')

// ─── Mapping ──────────────────────────────────────────────────────────────
const deepseek = { is_available: true, balance_infos: [
  { currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' },
  { currency: 'USD', total_balance: '5', granted_balance: '0', topped_up_balance: '5' }] }
const walletQuery = validateCustomQuery({ ...base, wallets: [{ itemsPath: 'balance_infos[*]', balance: { path: 'total_balance' },
  currency: { path: 'currency' }, granted: { path: 'granted_balance' }, toppedUp: { path: 'topped_up_balance' } }] }).query
const mapped = mapCustomResponse(walletQuery, deepseek)
assert.equal(mapped.status, 'ready')
assert.equal(mapped.source, 'custom')
assert.deepEqual(mapped.wallets, [
  { currency: 'CNY', balance: '110.00', kind: 'topped-up', granted: '10.00', toppedUp: '100.00' },
  { currency: 'USD', balance: '5', kind: 'topped-up', granted: '0', toppedUp: '5' }])
const cents = mapCustomResponse(validateCustomQuery({ ...base, wallets: [{ balance: { path: 'data.amount' }, currency: { fixed: 'CNY' }, divisor: 100 }] }).query, { data: { amount: 12345 } })
assert.deepEqual(cents.wallets, [{ currency: 'CNY', balance: '123.45', kind: 'topped-up' }])
assert.equal(mapCustomResponse(walletQuery, { balance_infos: [] }).status, 'failed', 'no fabricated zero balance')

const usage = { code: 0, data: { limits: [
  { name: '5h', ratio: 0.25, reset: 1791100000 },
  { name: 'week', used: 30, total: 120, reset: '2026-10-10T00:00:00Z' },
  { name: 'month', left: 90, total: 100, reset: 3600 }] } }
const quotaQuery = validateCustomQuery({ ...base, success: { path: 'code', equals: '0' }, errorMessagePath: 'msg', wallets: [], quotas: [
  { itemsPath: 'data.limits[0]', period: 'five-hour', usedPercent: { path: 'ratio' }, percentIsRatio: true, resetAt: { path: 'reset' }, resetFormat: 'unix-s' },
  { itemsPath: 'data.limits[1]', name: { path: 'name' }, used: { path: 'used' }, limit: { path: 'total' }, resetAt: { path: 'reset' } },
  { itemsPath: 'data.limits[2]', period: 'monthly', remaining: { path: 'left' }, limit: { path: 'total' }, resetAt: { path: 'reset' }, resetFormat: 'seconds-from-now' },
] }).query
const quotas = mapCustomResponse(quotaQuery, usage)
assert.equal(quotas.status, 'ready')
assert.equal(quotas.quotas.length, 3)
assert.deepEqual([quotas.quotas[0].period, quotas.quotas[0].usedPercent, quotas.quotas[0].remainingPercent, quotas.quotas[0].resetAt],
  ['five-hour', 25, 75, new Date(1791100000 * 1000).toISOString()])
assert.deepEqual([quotas.quotas[1].name, quotas.quotas[1].period, quotas.quotas[1].usedPercent, quotas.quotas[1].remaining, quotas.quotas[1].resetAt],
  ['week', undefined, 25, 90, '2026-10-10T00:00:00.000Z'])
assert.deepEqual([quotas.quotas[2].period, quotas.quotas[2].used, quotas.quotas[2].usedPercent], ['monthly', 10, 10])
assert.ok(Math.abs(Date.parse(quotas.quotas[2].resetAt) - Date.now() - 3600_000) < 5000)
assert.equal(new Set(quotas.quotas.map((q) => q.id)).size, 3, 'unique quota ids')
const failed = mapCustomResponse(quotaQuery, { code: 1, msg: 'bad token' })
assert.equal(failed.status, 'failed')
assert.match(failed.message, /bad token/)
assert.equal(normalizeReset(1791100000000, 'auto'), new Date(1791100000000).toISOString())
assert.equal(normalizeReset(1791100000, 'auto'), new Date(1791100000000).toISOString())
assert.equal(normalizeReset('nope', 'iso'), undefined)
console.log('PASS mapping: wallets over arrays, divisors, ratio/percent, used/limit/remaining, reset formats and success checks')

// ─── Host executor ────────────────────────────────────────────────────────
const key = 'fixture-custom-key-never-log'
let reply = { status: 200, body: JSON.stringify(deepseek) }
let requests = []
const subprocess = {
  resolveExecutable: async () => '/mock/node',
  spawn(spec) {
    assert.ok(!JSON.stringify(spec.argv).includes(key), 'secret never reaches argv')
    requests.push(JSON.parse(spec.stdio.stdin.data))
    return { done: Promise.resolve({ exitCode: 0 }), collected: { stdout: { readFrom: () => ({ text: JSON.stringify(reply) }) } } }
  },
}
const service = (name) => (name === 'subprocess' ? subprocess : name === 'credentials' ? { resolve: async (ref) => (ref === 'ADMIN' ? 'admin-secret-value' : undefined) } : undefined)
const target = { service, providerId: 'ark', baseURL: 'https://ark.example.com/api/v3', resolveKey: async () => key }
const balance = await customBalance(target, walletQuery)
assert.equal(balance.status, 'ready')
assert.equal(balance.endpoint, 'https://ark.example.com/api/v3/user/balance')
assert.equal(requests.at(-1).headers.Authorization, 'Bearer ' + key)
assert.equal(requests.at(-1).method, 'GET')
reply = { status: 401, body: 'denied for ' + key }
const denied = await customBalance(target, walletQuery)
assert.equal(denied.status, 'failed')
assert.ok(!JSON.stringify(denied).includes(key), 'echoed keys are redacted from errors')
assert.equal((await customBalance({ ...target, resolveKey: async () => undefined }, walletQuery)).status, 'no-credential')
const before = requests.length
const noKeyQuery = validateCustomQuery({ ...base, request: { ...base.request, headers: [] } }).query
reply = { status: 200, body: JSON.stringify(deepseek) }
assert.equal((await customBalance({ ...target, resolveKey: async () => undefined }, noKeyQuery)).status, 'ready', 'templates without {{apiKey}} need no key')
assert.equal(requests.length, before + 1)
const adminQuery = validateCustomQuery({ ...base, credentialRef: 'ADMIN', request: { ...base.request, method: 'POST', body: '{"k":"{{apiKey}}"}' } }).query
await customBalance(target, adminQuery)
assert.equal(requests.at(-1).headers.Authorization, 'Bearer admin-secret-value', 'credentialRef overrides the model key')
assert.equal(requests.at(-1).method, 'POST')
assert.deepEqual(JSON.parse(requests.at(-1).body), { k: 'admin-secret-value' })
reply = { status: 200, body: JSON.stringify({ ...deepseek, echo: key }) }
const tested = await testCustomQuery(target, walletQuery)
assert.equal(tested.ok, true)
assert.equal(tested.status, 200)
assert.equal(tested.data.echo, '***', 'test responses are redacted')
assert.equal(tested.balance.status, 'ready')
reply = { status: 200, body: 'not json ' + key }
const textResult = await testCustomQuery(target, walletQuery)
assert.equal(textResult.ok, false)
assert.match(textResult.text, /\*\*\*/)
assert.ok(!JSON.stringify(textResult).includes(key))
console.log('PASS Host executor: stdin transport, credentialRef, POST, missing keys, redaction and raw test output')

assert.equal(retainBalances(
  { fetchedAt: 'x', providers: [{ id: 'ark', baseURL: 'b', balance: { status: 'ready', wallets: [] } }] },
  { fetchedAt: 'y', providers: [{ id: 'ark', baseURL: 'b', balance: { status: 'failed', source: 'custom', message: 'm' } }] },
).providers[0].balance.status, 'failed', 'switching to a custom query does not keep the built-in balance')

// ─── Built Host: store + commands + override ──────────────────────────────
const dir = mkdtempSync(join(tmpdir(), 'dmu-custom-'))
const storeFile = join(dir, 'nested', 'store.json')
const host = readFileSync(new URL('lib/index.js', root), 'utf8').replace(/^import \{ defineTool \}.*$/m, 'const defineTool = (options) => options')
const { apply } = await import('data:text/javascript;base64,' + Buffer.from(host).toString('base64'))
const commands = []
const ids = ['ark', 'deepseek-official']
const services = {
  llm: {
    listProviders: () => ids.map((id) => ({ id })),
    listConfigurableProviders: () => [
      { provider: 'ark', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'ark'] },
      { provider: 'deepseek-official', settingsNs: 'llm-deepseek', settingsPath: [] },
    ],
    listModels: () => [{ id: 'm' }],
  },
  settings: { describe: () => [
    { ns: 'llm-pi-ai', value: { providers: { ark: { baseURL: 'https://ark.example.com/api/v3', apiKeyEnv: 'ARK_KEY' } } } },
    { ns: 'llm-deepseek', value: { apiKeyEnv: 'DEEPSEEK_API_KEY' } },
  ] },
  credentials: { describe: async () => ({ configured: true }), resolve: async () => key },
  subprocess,
}
apply({ get: (name) => services[name], commands: { register: (c) => commands.push(c) }, tools: { register() {} } }, { includeModelDetails: false, customQueryFile: storeFile })
const run = async (line) => {
  const result = await commands[0].handler({ rawInput: line })
  assert.equal(result.kind, 'success', result.text)
  return JSON.parse(result.text)
}
reply = { status: 200, body: JSON.stringify(deepseek) }
let payload = await run('detail')
assert.equal(payload.providers.find((p) => p.id === 'ark').balance.status, 'unsupported')
assert.equal(payload.providers.find((p) => p.id === 'ark').customQuery, undefined)
assert.equal((await run('custom-get provider=ark')).query, null)
assert.equal((await run('custom-set provider=ark ' + encodeCommandJson({ ...base, wallets: [] }))).ok, false, 'invalid configs are rejected, not saved')
assert.equal(existsSync(storeFile), false)
const test = await run('custom-test provider=ark ' + encodeCommandJson(walletQuery))
assert.equal(test.test.balance.status, 'ready')
assert.equal(requests.at(-1).url, 'https://ark.example.com/api/v3/user/balance', '{{baseURL}} comes from the provider settings')
assert.equal(existsSync(storeFile), false, 'test does not save')
const saved = await run('custom-set provider=ark ' + encodeCommandJson(walletQuery))
assert.deepEqual(saved.query, walletQuery)
assert.equal(statSync(storeFile).mode & 0o777, 0o600)
assert.ok(!readFileSync(storeFile, 'utf8').includes(key), 'store holds templates only')
payload = await run('detail')
const ark = payload.providers.find((p) => p.id === 'ark')
assert.equal(ark.balance.status, 'ready', 'saving invalidates the cached payload')
assert.equal(ark.balance.source, 'custom')
assert.deepEqual(ark.customQuery, { enabled: true })
// Override a built-in provider and disable it again.
await run('custom-set provider=deepseek-official ' + encodeCommandJson({ ...quotaQuery }))
reply = { status: 200, body: JSON.stringify(usage) }
let scoped = await run('refresh provider=deepseek-official')
assert.equal(scoped.providers[0].balance.status, 'failed', 'routes without a configured base URL cannot render {{baseURL}}')
assert.match(scoped.providers[0].balance.message, /baseURL/)
await run('custom-set provider=deepseek-official ' + encodeCommandJson({ ...quotaQuery, request: { ...quotaQuery.request, url: 'https://api.deepseek.com/usage' } }))
scoped = await run('refresh provider=deepseek-official')
assert.deepEqual(scoped.providers.map((p) => p.id), ['deepseek-official'], 'scoped refresh returns only the target')
assert.equal(scoped.providers[0].balance.source, 'custom')
assert.equal(scoped.providers[0].balance.quotas.length, 3)
await run('custom-set provider=deepseek-official ' + encodeCommandJson({ ...quotaQuery, enabled: false }))
reply = { status: 200, body: JSON.stringify(deepseek) }
scoped = await run('refresh provider=deepseek-official')
assert.equal(scoped.providers[0].balance.source, undefined, 'a disabled custom query falls back to the built-in lookup')
assert.deepEqual(scoped.providers[0].customQuery, { enabled: false })
await run('custom-delete provider=deepseek-official')
assert.equal((await run('custom-get provider=deepseek-official')).query, null)
assert.notEqual((await run('custom-get provider=ark')).query, null)
assert.equal((await commands[0].handler({ rawInput: 'custom-set provider=ark !!!' })).kind, 'error')
assert.equal((await commands[0].handler({ rawInput: 'custom-get' })).kind, 'error')
writeFileSync(storeFile, '{broken')
const damaged = await run('custom-get provider=ark')
assert.equal(damaged.query, null)
assert.match(damaged.storeError, /损坏/)
payload = await run('refresh')
assert.equal(payload.providers.find((p) => p.id === 'ark').balance.status, 'unsupported', 'a damaged store degrades to built-in behavior')
console.log('PASS built Host: store permissions, custom-get/set/delete/test, invalidation, override, disable, scoped refresh and damaged store')

// ─── Editor UI ────────────────────────────────────────────────────────────
let hooks = [], hookIndex = 0, instances = new Map(), visited, effects
globalThis.document = { documentElement: { lang: 'zh-CN' }, activeElement: null, addEventListener() {}, removeEventListener() {} }
const React = {
  Fragment: 'fragment',
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child != null && child !== false && child !== true) }),
  useState(initial) {
    const store = hooks, at = hookIndex++
    if (!store[at]) store[at] = { value: typeof initial === 'function' ? initial() : initial }
    return [store[at].value, (next) => { store[at].value = typeof next === 'function' ? next(store[at].value) : next }]
  },
  useRef(initial) { const at = hookIndex++; if (!hooks[at]) hooks[at] = { current: initial }; return hooks[at] },
  useEffect(fn, deps) {
    const store = hooks, at = hookIndex++, previous = store[at]
    if (!previous || !deps || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) effects.push(() => { previous?.cleanup?.(); store[at] = { deps, cleanup: fn() } })
  },
}
lib.initReact(React)
const renderNode = (node, path) => {
  if (node == null || typeof node !== 'object') return node
  if (typeof node.type === 'function') {
    const id = path + '@' + node.type.name
    visited.add(id)
    if (!instances.has(id)) instances.set(id, [])
    hooks = instances.get(id); hookIndex = 0
    return renderNode(node.type({ ...node.props, children: node.children }), id)
  }
  if (node.props.ref) node.props.ref.current = { focus() {} }
  return { ...node, children: node.children.map((child, at) => renderNode(child, path + '/' + (child?.props?.key ?? at))) }
}
const render = (tree) => { visited = new Set(); effects = []; const out = renderNode(tree, 'root'); effects.forEach((e) => e()); return out }
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve() }
const nodes = (tree) => (tree && typeof tree === 'object' ? [tree, ...tree.children.flatMap(nodes)] : [])
const text = (tree) => (typeof tree === 'string' || typeof tree === 'number' ? String(tree) : (tree?.children ?? []).map(text).join(' '))
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && text(node).trim() === label)
const field = (tree, label) => nodes(tree).find((node) => node.type === 'label' && text(node.children[0]).trim() === label)?.children.find((n) => n.type === 'input' || n.type === 'select')

const apiCalls = []
const api = {
  get: async (id) => { apiCalls.push(['get', id]); return { ok: true, query: null } },
  test: async (id, query) => { apiCalls.push(['test', id, query]); return { ok: true, test: { ok: true, status: 200, data: { code: 0, data: { money: '42.5', unit: 'USD' } }, balance: { status: 'failed' } } } },
  save: async (id, query) => { apiCalls.push(['save', id, query]); return { ok: true, query } },
  remove: async (id) => { apiCalls.push(['remove', id]); return { ok: true } },
}
let saved_ = 0
const t = (k, v) => lib.translate('zh', k, v)
const modal = () => render(React.createElement(lib.CustomQueryModal, { provider: { id: 'ark', displayName: '火山方舟', baseURL: 'https://ark.example.com', models: [], modelCount: 0, balance: { status: 'unsupported' } }, api, t, onClose() {}, onSaved() { saved_++ } }))
let tree = modal()
await flush()
tree = modal()
assert.deepEqual(apiCalls[0], ['get', 'ark'])
assert.equal(field(tree, '查询 URL').props.value, '{{baseURL}}/')
field(tree, '查询 URL').props.onChange({ target: { value: '{{baseURL}}/balance' } })
tree = modal()
// Save is blocked while the balance path is empty.
button(tree, '保存').props.onClick()
await flush()
tree = modal()
assert.equal(apiCalls.filter((c) => c[0] === 'save').length, 0)
assert.match(text(tree), /至少|缺少金额/)
// Remove the empty currency default wallet path issue: fill amount via the JSON tree.
const balanceInput = field(tree, '金额 *')
balanceInput.props.onChange({ target: { value: 'data.money' } })
tree = modal()
button(tree, '测试').props.onClick()
await flush()
tree = modal()
assert.equal(apiCalls.at(-1)[0], 'test')
assert.equal(apiCalls.at(-1)[2].request.url, '{{baseURL}}/balance')
assert.match(text(tree), /HTTP 200/)
assert.match(text(tree), /映射预览/)
assert.match(text(tree), /42\.50/, 'preview re-maps the test JSON with the current form')
// Click-to-fill: focus the currency field, then click the "unit" key in the tree.
field(tree, '货币单位').props.onFocus()
const unitKey = nodes(tree).find((node) => node.props.className === 'dmu-jsonKey' && text(node) === 'unit')
unitKey.props.onClick()
tree = modal()
assert.equal(field(tree, '货币单位').props.value, 'data.unit')
assert.match(text(tree), /\$42\.50/)
button(tree, '保存').props.onClick()
await flush()
tree = modal()
const savedQuery = apiCalls.at(-1)[2]
assert.equal(apiCalls.at(-1)[0], 'save')
assert.deepEqual(savedQuery.wallets[0], { balance: { path: 'data.money' }, currency: { path: 'data.unit' }, kind: 'topped-up' })
assert.equal(saved_, 1)
assert.match(text(tree), /已保存/)
assert.ok(button(tree, '删除配置'))
button(tree, '删除配置').props.onClick()
await flush()
tree = modal()
assert.equal(apiCalls.at(-1)[0], 'remove')
assert.equal(saved_, 2)
for (const lang of ['zh', 'en']) {
  for (const k of ['customOpen', 'customTitle', 'customPathHint', 'customBadge', 'customSave', 'customPreview']) assert.notEqual(lib.translate(lang, k), k)
}
console.log('PASS editor: load, validation, Host test, JSON tree click-to-fill, live preview, save, delete and copy')

// Built client bundle exposes the card button.
const clientSource = readFileSync(new URL('lib/client.js', root), 'utf8')
assert.doesNotMatch(clientSource, /^\s*(?:import|export)\s/m)
assert.match(clientSource, /custom-set provider=|custom-/)
console.log('PASS built client bundle contains the custom query editor and stays a plain script')
