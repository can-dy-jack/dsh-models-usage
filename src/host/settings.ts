/** Live configuration reads via the `settings` service. */

import { isRecord } from '../shared'
import type { ServiceLookup, SettingsService } from './context'

export interface SettingsRow {
  ns: string
  value?: unknown
}

/** Every active profile entry's live value, keyed by settings namespace. */
export function readSettingsRows(service: ServiceLookup): Map<string, SettingsRow> {
  const settings = service<SettingsService>('settings')
  const rows = new Map<string, SettingsRow>()
  if (settings === undefined || typeof settings.describe !== 'function') return rows
  let described: unknown
  try {
    described = settings.describe()
  } catch {
    return rows
  }
  for (const row of Array.isArray(described) ? described : []) {
    if (isRecord(row) && typeof row.ns === 'string') {
      rows.set(row.ns, { ns: row.ns, value: row.value })
    }
  }
  return rows
}

/** Walk a descriptor's `value` down the provider's settings path. */
export function configNodeAt(settingsRows: Map<string, SettingsRow>, settingsNs: string | undefined, settingsPath: string[] | undefined): Record<string, unknown> | undefined {
  if (settingsNs === undefined) return undefined
  const row = settingsRows.get(settingsNs)
  if (row === undefined) return undefined
  let node: unknown = row.value
  for (const segment of Array.isArray(settingsPath) ? settingsPath : []) {
    if (!isRecord(node)) return undefined
    node = node[segment]
  }
  return isRecord(node) ? node : undefined
}
