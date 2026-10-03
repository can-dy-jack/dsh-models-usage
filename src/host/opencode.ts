/**
 * Official OpenCode Go GET /zen/go/v1/usage (Bearer model API key).
 * https://github.com/anomalyco/opencode/blob/dev/packages/console/app/src/routes/zen/go/v1/usage.ts
 * `percent` is used percentage, not a ratio or a monetary balance.
 */
import type { BalanceInfo, QuotaWindow } from '../payload'
import { asString, isRecord } from '../shared'

export function parseOpenCodeGoUsage(data: unknown): BalanceInfo {
  if (!isRecord(data) || !isRecord(data.usage)) {
    return { status: 'failed', message: 'OpenCode Go 额度响应结构无法识别' }
  }
  const quotas: QuotaWindow[] = []
  for (const [field, id] of [['rolling', 'five-hour'], ['weekly', 'weekly'], ['monthly', 'monthly']] as const) {
    const window = data.usage[field]
    if (!isRecord(window) || (window.status !== 'ok' && window.status !== 'rate-limited')) continue
    const raw = window.percent
    if (typeof raw !== 'number' && (typeof raw !== 'string' || raw.trim().length === 0)) continue
    const usedPercent = Number(raw)
    if (!Number.isFinite(usedPercent) || usedPercent < 0) continue
    const resetAt = asString(window.resetsAt)
    quotas.push({
      id,
      usedPercent,
      remainingPercent: Math.max(0, 100 - usedPercent),
      resetAt: resetAt !== undefined && Number.isFinite(Date.parse(resetAt)) ? resetAt : undefined,
    })
  }
  if (quotas.length === 0) return { status: 'failed', message: 'OpenCode Go 未返回可识别的额度数据' }
  return { status: 'ready', quotas, wallets: [] }
}
