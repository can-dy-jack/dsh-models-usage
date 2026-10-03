/**
 * Local render harness for the browser half (not part of the plugin).
 *
 * It loads client.js with a fake `window.__ModuleLoader__` and a minimal React
 * shim (useState/useEffect/useRef/createElement), captures the slot
 * registrations, then renders the `main` panel against a stubbed Remote so the
 * collapse-into-dialog behaviour can be asserted without a browser.
 *
 * Usage: node .scratch/client-harness.mjs
 */
import { readFileSync } from 'node:fs'

/* ── React shim ─────────────────────────────────────────────────────────── */

const instances = new Map()
let hooks = null
let hookIndex = 0
let occurrence = 0
const effects = []

const React = {
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false && c !== true) }
  },
  useState(initial) {
    const store = hooks
    const at = hookIndex++
    if (store[at] === undefined) store[at] = typeof initial === 'function' ? initial() : initial
    return [store[at], (next) => { store[at] = typeof next === 'function' ? next(store[at]) : next }]
  },
  useEffect(fn) {
    const store = hooks
    const at = hookIndex++
    if (store[at] === undefined) { store[at] = true; effects.push(fn) }
  },
  useRef(initial) {
    const store = hooks
    const at = hookIndex++
    if (store[at] === undefined) store[at] = { current: initial }
    return store[at]
  },
}

function render(node) {
  if (node === null || node === undefined || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(render)
  if (typeof node.type === 'function') {
    const key = node.type.name + '#' + String(occurrence++)
    if (!instances.has(key)) instances.set(key, [])
    hooks = instances.get(key)
    hookIndex = 0
    return render(node.type({ ...node.props, children: node.children }))
  }
  return { type: node.type, props: node.props ?? {}, children: (node.children ?? []).map(render) }
}

function pass(tree) {
  occurrence = 0
  effects.length = 0
  const rendered = render(tree)
  for (const fn of effects) fn()
  return rendered
}

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

/* ── document / window stubs ───────────────────────────────────────────── */

// the panel polls the UI language on an interval; keep it out of the event loop
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}

const head = { appendChild() {} }
globalThis.document = {
  documentElement: { lang: 'zh-CN' },
  head,
  activeElement: null,
  querySelector: () => null,
  createElement: () => ({ dataset: {}, style: {}, textContent: '' }),
  addEventListener() {},
  removeEventListener() {},
}
let captured = null
globalThis.window = { __ModuleLoader__: { load: (entry) => { captured = entry } } }

/* ── load the plugin ───────────────────────────────────────────────────── */

new Function(readFileSync(new URL('lib/client.js', new URL('../', import.meta.url)), 'utf8'))()
const plugin = captured.factory((id) => {
  if (id === 'react') return React
  throw new Error('unexpected require: ' + id)
})

/* ── Host payload ──────────────────────────────────────────────────────── */

const models = []
for (let i = 1; i <= 12; i++) {
  models.push({ id: 'model-' + String(i), name: 'Model ' + String(i), contextWindow: 128000, maxTokens: 8192, inputModalities: ['text'] })
}
// the overlap regression: a very long id + name beside a long capability list
models[0] = {
  id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash Vision Exp',
  contextWindow: 1000000, maxTokens: 8192, inputModalities: ['text', 'image'],
  reasoning: { efforts: [{ id: 'off' }, { id: 'minimal' }, { id: 'low' }, { id: 'medium' }, { id: 'high' }, { id: 'max' }] },
}
// a model whose display name equals its id: no second span
models[1] = { id: 'plain-id', name: 'plain-id', contextWindow: 262144, inputModalities: ['text'] }
// a model with nothing to describe: no metadata line at all
models[2] = { id: 'bare-model', name: 'bare-model' }
const payload = {
  ok: true, detail: true, fetchedAt: new Date().toISOString(),
  counts: { providers: 1, activeProviders: 1, models: models.length },
  providers: [{
    id: 'demo', displayName: '演示服务商', active: true, baseURL: 'https://example.test/v1', api: 'openai-completions',
    credential: { ref: 'DEMO_API_KEY', configured: true }, balance: { status: 'ready', wallets: [{ currency: 'CNY', balance: '10.00', kind: 'topped-up' }] },
    modelCount: models.length, models,
  }],
}

/* ── fake client ctx ───────────────────────────────────────────────────── */

const registrations = []
const ctx = {
  remote: { commands: { execute: async () => ({ ok: true, value: { commandId: 'c', result: { kind: 'success', text: JSON.stringify(payload) } } }) } },
  layout: { selectPanel() {} },
  slots: {
    inject(name, callback) { registrations.push({ slot: name, ...callback() }) },
    register(options, component) { return { options, component } },
  },
}

console.log('inject        :', JSON.stringify(plugin.inject))
plugin.apply(ctx)
console.log('slots         :', registrations.map((r) => r.slot + '/' + (r.options.id ?? r.options.key)).join(', '))

const sessions = { phase: 'ready', ids: ['s1'], byId: { s1: { id: 's1', retainedBy: { mainView: 1 } } } }
const main = registrations.find((r) => r.slot === 'main')
const props = { useSessions: (selector) => selector(sessions), sessionId: undefined, close() {} }

/* ── render, settle the async read, render again ──────────────────────── */

pass(React.createElement(main.component, props))
await flush()
let tree = pass(React.createElement(main.component, props))

const walk = (node, visit) => {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return }
  visit(node)
  ;(node.children ?? []).forEach((child) => walk(child, visit))
}

const countByClass = (root, className) => {
  let n = 0
  walk(root, (node) => { if (typeof node.props?.className === 'string' && node.props.className.split(' ').includes(className)) n++ })
  return n
}
const findByClass = (root, className) => {
  let found = null
  walk(root, (node) => { if (found === null && typeof node.props?.className === 'string' && node.props.className.split(' ').includes(className)) found = node })
  return found
}

const check = (label, actual, expected) => {
  const ok = actual === expected
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + '  → ' + String(actual) + (ok ? '' : ' (expected ' + String(expected) + ')'))
  return ok
}

let allOk = true
allOk = check('collapsed model rows', countByClass(tree, 'dmu-model'), 6) && allOk
const more = findByClass(tree, 'dmu-more')
allOk = check('"show all" control present', more !== null, true) && allOk
allOk = check('modal closed initially', findByClass(tree, 'dmu-modal'), null) && allOk
console.log('       button text:', JSON.stringify(more?.children?.join?.('') ?? more?.children ?? ''))

/* open the dialog the way a click does, then re-render */
more.props.onClick()
tree = pass(React.createElement(main.component, props))

const dialog = findByClass(tree, 'dmu-modal')
allOk = check('modal opened', dialog !== null, true) && allOk
allOk = check('modal role', dialog?.props?.role, 'dialog') && allOk
// the card keeps its collapsed preview behind the mask, so count inside the dialog body
allOk = check('modal rows = all models', countByClass(findByClass(tree, 'dmu-modalBody'), 'dmu-model'), 12) && allOk
allOk = check('mask layer present', findByClass(tree, 'dmu-mask') !== null, true) && allOk

/* structure: the two fields of a row are stacked boxes, so neither can overlap */
const body = findByClass(tree, 'dmu-modalBody')
const rows = []
walk(body, (node) => { if (typeof node.props?.className === 'string' && node.props.className.split(' ').includes('dmu-model')) rows.push(node) })
const structure = rows.map((row) => (row.children ?? []).map((child) => child.props.className).join('+'))
allOk = check('long row is head+meta', structure[0], 'dmu-modelHead+dmu-model-meta') && allOk
const longHead = rows[0].children[0]
allOk = check('long row head has id+name', (longHead.children ?? []).length, 2) && allOk
allOk = check('meta lives in its own line', rows[0].children[1].props.className, 'dmu-model-meta') && allOk
allOk = check('name-less row head has id only', (rows[1].children[0].children ?? []).length, 1) && allOk
allOk = check('bare model has no meta line', (rows[2].children ?? []).length, 1) && allOk
console.log('       row[0] lines  :', JSON.stringify(rows[0].children.map((c) => (c.children ?? []).map((t) => (typeof t === 'string' ? t : t?.children?.join?.('') ?? '')).join(' '))))
console.log('       dialog title  :', JSON.stringify(findByClass(tree, 'dmu-modalTitle')?.children?.[0] ?? ''))

/* a pointer-down inside the dialog must NOT close it */
let overlay = findByClass(tree, 'dmu-overlay')
overlay.props.onMouseDown({ target: dialog, currentTarget: overlay })
tree = pass(React.createElement(main.component, props))
allOk = check('click inside keeps it open', findByClass(tree, 'dmu-modal') !== null, true) && allOk

/* a backdrop pointer-down closes it */
overlay = findByClass(tree, 'dmu-overlay')
overlay.props.onMouseDown({ target: overlay, currentTarget: overlay })
tree = pass(React.createElement(main.component, props))
allOk = check('backdrop click closes', findByClass(tree, 'dmu-modal'), null) && allOk
allOk = check('back to collapsed rows', countByClass(tree, 'dmu-model'), 6) && allOk

/* the rail icon: geometry only, so a typo in an attribute shows up here */
const icon = registrations.find((r) => r.slot === 'sidebar.panellist').component
const iconTree = pass(React.createElement(icon, { size: 20 }))
allOk = check('icon is an svg at the asked size', iconTree.type + '/' + iconTree.props.width, 'svg/20') && allOk
allOk = check('icon parts (mask, card, coin)', (iconTree.children ?? []).length, 3) && allOk
const maskedCard = iconTree.children[1]
const coin = iconTree.children[2]
allOk = check('card has frame + 2 rows', (maskedCard.children ?? []).length, 3) && allOk
allOk = check('card is notched by a mask', typeof maskedCard.props.mask, 'string') && allOk
allOk = check('coin has rim + face', (coin.children ?? []).length, 2) && allOk

console.log(allOk ? '\nall client checks pass' : '\nFAILURES')
