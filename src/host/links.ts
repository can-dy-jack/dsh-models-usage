/** Pure provider→URL helpers: console links, balance endpoints, sort order. */

import { asString } from '../shared'
import type { SupportedBalanceQueryKind } from '../balance-support'
import { ACCOUNT_PROVIDER, OFFICIAL_PROVIDER } from './options'

export function originOf(baseURL: unknown): string | undefined {
  const raw = asString(baseURL)
  if (raw === undefined) return undefined
  try {
    return new URL(raw).origin
  } catch {
    return undefined
  }
}

export function hostOf(baseURL: unknown): string | undefined {
  const raw = asString(baseURL)
  if (raw === undefined) return undefined
  try {
    return new URL(raw).hostname
  } catch {
    return undefined
  }
}

/** Recognize the built-in route and custom routes on the official API host. */
export function isAntLingRoute(providerId: string, baseURL: string | undefined): boolean {
  return providerId === 'ant-ling' || hostOf(baseURL) === 'api.ant-ling.com'
}

/** MiMo PAYG and regional Token Plan share a console, but have separate billing. */
export function xiaomiBillingMode(providerId: string, baseURL: string | undefined): 'api' | 'token-plan' | undefined {
  const host = hostOf(baseURL)
  if (host === 'api.xiaomimimo.com') return 'api'
  if (host !== undefined && /^token-plan-(?:cn|sgp|ams)\.xiaomimimo\.com$/.test(host)) return 'token-plan'
  if (providerId === 'xiaomi') return 'api'
  if (['xiaomi-token-plan-cn', 'xiaomi-token-plan-sgp', 'xiaomi-token-plan-ams'].includes(providerId)) return 'token-plan'
  return undefined
}

/** Model keys cannot authenticate Bailian's console usage or cloud billing APIs. */
export function qwenBillingRoute(providerId: string, baseURL: string | undefined):
  { mode: 'token-plan' | 'coding-plan' | 'api'; region: string } | undefined {
  const host = hostOf(baseURL)
  if (host === 'token-plan.cn-beijing.maas.aliyuncs.com') return { mode: 'token-plan', region: 'cn-beijing' }
  if (host === 'token-plan.ap-southeast-1.maas.aliyuncs.com') return { mode: 'token-plan', region: 'ap-southeast-1' }
  if (host === 'coding.dashscope.aliyuncs.com') return { mode: 'coding-plan', region: 'cn-beijing' }
  if (host === 'coding-intl.dashscope.aliyuncs.com') return { mode: 'coding-plan', region: 'ap-southeast-1' }
  const regions: Record<string, string> = {
    'dashscope.aliyuncs.com': 'cn-beijing',
    'dashscope-intl.aliyuncs.com': 'ap-southeast-1',
    'dashscope-us.aliyuncs.com': 'us-east-1',
    'cn-hongkong.dashscope.aliyuncs.com': 'cn-hongkong',
  }
  if (host !== undefined) {
    const region = regions[host]
      ?? (/^token-plan\./.test(host) ? undefined
        : /^[a-z0-9-]+\.(cn-beijing|ap-southeast-1|us-east-1|cn-hongkong|ap-northeast-1|eu-central-1)\.maas\.aliyuncs\.com$/.exec(host)?.[1])
    if (region !== undefined) return { mode: 'api', region }
  }
  if (providerId === 'qwen-token-plan-cn') return { mode: 'token-plan', region: 'cn-beijing' }
  if (providerId === 'qwen-token-plan' || providerId === 'qwen-token-plan-individual') {
    return { mode: 'token-plan', region: 'ap-southeast-1' }
  }
  return undefined
}

/** Official hosts take precedence over a route's default region. */
export function zaiPlatform(providerId: string, baseURL: string | undefined): 'zai' | 'zai-cn' | undefined {
  const host = hostOf(baseURL)
  if (host === 'api.z.ai') return 'zai'
  if (host === 'open.bigmodel.cn' || host === 'dev.bigmodel.cn') return 'zai-cn'
  return providerId === 'zai' ? 'zai' : providerId === 'zai-coding-cn' ? 'zai-cn' : undefined
}

/** Console/usage page a user can open when no balance endpoint exists. */
export function consoleLink(providerId: string, baseURL: string | undefined): string | undefined {
  const host = hostOf(baseURL)
  if (isAntLingRoute(providerId, baseURL)) return 'https://chat.ant-ling.com/open'
  const xiaomi = xiaomiBillingMode(providerId, baseURL)
  if (xiaomi !== undefined) return `https://platform.xiaomimimo.com/console/${xiaomi === 'api' ? 'balance' : 'plan-manage'}`
  const qwen = qwenBillingRoute(providerId, baseURL)
  if (qwen !== undefined) {
    const domestic = qwen.region === 'cn-beijing'
    const console = `https://${domestic ? 'bailian.console.aliyun.com' : 'modelstudio.console.alibabacloud.com'}/${qwen.region}`
    return console + (qwen.mode === 'token-plan' ? `/subscription/${domestic ? 'overview' : 'token-plan'}`
      : qwen.mode === 'coding-plan' ? '/subscription/coding-plan' : '')
  }
  const zai = zaiPlatform(providerId, baseURL)
  if (zai !== undefined) {
    const coding = zaiUsageTarget(providerId, baseURL) !== undefined
    return zai === 'zai' ? `https://z.ai/manage-apikey/${coding ? 'coding-plan/personal/usage' : 'billing'}`
      : `https://bigmodel.cn/usercenter/${coding ? 'glm-coding/usage' : 'proj-mgmt/account'}`
  }
  if (providerId === 'openrouter' || host === 'openrouter.ai') return 'https://openrouter.ai/settings/credits'
  if (providerId === 'opencode-go' || host === 'opencode.ai') return 'https://opencode.ai/workspace'
  if (kimiUsageURL(providerId, baseURL) !== undefined) {
    return host === 'api.kimi.ai' ? 'https://www.kimi.ai/code/console' : 'https://www.kimi.com/code/console'
  }
  const moonshot = moonshotBalanceTarget(providerId, baseURL)
  if (moonshot !== undefined) {
    return moonshot.kind === 'moonshot-cn'
      ? 'https://platform.moonshot.cn/console/info'
      : 'https://platform.moonshot.ai/console/info'
  }
  const minimax = minimaxBalanceTarget(providerId, baseURL)
  if (minimax !== undefined) {
    return minimax.kind === 'minimax-cn' ? 'https://platform.minimax.cn/user-center/payment/token-plan'
      : 'https://platform.minimax.io/user-center/payment/token-plan'
  }
  if (host !== undefined) {
    if (host.endsWith('volces.com')) return 'https://console.volcengine.com/ark'
    if (host.endsWith('bigmodel.cn')) return 'https://bigmodel.cn/usercenter/proj-mgmt/account'
    if (host.endsWith('aliyuncs.com')) return 'https://bailian.console.aliyun.com/'
    if (host.endsWith('siliconflow.cn')) return 'https://cloud.siliconflow.cn/account/ak'
  }
  if (providerId === 'ark') return 'https://console.volcengine.com/ark'
  return originOf(baseURL)
}

export type BalanceTarget =
  | { kind: 'account' }
  | { kind: Exclude<SupportedBalanceQueryKind, 'account' | 'minimax' | 'minimax-cn'>; url: string }
  | { kind: 'minimax' | 'minimax-cn'; url: string; balanceURL: string }
  | { kind: 'unsupported' }

/** Official Coding Plan OpenAI/Anthropic bases; PAYG wallet APIs are not public. */
export function zaiUsageTarget(providerId: string, baseURL: string | undefined):
  { kind: 'zai' | 'zai-cn'; url: string } | undefined {
  const kind = zaiPlatform(providerId, baseURL)
  if (kind === undefined) return undefined
  try {
    const url = new URL(baseURL ?? (kind === 'zai-cn'
      ? 'https://open.bigmodel.cn/api/coding/paas/v4' : 'https://api.z.ai/api/coding/paas/v4'))
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    const official = ['api.z.ai', 'open.bigmodel.cn', 'dev.bigmodel.cn'].includes(url.hostname)
    const path = url.pathname.replace(/\/+$/, '')
    const codingSuffix = /\/api\/(?:coding\/paas\/v4|anthropic(?:\/v1)?)$/
    if (official ? !/^\/api\/(?:coding\/paas\/v4|anthropic(?:\/v1)?)$/.test(path) : /\/api\/paas\/v4$/.test(path)) return undefined
    const prefix = official ? '' : codingSuffix.test(path) ? path.replace(codingSuffix, '') : path.replace(/\/v1$/, '')
    url.pathname = prefix + '/api/monitor/usage/quota/limit'
    url.search = ''
    url.hash = ''
    return { kind, url: url.href }
  } catch {
    return undefined
  }
}

/** Both model protocols share the account API; explicit proxies retain their prefix. */
export function minimaxBalanceTarget(providerId: string, baseURL: string | undefined):
  { kind: 'minimax' | 'minimax-cn'; url: string; balanceURL: string } | undefined {
  const routeKind = providerId === 'minimax-cn' ? 'minimax-cn' : providerId === 'minimax' ? 'minimax' : undefined
  if (baseURL === undefined && routeKind === undefined) return undefined
  try {
    const url = new URL(baseURL ?? (routeKind === 'minimax-cn' ? 'https://api.minimaxi.com' : 'https://api.minimax.io'))
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    const officialKind = url.hostname === 'api.minimax.io' ? 'minimax'
      : url.hostname === 'api.minimaxi.com' || url.hostname === 'api.minimax.cn' ? 'minimax-cn' : undefined
    const kind = officialKind ?? routeKind
    if (kind === undefined) return undefined
    const path = url.pathname.replace(/\/+$/, '')
    const prefix = officialKind !== undefined ? '' : path.replace(/\/(?:anthropic(?:\/v1)?|v1)$/, '')
    url.search = ''
    url.hash = ''
    url.pathname = prefix + '/account/query_balance'
    const balanceURL = url.href
    url.pathname = prefix + '/v1/token_plan/remains'
    return { kind, url: url.href, balanceURL }
  } catch {
    return undefined
  }
}

/** Built-in routes can omit their default base; explicit proxies keep their origin and prefix. */
export function openRouterCreditsURL(providerId: string, baseURL: string | undefined): string | undefined {
  if (baseURL === undefined) return providerId === 'openrouter' ? 'https://openrouter.ai/api/v1/credits' : undefined
  try {
    const url = new URL(baseURL)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    const official = url.hostname === 'openrouter.ai'
    if (providerId !== 'openrouter' && !official) return undefined
    const path = url.pathname.replace(/\/+$/, '')
    url.pathname = official ? '/api/v1/credits'
      : path + (path.endsWith('/v1') ? '/credits' : '/api/v1/credits')
    url.search = ''
    url.hash = ''
    return url.href
  } catch {
    return undefined
  }
}

/** Regional keys and currencies are independent; explicit routes may use a proxy. */
export function moonshotBalanceTarget(providerId: string, baseURL: string | undefined):
  { kind: 'moonshot' | 'moonshot-cn'; url: string } | undefined {
  const routeKind = providerId === 'moonshotai-cn' ? 'moonshot-cn' : providerId === 'moonshotai' ? 'moonshot' : undefined
  if (baseURL === undefined) {
    if (routeKind === undefined) return undefined
    return { kind: routeKind, url: `https://api.moonshot.${routeKind === 'moonshot-cn' ? 'cn' : 'ai'}/v1/users/me/balance` }
  }
  try {
    const url = new URL(baseURL)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    const officialKind = url.hostname === 'api.moonshot.cn' ? 'moonshot-cn'
      : url.hostname === 'api.moonshot.ai' ? 'moonshot' : undefined
    const kind = officialKind ?? routeKind
    if (kind === undefined) return undefined
    const path = url.pathname.replace(/\/+$/, '')
    url.pathname = officialKind !== undefined ? '/v1/users/me/balance'
      : path + (path.endsWith('/v1') ? '/users/me/balance' : '/v1/users/me/balance')
    url.search = ''
    url.hash = ''
    return { kind, url: url.href }
  } catch {
    return undefined
  }
}

/** Kimi Code supports OpenAI (/coding/v1) and Anthropic (/coding) bases. */
export function kimiUsageURL(providerId: string, baseURL: string | undefined): string | undefined {
  if (baseURL === undefined) {
    return providerId === 'kimi-coding' ? 'https://api.kimi.com/coding/v1/usages' : undefined
  }
  try {
    const url = new URL(baseURL)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    const path = url.pathname.replace(/\/+$/, '')
    const official = (url.hostname === 'api.kimi.com' || url.hostname === 'api.kimi.ai')
      && /^\/coding(?:\/v1)?$/.test(path)
    if (providerId !== 'kimi-coding' && !official) return undefined
    url.pathname = path + (path.endsWith('/v1') ? '/usages' : '/v1/usages')
    url.search = ''
    url.hash = ''
    return url.href
  } catch {
    return undefined
  }
}

/** Explicit Go routes may use proxies; automatic detection only matches the official Go base. */
export function openCodeGoUsageURL(providerId: string, baseURL: string | undefined): string | undefined {
  if (baseURL === undefined) return providerId === 'opencode-go' ? 'https://opencode.ai/zen/go/v1/usage' : undefined
  try {
    const url = new URL(baseURL)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    const path = url.pathname.replace(/\/+$/, '')
    const official = url.hostname === 'opencode.ai' && /^\/zen\/go(?:\/v1)?$/.test(path)
    // Zen uses the same domain but does not expose a model-key wallet query.
    if (url.hostname === 'opencode.ai' ? !official : providerId !== 'opencode-go') return undefined
    url.pathname = path + (path.endsWith('/v1') ? '/usage' : '/v1/usage')
    url.search = ''
    url.hash = ''
    return url.href
  } catch {
    return undefined
  }
}

/** Which balance endpoint, if any, belongs to one provider route. */
export function balanceTarget(providerId: string, baseURL: string | undefined): BalanceTarget {
  if (providerId === ACCOUNT_PROVIDER) return { kind: 'account' }
  if (isAntLingRoute(providerId, baseURL)) return { kind: 'unsupported' }
  if (xiaomiBillingMode(providerId, baseURL) !== undefined) return { kind: 'unsupported' }
  if (qwenBillingRoute(providerId, baseURL) !== undefined) return { kind: 'unsupported' }
  const host = hostOf(baseURL)
  if (providerId === OFFICIAL_PROVIDER || (host !== undefined && (host === 'api.deepseek.com' || host.endsWith('.deepseek.com')))) {
    return { kind: 'deepseek', url: `${originOf(baseURL) ?? 'https://api.deepseek.com'}/user/balance` }
  }
  const creditsURL = openRouterCreditsURL(providerId, baseURL)
  if (creditsURL !== undefined) return { kind: 'openrouter', url: creditsURL }
  const kimiURL = kimiUsageURL(providerId, baseURL)
  if (kimiURL !== undefined) return { kind: 'kimi-coding', url: kimiURL }
  const moonshot = moonshotBalanceTarget(providerId, baseURL)
  if (moonshot !== undefined) return moonshot
  const goURL = openCodeGoUsageURL(providerId, baseURL)
  if (goURL !== undefined) return { kind: 'opencode-go', url: goURL }
  const minimax = minimaxBalanceTarget(providerId, baseURL)
  if (minimax !== undefined) return minimax
  const zai = zaiUsageTarget(providerId, baseURL)
  if (zai !== undefined) return zai
  return { kind: 'unsupported' }
}

export function providerOrder(providerId: string): number {
  if (providerId === ACCOUNT_PROVIDER) return 0
  if (providerId === OFFICIAL_PROVIDER) return 1
  return 2
}
