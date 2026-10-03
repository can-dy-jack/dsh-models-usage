/** Pure provider→URL helpers: console links, balance endpoints, sort order. */

import { asString } from '../shared'
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
  if (host !== undefined) {
    if (host.endsWith('volces.com')) return 'https://console.volcengine.com/ark'
    if (host === 'openrouter.ai') return 'https://openrouter.ai/settings/credits'
    if (host.endsWith('moonshot.cn') || host.endsWith('moonshot.ai')) return 'https://platform.moonshot.cn/console/info'
    if (host.endsWith('bigmodel.cn')) return 'https://bigmodel.cn/usercenter/proj-mgmt/account'
    if (host.endsWith('aliyuncs.com')) return 'https://bailian.console.aliyun.com/'
    if (host.endsWith('siliconflow.cn')) return 'https://cloud.siliconflow.cn/account/ak'
  }
  if (providerId === 'ark') return 'https://console.volcengine.com/ark'
  return originOf(baseURL)
}

export type BalanceTarget =
  | { kind: 'account' }
  | { kind: 'deepseek' | 'openrouter'; url: string }
  | { kind: 'unsupported' }

/** Which balance endpoint, if any, belongs to one provider route. */
export function balanceTarget(providerId: string, baseURL: string | undefined): BalanceTarget {
  if (providerId === ACCOUNT_PROVIDER) return { kind: 'account' }
  const host = hostOf(baseURL)
  if (providerId === OFFICIAL_PROVIDER || (host !== undefined && (host === 'api.deepseek.com' || host.endsWith('.deepseek.com')))) {
    return { kind: 'deepseek', url: `${originOf(baseURL) ?? 'https://api.deepseek.com'}/user/balance` }
  }
  if (host === 'openrouter.ai') return { kind: 'openrouter', url: 'https://openrouter.ai/api/v1/credits' }
  return { kind: 'unsupported' }
}

export function providerOrder(providerId: string): number {
  if (providerId === ACCOUNT_PROVIDER) return 0
  if (providerId === OFFICIAL_PROVIDER) return 1
  return 2
}
