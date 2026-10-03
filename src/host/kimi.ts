/**
 * Official Kimi Code GET /coding/v1/usages, using the same fields as the CLI:
 * https://github.com/MoonshotAI/kimi-code/blob/main/packages/oauth/src/managed-usage.ts
 * Legacy count/window format:
 * https://github.com/MoonshotAI/kimi-cli/blob/main/src/kimi_cli/ui/shell/usage.py
 */
import type { BalanceInfo, QuotaWindow, Wallet } from '../payload'
import { asString, isRecord } from '../shared'

function numeric(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim().length === 0)) return undefined
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

function resetAt(data: Record<string, unknown>): string | undefined {
  for (const key of ['reset_time', 'resetTime', 'reset_at', 'resetAt']) {
    const value = asString(data[key])
    if (value !== undefined && Number.isFinite(Date.parse(value))) return value
  }
  for (const key of ['reset_in', 'resetIn', 'ttl']) {
    const seconds = numeric(data[key])
    if (seconds !== undefined && seconds <= 31_536_000) return new Date(Date.now() + seconds * 1000).toISOString()
  }
  return undefined
}

function quota(id: string, usedPercent: number, data: Record<string, unknown>): QuotaWindow {
  return { id, usedPercent, remainingPercent: Math.max(0, 100 - usedPercent), resetAt: resetAt(data) }
}

function countQuota(id: string, data: unknown): QuotaWindow | undefined {
  if (!isRecord(data)) return undefined
  const limit = numeric(data.limit)
  const remaining = numeric(data.remaining)
  const used = numeric(data.used) ?? (limit !== undefined && remaining !== undefined ? Math.max(0, limit - remaining) : undefined)
  if (limit === undefined || limit <= 0 || used === undefined) return undefined
  const usedPercent = used / limit * 100
  if (!Number.isFinite(usedPercent)) return undefined
  return {
    ...quota(id, usedPercent, data), limit, used,
    remaining: remaining ?? Math.max(0, limit - used),
  }
}

function windowSeconds(item: Record<string, unknown>, detail: Record<string, unknown>): number | undefined {
  const window = isRecord(item.window) ? item.window : {}
  const duration = numeric(window.duration ?? item.duration ?? detail.duration)
  if (duration === undefined || duration <= 0) return undefined
  const unit = asString(window.timeUnit ?? item.timeUnit ?? detail.timeUnit) ?? ''
  const factor = unit.includes('MINUTE') ? 60 : unit.includes('HOUR') ? 3600 : unit.includes('DAY') ? 86400 : 1
  const seconds = duration * factor
  return Number.isFinite(seconds) ? seconds : undefined
}

function boosterWallet(raw: unknown): Wallet | undefined {
  if (!isRecord(raw) || !isRecord(raw.balance) || raw.balance.type !== 'BOOSTER') return undefined
  const left = numeric(raw.balance.amountLeft)
  if (left === undefined) return undefined
  const total = numeric(raw.balance.amount)
  const monthlyLimit = isRecord(raw.monthlyChargeLimit) ? raw.monthlyChargeLimit : {}
  const monthlyUsed = isRecord(raw.monthlyUsed) ? raw.monthlyUsed : {}
  // Official fixed-point scale: 1,000,000 units per cent (100,000,000 per currency unit).
  return {
    currency: asString(monthlyLimit.currency) ?? asString(monthlyUsed.currency) ?? 'USD',
    balance: (left / 100_000_000).toFixed(8),
    toppedUp: total !== undefined ? (total / 100_000_000).toFixed(8) : undefined,
    kind: 'extra-usage',
  }
}

export function parseKimiUsage(data: unknown): BalanceInfo {
  if (!isRecord(data)) return { status: 'failed', message: 'Kimi Code 用量响应结构无法识别' }
  const quotas: QuotaWindow[] = []
  const usages = isRecord(data.usages) ? data.usages : {}
  for (const [field, id] of [
    ['limit_5h', 'five-hour'], ['limit_7d', 'weekly'],
    ['limit_month_total', 'month-total'], ['limit_month_code', 'month-code'],
  ] as const) {
    const entry = usages[field]
    if (!isRecord(entry)) continue
    const ratio = numeric(entry.used_ratio)
    if (ratio !== undefined && Number.isFinite(ratio * 100)) quotas.push(quota(id, ratio * 100, entry))
  }
  // Fill missing windows from the older format without duplicating new-format entries.
  const summary = countQuota('weekly', data.usage)
  if (summary !== undefined && !quotas.some((entry) => entry.id === summary.id)) quotas.push(summary)
  if (Array.isArray(data.limits)) {
    for (const [index, item] of data.limits.entries()) {
      if (!isRecord(item)) continue
      const detail = isRecord(item.detail) ? item.detail : item
      const seconds = windowSeconds(item, detail)
      const id = seconds === 18000 ? 'five-hour' : seconds === 604800 ? 'weekly' : `limit-${index + 1}`
      const entry = countQuota(id, detail)
      if (entry === undefined || quotas.some((existing) => existing.id === id)) continue
      entry.windowSeconds = seconds
      entry.name = asString(item.name ?? item.title ?? item.scope ?? detail.name ?? detail.title)
      quotas.push(entry)
    }
  }
  const wallet = boosterWallet(data.boosterWallet)
  if (quotas.length === 0 && wallet === undefined) return { status: 'failed', message: 'Kimi Code 未返回可识别的额度或余额数据' }
  return { status: 'ready', quotas, wallets: wallet !== undefined ? [wallet] : [] }
}
