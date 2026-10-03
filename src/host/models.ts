/** Provider route enumeration and model catalog collection. */

import { asString, errorText, isRecord } from '../shared'
import type { ModelEntry } from '../payload'
import type { LlmService, ServiceLookup } from './context'
import { providerOrder } from './links'
import { DETAIL_CONCURRENCY, DETAIL_MODEL_CAP, type PluginOptions } from './options'

/** One provider route, merged from the registered set and the config directory. */
export interface ProviderDraft {
  id: string
  routeName?: string
  active: boolean
  displayName?: string
  settingsNs?: string
  settingsPath?: string[]
  declared?: boolean
  configError?: string
}

/**
 * The providers this payload reports.
 *
 * `ctx.llm.listProviders()` is the set of routes with a **registered adapter** —
 * exactly what the running composition actually offers. The configurable-provider
 * directory also lists *declared but dormant* routes (a bare `llm-pi-ai` offers
 * its whole installed catalog, e.g. `amazon-bedrock`); those have no adapter, so
 * asking them for models fails with `NO_ADAPTER`. They are omitted by default and
 * only contribute display metadata to routes that really exist.
 */
export function listProviderEntries(service: ServiceLookup, options: PluginOptions): ProviderDraft[] {
  const llm = service<LlmService>('llm')
  const entries = new Map<string, ProviderDraft>()
  if (llm !== undefined && typeof llm.listProviders === 'function') {
    let registered: unknown
    try {
      registered = llm.listProviders()
    } catch {
      registered = []
    }
    for (const info of Array.isArray(registered) ? registered : []) {
      if (!isRecord(info) || typeof info.id !== 'string') continue
      entries.set(info.id, { id: info.id, routeName: asString(info.name), active: true })
    }
  }
  if (llm !== undefined && typeof llm.listConfigurableProviders === 'function') {
    let directory: unknown
    try {
      directory = llm.listConfigurableProviders()
    } catch {
      directory = []
    }
    for (const entry of Array.isArray(directory) ? directory : []) {
      if (!isRecord(entry) || typeof entry.provider !== 'string') continue
      const known = entries.get(entry.provider)
      // A dormant route only appears when the caller asked for it.
      if (known === undefined && options.includeDormantProviders !== true) continue
      const merged: ProviderDraft = known ?? { id: entry.provider, active: false }
      entries.set(entry.provider, {
        ...merged,
        displayName: asString(entry.displayName),
        settingsNs: asString(entry.settingsNs),
        settingsPath: Array.isArray(entry.settingsPath) ? entry.settingsPath as string[] : [],
        declared: entry.declared === true,
        configError: asString(entry.error),
      })
    }
  }
  return [...entries.values()].sort((left, right) => {
    const byGroup = providerOrder(left.id) - providerOrder(right.id)
    return byGroup !== 0 ? byGroup : left.id.localeCompare(right.id)
  })
}

/** Advertised catalog for one route; a dormant or failing route is reported, not thrown. */
export async function listModels(service: ServiceLookup, providerId: string): Promise<{ models: ModelEntry[]; error: string | undefined }> {
  const llm = service<LlmService>('llm')
  if (llm === undefined || typeof llm.listModels !== 'function') return { models: [], error: undefined }
  try {
    const listed = await llm.listModels(providerId)
    const models: ModelEntry[] = []
    for (const model of Array.isArray(listed) ? listed : []) {
      if (!isRecord(model) || typeof model.id !== 'string') continue
      models.push({
        id: model.id,
        name: asString(model.name) ?? model.id,
        description: asString(model.description),
        inputModalities: Array.isArray(model.inputModalities) ? model.inputModalities.filter((item): item is string => typeof item === 'string') : undefined,
      })
    }
    return { models, error: undefined }
  } catch (error) {
    return { models: [], error: errorText(error) }
  }
}

/** Fold the settings-configured catalog in when the adapter advertises nothing. */
export function modelsFromConfig(node: Record<string, unknown> | undefined): ModelEntry[] {
  const models: ModelEntry[] = []
  for (const model of isRecord(node) && Array.isArray(node.models) ? node.models : []) {
    if (!isRecord(model) || typeof model.id !== 'string') continue
    models.push({
      id: model.id,
      name: asString(model.name) ?? model.id,
      description: asString(model.description),
      contextWindow: typeof model.contextWindow === 'number' ? model.contextWindow : undefined,
      maxTokens: typeof model.maxTokens === 'number' ? model.maxTokens : undefined,
      inputModalities: Array.isArray(model.inputModalities)
        ? model.inputModalities.filter((item): item is string => typeof item === 'string')
        : Array.isArray(model.input)
          ? model.input.filter((item): item is string => typeof item === 'string')
          : undefined,
      source: 'settings',
    })
  }
  return models
}

/** Exact per-model metadata (context window, output cap, reasoning efforts). */
export async function enrichModels(service: ServiceLookup, providerId: string, models: ModelEntry[]): Promise<ModelEntry[]> {
  const llm = service<LlmService>('llm')
  if (llm === undefined || typeof llm.resolveModelInfo !== 'function') return models
  const resolve = llm.resolveModelInfo
  const targets = models.slice(0, DETAIL_MODEL_CAP)
  const enriched = new Map<string, Partial<ModelEntry>>()
  let cursor = 0
  const worker = async () => {
    while (cursor < targets.length) {
      const index = cursor
      cursor += 1
      const model = targets[index]
      try {
        const info = await resolve(providerId, model.id)
        if (isRecord(info)) {
          enriched.set(model.id, {
            contextWindow: isRecord(info.context) && typeof info.context.contextWindow === 'number' ? info.context.contextWindow : undefined,
            maxTokens: typeof info.defaultMaxTokens === 'number' ? info.defaultMaxTokens : undefined,
            inputModalities: Array.isArray(info.inputModalities) ? info.inputModalities.filter((item): item is string => typeof item === 'string') : undefined,
            reasoning: isRecord(info.reasoning) && Array.isArray(info.reasoning.efforts)
              ? {
                  efforts: info.reasoning.efforts.filter(isRecord).map((effort) => ({
                    id: String(effort.id ?? ''),
                    name: String(effort.name ?? effort.id ?? ''),
                  })),
                  defaultEffort: asString(info.reasoning.defaultEffort),
                }
              : undefined,
          })
        }
      } catch (error) {
        enriched.set(model.id, { detailError: errorText(error) })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, targets.length) }, worker))
  return models.map((model) => {
    const detail = enriched.get(model.id)
    return detail === undefined ? model : { ...model, ...detail }
  })
}
