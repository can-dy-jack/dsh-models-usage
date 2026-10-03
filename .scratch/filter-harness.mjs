/** Search/filter projections and real client-bundle interactions, without live APIs. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const bundled = await build({
  stdin: { contents: `export * from './src/client/filter';`, resolveDir: root.pathname, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false,
})
const { defaultFilters, filterModels, filterProviders, inputModalities, supportsReasoning, createFilterStore } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))

const models = Array.from({ length: 9 }, (_, index) => ({
  id: 'model-' + (index + 1), name: 'Model ' + (index + 1), inputModalities: ['text'],
}))
models[0] = { id: 'shared-model', name: '共享模型', inputModalities: ['text', 'image'], reasoning: { efforts: [{ id: 'off' }, { id: 'high' }] } }
models[7] = { id: 'model-8', name: 'Hidden Vision', inputModalities: ['text', 'image'], reasoning: { efforts: [{ id: 'auto' }] } }
models[8] = { id: 'model-9', name: 'Audio Nine', inputModalities: ['audio'] }
const provider = (id, displayName, active, models) => ({
  id, displayName, active, declared: true, credential: null, modelCount: models.length, models,
  balance: { status: 'ready', fetchedAt: new Date().toISOString(), wallets: [{ currency: 'CNY', balance: '12.00', kind: 'account' }] },
})
const providers = [
  provider('alpha', '演示服务商', true, models),
  provider('beta', 'Beta Route', false, [
    { id: 'shared-model', name: 'Shared Beta', inputModalities: ['image', 'custom-input'], reasoning: { efforts: [{ id: 'none' }] } },
    { id: 'bare-model', name: 'Bare Model' },
  ]),
  provider('account', 'Empty Account', true, []),
]
const payloadFor = (providers) => ({
  ok: true, detail: true, command: 'dsh-models-usage', fetchedAt: new Date().toISOString(), cacheRemainingMs: 60_000,
  counts: { providers: providers.length, activeProviders: providers.filter((p) => p.active).length, models: providers.reduce((n, p) => n + p.modelCount, 0) },
  providers,
})
const freeze = (value) => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
freeze(providers)
const original = JSON.stringify(providers)
const filtered = (patch) => filterProviders(providers, { ...defaultFilters(), ...patch })
assert.equal(filtered({}).length, 3, 'default view retains zero-model accounts')
assert.equal(filtered({ query: '  ALPHA  ' })[0].models.length, 9)
assert.equal(filtered({ query: '演示' })[0].models.length, 9)
assert.equal(filtered({ query: '  HIDDEN VISION ' })[0].models[0].id, 'model-8')
assert.equal(filtered({ query: 'SHARED-MODEL' }).length, 2, 'same model IDs under different providers both match')
assert.deepEqual(filtered({ query: 'account' }).map((p) => p.provider.id), ['account'])
assert.equal(filtered({ query: 'does-not-exist' }).length, 0)
assert.equal(filtered({ providerId: 'beta', activation: 'active' }).length, 0)
assert.equal(filtered({ activation: 'dormant' })[0].provider.id, 'beta')
assert.equal(filtered({ modality: 'image' }).reduce((n, p) => n + p.models.length, 0), 3)
assert.equal(filtered({ reasoningOnly: true }).reduce((n, p) => n + p.models.length, 0), 2)
assert.equal(filtered({ providerId: 'alpha', activation: 'active', query: 'vision', modality: 'image', reasoningOnly: true })[0].models.length, 1)
assert.equal(filtered({ providerId: 'account', modality: 'text' }).length, 0)
assert.equal(filtered({ query: 'bare', reasoningOnly: true }).length, 0)
assert.equal(supportsReasoning({ reasoning: { efforts: [{ id: '' }, { id: ' ' }, { id: 'OFF' }, { id: 'none' }] } }), false)
assert.equal(supportsReasoning({ reasoning: { efforts: [{ id: 'custom-effort' }] } }), true)
assert.equal(supportsReasoning({}), false)
assert.deepEqual(inputModalities(providers.flatMap((p) => p.models)), ['audio', 'custom-input', 'image', 'text'])
assert.equal(filterModels(models, { ...defaultFilters(), query: 'ALPHA' }).length, 0, 'modal search only matches model fields')
assert.equal(JSON.stringify(providers), original, 'source metadata, counts and account balance are immutable')

const store = createFilterStore()
let notifications = 0
const stop = store.subscribe(() => notifications++)
store.set({ ...defaultFilters(), query: 'alpha' })
store.set({ ...defaultFilters(), query: 'alpha' })
assert.equal(notifications, 1)
store.reset()
assert.deepEqual(store.snapshot(), defaultFilters())
assert.equal(notifications, 2)
stop()
store.set({ ...defaultFilters(), query: 'beta' })
assert.equal(notifications, 2)
assert.deepEqual(createFilterStore().snapshot(), defaultFilters(), 'new plugin instance starts with default conditions')
console.log('PASS pure projections, metadata gaps, combined filters, zero-model accounts, immutability and store lifecycle')

// A path/key-aware React shim: effects clean up on unmount, and state follows
// provider IDs rather than changing when filtering shifts the render order.
let hooks, hookIndex
let instances = new Map(), visited, effects
const listeners = new Map()
const styles = []
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}
globalThis.document = {
  documentElement: { lang: 'zh-CN' }, activeElement: null,
  head: { appendChild: (tag) => styles.push(tag) }, querySelector: () => null,
  createElement: () => ({ dataset: {}, style: {} }),
  addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn) },
  removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
}
const React = {
  Fragment: 'fragment',
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child != null && child !== false && child !== true) }),
  useState(initial) {
    const store = hooks, at = hookIndex++
    if (!store[at]) store[at] = { value: typeof initial === 'function' ? initial() : initial }
    return [store[at].value, (next) => { store[at].value = typeof next === 'function' ? next(store[at].value) : next }]
  },
  useRef(initial) {
    const at = hookIndex++
    if (!hooks[at]) hooks[at] = { current: initial }
    return hooks[at]
  },
  useEffect(fn, deps) {
    const store = hooks, at = hookIndex++, previous = store[at]
    if (!previous || !deps || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) {
      effects.push(() => { previous?.cleanup?.(); store[at] = { deps, cleanup: fn() } })
    }
  },
}
const renderNode = (node, path) => {
  if (node == null || typeof node !== 'object') return node
  if (typeof node.type === 'function') {
    const id = path + '@' + node.type.name
    visited.add(id)
    if (!instances.has(id)) instances.set(id, [])
    hooks = instances.get(id); hookIndex = 0
    return renderNode(node.type({ ...node.props, children: node.children }), id)
  }
  if (node.props.ref) node.props.ref.current = { focus() { document.activeElement = this } }
  return { ...node, children: node.children.map((child, at) => renderNode(child, path + '/' + (child?.props?.key ?? at))) }
}
const cleanup = (hooks) => hooks.forEach((hook) => hook?.cleanup?.())
const render = (tree) => {
  visited = new Set(); effects = []
  const result = renderNode(tree, 'root')
  for (const [id, hooks] of instances) if (!visited.has(id)) { cleanup(hooks); instances.delete(id) }
  effects.forEach((effect) => effect())
  return result
}
const unmount = () => { instances.forEach(cleanup); instances = new Map() }
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve() }
const nodes = (tree) => tree && typeof tree === 'object' ? [tree, ...tree.children.flatMap(nodes)] : []
const byClass = (tree, className) => nodes(tree).filter((node) => node.props.className?.split(' ').includes(className))
const text = (tree) => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : (tree?.children ?? []).map(text).join(' ')
const search = (tree) => nodes(tree).find((node) => node.type === 'input' && node.props.type === 'search')
const select = (tree, label) => byClass(tree, 'dmu-filterField').find((node) => text(node.children[0]) === label).children.find((node) => node.type === 'select')
const change = (node, value) => node.props.onChange({ currentTarget: { value } })
const reset = (tree) => byClass(tree, 'dmu-filterReset')[0].props.onClick()
const toggle = (tree) => byClass(tree, 'dmu-filterToggle')[0].props.onClick()
const expand = (tree) => { if (!byClass(tree, 'dmu-filterToggle')[0].props['aria-expanded']) toggle(tree) }
const rowIds = (tree) => byClass(tree, 'dmu-model-id').map(text)

const clientSource = readFileSync(new URL('lib/client.js', root), 'utf8')
assert.doesNotMatch(clientSource, /^\s*(?:import|export)\s/m, 'client bundle has no module declarations')
let captured
globalThis.window = { __ModuleLoader__: { load: (entry) => { captured = entry } } }
new Function(clientSource)()
const plugin = captured.factory((id) => { assert.equal(id, 'react'); return React })
let currentProviders = structuredClone(providers)
const calls = [], registrations = []
plugin.apply({
  remote: { commands: { execute: async (...args) => {
    calls.push(args)
    assert.equal(args.length, 3); assert.deepEqual(args[2], [])
    const scope = / provider=(.*)$/.exec(args[1])?.[1]
    const selected = scope ? currentProviders.filter((p) => p.id === decodeURIComponent(scope)) : currentProviders
    return { ok: true, value: { result: { kind: 'success', text: JSON.stringify(payloadFor(selected)) } } }
  } } },
  slots: {
    inject: (_name, fn) => fn(), register: (options, component) => { registrations.push({ options, component }) }, entries: () => [],
  },
})
const main = registrations.find((entry) => entry.options.name === 'main').component
let sessionId = 'session-1'
const panel = () => render(React.createElement(main, { sessionId }))
panel(); await flush()
let tree = panel()
assert.equal(calls.length, 1)
assert.equal(byClass(tree, 'dmu-card').length, 3)
assert.match(text(byClass(tree, 'dmu-filterSummary')[0]), /3 \/ 3.*11 \/ 11/)
assert.deepEqual(rowIds(tree), [], 'model details only render inside a dialog')
assert.deepEqual(byClass(tree, 'dmu-modelCount').map(text), ['9', '2', '0'])
assert.equal(byClass(tree, 'dmu-modelsTrigger')[2].props.disabled, true, 'zero-model accounts keep a disabled count')
byClass(tree, 'dmu-modelsTrigger')[1].props.onClick(); tree = panel()
assert.deepEqual(rowIds(byClass(tree, 'dmu-modal')[0]), ['shared-model', 'bare-model'], 'providers with fewer than six models can open their list')
byClass(tree, 'dmu-modalClose')[0].props.onClick(); tree = panel()
assert.equal(search(tree), undefined, 'main search controls are collapsed by default')
assert.equal(byClass(tree, 'dmu-filterToggle')[0].props['aria-expanded'], false)
expand(tree); tree = panel()

change(search(tree), '  HIDDEN VISION ')
tree = panel()
assert.deepEqual(rowIds(tree), [], 'search keeps model details out of the cards')
assert.match(text(byClass(tree, 'dmu-modelCount')[0]), /1 \/ 9/)
byClass(tree, 'dmu-modelsTrigger')[0].props.onClick(); tree = panel()
assert.deepEqual(rowIds(byClass(tree, 'dmu-modal')[0]), ['model-8'], 'a single search match can open its model dialog')
byClass(tree, 'dmu-modalClose')[0].props.onClick(); tree = panel()
assert.match(text(tree), /12\.00/, 'account balance remains unchanged by model filters')
assert.equal(calls.length, 1)
toggle(tree); tree = panel()
assert.equal(search(tree), undefined)
assert.match(text(byClass(tree, 'dmu-modelCount')[0]), /1 \/ 9/, 'collapsing does not clear the active query')
assert.equal(byClass(tree, 'dmu-filterActive').length, 1, 'collapsed active filters remain visible')
assert.match(text(byClass(tree, 'dmu-filterSummary')[0]), /1 \/ 3.*1 \/ 11/)
expand(tree); tree = panel()
assert.equal(search(tree).props.value, '  HIDDEN VISION ')
change(search(tree), 'alpha'); tree = panel()
assert.equal(rowIds(tree).length, 0)
assert.equal(text(byClass(tree, 'dmu-modelCount')[0]), '9')
assert.equal(select(tree, '服务商').children.length, 4, 'provider options use the complete catalog')
assert.ok(text(select(tree, '输入类型')).includes('custom-input'), 'extension modalities keep their IDs')

let restoredFocus = 0
const trigger = { focus() { restoredFocus++; document.activeElement = this } }
document.activeElement = trigger
byClass(tree, 'dmu-modelsTrigger')[0].props.onClick(); tree = panel()
let modal = byClass(tree, 'dmu-modal')[0]
assert.equal(modal.props.role, 'dialog')
assert.equal(rowIds(modal).length, 9)
assert.equal(search(modal), undefined, 'modal search controls are collapsed by default')
expand(modal); tree = panel(); modal = byClass(tree, 'dmu-modal')[0]
assert.equal(select(modal, '输入类型').props.value, '')
assert.equal(nodes(modal).filter((node) => node.type === 'select').length, 1, 'provider/status filters are only on the main panel')
change(search(modal), 'model-8'); tree = panel(); modal = byClass(tree, 'dmu-modal')[0]
assert.deepEqual(rowIds(modal), ['model-8'])
assert.match(text(byClass(modal, 'dmu-filterSummary')[0]), /1 \/ 9/)
toggle(modal); tree = panel(); modal = byClass(tree, 'dmu-modal')[0]
assert.equal(search(modal), undefined)
assert.deepEqual(rowIds(modal), ['model-8'], 'modal conditions remain active when collapsed')
expand(modal); tree = panel(); modal = byClass(tree, 'dmu-modal')[0]
assert.equal(search(modal).props.value, 'model-8')
reset(modal); tree = panel(); modal = byClass(tree, 'dmu-modal')[0]
assert.equal(rowIds(modal).length, 9)
assert.equal(search(tree).props.value, 'alpha', 'modal reset leaves the global query intact')
for (const listener of listeners.get('keydown')) listener({ key: 'Escape', stopPropagation() {} })
tree = panel()
assert.equal(byClass(tree, 'dmu-modal').length, 0)
assert.equal(restoredFocus, 1)
assert.equal(document.activeElement, trigger)

change(select(tree, '输入类型'), 'text'); tree = panel()
byClass(tree, 'dmu-modelsTrigger')[0].props.onClick(); tree = panel(); modal = byClass(tree, 'dmu-modal')[0]
assert.equal(search(modal), undefined, 'reopened modal starts collapsed')
expand(modal); tree = panel(); modal = byClass(tree, 'dmu-modal')[0]
assert.equal(search(modal).props.value, '', 'modal conditions reset after closing')
assert.equal(rowIds(modal).length, 8)
change(select(modal, '输入类型'), 'audio'); tree = panel(); modal = byClass(tree, 'dmu-modal')[0]
assert.equal(rowIds(modal).length, 0, 'modal filters intersect with the parent projection')
assert.equal(byClass(modal, 'dmu-noResults').length, 1)
reset(modal); tree = panel(); modal = byClass(tree, 'dmu-modal')[0]
assert.equal(rowIds(modal).length, 8)
let overlay = byClass(tree, 'dmu-overlay')[0]
overlay.props.onMouseDown({ target: modal, currentTarget: overlay }); tree = panel()
assert.equal(byClass(tree, 'dmu-modal').length, 1, 'clicking inside keeps the modal open')
overlay = byClass(tree, 'dmu-overlay')[0]
overlay.props.onMouseDown({ target: overlay, currentTarget: overlay }); panel()

unmount(); sessionId = 'session-2'; tree = panel(); await flush(); tree = panel()
assert.equal(search(tree), undefined, 'reopened panel starts collapsed while conditions are retained')
assert.equal(byClass(tree, 'dmu-filterActive').length, 1)
expand(tree); tree = panel()
assert.equal(search(tree).props.value, 'alpha')
assert.equal(select(tree, '输入类型').props.value, 'text')
assert.equal(calls.length, 1, 'search, local filters, remounts and fresh session changes make no extra requests')
sessionId = undefined; tree = panel(); await flush()
assert.match(text(tree), /未找到活动会话/)
assert.equal(calls.length, 1)
sessionId = 'session-2'; tree = panel(); await flush(); tree = panel()
expand(tree); tree = panel()
assert.equal(search(tree).props.value, 'alpha')

byClass(tree, 'dmu-modelsTrigger')[0].props.onClick(); tree = panel(); modal = byClass(tree, 'dmu-modal')[0]
expand(modal); tree = panel(); modal = byClass(tree, 'dmu-modal')[0]
change(search(modal), 'model-8'); tree = panel()
currentProviders[0].models[7].inputModalities = ['audio']
byClass(tree, 'dmu-providerRefresh')[0].props.onClick(); await flush(); tree = panel(); modal = byClass(tree, 'dmu-modal')[0]
assert.equal(calls.length, 2)
assert.match(calls.at(-1)[1], /refresh provider=alpha$/)
assert.equal(search(tree).props.value, 'alpha')
assert.equal(search(modal).props.value, 'model-8')
assert.equal(rowIds(modal).length, 0, 'scoped refresh reapplies both levels of filters')
assert.match(text(byClass(modal, 'dmu-filterSummary')[0]), /0 \/ 7/)
byClass(modal, 'dmu-modalClose')[0].props.onClick(); tree = panel()

change(select(tree, '服务商'), 'alpha'); tree = panel()
currentProviders = currentProviders.slice(1)
byClass(tree, 'dmu-actions')[0].children.find((node) => text(node) === '刷新').props.onClick()
panel(); await flush(); tree = panel()
assert.equal(calls.length, 3)
assert.equal(byClass(tree, 'dmu-card').length, 0)
assert.equal(byClass(tree, 'dmu-noResults').length, 1)
assert.equal(select(tree, '服务商').props.value, 'alpha')
assert.match(text(select(tree, '服务商')), /alpha（当前目录中不存在）/)
assert.equal(select(tree, '输入类型').props.value, 'text')
assert.match(text(select(tree, '输入类型')), /文本（当前目录中不存在）/)
reset(tree); tree = panel()
assert.equal(byClass(tree, 'dmu-card').length, 2)
change(search(tree), 'nothing-matches'); tree = panel()
assert.equal(byClass(tree, 'dmu-noResults').length, 1)
reset(byClass(tree, 'dmu-noResults')[0]); tree = panel()
assert.equal(byClass(tree, 'dmu-card').length, 2)
currentProviders = []
byClass(tree, 'dmu-actions')[0].children.find((node) => text(node) === '刷新').props.onClick()
panel(); await flush(); tree = panel()
assert.equal(byClass(tree, 'dmu-noResults').length, 0)
assert.match(text(tree), /未发现任何服务商/)
assert.equal(calls.length, 4)

// Remount in English to exercise the same labels and option translations.
unmount(); document.documentElement.lang = 'en'; tree = panel(); await flush(); tree = panel()
assert.equal(byClass(tree, 'dmu-filterToggle')[0].props.title, 'Expand search and filters')
expand(tree); tree = panel()
assert.equal(search(tree).props.placeholder, 'Search provider or model names and IDs')
assert.equal(select(tree, 'Provider').props.value, '')
assert.equal(select(tree, 'Input type').props.value, '')
assert.match(text(tree), /Showing 0 \/ 0 providers/)
assert.ok(styles[0].textContent.includes('@container dmu-page (max-width:760px)'))
unmount()
console.log('PASS real bundle counts/dialog-only models, modal intersections/reset/focus, refreshes, retained conditions, disappearing options, localization and request counts')
console.log('All filter checks pass')

// Optional static snapshots from the actual components/CSS for browser layout
// inspection. Uses only the synthetic payload above, never live account data.
if (process.argv[2] === '--preview') {
  currentProviders = structuredClone(providers)
  tree = panel()
  byClass(tree, 'dmu-actions')[0].children.find((node) => text(node) === 'Refresh').props.onClick()
  panel(); await flush(); unmount()
  const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
  const html = (node, selected) => {
    if (node == null) return ''
    if (typeof node !== 'object') return escape(node)
    if (node.type === 'fragment') return node.children.map((child) => html(child, selected)).join('')
    const attrs = Object.entries(node.props).flatMap(([key, value]) => {
      if (key === 'key' || key === 'ref' || key === 'children' || key === 'style' || key.startsWith('on') || value == null || value === false) return []
      if (node.type === 'select' && key === 'value') return []
      const name = key === 'className' ? 'class' : key === 'tabIndex' ? 'tabindex' : key
      return [value === true ? name : name + '="' + escape(value) + '"']
    })
    if (node.type === 'option' && node.props.value === selected) attrs.push('selected')
    const open = '<' + node.type + (attrs.length ? ' ' + attrs.join(' ') : '') + '>'
    if (node.type === 'input') return open
    return open + node.children.map((child) => html(child, node.type === 'select' ? node.props.value : selected)).join('') + '</' + node.type + '>'
  }
  const previews = []
  for (const lang of ['zh-CN', 'en']) {
    document.documentElement.lang = lang
    tree = panel(); await flush(); tree = panel()
    previews.push('<section><h2>' + lang + ' · 360px panel</h2><div class="preview">' + html(tree) + '</div></section>')
    byClass(tree, 'dmu-modelsTrigger')[0].props.onClick(); tree = panel()
    previews.push('<section><h2>' + lang + ' · 360px dialog</h2><div class="preview">' + html(byClass(tree, 'dmu-modal')[0]) + '</div></section>')
    unmount()
  }
  const path = '/private/tmp/dmu-filter-preview.html'
  writeFileSync(path, '<!doctype html><html><head><meta charset="utf-8"><title>Model filter layout checks</title><style>'
    + ':root{--dsw-alias-label-primary:#e4e4e7;--dsw-alias-label-secondary:#b7b7bd;--dsw-alias-label-tertiary:#85858e;--dsw-alias-border-l1:#404049;--dsw-alias-border-l2:#404049;--dsw-alias-border-l3:#505059;--dsw-alias-bg-layer-1:#242429;--dsw-alias-bg-layer-2:#292930;--dsw-alias-state-business-primary:#86abff;--dsw-alias-state-success-primary:#43c882;--dsw-radius-panel:16px}'
    + styles[0].textContent
    + 'body{margin:20px;background:#131316;color:#e4e4e7;font:13px system-ui}main{display:grid;grid-template-columns:repeat(2,360px);gap:24px}section>h2{font-size:14px}.preview{width:360px;height:640px;border:1px solid #505059;border-radius:16px;overflow:hidden}.preview>.dmu-modal{height:100%}.preview .dmu-modalBody{flex:1}.preview .dmu-modal{font-size:13px;line-height:1.5}</style></head><body><main>'
    + previews.join('') + '</main></body></html>')
  console.log('Layout preview: ' + path)
}
