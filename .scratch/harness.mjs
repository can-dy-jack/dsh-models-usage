/**
 * Scratch harness: loads the Host half with mocked Cordis services and prints
 * the payload the Client would receive. Not part of the plugin package.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const root = new URL('../', import.meta.url)
const source = readFileSync(new URL('lib/index.js', root), 'utf8')
  .replace(/^import \{ defineTool \}.*$/m, 'const defineTool = (options) => options')
const generated = new URL('.scratch/host-under-test.mjs', root)
writeFileSync(generated, source)

const registered = { commands: [], tools: [] }
const asked = []

const catalogs = {
  'deepseek-official': [
    { provider: 'deepseek-official', id: 'deepseek-v4-flash', name: 'deepseek-v4-flash' },
    { provider: 'deepseek-official', id: 'deepseek-v4-pro', name: 'deepseek-v4-pro' },
  ],
  'deepseek-account': [
    { provider: 'deepseek-account', id: 'deepseek-v4-flash', name: 'deepseek-v4-flash' },
  ],
  ark: [
    { provider: 'ark', id: 'doubao-seed-2.1-lite', name: 'doubao-seed-2.1-lite' },
    { provider: 'ark', id: 'deepseek-v4.1-flash', name: 'deepseek-v4.1-flash' },
    { provider: 'ark', id: 'kimi-k3', name: 'kimi-k3' },
    { provider: 'ark', id: 'glm-5.3', name: 'glm-5.3' },
  ],
  openrouter: [
    { provider: 'openrouter', id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5' },
  ],
}

const details = {
  'deepseek-v4-flash': { context: { contextWindow: 131072 }, defaultMaxTokens: 8192, inputModalities: ['text'], reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }], defaultEffort: 'high' } },
  'deepseek-v4-pro': { context: { contextWindow: 131072 }, defaultMaxTokens: 16384, inputModalities: ['text', 'image'] },
  'doubao-seed-2.1-lite': { context: { contextWindow: 262144 }, defaultMaxTokens: 4096, inputModalities: ['text'] },
  'deepseek-v4.1-flash': { context: { contextWindow: 131072 }, defaultMaxTokens: 8192, inputModalities: ['text'] },
  'kimi-k3': { context: { contextWindow: 262144 }, defaultMaxTokens: 8192, inputModalities: ['text'] },
  'glm-5.3': { context: { contextWindow: 204800 }, defaultMaxTokens: 8192, inputModalities: ['text', 'image'] },
  'anthropic/claude-sonnet-4.5': { context: { contextWindow: 200000 }, defaultMaxTokens: 8192, inputModalities: ['text', 'image'] },
}

const DEEPSEEK_BODY = JSON.stringify({
  is_available: true,
  balance_infos: [{ currency: 'CNY', total_balance: '88.66', granted_balance: '0.00', topped_up_balance: '88.66' }],
})

const services = {
  llm: {
    listProviders: () => [
      { id: 'deepseek-account', name: 'DeepSeek 账号' },
      { id: 'deepseek-official', name: 'DeepSeek' },
      { id: 'ark', name: '火山方舟' },
      { id: 'openrouter', name: 'OpenRouter' },
    ],
    listConfigurableProviders: () => [
      { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] },
      { provider: 'deepseek-account', displayName: 'DeepSeek 账号', settingsNs: 'llm-deepseek-account', settingsPath: [] },
      { provider: 'ark', displayName: '火山方舟', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'ark'] },
      { provider: 'openrouter', displayName: 'OpenRouter', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openrouter'] },
      // declared but dormant: no adapter registered -> listModels would throw NO_ADAPTER
      { provider: 'amazon-bedrock', displayName: 'Amazon Bedrock', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'amazon-bedrock'] },
    ],
    listModels: async (provider) => {
      asked.push(provider)
      if (catalogs[provider] === undefined) throw new Error('no adapter registered for provider "' + provider + '"')
      return catalogs[provider]
    },
    resolveModelInfo: async (provider, model) => {
      const detail = details[model]
      if (detail === undefined) throw new Error('unknown model ' + model)
      return { provider, id: model, name: model, ...detail }
    },
  },
  settings: {
    describe: () => [
      {
        ns: 'llm-deepseek',
        value: {
          apiKeyEnv: 'DEEPSEEK_API_KEY',
          baseURL: 'https://api.deepseek.com/anthropic',
          models: [{ id: 'deepseek-v4-flash' }],
        },
      },
      { ns: 'llm-deepseek-account', value: { baseURL: 'https://api.deepseek.com/anthropic' } },
      {
        ns: 'llm-pi-ai',
        value: {
          providers: {
            ark: {
              displayName: '火山方舟',
              apiKeyEnv: 'ARK_API_KEY',
              api: 'openai-completions',
              baseURL: 'https://ark.cn-beijing.volces.com/api/coding/v3',
              models: [{ id: 'doubao-seed-2.1-lite' }, { id: 'deepseek-v4.1-flash' }, { id: 'kimi-k3' }, { id: 'glm-5.3' }],
            },
            openrouter: {
              displayName: 'OpenRouter',
              api: 'openai-completions',
              baseURL: 'https://openrouter.ai/api/v1',
              models: [{ id: 'anthropic/claude-sonnet-4.5' }],
            },
          },
        },
      },
    ],
  },
  credentials: {
    describe: async (ref) => ({ configured: ref === 'DEEPSEEK_API_KEY', source: 'store', writable: true }),
    resolve: async (ref) => (ref === 'DEEPSEEK_API_KEY' ? 'sk-test-key' : undefined),
    describeRecord: async (key) => (key === 'llm-pi-ai/openrouter' ? { configured: true, kind: 'api-key', writable: true } : { configured: false, writable: true }),
    readRecord: async (key) => (key === 'llm-pi-ai/openrouter' ? { kind: 'api-key', key: 'or-test-key' } : undefined),
  },
  deepseekAccount: {
    getBalance: async (client) => {
      if (typeof client.version !== 'string' || client.version.length === 0) throw new Error('bad client metadata')
      return {
        status: 'ready',
        value: [{ currency: 'CNY', balance: '12.34' }],
        bonusWallets: [{ currency: 'CNY', balance: '5.00' }],
      }
    },
  },
  subprocess: {
    resolveExecutable: async (name) => '/usr/bin/' + name,
    spawn: (spec) => {
      const request = JSON.parse(spec.stdio.stdin.data)
      const body = request.url.endsWith('/user/balance')
        ? DEEPSEEK_BODY
        : request.url.endsWith('/api/v1/credits')
          ? JSON.stringify({ data: { total_credits: 20, total_usage: 7.5 } })
          : JSON.stringify({ error: 'unexpected url ' + request.url })
      const text = JSON.stringify({ status: 200, body })
      return {
        done: Promise.resolve({ exitCode: 0 }),
        collected: { stdout: { readFrom: () => ({ text }) }, stderr: { readFrom: () => ({ text: '' }) } },
      }
    },
  },
}

const ctx = {
  get: (name) => services[name],
  commands: { register: (definition) => registered.commands.push(definition) },
  tools: { register: (definition) => registered.tools.push(definition) },
}

const host = await import(pathToFileURL(generated.pathname).href)
console.log('exports:', host.name, JSON.stringify(host.inject))
host.apply(ctx, {})

console.log('commands:', registered.commands.map((entry) => entry.name))
console.log('tools:', registered.tools.map((entry) => entry.name))

const invocation = { rawInput: 'detail', agent: { session: { id: 'session-test' } } }
const result = await registered.commands[0].handler(invocation)
console.log('command kind:', result.kind)
const payload = JSON.parse(result.text)
for (const provider of payload.providers) {
  console.log('---', provider.id, '|', provider.displayName, '| active=' + provider.active, '| models=' + provider.modelCount)
  console.log('    credential:', JSON.stringify(provider.credential))
  console.log('    balance   :', JSON.stringify(provider.balance))
  console.log('    firstModel:', JSON.stringify(provider.models[0]))
}
console.log('counts:', JSON.stringify(payload.counts))
console.log('provider ids      :', payload.providers.map((p) => p.id).join(', '))
console.log('listModels asked  :', asked.join(', '))
console.log('dormant filtered  :', !payload.providers.some((p) => p.id === 'amazon-bedrock') && !asked.includes('amazon-bedrock'))
console.log('no adapter errors :', !payload.providers.some((p) => typeof p.configError === 'string' && p.configError.includes('no adapter')))

const summary = JSON.parse((await registered.commands[0].handler({ rawInput: 'summary', agent: { session: { id: 's' } } })).text)
console.log('summary models array empty:', summary.providers.every((provider) => provider.models.length === 0))

const toolResult = await registered.tools[0].execute({}, { signal: undefined })
console.log('tool ok:', toolResult.ok, 'providers:', toolResult.providers.length)
