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
 *   collect.ts     payload assembly + cache
 */

import { defineTool } from '@deepseek-ai/dsh-tools'

import { isRecord } from './shared'
import { createServiceLookup, type PluginContext } from './host/context'
import { createPayloadLoader } from './host/collect'
import { COMMAND_NAME, DEFAULTS, type PluginOptions } from './host/options'

export const name = 'dsh-models-usage'
export const inject = ['llm', 'settings', 'credentials', 'commands', 'tools', 'subprocess']

export function apply(ctx: PluginContext, config: unknown) {
  const options: PluginOptions = { ...DEFAULTS, ...(isRecord(config) ? config : {}) }
  const service = createServiceLookup(ctx)
  const payloadFor = createPayloadLoader({ service, options })

  // ─── Remote entry point (the Client reaches this through `remote.commands`) ──

  ctx.commands.register({
    name: COMMAND_NAME,
    description: '列出当前模型列表中的服务商与模型，并查询可获得的余额信息。',
    input: { hint: 'summary | detail | refresh' },
    recordInput: false,
    handler: async (invocation) => {
      const raw = String(invocation.rawInput ?? '').trim().toLowerCase()
      const detail = raw !== 'summary'
      try {
        const payload = await payloadFor(detail, undefined)
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
