/**
 * Host payload reads through the built-in `commands` Remote namespace — this
 * bundle needs no generated Remote artifacts of its own.
 */

import { isRecord } from '../shared'
import { CACHE_RETRY_MS, CACHE_TTL_MS, hasBalanceFailure, mergeProviderPayload, projectPayload, retainBalances } from '../cache'
import type { UsagePayload } from '../payload'
import { React } from './react'
import type { ClientContext } from './context'

export type ReadResult = { ok: true; payload: UsagePayload } | { ok: false; error: string }
export type Reader = {
  (sessionId: string | undefined, detail: boolean, force?: boolean): Promise<ReadResult>
  snapshot(): PayloadState
  subscribe(listener: () => void): () => void
  refreshProvider(sessionId: string | undefined, providerId: string): Promise<ReadResult>
}

export type ProviderRefreshState = { refreshing: boolean; error?: string }

export type PayloadState =
  | { kind: 'loading' }
  | { kind: 'ready'; payload: UsagePayload; refreshing: boolean; refreshError?: string; providerRefreshes?: Record<string, ProviderRefreshState> }
  | { kind: 'error'; error: string }

export type CommandResult = { ok: true; text: string } | { ok: false; error: string }

/** Run one `/dsh-models-usage ...` line and unwrap the Remote envelope to its text. */
export async function executeCommand(ctx: ClientContext, sessionId: string, args: string): Promise<CommandResult> {
  try {
    // The client Remote validates the business argument count: three
    // (agentId, line, submittedAttachments) plus an optional AbortSignal.
    const execution = await ctx.remote.commands.execute(sessionId, '/dsh-models-usage ' + args, [])
    const envelope = isRecord(execution) && typeof execution.ok === 'boolean'
      ? execution
      : { ok: true, value: execution }
    if (envelope.ok !== true) {
      return { ok: false, error: String(envelope.error === undefined ? 'remote-error' : envelope.error) }
    }
    const value = envelope.value
    const result = isRecord(value) && isRecord(value.result) ? value.result : undefined
    if (result === undefined) return { ok: false, error: 'empty-result' }
    if (result.kind === 'error') return { ok: false, error: String(result.text === undefined ? 'command-failed' : result.text) }
    const text = typeof result.text === 'string' ? result.text : undefined
    return text === undefined || text.length === 0 ? { ok: false, error: 'empty-result' } : { ok: true, text }
  } catch (error) {
    return { ok: false, error: String((error as { message?: unknown } | null)?.message || error) }
  }
}

/** Always read the complete payload for the panel's shared cache. */
async function requestPayload(ctx: ClientContext, sessionId: string, force: boolean, providerId?: string): Promise<ReadResult> {
    const args = (force ? 'refresh' : 'detail')
      + (providerId === undefined ? '' : ' provider=' + encodeURIComponent(providerId))
    const executed = await executeCommand(ctx, sessionId, args)
    if (!executed.ok) return executed
    try {
      const payload: unknown = JSON.parse(executed.text)
      if (!isRecord(payload) || payload.ok !== true || payload.detail !== true
        || typeof payload.fetchedAt !== 'string' || !Array.isArray(payload.providers) || !isRecord(payload.counts)) {
        return { ok: false, error: 'invalid-payload' }
      }
      return { ok: true, payload: payload as UsagePayload }
    } catch (error) {
      return { ok: false, error: String((error as { message?: unknown } | null)?.message || error) }
    }
}

/** Memory cache owned by the plugin instance, surviving panel/session remounts. */
export function createReader(ctx: ClientContext): Reader {
  let state: PayloadState = { kind: 'loading' }
  let payload: UsagePayload | undefined
  let expiresAt = 0
  let retryAt = 0
  let lastError: string | undefined
  let pending: Promise<ReadResult> | undefined
  const providerPending = new Map<string, Promise<ReadResult>>()
  const providerRefreshes = new Map<string, ProviderRefreshState>()
  const listeners = new Set<() => void>()
  const publish = (next: PayloadState) => {
    state = next
    for (const listener of listeners) listener()
  }
  const projectResult = (result: ReadResult, detail: boolean): ReadResult => result.ok
    ? { ok: true, payload: projectPayload(result.payload, detail) }
    : result
  const publishReady = () => {
    if (payload !== undefined) publish({
      kind: 'ready', payload, refreshing: pending !== undefined, refreshError: lastError,
      providerRefreshes: Object.fromEntries(providerRefreshes),
    })
  }

  const read = async (sessionId: string | undefined, detail: boolean, force = false): Promise<ReadResult> => {
    // An absent session is caller-local: do not erase another surface's cache.
    if (typeof sessionId !== 'string' || sessionId.length === 0) return { ok: false, error: 'no-session' }
    if (pending !== undefined) return projectResult(await pending, detail)
    if (providerPending.size > 0) {
      if (!force && payload !== undefined) return { ok: true, payload: projectPayload(payload, detail) }
      await Promise.all(providerPending.values())
      return read(sessionId, detail, force)
    }
    if (!force && lastError !== undefined && Date.now() < retryAt) return { ok: false, error: lastError }
    if (!force && payload !== undefined && Date.now() < expiresAt) return { ok: true, payload: projectPayload(payload, detail) }

    pending = requestPayload(ctx, sessionId, force).then((result): ReadResult => {
      if (result.ok) {
        payload = retainBalances(payload, result.payload)
        const remaining = payload.cacheRemainingMs
        const ttl = hasBalanceFailure(payload) ? CACHE_RETRY_MS : CACHE_TTL_MS
        // A cached Host response has only its remaining lifetime, not a new TTL.
        const lifetime = typeof remaining === 'number' && Number.isFinite(remaining)
          ? Math.max(0, Math.min(ttl, remaining))
          : Math.max(0, Math.min(ttl, Date.parse(payload.fetchedAt) + ttl - Date.now()))
        expiresAt = Date.now() + (Number.isFinite(lifetime) ? lifetime : 0)
        lastError = undefined
        retryAt = 0
        providerRefreshes.clear()
        publish({ kind: 'ready', payload, refreshing: false })
        return { ok: true, payload }
      }
      lastError = result.error
      retryAt = Date.now() + CACHE_RETRY_MS
      publish(payload === undefined
        ? { kind: 'error', error: result.error }
        : { kind: 'ready', payload, refreshing: false, refreshError: result.error })
      return result
    }).finally(() => { pending = undefined })
    publish(payload === undefined ? { kind: 'loading' } : { kind: 'ready', payload, refreshing: true })
    return projectResult(await pending, detail)
  }

  const refreshProvider = async (sessionId: string | undefined, providerId: string): Promise<ReadResult> => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return { ok: false, error: 'no-session' }
    const existing = providerPending.get(providerId)
    if (existing !== undefined) return existing
    // The full refresh already includes this provider; share that request.
    if (pending !== undefined) return pending
    if (payload === undefined || !payload.providers.some((provider) => provider.id === providerId)) {
      return { ok: false, error: 'unknown-provider' }
    }
    const request = requestPayload(ctx, sessionId, true, providerId).then((result): ReadResult => {
      if (result.ok && (result.payload.providers.length !== 1 || result.payload.providers[0].id !== providerId)) {
        // An old Host may ignore the scope; never replace every card with it.
        result = { ok: false, error: 'invalid-provider-response' }
      }
      if (result.ok) {
        const update = retainBalances(payload, result.payload)
        payload = mergeProviderPayload(payload!, update)
        if (hasBalanceFailure(update)) expiresAt = Math.min(expiresAt, Date.now() + CACHE_RETRY_MS)
        providerRefreshes.delete(providerId)
        publishReady()
        return { ok: true, payload: update }
      }
      providerRefreshes.set(providerId, { refreshing: false, error: result.error })
      publishReady()
      return result
    }).finally(() => { providerPending.delete(providerId) })
    providerPending.set(providerId, request)
    providerRefreshes.set(providerId, { refreshing: true })
    publishReady()
    return request
  }

  return Object.assign(read, {
    refreshProvider,
    snapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  })
}

export function usePayload(read: Reader, sessionId: string | undefined, detail: boolean, manualToken: number): PayloadState {
  const [, render] = React.useState(0)
  const previousToken = React.useRef(manualToken)
  React.useEffect(() => {
    const unsubscribe = read.subscribe(() => render((value) => value + 1))
    const force = previousToken.current !== manualToken
    previousToken.current = manualToken
    void read(sessionId, detail, force)
    return unsubscribe
  }, [read, sessionId, detail, manualToken])
  if (typeof sessionId !== 'string' || sessionId.length === 0) return { kind: 'error', error: 'no-session' }
  const state = read.snapshot()
  return state.kind === 'ready' ? { ...state, payload: projectPayload(state.payload, detail) } : state
}
