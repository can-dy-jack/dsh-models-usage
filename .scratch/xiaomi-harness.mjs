/** Xiaomi model-key routes stay unsupported; never query the cookie-only console. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const result = await build({
  stdin: {
    contents: `export { initReact } from './src/client/react';
      export { translate } from './src/client/i18n';
      export { BalanceBlock } from './src/client/ui/balance';
      export { BUILTIN_PROVIDER_QUERY_SUPPORT, BUILTIN_PROVIDER_QUERY_SUPPORT_GROUPS } from './src/balance-support';`,
    resolveDir: root.pathname, loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
})
const { initReact, translate, BalanceBlock, BUILTIN_PROVIDER_QUERY_SUPPORT, BUILTIN_PROVIDER_QUERY_SUPPORT_GROUPS } =
  await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
const source = readFileSync(new URL('lib/index.js', root), 'utf8')
  .replace(/^import \{ defineTool \}.*$/m, 'const defineTool = (options) => options')
const { apply } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const builtin = ['xiaomi', 'xiaomi-token-plan-cn', 'xiaomi-token-plan-sgp', 'xiaomi-token-plan-ams']
const routes = [
  ...builtin.map((id) => ({ id, mode: id === 'xiaomi' ? 'api' : 'token-plan' })),
  { id: 'custom-openai', baseURL: 'https://api.xiaomimimo.com/v1', mode: 'api' },
  { id: 'custom-anthropic', baseURL: 'https://api.xiaomimimo.com/anthropic', mode: 'api' },
  ...['cn', 'sgp', 'ams'].flatMap((region) => ['/v1', '/anthropic', '/anthropic/v1'].map((path, index) => ({
    id: `custom-plan-${region}-${index}`, baseURL: `https://token-plan-${region}.xiaomimimo.com${path}`, mode: 'token-plan',
  }))),
  { id: 'xiaomi-lookalike', baseURL: 'https://api.xiaomimimo.com.example.org/v1' },
]
const commands = []
const asked = []
let credentialsConfigured = true
let secretReads = 0
let networkCalls = 0
const realFetch = globalThis.fetch
globalThis.fetch = async () => { networkCalls++; throw new Error('Unexpected balance request') }
const services = {
  llm: {
    listProviders: () => routes.map(({ id }) => ({ id })),
    listConfigurableProviders: () => routes.map(({ id }) => ({ provider: id, settingsNs: 'llm-pi-ai', settingsPath: ['providers', id] })),
    listModels: (id) => { asked.push(id); return [{ id: 'mimo-model' }] },
  },
  settings: { describe: () => [{ ns: 'llm-pi-ai', value: { providers: Object.fromEntries(routes.map(({ id, baseURL }) =>
    [id, { baseURL, ...(id === 'xiaomi' ? {} : { apiKeyEnv: 'MOCK_XIAOMI_KEY' }) }])) } }] },
  credentials: {
    describe: async () => ({ configured: credentialsConfigured }),
    describeRecord: async () => ({ configured: credentialsConfigured, kind: 'api-key' }),
    resolve: async () => { secretReads++; return 'mock-secret' },
    readRecord: async () => { secretReads++; return { kind: 'api-key', key: 'mock-secret' } },
  },
  subprocess: { resolveExecutable: () => '/mock/node', spawn: () => { networkCalls++; throw new Error('Unexpected subprocess') } },
}
initReact({ createElement: (type, props, ...children) => typeof type === 'function'
  ? type(props) : { type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child != null) } })
const walk = (node, visit) => { if (node && typeof node === 'object') { visit(node); (node.children ?? []).forEach((child) => walk(child, visit)) } }
try {
  apply({ get: (name) => services[name], commands: { register: (c) => commands.push(c) }, tools: { register() {} } }, { includeModelDetails: false })
  for (const configured of [true, false]) {
    credentialsConfigured = configured
    for (const route of routes) {
      asked.length = 0
      const response = await commands[0].handler({ rawInput: 'refresh provider=' + route.id })
      assert.equal(response.kind, 'success')
      const payload = JSON.parse(response.text)
      assert.deepEqual(payload.providers.map((p) => p.id), [route.id], 'refresh returns only its target')
      assert.deepEqual(asked, [route.id])
      const { balance } = payload.providers[0]
      assert.equal(balance.status, 'unsupported')
      assert.equal(balance.wallets, undefined)
      assert.equal(balance.quotas, undefined)
      assert.equal(balance.endpoint, undefined)
      assert.ok(!response.text.includes('mock-secret'))
      if (route.mode === undefined) { assert.equal(balance.messageKey, undefined); continue }
      const link = `https://platform.xiaomimimo.com/console/${route.mode === 'api' ? 'balance' : 'plan-manage'}`
      assert.equal(balance.link, link)
      assert.equal(balance.messageKey, route.mode === 'api' ? 'supportXiaomiApiDetails' : 'supportXiaomiPlanDetails')
      for (const lang of ['zh', 'en']) {
        const t = (key, values) => translate(lang, key, values)
        const tree = BalanceBlock({ balance, t })
        let foundStatus = false, foundLink = false
        walk(tree, (node) => {
          if (node.type === 'span' && node.props.title) {
            assert.equal(node.props.title, t(balance.messageKey))
            assert.equal(node.children[0], t('balanceUnsupported'))
            foundStatus = true
          }
          if (node.type === 'a') { assert.equal(node.props.href, link); foundLink = true }
          assert.notEqual(node.props.role, 'progressbar')
        })
        assert.ok(foundStatus && foundLink)
      }
    }
  }
  assert.equal(secretReads, 0, 'unsupported routes do not resolve model keys')
  assert.equal(networkCalls, 0, 'unsupported routes do not call inference or console APIs')
  assert.equal(BUILTIN_PROVIDER_QUERY_SUPPORT.length, 43)
  const group = BUILTIN_PROVIDER_QUERY_SUPPORT_GROUPS.find((g) => g.id === 'xiaomi')
  assert.deepEqual([...group.providers.map((p) => p.id)].sort(), [...builtin].sort())
  for (const support of group.providers) {
    assert.equal(support.status, 'no-public-api')
    assert.equal(support.credential, undefined)
    for (const lang of ['zh', 'en']) assert.notEqual(translate(lang, support.details), support.details)
  }
  console.log('PASS Xiaomi built-in/custom OpenAI/Anthropic routes, scoped refresh, zh/en unsupported status and console links; no secret reads or requests')
} finally {
  globalThis.fetch = realFetch
}
