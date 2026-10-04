/** Account query integrations, shared by Host target types and the support catalog. */
export const SUPPORTED_BALANCE_QUERIES = [
  { id: 'deepseek', providers: ['deepseek-official', 'deepseek'], name: 'supportDeepseekApi', statusLabel: 'supportBalanceReady', details: 'supportDeepseekApiDetails', credential: 'supportApiKey' },
  { id: 'account', providers: ['deepseek-account'], name: 'supportDeepseekAccount', statusLabel: 'supportBalanceReady', details: 'supportDeepseekAccountDetails', credential: 'supportAccountLogin' },
  { id: 'openrouter', providers: ['openrouter'], name: 'supportOpenrouter', statusLabel: 'supportBalanceReady', details: 'supportOpenrouterDetails', credential: 'supportApiKey' },
  { id: 'kimi-coding', providers: ['kimi-coding'], name: 'supportKimiCode', statusLabel: 'supportBalanceUsageReady', details: 'supportKimiCodeDetails', credential: 'supportApiKey' },
  { id: 'moonshot', providers: ['moonshotai'], name: 'supportMoonshot', statusLabel: 'supportBalanceReady', details: 'supportMoonshotBalanceDetails', credential: 'supportApiKey', documentation: 'https://platform.moonshot.ai/docs/api/balance' },
  { id: 'moonshot-cn', providers: ['moonshotai-cn'], name: 'supportMoonshotCn', statusLabel: 'supportBalanceReady', details: 'supportMoonshotCnBalanceDetails', credential: 'supportApiKey', documentation: 'https://platform.moonshot.cn/docs/api/balance' },
  { id: 'opencode-go', providers: ['opencode-go'], name: 'supportOpenCodeGo', statusLabel: 'supportUsageReady', details: 'supportOpenCodeGoDetails', credential: 'supportGoApiKey' },
] as const

export type SupportedBalanceQueryKind = typeof SUPPORTED_BALANCE_QUERIES[number]['id']

export type ProviderQuerySupportStatus = 'supported' | 'not-integrated' | 'no-public-api'

export type ProviderQuerySupport = {
  id: string
  name: string
  translatedName?: boolean
  status: ProviderQuerySupportStatus
  statusLabel: string
  details: string
  credential?: string
  documentation?: string
}

function pending(id: string, name: string, details: string, documentation: string): ProviderQuerySupport {
  return { id, name, status: 'not-integrated', statusLabel: 'supportNotIntegrated', details, documentation }
}

function noPublicApi(id: string, name: string, documentation: string, details = 'supportNoPublicApiDetails'): ProviderQuerySupport {
  return { id, name, status: 'no-public-api', statusLabel: 'supportNoPublicApi', details, documentation }
}

/**
 * Harness 0.2.0-rc.2: 41 llm-pi-ai builtinProviders() routes plus its two native
 * DeepSeek routes. Reviewed against public provider documentation on 2026-10-04.
 * "No public API" excludes private console endpoints and per-request token counts.
 * Keep regional/subscription routes separate, even when they share a vendor.
 */
export const BUILTIN_PROVIDER_QUERY_SUPPORT: readonly ProviderQuerySupport[] = [
  ...SUPPORTED_BALANCE_QUERIES.flatMap((query): ProviderQuerySupport[] => query.providers.map((id) => ({
    id, name: query.name, translatedName: true, status: 'supported', statusLabel: query.statusLabel,
    details: query.details, credential: query.credential,
    ...('documentation' in query ? { documentation: query.documentation } : {}),
  }))),
  pending('amazon-bedrock', 'Amazon Bedrock', 'supportAwsUsageDetails', 'https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_GetCostAndUsage.html'),
  noPublicApi('ant-ling', 'Ant Ling', 'https://developer.ant-ling.com/zh-CN/docs/getting-started/changelog/billing-upgrade/'),
  pending('anthropic', 'Anthropic', 'supportAnthropicUsageDetails', 'https://platform.claude.com/docs/en/manage-claude/usage-cost-api'),
  pending('azure-openai-responses', 'Azure OpenAI', 'supportAzureUsageDetails', 'https://learn.microsoft.com/en-us/rest/api/cost-management/query/usage'),
  pending('baseten', 'Baseten', 'supportBasetenUsageDetails', 'https://www.baseten.co/resources/changelog/retrieve-billing-usage-via-api/'),
  noPublicApi('cerebras', 'Cerebras', 'https://inference-docs.cerebras.ai/console/overview'),
  pending('cloudflare-ai-gateway', 'Cloudflare AI Gateway', 'supportCloudflareUsageDetails', 'https://developers.cloudflare.com/ai-gateway/observability/analytics/'),
  pending('cloudflare-workers-ai', 'Cloudflare Workers AI', 'supportCloudflareUsageDetails', 'https://developers.cloudflare.com/workers-ai/'),
  pending('fireworks', 'Fireworks', 'supportFireworksUsageDetails', 'https://docs.fireworks.ai/accounts/exporting-usage-and-costs'),
  pending('github-copilot', 'GitHub Copilot', 'supportCopilotUsageDetails', 'https://docs.github.com/en/rest/billing/usage'),
  pending('google', 'Google Gemini', 'supportGoogleUsageDetails', 'https://cloud.google.com/monitoring/api/metrics_gcp'),
  pending('google-vertex', 'Google Vertex AI', 'supportGoogleUsageDetails', 'https://cloud.google.com/vertex-ai/generative-ai/docs/monitoring/monitoring-models'),
  noPublicApi('groq', 'Groq', 'https://console.groq.com/docs/billing-faqs'),
  noPublicApi('huggingface', 'Hugging Face', 'https://huggingface.co/docs/hub/billing'),
  noPublicApi('meta', 'Meta', 'https://dev.meta.ai/help/usage-and-limits/api-usage'),
  pending('minimax', 'MiniMax', 'supportMinimaxUsageDetails', 'https://platform.minimax.io/subscribe/coding-plan'),
  pending('minimax-cn', 'MiniMax CN', 'supportMinimaxUsageDetails', 'https://platform.minimaxi.com/subscribe/coding-plan'),
  pending('mistral', 'Mistral', 'supportMistralUsageDetails', 'https://docs.mistral.ai/admin/admin-api/usage-metrics'),
  noPublicApi('nvidia', 'NVIDIA', 'https://docs.api.nvidia.com/'),
  pending('openai', 'OpenAI', 'supportOpenaiUsageDetails', 'https://platform.openai.com/docs/api-reference/usage'),
  noPublicApi('openai-codex', 'OpenAI Codex', 'https://developers.openai.com/codex/pricing/', 'supportSubscriptionNoPublicApiDetails'),
  noPublicApi('opencode', 'OpenCode Zen', 'https://opencode.ai/docs/zen/', 'supportZenNoPublicApiDetails'),
  pending('qwen-token-plan', 'Qwen Token Plan', 'supportQwenUsageDetails', 'https://help.aliyun.com/zh/model-studio/cli/usage-quota'),
  pending('qwen-token-plan-cn', 'Qwen Token Plan CN', 'supportQwenUsageDetails', 'https://help.aliyun.com/zh/model-studio/cli/usage-quota'),
  pending('qwen-token-plan-individual', 'Qwen Token Plan Individual', 'supportQwenUsageDetails', 'https://help.aliyun.com/zh/model-studio/cli/usage-quota'),
  noPublicApi('radius', 'Radius', 'https://pi.dev/models/radius/balanced'),
  pending('together', 'Together', 'supportTogetherUsageDetails', 'https://docs.together.ai/docs/changelog'),
  pending('vercel-ai-gateway', 'Vercel AI Gateway', 'supportVercelBalanceDetails', 'https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway'),
  pending('xai', 'xAI', 'supportXaiBalanceDetails', 'https://docs.x.ai/developers/rest-api-reference/management'),
  noPublicApi('xiaomi', 'Xiaomi MiMo', 'https://mimo.mi.com/docs/pricing'),
  noPublicApi('xiaomi-token-plan-ams', 'Xiaomi Token Plan AMS', 'https://mimo.mi.com/'),
  noPublicApi('xiaomi-token-plan-cn', 'Xiaomi Token Plan CN', 'https://mimo.mi.com/'),
  noPublicApi('xiaomi-token-plan-sgp', 'Xiaomi Token Plan SGP', 'https://mimo.mi.com/'),
  pending('zai', 'Z.AI', 'supportZaiUsageDetails', 'https://github.com/zai-org/zai-coding-plugins/tree/main/plugins/glm-plan-usage'),
  pending('zai-coding-cn', 'Z.AI Coding CN', 'supportZaiUsageDetails', 'https://github.com/zai-org/zai-coding-plugins/tree/main/plugins/glm-plan-usage'),
]

export type ProviderQuerySupportGroup = {
  id: string
  name: string
  translatedName?: boolean
  providers: ProviderQuerySupport[]
}

/** Regional APIs and subscriptions stay distinct within the same provider family. */
const PROVIDER_QUERY_FAMILIES = [
  { id: 'deepseek', name: 'DeepSeek', providers: ['deepseek-official', 'deepseek', 'deepseek-account'] },
  { id: 'kimi', name: 'Kimi / Moonshot AI', providers: ['kimi-coding', 'moonshotai-cn', 'moonshotai'] },
  { id: 'opencode', name: 'OpenCode', providers: ['opencode-go', 'opencode'] },
  { id: 'cloudflare', name: 'Cloudflare', providers: ['cloudflare-ai-gateway', 'cloudflare-workers-ai'] },
  { id: 'google', name: 'Google', providers: ['google', 'google-vertex'] },
  { id: 'minimax', name: 'MiniMax', providers: ['minimax', 'minimax-cn'] },
  { id: 'openai', name: 'OpenAI', providers: ['openai', 'openai-codex'] },
  { id: 'qwen', name: 'Qwen', providers: ['qwen-token-plan', 'qwen-token-plan-cn', 'qwen-token-plan-individual'] },
  { id: 'xiaomi', name: 'Xiaomi MiMo', providers: ['xiaomi', 'xiaomi-token-plan-ams', 'xiaomi-token-plan-cn', 'xiaomi-token-plan-sgp'] },
  { id: 'zai', name: 'Z.AI', providers: ['zai', 'zai-coding-cn'] },
]

export const BUILTIN_PROVIDER_QUERY_SUPPORT_GROUPS: readonly ProviderQuerySupportGroup[] = (() => {
  const groups = new Map<string, ProviderQuerySupportGroup>()
  for (const provider of BUILTIN_PROVIDER_QUERY_SUPPORT) {
    const family = PROVIDER_QUERY_FAMILIES.find((entry) => entry.providers.includes(provider.id))
    const id = family?.id ?? provider.id
    let group = groups.get(id)
    if (group === undefined) {
      group = {
        id, name: family?.name ?? provider.name,
        translatedName: family === undefined ? provider.translatedName : false,
        providers: [],
      }
      groups.set(id, group)
    }
    group.providers.push(provider)
  }
  return Array.from(groups.values())
})()
