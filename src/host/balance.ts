/**
 * Balance queries. Always *account/provider* scoped, never per model: a model
 * id is a price/route fact, while a wallet belongs to the provider account
 * behind it. Providers whose API key cannot query a balance endpoint are
 * reported as such instead of being given a fabricated zero.
 */

import { errorText, isRecord } from '../shared'
import type { BalanceInfo, Wallet } from '../payload'
import type { DeepseekAccountService, ServiceLookup } from './context'
import { balanceTarget, consoleLink, isAntLingRoute } from './links'
import { parseKimiUsage } from './kimi'
import { parseMoonshotBalance } from './moonshot'
import { parseOpenCodeGoUsage } from './opencode'
import { clientMetadata, requestJson } from './net'
import type { PluginOptions } from './options'

export async function accountBalance(service: ServiceLookup, options: PluginOptions): Promise<BalanceInfo> {
  const account = service<DeepseekAccountService>('deepseekAccount')
  if (account === undefined || typeof account.getBalance !== 'function') {
    return { status: 'unavailable', message: '账号服务未挂载（未登录或非 Desktop 组合）' }
  }
  try {
    const result = await account.getBalance(clientMetadata(options))
    if (result === null || result === undefined) {
      return { status: 'not-signed-in', message: '未登录 DeepSeek 账号' }
    }
    if (isRecord(result) && result.status === 'ready') {
      const wallets: Wallet[] = (Array.isArray(result.value) ? result.value : [])
        .filter(isRecord)
        .map((wallet) => ({ currency: String(wallet.currency ?? ''), balance: String(wallet.balance ?? ''), kind: 'topped-up' }))
      const bonusWallets: Wallet[] = (Array.isArray(result.bonusWallets) ? result.bonusWallets : [])
        .filter(isRecord)
        .map((wallet) => ({ currency: String(wallet.currency ?? ''), balance: String(wallet.balance ?? ''), kind: 'granted' }))
      return { status: 'ready', wallets, bonusWallets }
    }
    return { status: 'failed', message: '账号余额读取失败（可稍后重试）' }
  } catch (error) {
    return { status: 'failed', message: `账号余额读取失败: ${errorText(error)}` }
  }
}

/**
 * @param resolveKey - resolves the provider's API key (reference or record), or undefined.
 * @param label - what to name in a "not configured" message.
 */
export async function providerBalance(
  service: ServiceLookup,
  options: PluginOptions,
  providerId: string,
  baseURL: string | undefined,
  resolveKey: () => Promise<string | undefined>,
  label: string | undefined,
  signal: AbortSignal | undefined,
): Promise<BalanceInfo> {
  const target = balanceTarget(providerId, baseURL)
  if (target.kind === 'account') return accountBalance(service, options)
  if (target.kind === 'unsupported') {
    const antLing = isAntLingRoute(providerId, baseURL)
    return {
      status: 'unsupported',
      message: antLing
        ? '暂不支持百灵余额查询；模型 API Key 无法认证控制台钱包接口，请登录官方控制台查看'
        : '该服务商未提供可用模型密钥查询的余额接口',
      ...(antLing ? { messageKey: 'supportAntLingConsoleDetails' } : {}),
      link: consoleLink(providerId, baseURL),
    }
  }
  const credentialLabel = label ?? (target.kind === 'openrouter' ? 'OpenRouter API Key'
    : target.kind === 'moonshot' || target.kind === 'moonshot-cn' ? 'Moonshot API Key' : undefined)
  if (credentialLabel === undefined) {
    return { status: 'unsupported', message: '未声明凭据引用，无法查询余额', link: consoleLink(providerId, baseURL) }
  }
  const key = await resolveKey()
  if (key === undefined || key.length === 0) {
    return { status: 'no-credential', message: `未配置 ${credentialLabel}`, link: consoleLink(providerId, baseURL) }
  }
  const headers = { Authorization: `Bearer ${key}`, Accept: 'application/json' }
  const response = await requestJson(service, target.url, headers, signal)
  if (response.ok !== true) {
    const message = target.kind === 'opencode-go' && response.status === 403
      ? 'OpenCode Go 拒绝额度查询，请检查订阅状态及 API Key 是否关联订阅 (HTTP 403)'
      : target.kind === 'openrouter' && response.status === 403
        ? 'OpenRouter 拒绝余额查询，请确认 API Key 有账户余额查询权限（官方文档要求管理密钥）(HTTP 403)'
      : response.error
    return { status: 'failed', message, link: consoleLink(providerId, baseURL) }
  }
  const data = response.data
  if (target.kind === 'kimi-coding') {
    return { ...parseKimiUsage(data), endpoint: target.url, link: consoleLink(providerId, baseURL) }
  }
  if (target.kind === 'opencode-go') {
    return { ...parseOpenCodeGoUsage(data), endpoint: target.url, link: consoleLink(providerId, baseURL) }
  }
  if (target.kind === 'moonshot' || target.kind === 'moonshot-cn') {
    return {
      ...parseMoonshotBalance(data, target.kind === 'moonshot-cn' ? 'CNY' : 'USD'),
      endpoint: target.url, link: consoleLink(providerId, baseURL),
    }
  }
  if (target.kind === 'deepseek') {
    const infos = isRecord(data) && Array.isArray(data.balance_infos) ? data.balance_infos.filter(isRecord) : []
    return {
      status: 'ready',
      endpoint: target.url,
      isAvailable: isRecord(data) ? data.is_available === true : false,
      wallets: infos.map((info) => ({
        currency: String(info.currency ?? ''),
        balance: String(info.total_balance ?? ''),
        granted: String(info.granted_balance ?? ''),
        toppedUp: String(info.topped_up_balance ?? ''),
        kind: 'topped-up',
      })),
    }
  }
  const credits = isRecord(data) && isRecord(data.data) ? data.data : undefined
  const total = credits !== undefined ? Number(credits.total_credits) : Number.NaN
  const used = credits !== undefined ? Number(credits.total_usage) : Number.NaN
  if (!Number.isFinite(total)) return { status: 'failed', message: '响应结构无法识别', link: consoleLink(providerId, baseURL) }
  const remaining = total - (Number.isFinite(used) ? used : 0)
  return {
    status: 'ready',
    endpoint: target.url,
    wallets: [{ currency: 'USD', balance: remaining.toFixed(2), toppedUp: total.toFixed(2), granted: '0.00', kind: 'topped-up' }],
  }
}
