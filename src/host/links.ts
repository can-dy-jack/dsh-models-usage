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

/** Console/usage page a user can open when no balance endpoint exists. */
export function consoleLink(providerId: string, baseURL: string | undefined): string | undefined {
  const host = hostOf(baseURL)
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
  if (host !== undefined) {
    if (host.endsWith('volces.com')) return 'https://console.volcengine.com/ark'
    if (host === 'openrouter.ai') return 'https://openrouter.ai/settings/credits'
    if (host.endsWith('bigmodel.cn')) return 'https://bigmodel.cn/usercenter/proj-mgmt/account'
    if (host.endsWith('aliyuncs.com')) return 'https://bailian.console.aliyun.com/'
    if (host.endsWith('siliconflow.cn')) return 'https://cloud.siliconflow.cn/account/ak'
  }
  if (providerId === 'ark') return 'https://console.volcengine.com/ark'
  return originOf(baseURL)
}

export type BalanceTarget =
  | { kind: 'account' }
  | { kind: Exclude<SupportedBalanceQueryKind, 'account'>; url: string }
  | { kind: 'unsupported' }

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
  const host = hostOf(baseURL)
  if (providerId === OFFICIAL_PROVIDER || (host !== undefined && (host === 'api.deepseek.com' || host.endsWith('.deepseek.com')))) {
    return { kind: 'deepseek', url: `${originOf(baseURL) ?? 'https://api.deepseek.com'}/user/balance` }
  }
  if (host === 'openrouter.ai') return { kind: 'openrouter', url: 'https://openrouter.ai/api/v1/credits' }
  const kimiURL = kimiUsageURL(providerId, baseURL)
  if (kimiURL !== undefined) return { kind: 'kimi-coding', url: kimiURL }
  const moonshot = moonshotBalanceTarget(providerId, baseURL)
  if (moonshot !== undefined) return moonshot
  const goURL = openCodeGoUsageURL(providerId, baseURL)
  if (goURL !== undefined) return { kind: 'opencode-go', url: goURL }
  return { kind: 'unsupported' }
}

export function providerOrder(providerId: string): number {
  if (providerId === ACCOUNT_PROVIDER) return 0
  if (providerId === OFFICIAL_PROVIDER) return 1
  return 2
}
