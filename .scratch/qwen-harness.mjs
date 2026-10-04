/** Bailian's official usage CLI requires Console auth, separate from model keys. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const bundle = await build({
  stdin: { contents: `export { qwenBillingRoute, balanceTarget, consoleLink } from './src/host/links';
    export { initReact } from './src/client/react';
    export { translate } from './src/client/i18n';
    export { BalanceBlock } from './src/client/ui/balance';
    export { BUILTIN_PROVIDER_QUERY_SUPPORT, BUILTIN_PROVIDER_QUERY_SUPPORT_GROUPS } from './src/balance-support';`,
    resolveDir: root.pathname, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false,
})
const { qwenBillingRoute, balanceTarget, consoleLink, initReact, translate, BalanceBlock,
  BUILTIN_PROVIDER_QUERY_SUPPORT, BUILTIN_PROVIDER_QUERY_SUPPORT_GROUPS } =
  await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const builtin = ['qwen-token-plan', 'qwen-token-plan-cn', 'qwen-token-plan-individual']
const routes = builtin.map((id) => ({ id, mode: 'token-plan', region: id.endsWith('-cn') ? 'cn-beijing' : 'ap-southeast-1' }))
for (const [host, mode, region] of [
  ['token-plan.cn-beijing.maas.aliyuncs.com', 'token-plan', 'cn-beijing'],
  ['token-plan.ap-southeast-1.maas.aliyuncs.com', 'token-plan', 'ap-southeast-1'],
  ['coding.dashscope.aliyuncs.com', 'coding-plan', 'cn-beijing'],
  ['coding-intl.dashscope.aliyuncs.com', 'coding-plan', 'ap-southeast-1'],
  ['dashscope.aliyuncs.com', 'api', 'cn-beijing'],
  ['dashscope-intl.aliyuncs.com', 'api', 'ap-southeast-1'],
  ['dashscope-us.aliyuncs.com', 'api', 'us-east-1'],
  ['cn-hongkong.dashscope.aliyuncs.com', 'api', 'cn-hongkong'],
  ...['cn-beijing', 'ap-southeast-1', 'us-east-1', 'cn-hongkong', 'ap-northeast-1', 'eu-central-1']
    .map((region) => [`llm-workspace.${region}.maas.aliyuncs.com`, 'api', region]),
]) {
  for (const path of [mode === 'coding-plan' ? '/v1' : '/compatible-mode/v1', '/apps/anthropic', '/apps/anthropic/v1/']) {
    routes.push({ id: 'custom-' + routes.length, baseURL: `https://${host}${path}?ignored=1#ignored`, mode, region })
  }
}
for (const [id, baseURL, mode, region] of [
  ['qwen-token-plan-cn', 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic', 'token-plan', 'ap-southeast-1'],
  ['qwen-token-plan-individual', 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', 'token-plan', 'cn-beijing'],
  ['qwen-token-plan', 'https://coding.dashscope.aliyuncs.com/v1', 'coding-plan', 'cn-beijing'],
  ['qwen-token-plan-cn', 'https://dashscope-us.aliyuncs.com/api/v1', 'api', 'us-east-1'],
  ['qwen-token-plan', 'https://proxy.example/gateway/v1', 'token-plan', 'ap-southeast-1'],
]) {
  assert.deepEqual(qwenBillingRoute(id, baseURL), { mode, region })
  assert.equal(balanceTarget(id, baseURL).kind, 'unsupported')
}
for (const host of ['token-plan.cn-beijing.maas.aliyuncs.com.example.org', 'coding.dashscope.aliyuncs.com.example.org',
  'llm-workspace.cn-beijing.maas.aliyuncs.com.example.org', 'other.aliyuncs.com', 'token-plan.us-east-1.maas.aliyuncs.com']) {
  assert.equal(qwenBillingRoute('custom', `https://${host}/v1`), undefined)
}
assert.equal(qwenBillingRoute('custom', 'bad-url'), undefined)
console.log('PASS Qwen default/overridden regions, Token/Coding/PAYG OpenAI/Anthropic routes, explicit proxies and lookalike rejection')

const source = readFileSync(new URL('lib/index.js', root), 'utf8')
  .replace(/^import \{ defineTool \}.*$/m, 'const defineTool = (options) => options')
const { apply } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
let secretReads = 0, networkCalls = 0
const realFetch = globalThis.fetch
globalThis.fetch = async () => { networkCalls++; throw new Error('Unexpected balance request') }
initReact({ createElement: (type, props, ...children) => typeof type === 'function'
  ? type(props) : { type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child != null) } })
const walk = (node, visit) => { if (node && typeof node === 'object') { visit(node); (node.children ?? []).forEach((child) => walk(child, visit)) } }
try {
  for (const configured of [true, false]) {
    for (const record of [false, true]) {
      const commands = [], asked = []
      const services = {
        llm: {
          listProviders: () => routes.map(({ id }) => ({ id })),
          listConfigurableProviders: () => routes.map(({ id }) => ({ provider: id, settingsNs: 'llm-pi-ai', settingsPath: ['providers', id] })),
          listModels: (id) => { asked.push(id); return [{ id: 'qwen-model' }] },
        },
        settings: { describe: () => [{ ns: 'llm-pi-ai', value: { providers: Object.fromEntries(routes.map(({ id, baseURL }) =>
          [id, { baseURL, ...(record ? {} : { apiKeyEnv: 'MOCK_QWEN_KEY' }) }])) } }] },
        credentials: {
          describe: async () => ({ configured }), describeRecord: async () => ({ configured, kind: 'api-key' }),
          resolve: async () => { secretReads++; return 'mock-secret' },
          readRecord: async () => { secretReads++; return { kind: 'api-key', key: 'mock-secret' } },
        },
        subprocess: { resolveExecutable: () => '/mock/node', spawn: () => { networkCalls++; throw new Error('Unexpected subprocess') } },
      }
      apply({ get: (name) => services[name], commands: { register: (c) => commands.push(c) }, tools: { register() {} } }, { includeModelDetails: false })
      for (const { id, baseURL, mode, region } of routes) {
        asked.length = 0
        const response = await commands[0].handler({ rawInput: 'refresh provider=' + id })
        const payload = JSON.parse(response.text)
        assert.deepEqual(payload.providers.map((p) => p.id), [id])
        assert.deepEqual(asked, [id])
        const { balance } = payload.providers[0]
        assert.equal(balance.status, 'unsupported')
        for (const field of ['wallets', 'quotas', 'endpoint']) assert.equal(balance[field], undefined)
        assert.equal(balance.messageKey, mode === 'api' ? 'supportQwenApiDetails'
          : mode === 'coding-plan' ? 'supportQwenCodingDetails' : 'supportQwenUsageDetails')
        const domestic = region === 'cn-beijing'
        const link = `https://${domestic ? 'bailian.console.aliyun.com' : 'modelstudio.console.alibabacloud.com'}/${region}`
          + (mode === 'token-plan' ? `/subscription/${domestic ? 'overview' : 'token-plan'}`
            : mode === 'coding-plan' ? '/subscription/coding-plan' : '')
        assert.equal(balance.link, link)
        assert.equal(consoleLink(id, baseURL), link)
        assert.ok(!response.text.includes('mock-secret'))
        for (const lang of ['zh', 'en']) {
          const t = (key, values) => translate(lang, key, values)
          let foundStatus = false, foundLink = false
          walk(BalanceBlock({ balance, t }), (node) => {
            if (node.type === 'span' && node.props.title) {
              assert.equal(node.props.title, t(balance.messageKey))
              assert.equal(node.children[0], t('balanceUnsupported')); foundStatus = true
            }
            if (node.type === 'a') { assert.equal(node.props.href, link); foundLink = true }
            assert.notEqual(node.props.role, 'progressbar')
          })
          assert.ok(foundStatus && foundLink)
        }
      }
    }
  }
  assert.equal(secretReads, 0, 'unsupported routes do not read reference/record keys')
  assert.equal(networkCalls, 0, 'unsupported routes do not query inference, console or billing APIs')
  console.log('PASS built Host scoped refresh, configured/missing reference/record credentials, no secret reads or network requests, zh/en status and links')
} finally { globalThis.fetch = realFetch }
assert.equal(BUILTIN_PROVIDER_QUERY_SUPPORT.length, 43)
assert.equal(new Set(BUILTIN_PROVIDER_QUERY_SUPPORT.map((p) => p.id)).size, 43)
const group = BUILTIN_PROVIDER_QUERY_SUPPORT_GROUPS.find((g) => g.id === 'qwen')
assert.deepEqual(group.providers.map((p) => p.id), builtin)
for (const entry of group.providers) {
  assert.equal(entry.status, 'unsupported')
  assert.equal(entry.statusLabel, 'balanceUnsupported')
  assert.equal(entry.credential, undefined)
  for (const lang of ['zh', 'en']) {
    for (const field of ['name', 'details']) assert.notEqual(translate(lang, entry[field]), entry[field])
    assert.match(translate(lang, entry.details), lang === 'zh' ? /控制台认证/ : /console authentication/)
  }
}
console.log('PASS all three Qwen support entries are localized and explicitly unsupported; official Console authentication explained')
