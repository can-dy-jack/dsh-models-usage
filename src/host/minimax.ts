/**
 * MiniMax official CLI contracts (API keys, not browser sessions):
 * https://github.com/MiniMax-AI/cli/blob/main/src/client/endpoints.ts
 * https://github.com/MiniMax-AI/cli/blob/main/src/types/api.ts
 * https://github.com/MiniMax-AI/cli/blob/main/src/utils/quota.ts
 * `sk-api-` selects /account/query_balance; subscription keys use /v1/token_plan/remains.
 */
import type { BalanceInfo, QuotaWindow, Wallet } from '../payload'
import { asString, isRecord } from '../shared'

function numeric(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function failure(data: unknown): BalanceInfo | undefined {
  if (!isRecord(data)) return { status: 'failed', message: 'MiniMax 响应结构无法识别' }
  if (data.base_resp !== undefined) {
    const code = isRecord(data.base_resp) ? numeric(data.base_resp.status_code) : undefined
    if (code !== 0) {
      const message = isRecord(data.base_resp) ? asString(data.base_resp.status_msg) : undefined
      if (message !== undefined && /no active (?:token|coding) plan subscription/i.test(message)) {
        return { status: 'failed', message: 'MiniMax 未检测到有效的 Token / Coding Plan 订阅，请检查该地区的订阅状态及专用密钥' }
      }
      return { status: 'failed', message: `MiniMax 查询失败${code !== undefined ? ` (${code})` : ''}，请检查密钥类型、地区和账户状态` }
    }
  }
  return undefined
}

/** Preserve official available amount and breakdowns; do not recalculate or scale. */
export function parseMiniMaxBalance(data: unknown, currency: 'CNY' | 'USD'): BalanceInfo {
  const error = failure(data)
  if (error !== undefined) return error
  if (!isRecord(data) || !isRecord(data.base_resp) || data.available_amount === undefined) {
    return { status: 'failed', message: 'MiniMax 余额响应结构无法识别' }
  }
  const available = numeric(data.available_amount)
  if (available === undefined) return { status: 'failed', message: 'MiniMax 未返回有效的可用余额' }
  const wallet: Wallet = { currency, balance: String(data.available_amount).trim(), kind: 'account' }
  for (const [field, key] of [['cash_balance', 'cash'], ['voucher_balance', 'voucher'], ['credit_balance', 'credit'], ['owed_amount', 'owed']] as const) {
    if (data[field] === undefined) continue
    const value = numeric(data[field])
    if (value === undefined || (key !== 'cash' && value < 0)) return { status: 'failed', message: 'MiniMax 余额明细无效' }
    wallet[key] = String(data[field]).trim()
  }
  return { status: 'ready', isAvailable: available > 0, wallets: [wallet] }
}

function resetAt(end: unknown, countdown: unknown, now: number): string | undefined {
  const epoch = numeric(end)
  const milliseconds = epoch !== undefined && epoch > 0 ? epoch : undefined
  const remaining = numeric(countdown)
  const time = milliseconds ?? (remaining !== undefined && remaining >= 0 ? now + remaining : undefined)
  if (time === undefined || !Number.isFinite(new Date(time).getTime())) return undefined
  return new Date(time).toISOString()
}

function quota(item: Record<string, unknown>, period: 'five-hour' | 'weekly', scope: string | undefined, now: number): QuotaWindow | undefined {
  const weekly = period === 'weekly'
  const prefix = weekly ? 'current_weekly' : 'current_interval'
  const status = numeric(item[prefix + '_status'])
  const percent = numeric(item[prefix + '_remaining_percent'])
  const total = numeric(item[prefix + '_total_count'])
  const reported = numeric(item[prefix + '_usage_count'])
  let counts: { limit: number; used: number; remaining: number } | undefined
  // Official legacy semantics: usage_count means remaining. New responses can
  // mean consumed; only attach counts when they agree with the explicit percent.
  if (total !== undefined && total > 0 && reported !== undefined && reported >= 0 && reported <= total) {
    let remaining = reported
    const leftDistance = percent === undefined ? 0 : Math.abs(reported / total * 100 - percent)
    const usedDistance = percent === undefined ? Infinity : Math.abs((total - reported) / total * 100 - percent)
    if (Math.min(leftDistance, usedDistance) <= 1) {
      if (usedDistance < leftDistance) remaining = total - reported
      counts = { limit: total, used: total - remaining, remaining }
    }
  }
  const basePercent = status === 3 ? 100 : status === 2 ? 0
    : percent !== undefined && percent >= 0 ? percent
    : counts !== undefined ? counts.remaining / counts.limit * 100 : undefined
  if (basePercent === undefined) return undefined
  const boost = weekly ? numeric(item.weekly_boost_permille) : undefined
  const remainingPercent = basePercent * (boost !== undefined && boost > 0 && status !== 3 ? boost / 1000 : 1)
  if (!Number.isFinite(remainingPercent)) return undefined
  const start = numeric(item[weekly ? 'weekly_start_time' : 'start_time'])
  const end = numeric(item[weekly ? 'weekly_end_time' : 'end_time'])
  const windowSeconds = start !== undefined && end !== undefined && end > start ? (end - start) / 1000 : undefined
  return {
    id: scope === undefined ? period : `${scope}:${period}`, period, scope,
    windowSeconds,
    usedPercent: Math.max(0, 100 - basePercent), remainingPercent,
    resetAt: status === 3 ? undefined : resetAt(end, item[weekly ? 'weekly_remains_time' : 'remains_time'], now),
    ...(status === 3 ? { unlimited: true } : {}),
    ...(status === 2 || status === 3 ? {} : counts),
  }
}

export function parseMiniMaxUsage(data: unknown, now = Date.now()): BalanceInfo {
  const error = failure(data)
  if (error !== undefined) return error
  if (!isRecord(data) || !Array.isArray(data.model_remains)) return { status: 'failed', message: 'MiniMax 套餐额度响应结构无法识别' }
  const quotas: QuotaWindow[] = []
  for (const item of data.model_remains) {
    if (!isRecord(item)) continue
    const scope = asString(item.model_name)
    for (const period of ['five-hour', 'weekly'] as const) {
      const entry = quota(item, period, scope, now)
      if (entry !== undefined && !quotas.some((existing) => existing.id === entry.id)) quotas.push(entry)
    }
  }
  if (quotas.length === 0) return { status: 'failed', message: 'MiniMax 未返回可识别的套餐额度，请确认使用对应地区的订阅密钥' }
  return { status: 'ready', quotas, wallets: [] }
}
