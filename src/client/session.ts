/** Resolving "which session is active" from slot props / the session store. */

import { isRecord } from '../shared'
import type { SessionStore, SlotProps } from './context'

/**
 * The session the main view is showing. The store state is
 * `{ ids, byId, phase }` — there is no `current` field — so the active
 * session is the row retained by the main view, exactly as the shipped
 * `ui-session` / `ui-settings-general` pages select it.
 */
export function currentSessionId(state: SessionStore): string | undefined {
  const byId = isRecord(state.byId) ? state.byId : undefined
  if (byId === undefined) return undefined
  const main = Object.values(byId).find((session) => (session?.retainedBy?.mainView ?? 0) > 0)
  if (main !== undefined && typeof main.id === 'string') return main.id
  for (const id of Array.isArray(state.ids) ? state.ids : []) {
    const row = byId[id]
    if (row && row.origin !== 'subagent' && typeof row.id === 'string') return row.id
  }
  return undefined
}

/** A session id from slot props: the explicit one first, then the session store. */
export function sessionIdFromProps(props: SlotProps): string | undefined {
  if (props !== null && typeof props === 'object' && typeof props.sessionId === 'string' && props.sessionId.length > 0) {
    return props.sessionId
  }
  if (props !== null && typeof props === 'object' && typeof props.useSessions === 'function') {
    return props.useSessions(currentSessionId)
  }
  return undefined
}
