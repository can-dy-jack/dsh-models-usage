/** Client-only projections; the source payload and account balances stay intact. */

import type { ModelEntry, ProviderEntry } from '../payload'

export type FilterState = {
  query: string
  providerId: string
  activation: 'all' | 'active' | 'dormant'
  modality: string
  reasoningOnly: boolean
}

export function defaultFilters(): FilterState {
  return { query: '', providerId: '', activation: 'all', modality: '', reasoningOnly: false }
}

export function hasActiveFilters(value: FilterState): boolean {
  return value.query !== '' || value.providerId !== '' || value.activation !== 'all'
    || value.modality !== '' || value.reasoningOnly
}

export type FilterStore = {
  snapshot(): FilterState
  set(next: FilterState): void
  reset(): void
  subscribe(listener: () => void): () => void
}

/** Owned by apply(), so panel/session remounts retain conditions until reload. */
export function createFilterStore(): FilterStore {
  let state = defaultFilters()
  const listeners = new Set<() => void>()
  const set = (next: FilterState) => {
    if (state.query === next.query && state.providerId === next.providerId
      && state.activation === next.activation && state.modality === next.modality
      && state.reasoningOnly === next.reasoningOnly) return
    state = { ...next }
    for (const listener of listeners) listener()
  }
  return {
    snapshot: () => state,
    set,
    reset: () => set(defaultFilters()),
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

const normalize = (value: string) => value.trim().toLowerCase()
const matchesText = (query: string, ...values: string[]) => values.some((value) => value.toLowerCase().includes(query))

export function supportsReasoning(model: ModelEntry): boolean {
  return Array.isArray(model.reasoning?.efforts) && model.reasoning.efforts.some((effort) => {
    const id = typeof effort.id === 'string' ? normalize(effort.id) : ''
    return id !== '' && id !== 'off' && id !== 'none'
  })
}

function matchesCapabilities(model: ModelEntry, filters: FilterState): boolean {
  return (filters.modality === '' || (Array.isArray(model.inputModalities) && model.inputModalities.includes(filters.modality)))
    && (!filters.reasoningOnly || supportsReasoning(model))
}

export function filterModels(models: ModelEntry[], filters: FilterState): ModelEntry[] {
  const query = normalize(filters.query)
  return models.filter((model) => matchesCapabilities(model, filters)
    && matchesText(query, model.id, model.name))
}

export type FilteredProvider = { provider: ProviderEntry; models: ModelEntry[] }

export function filterProviders(providers: ProviderEntry[], filters: FilterState): FilteredProvider[] {
  const query = normalize(filters.query)
  const needsCapabilities = filters.modality !== '' || filters.reasoningOnly
  const results: FilteredProvider[] = []
  for (const provider of providers) {
    if (filters.providerId !== '' && provider.id !== filters.providerId) continue
    if (filters.activation === 'active' && !provider.active) continue
    if (filters.activation === 'dormant' && provider.active) continue
    const providerMatches = matchesText(query, provider.id, provider.displayName)
    const models = (Array.isArray(provider.models) ? provider.models : []).filter((model) =>
      matchesCapabilities(model, filters) && (providerMatches || matchesText(query, model.id, model.name)))
    // Keep zero-model accounts when no model capability is required.
    if (models.length > 0 || (!needsCapabilities && providerMatches)) results.push({ provider, models })
  }
  return results
}

export function inputModalities(models: ModelEntry[]): string[] {
  return [...new Set(models.flatMap((model) => Array.isArray(model.inputModalities)
    ? model.inputModalities.filter((value) => typeof value === 'string' && value.trim() !== '') : []))]
    .sort((left, right) => left.localeCompare(right))
}
