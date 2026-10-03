/** Payload assembly: per-provider collection, caching, and the loader entry. */

import { asString } from '../shared'
import type { CredentialInfo, ProviderEntry, UsagePayload } from '../payload'
import type { ServiceLookup } from './context'
import { providerBalance } from './balance'
import { describeCredential, describeRecordCredential, resolveRecordSecret, resolveSecret } from './credentials'
import { balanceTarget } from './links'
import { enrichModels, listModels, listProviderEntries, modelsFromConfig, type ProviderDraft } from './models'
import { CACHE_TTL_MS, COMMAND_NAME, type PluginOptions } from './options'
import { configNodeAt, readSettingsRows, type SettingsRow } from './settings'

export interface HostEnv {
  service: ServiceLookup
  options: PluginOptions
}

async function collectProvider(env: HostEnv, entry: ProviderDraft, settingsRows: Map<string, SettingsRow>, signal: AbortSignal | undefined): Promise<ProviderEntry> {
  const settingsNode = configNodeAt(settingsRows, entry.settingsNs, entry.settingsPath)
  const baseURL = asString(settingsNode?.baseURL)
  const apiKeyEnv = asString(settingsNode?.apiKeyEnv)
  const { models: advertised, error: catalogError } = await listModels(env.service, entry.id)
  let models = advertised.length > 0 ? advertised : modelsFromConfig(settingsNode)
  if (env.options.includeModelDetails !== false && models.length > 0) {
    models = await enrichModels(env.service, entry.id, models)
  }

  // Credential: a settings reference first, then the interactive pi-ai record.
  const byReference = await describeCredential(env.service, apiKeyEnv)
  const byRecord = byReference === null || byReference.configured !== true
    ? await describeRecordCredential(env.service, entry.settingsNs, entry.id)
    : undefined
  const credential: CredentialInfo | null = byRecord !== undefined
    ? { ref: byRecord.key, configured: true, source: 'record', kind: byRecord.kind }
    : byReference
  const resolveKey = async (): Promise<string | undefined> => {
    if (apiKeyEnv !== undefined) {
      const value = await resolveSecret(env.service, apiKeyEnv)
      if (value !== undefined && value.length > 0) return value
    }
    if (byRecord !== undefined && byRecord.kind === 'api-key') return resolveRecordSecret(env.service, byRecord.key)
    return undefined
  }
  const label = apiKeyEnv ?? byRecord?.key ?? (balanceTarget(entry.id, baseURL).kind === 'deepseek' ? 'DEEPSEEK_API_KEY' : undefined)

  const balance = await providerBalance(env.service, env.options, entry.id, baseURL, resolveKey, label, signal)
  return {
    id: entry.id,
    displayName: entry.displayName ?? entry.routeName ?? entry.id,
    active: entry.active === true,
    declared: entry.declared === true,
    settingsNs: entry.settingsNs,
    settingsPath: entry.settingsPath,
    baseURL,
    api: asString(settingsNode?.api),
    configError: entry.configError ?? catalogError,
    credential,
    balance,
    modelCount: models.length,
    models,
  }
}

async function buildPayload(env: HostEnv, detail: boolean, signal: AbortSignal | undefined): Promise<UsagePayload> {
  const settingsRows = readSettingsRows(env.service)
  const entries = listProviderEntries(env.service, env.options)
  const providers: ProviderEntry[] = []
  for (const entry of entries) {
    providers.push(await collectProvider(env, entry, settingsRows, signal))
  }
  const payload: UsagePayload = {
    ok: true,
    command: COMMAND_NAME,
    detail: detail === true,
    fetchedAt: new Date().toISOString(),
    providers: providers.map((provider) => (detail === true ? provider : { ...provider, models: [] })),
    counts: {
      providers: providers.length,
      activeProviders: providers.filter((provider) => provider.active).length,
      models: providers.reduce((total, provider) => total + provider.modelCount, 0),
    },
  }
  return payload
}

/** The single payload source shared by the slash command and the model tool. */
export function createPayloadLoader(env: HostEnv): (detail: boolean, signal: AbortSignal | undefined) => Promise<UsagePayload> {
  let cache: { at: number; detail: boolean; payload: UsagePayload } | undefined
  return async function payloadFor(detail: boolean, signal: AbortSignal | undefined): Promise<UsagePayload> {
    const now = Date.now()
    if (cache !== undefined && cache.detail === detail && now - cache.at < CACHE_TTL_MS) return cache.payload
    const payload = await buildPayload(env, detail, signal)
    cache = { at: now, detail, payload }
    return payload
  }
}
