/** Display formatting: amounts, update times, and per-model metadata lines. */

import type { ModelEntry } from '../payload'
import type { Translate } from './i18n'

export function currencySymbol(currency: string): string {
  if (currency === 'CNY') return '¥'
  if (currency === 'USD') return '$'
  return currency.length > 0 ? currency + ' ' : ''
}

export function formatAmount(value: unknown): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value ?? '')
  if (numeric > 0 && numeric < 0.01) return '<0.01'
  return numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Known capability values are UI copy; provider extensions keep their original ids. */
export function capabilityLabel(kind: 'modality' | 'effort', value: string, t: Translate): string {
  const key = kind + '-' + value
  const label = t(key)
  return label === key ? value : label
}

export function describeModelMeta(model: ModelEntry, t: Translate): string {
  const parts: string[] = []
  if (typeof model.contextWindow === 'number' && model.contextWindow > 0) {
    parts.push(t('modelContext', { count: Math.round(model.contextWindow / 1000) }))
  }
  if (typeof model.maxTokens === 'number' && model.maxTokens > 0) parts.push(t('modelOutput', { count: model.maxTokens }))
  if (model.reasoning && Array.isArray(model.reasoning.efforts) && model.reasoning.efforts.length > 0) {
    parts.push(t('modelReasoning', {
      efforts: model.reasoning.efforts.map((effort) => capabilityLabel('effort', effort.id, t)).join('/'),
    }))
  }
  return parts.join(' · ')
}

export function formatPercent(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%'
}

/** Absolute timestamps use the browser's local time zone. */
export function formatLocalDateTime(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0')
  return value.getFullYear() + '-' + pad(value.getMonth() + 1) + '-' + pad(value.getDate())
    + ' ' + pad(value.getHours()) + ':' + pad(value.getMinutes())
}

/** Recent reads use elapsed time; older reads use the user's local date/time. */
export function formatUpdatedAt(updated: Date, t: Translate, now = Date.now()): string {
  const elapsed = Math.max(0, now - updated.getTime())
  if (elapsed < 60_000) return t('updatedJustNow')
  if (elapsed < 3_600_000) return t('updatedMinutesAgo', { count: Math.floor(elapsed / 60_000) })
  if (elapsed < 86_400_000) return t('updatedHoursAgo', { count: Math.floor(elapsed / 3_600_000) })
  return formatLocalDateTime(updated)
}
