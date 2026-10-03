/** Module loader + injected service surfaces (structural). */

import type { ReactLike } from './react'

export type ModuleRequire = (id: string) => ReactLike

export interface ModuleLoader {
  load(entry: { id: string; factory(require: ModuleRequire): unknown }): void
}

declare global {
  interface Window {
    __ModuleLoader__: ModuleLoader
  }
}

/** Slot component props as the shell hands them down. */
export interface SlotProps {
  sessionId?: string
  useSessions?<T>(selector: (state: SessionStore) => T): T
}

export interface SessionRow {
  id?: string
  origin?: string
  retainedBy?: { mainView?: number }
}

export interface SessionStore {
  ids?: string[]
  byId?: Record<string, SessionRow | undefined>
  phase?: string
}

export interface ClientContext {
  slots: {
    inject(name: string, register: () => unknown): void
    register(meta: Record<string, unknown>, component: (props: any) => unknown): unknown
    entries(key: string): readonly unknown[]
  }
  remote: {
    commands: {
      execute(sessionId: string, line: string, submittedAttachments: unknown[], signal?: AbortSignal): Promise<unknown>
    }
  }
  layout: { selectPanel(id: string): void }
}
