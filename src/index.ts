/**
 * dsh-models-usage — Host half (entry).
 *
 * Purpose: read the *current model list* (every provider route the running Host
 * knows about, plus every model each route advertises) and attach whatever
 * balance information can actually be obtained for that provider.
 *
 * Data sources, all host-side services:
 *   - `ctx.llm.listProviders()`              → registered routes        `{id, name}`
 *   - `ctx.llm.listConfigurableProviders()`  → provider directory       `{provider, displayName, settingsNs, settingsPath, declared?, error?}`
 *   - `ctx.llm.listModels(id)`               → advertised catalog       `{provider, id, name, description?, inputModalities?}`
 *   - `ctx.llm.resolveModelInfo(id, model)`  → exact model metadata     `{contextWindow, maxTokens, reasoning.efforts, …}`
 *   - `ctx.settings.describe()`              → live config values       `llm-pi-ai` / `llm-deepseek` / … (baseURL, api, apiKeyEnv, models)
 *   - `ctx.credentials.describe(ref)`        → configured? (never a value)
 *   - `ctx.get('deepseekAccount').getBalance(client)` → DeepSeek account wallets
 *
 * The Web GUI pulls the JSON payload through the built-in `commands` Remote
 * namespace, so this bundle needs no generated Typert artifacts:
 *   client ctx.remote.commands.execute(sessionId, '/dsh-models-usage detail')
 *
 * Layout: `host/` is split by responsibility —
 *   context.ts     service surfaces + ServiceLookup
 *   options.ts     constants + cordis config contract
 *   links.ts       console links / balance endpoints / provider order
 *   net.ts         bounded-subprocess JSON transport (+ fetch fallback)
 *   settings.ts    live settings rows + config path walking
 *   models.ts      provider enumeration + model catalogs
 *   credentials.ts credential probes and secret resolution
 *   balance.ts     account/provider balance queries
 *   custom.ts      user-defined query execution (+ custom-store.ts persistence)
 *   collect.ts     payload assembly + cache
 */

import { defineTool } from '@deepseek-ai/dsh-tools'

import { isRecord } from './shared'
import { createServiceLookup, type PluginContext } from './host/context'
import { createPayloadLoader, runCustomTest } from './host/collect'
import { customStorePath, readCustomQuery, writeCustomQuery } from './host/custom-store'
import { decodeCommandJson, validateCustomQuery } from './custom-query'
import { COMMAND_NAME, DEFAULTS, type PluginOptions } from './host/options'

export const name = 'dsh-models-usage'
export const inject = ['llm', 'settings', 'credentials', 'commands', 'tools', 'subprocess']

export function apply(ctx: PluginContext, config: unknown) {
  const options: PluginOptions = { ...DEFAULTS, ...(isRecord(config) ? config : {}) }
  const service = createServiceLookup(ctx)
  const env = { service, options }
  const payloadFor = createPayloadLoader(env)

  /** Custom query editor actions; payloads are base64url JSON (lines split on spaces). */
  async function handleCustomCommand(args: string[]): Promise<Record<string, unknown>> {
    const action = args[0].toLowerCase()
    const providerArg = args.find((arg) => arg.startsWith('provider='))
    const encoded = args.slice(1).filter((arg) => !arg.startsWith('provider='))
    if (providerArg === undefined || encoded.length > 1) throw new Error(`用法: ${action} provider=<id> [<base64url>]`)
    const providerId = decodeURIComponent(providerArg.slice('provider='.length))
    const base = { ok: true, command: COMMAND_NAME, action, providerId }
    if (action === 'custom-get') {
      const { query, error } = readCustomQuery(options, providerId)
      return { ...base, query: query ?? null, storePath: customStorePath(options), ...(error !== undefined ? { storeError: error } : {}) }
    }
    if (action === 'custom-delete') {
      writeCustomQuery(options, providerId, undefined)
      payloadFor.invalidate()
      return base
    }
    if (action !== 'custom-set' && action !== 'custom-test') throw new Error(`未知子命令: ${action}`)
    if (encoded.length !== 1) throw new Error(`${action} 需要配置载荷`)
    let raw: unknown
    try {
      raw = decodeCommandJson(encoded[0])
    } catch (error) {
      throw new Error(`配置载荷无法解析: ${error instanceof Error ? error.message : String(error)}`)
    }
    const validated = validateCustomQuery(raw)
    if (!validated.ok) return { ...base, ok: false, errors: validated.errors }
    if (action === 'custom-test') {
      return { ...base, test: await runCustomTest(env, providerId, validated.query, undefined) }
    }
    writeCustomQuery(options, providerId, validated.query)
    payloadFor.invalidate()
    return { ...base, query: validated.query }
  }

  // ─── Remote entry point (the Client reaches this through `remote.commands`) ──

  ctx.commands.register({
    name: COMMAND_NAME,
    description: '列出当前模型列表中的服务商与模型，并查询可获得的余额信息。',
    input: { hint: 'summary | detail | refresh [provider=<id>] | custom-get|custom-set|custom-delete|custom-test provider=<id> [<base64url>]' },
    recordInput: false,
    handler: async (invocation) => {
      try {
        const args = String(invocation.rawInput ?? '').trim().split(/\s+/).filter(Boolean)
        if (args[0]?.toLowerCase().startsWith('custom-')) {
          return { kind: 'success', text: JSON.stringify(await handleCustomCommand(args)) }
        }
        const modes = args.map((arg) => arg.toLowerCase())
        const providerArgs = args.filter((arg) => arg.startsWith('provider='))
        if (providerArgs.length > 1 || args.some((arg) => !['summary', 'detail', 'refresh'].includes(arg.toLowerCase()) && !arg.startsWith('provider='))) {
          throw new Error('用法: summary | detail | refresh [provider=<id>]')
        }
        const providerId = providerArgs.length === 0 ? undefined : decodeURIComponent(providerArgs[0].slice('provider='.length))
        const payload = await payloadFor(!modes.includes('summary'), undefined, modes.includes('refresh'), providerId)
        return { kind: 'success', text: JSON.stringify(payload) }
      } catch (error) {
        return { kind: 'error', text: `采集模型清单失败: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  })

  // ─── Model-facing tool ───────────────────────────────────────────────────

  ctx.tools.register(defineTool({
    name: 'models_balance',
    description: '列出当前 Harness 模型列表中的全部服务商与模型，并给出每个服务商可查询到的余额信息'
      + '（DeepSeek 开放平台 / DeepSeek 账号由官方接口返回；未提供余额接口的服务商会被明确标注）。'
      + '无参数。',
    parameters: {},
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(_args, exec) {
      const payload = await payloadFor(true, exec?.signal)
      return payload
    },
  }))
}
