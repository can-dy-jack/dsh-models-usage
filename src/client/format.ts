/** Display formatting: currency symbols, amounts, per-model metadata lines. */

import type { ModelEntry } from '../payload'

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

export function describeModelMeta(model: ModelEntry): string {
  const parts: string[] = []
  if (typeof model.contextWindow === 'number' && model.contextWindow > 0) {
    parts.push(Math.round(model.contextWindow / 1000) + 'K ctx')
  }
  if (typeof model.maxTokens === 'number' && model.maxTokens > 0) parts.push('≤' + model.maxTokens + ' out')
  if (Array.isArray(model.inputModalities) && model.inputModalities.length > 0) parts.push(model.inputModalities.join('+'))
  if (model.reasoning && Array.isArray(model.reasoning.efforts) && model.reasoning.efforts.length > 0) {
    parts.push('effort: ' + model.reasoning.efforts.map((effort) => effort.id).join('/'))
  }
  return parts.join(' · ')
}
