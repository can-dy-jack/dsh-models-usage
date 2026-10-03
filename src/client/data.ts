/**
 * Host payload reads through the built-in `commands` Remote namespace — this
 * bundle needs no generated Remote artifacts of its own.
 */

import { isRecord } from '../shared'
import type { UsagePayload } from '../payload'
import { React } from './react'
import type { ClientContext } from './context'

export type ReadResult = { ok: true; payload: UsagePayload } | { ok: false; error: string }
export type Reader = (sessionId: string | undefined, detail: boolean) => Promise<ReadResult>

export type PayloadState =
  | { kind: 'loading' }
  | { kind: 'ready'; payload: UsagePayload }
  | { kind: 'error'; error: string }

/** Read the Host payload through the built-in commands namespace. */
export function createReader(ctx: ClientContext): Reader {
  return async function read(sessionId: string | undefined, detail: boolean): Promise<ReadResult> {
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      return { ok: false, error: 'no-session' }
    }
    const line = '/dsh-models-usage ' + (detail ? 'detail' : 'summary')
    try {
      // The client Remote validates the business argument count: three
      // (agentId, line, submittedAttachments) plus an optional AbortSignal.
      const execution = await ctx.remote.commands.execute(sessionId, line, [])
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
      if (text === undefined || text.length === 0) {
        return { ok: false, error: 'empty-result' }
      }
      return { ok: true, payload: JSON.parse(text) as UsagePayload }
    } catch (error) {
      return { ok: false, error: String((error as { message?: unknown } | null)?.message || error) }
    }
  }
}

export function usePayload(read: Reader, sessionId: string | undefined, detail: boolean, manualToken: number): PayloadState {
  const [state, setState] = React.useState<PayloadState>({ kind: 'loading' })
  React.useEffect(() => {
    let disposed = false
    setState((previous) => (previous.kind === 'ready' ? previous : { kind: 'loading' }))
    read(sessionId, detail).then((result) => {
      if (disposed) return
      if (result.ok) setState({ kind: 'ready', payload: result.payload })
      else setState({ kind: 'error', error: result.error })
    })
    return () => { disposed = true }
  }, [sessionId, detail, manualToken])
  return state
}
