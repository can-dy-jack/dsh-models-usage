/** Payload assembly: per-provider collection, caching, and the loader entry. */

import { asString } from '../shared'
import { CACHE_RETRY_MS, CACHE_TTL_MS, hasBalanceFailure, mergeProviderPayload, projectPayload, retainBalances } from '../cache'
import type { CredentialInfo, ProviderEntry, UsagePayload } from '../payload'
import type { ServiceLookup } from './context'
import { providerBalance } from './balance'
import { describeCredential, describeRecordCredential, resolveRecordSecret, resolveSecret } from './credentials'
import { balanceTarget } from './links'
import { enrichModels, listModels, listProviderEntries, modelsFromConfig, type ProviderDraft } from './models'
import { COMMAND_NAME, type PluginOptions } from './options'
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

async function buildPayload(env: HostEnv, providerId?: string): Promise<UsagePayload> {
  const settingsRows = readSettingsRows(env.service)
  const allEntries = listProviderEntries(env.service, env.options)
  const entries = providerId === undefined ? allEntries : allEntries.filter((entry) => entry.id === providerId)
  if (providerId !== undefined && entries.length === 0) throw new Error(`未找到服务商: ${providerId}`)
  const providers: ProviderEntry[] = []
  for (const entry of entries) {
    providers.push(await collectProvider(env, entry, settingsRows, undefined))
  }
  const payload: UsagePayload = {
    ok: true,
    command: COMMAND_NAME,
    detail: true,
    fetchedAt: new Date().toISOString(),
    providers,
    counts: {
      providers: providers.length,
      activeProviders: providers.filter((provider) => provider.active).length,
      models: providers.reduce((total, provider) => total + provider.modelCount, 0),
    },
  }
  return payload
}

/** Cancelling one caller must not cancel a collection shared with other readers. */
function waitForPayload<T>(pending: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return pending
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => { reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

/** One complete cache and collection shared by summary/detail/refresh and tools. */
export function createPayloadLoader(env: HostEnv): (detail: boolean, signal: AbortSignal | undefined, force?: boolean, providerId?: string) => Promise<UsagePayload> {
  let cache: { expiresAt: number; payload: UsagePayload } | undefined
  let pending: Promise<UsagePayload> | undefined
  let failure: { retryAt: number; error: unknown } | undefined
  const scopedPending = new Map<string, Promise<UsagePayload>>()
  return async function payloadFor(detail: boolean, signal: AbortSignal | undefined, force = false, providerId?: string): Promise<UsagePayload> {
    signal?.throwIfAborted()
    if (providerId !== undefined) {
      if (pending !== undefined) {
        // Share an ongoing full collection instead of racing its cache write.
        const payload = await waitForPayload(pending, signal)
        const provider = payload.providers.find((entry) => entry.id === providerId)
        if (provider === undefined) throw new Error(`未找到服务商: ${providerId}`)
        return projectPayload({
          ...payload,
          providers: [provider],
          counts: { providers: 1, activeProviders: provider.active ? 1 : 0, models: provider.modelCount },
          cacheRemainingMs: Math.max(0, (cache?.expiresAt ?? 0) - Date.now()),
        }, detail)
      }
      let request = scopedPending.get(providerId)
      if (request === undefined) {
        request = buildPayload(env, providerId).then((collected) => {
          const payload = retainBalances(cache?.payload, collected)
          const ttl = hasBalanceFailure(payload) ? CACHE_RETRY_MS : CACHE_TTL_MS
          if (cache !== undefined) {
            cache.payload = mergeProviderPayload(cache.payload, payload)
            // A provider update must not extend other providers' freshness.
            cache.expiresAt = Math.min(cache.expiresAt, Date.now() + ttl)
          }
          return { ...payload, cacheRemainingMs: ttl }
        }).finally(() => { scopedPending.delete(providerId) })
        scopedPending.set(providerId, request)
      }
      return projectPayload(await waitForPayload(request, signal), detail)
    }
    if (pending === undefined && scopedPending.size > 0) {
      // Finish scoped writes before a full snapshot can replace the cache.
      await waitForPayload(Promise.allSettled(scopedPending.values()), signal)
    }
    if (pending === undefined) {
      if (!force && cache !== undefined && Date.now() < cache.expiresAt) {
        return { ...projectPayload(cache.payload, detail), cacheRemainingMs: cache.expiresAt - Date.now() }
      }
      if (!force && failure !== undefined && Date.now() < failure.retryAt) throw failure.error
      pending = buildPayload(env).then((collected) => {
        const payload = retainBalances(cache?.payload, collected)
        const ttl = hasBalanceFailure(payload) ? CACHE_RETRY_MS : CACHE_TTL_MS
        cache = { expiresAt: Date.now() + ttl, payload }
        failure = undefined
        return payload
      }, (error: unknown) => {
        failure = { retryAt: Date.now() + CACHE_RETRY_MS, error }
        throw error
      }).finally(() => { pending = undefined })
    }
    const payload = await waitForPayload(pending, signal)
    return { ...projectPayload(payload, detail), cacheRemainingMs: Math.max(0, (cache?.expiresAt ?? 0) - Date.now()) }
  }
}
