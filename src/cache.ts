/** Cache policy and projections shared by the Host and browser bundles. */

import type { UsagePayload } from './payload'

export const CACHE_TTL_MS = 60_000
export const CACHE_RETRY_MS = 15_000

export function projectPayload(payload: UsagePayload, detail: boolean): UsagePayload {
  return detail ? payload : {
    ...payload,
    detail: false,
    providers: payload.providers.map((provider) => ({ ...provider, models: [] })),
  }
}

/** Keep a previously read balance on a failed update, with its original age. */
export function retainBalances(previous: UsagePayload | undefined, next: UsagePayload): UsagePayload {
  const byId = new Map(previous?.providers.map((provider) => [provider.id, provider]))
  return {
    ...next,
    providers: next.providers.map((provider) => {
      const old = byId.get(provider.id)
      if (provider.balance.status !== 'failed' || old?.balance.status !== 'ready'
        || old.baseURL !== provider.baseURL
        // Switching between built-in and custom queries must not keep the other source's value.
        || old.balance.source !== provider.balance.source
        || old.settingsNs !== provider.settingsNs
        || old.credential?.ref !== provider.credential?.ref
        || old.credential?.source !== provider.credential?.source
        || old.credential?.kind !== provider.credential?.kind
        || old.credential?.configured !== provider.credential?.configured) {
        // Each card owns its timestamp, including unsupported/missing-key states.
        // A scoped refresh must not change the time on any other card.
        return { ...provider, balance: { ...provider.balance, fetchedAt: provider.balance.fetchedAt ?? next.fetchedAt } }
      }
      return {
        ...provider,
        balance: {
          ...old.balance,
          fetchedAt: old.balance.fetchedAt ?? previous?.fetchedAt,
          refreshError: provider.balance.message || 'balance-query-failed',
        },
      }
    }),
  }
}

export function hasBalanceFailure(payload: UsagePayload): boolean {
  return payload.providers.some((provider) => provider.balance.status === 'failed' || provider.balance.refreshError !== undefined)
}

/** Replace only providers present in a scoped response, keeping other entries. */
export function mergeProviderPayload(previous: UsagePayload, update: UsagePayload): UsagePayload {
  const byId = new Map(update.providers.map((provider) => [provider.id, provider]))
  const providers = previous.providers.map((provider) => byId.get(provider.id) ?? provider)
  return {
    ...previous,
    fetchedAt: update.fetchedAt,
    providers,
    counts: {
      providers: providers.length,
      activeProviders: providers.filter((provider) => provider.active).length,
      models: providers.reduce((total, provider) => total + provider.modelCount, 0),
    },
  }
}
