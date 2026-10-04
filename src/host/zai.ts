/**
 * Official GLM Coding Plan query/auth contract:
 * https://github.com/zai-org/zai-coding-plugins/blob/main/plugins/glm-plan-usage/skills/usage-query-skill/scripts/query-usage.mjs
 * Current official usage page maps TOKENS_LIMIT / CREDIT_LIMIT unit 3 to 5h,
 * unit 6 to weekly, and TIME_LIMIT unit 5 to monthly MCP calls:
 * https://z.ai/manage-apikey/coding-plan/personal/usage
 * `percentage` means used; `nextResetTime` is a millisecond epoch.
 */
import type { BalanceInfo, QuotaWindow } from '../payload'
import { isRecord } from '../shared'

function numeric(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return undefined
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

function resetAt(value: unknown): string | undefined {
  const milliseconds = numeric(value)
  if (milliseconds === undefined || milliseconds < 1_000_000_000_000) return undefined
  const date = new Date(milliseconds)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

function quotaId(item: Record<string, unknown>): string | undefined {
  const unit = numeric(item.unit)
  const count = numeric(item.number)
  if (item.unit !== undefined && unit === undefined || item.number !== undefined && count === undefined) return undefined
  if (item.type === 'TIME_LIMIT') {
    return (unit === undefined || unit === 5) && (count === undefined || count === 1) ? 'mcp-monthly' : undefined
  }
  if (item.type !== 'TOKENS_LIMIT' && item.type !== 'CREDIT_LIMIT') return undefined
  // Legacy official plugin responses can omit the unit and number fields.
  if (unit === undefined || unit === 3) return count === undefined || count === 5 ? 'five-hour' : undefined
  return unit === 6 && (count === undefined || count === 1) ? 'weekly' : undefined
}

export function parseZaiUsage(data: unknown): BalanceInfo {
  if (!isRecord(data)) return { status: 'failed', message: 'Z.AI Coding Plan 额度响应结构无法识别' }
  if (data.success !== undefined && data.success !== true || data.code !== undefined && numeric(data.code) !== 200) {
    const code = numeric(data.code)
    return { status: 'failed', message: `Z.AI 额度查询失败${code !== undefined ? ` (${code})` : ''}，请检查地区、套餐状态及 API Key 是否关联 Coding Plan` }
  }
  const payload = isRecord(data.data) ? data.data : data
  if (!Array.isArray(payload.limits)) return { status: 'failed', message: 'Z.AI Coding Plan 未返回额度列表' }
  const quotas: QuotaWindow[] = []
  for (const item of payload.limits) {
    if (!isRecord(item)) continue
    const id = quotaId(item)
    if (id === undefined) continue
    const limit = numeric(item.usage)
    const used = numeric(item.currentValue)
    const reportedRemaining = numeric(item.remaining)
    const remaining = reportedRemaining ?? (limit !== undefined && used !== undefined ? Math.max(0, limit - used) : undefined)
    const percent = item.percentage === undefined
      ? limit !== undefined && limit > 0 && used !== undefined ? used / limit * 100 : undefined
      : numeric(item.percentage)
    if (percent === undefined || !Number.isFinite(percent)) continue
    const entry: QuotaWindow = {
      id, usedPercent: percent, remainingPercent: Math.max(0, 100 - percent), resetAt: resetAt(item.nextResetTime),
      ...(limit !== undefined && limit > 0 && used !== undefined && remaining !== undefined ? { limit, used, remaining } : {}),
    }
    // New credit windows replace legacy token windows for the same period.
    const index = quotas.findIndex((existing) => existing.id === id)
    if (index < 0) quotas.push(entry)
    else if (item.type === 'CREDIT_LIMIT') quotas[index] = entry
  }
  if (quotas.length === 0) return { status: 'failed', message: 'Z.AI 未返回可识别的 Coding Plan 额度，请确认套餐与密钥权限；部分团队套餐可能不支持此查询' }
  quotas.sort((a, b) => ['five-hour', 'weekly', 'mcp-monthly'].indexOf(a.id) - ['five-hour', 'weekly', 'mcp-monthly'].indexOf(b.id))
  return { status: 'ready', quotas, wallets: [] }
}
