/**
 * Persistence for user-defined queries: one JSON file of templates (never a
 * secret), written atomically with owner-only permissions.
 */

import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { errorText, isRecord } from '../shared'
import { validateCustomQuery, type CustomQuery, type CustomQueryStore } from '../custom-query'
import type { PluginOptions } from './options'

export function customStorePath(options: PluginOptions): string {
  if (typeof options.customQueryFile === 'string' && options.customQueryFile.length > 0) return options.customQueryFile
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.length > 0 ? process.env.DSH_HOME : join(homedir(), '.dsh')
  return join(home, 'storages', 'dsh-models-usage.custom-queries.json')
}

export type LoadedStore = { store: CustomQueryStore; error?: string }

/** A missing file is an empty store; a damaged one degrades to empty with an error. */
export function loadCustomStore(options: PluginOptions): LoadedStore {
  let raw: string
  try {
    raw = readFileSync(customStorePath(options), 'utf8')
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') return { store: { version: 1, queries: {} } }
    return { store: { version: 1, queries: {} }, error: `自定义查询配置读取失败: ${errorText(error)}` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return { store: { version: 1, queries: {} }, error: `自定义查询配置已损坏: ${errorText(error)}` }
  }
  const queries: Record<string, CustomQuery> = {}
  const errors: string[] = []
  for (const [providerId, entry] of Object.entries(isRecord(parsed) && isRecord(parsed.queries) ? parsed.queries : {})) {
    const result = validateCustomQuery(entry)
    if (result.ok) queries[providerId] = result.query
    else errors.push(`${providerId}: ${result.errors.join('；')}`)
  }
  return { store: { version: 1, queries }, ...(errors.length > 0 ? { error: `自定义查询配置无效: ${errors.join(' / ')}` } : {}) }
}

export function saveCustomStore(options: PluginOptions, store: CustomQueryStore): void {
  const path = customStorePath(options)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temp, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 })
  renameSync(temp, path)
  try { chmodSync(path, 0o600) } catch { /* best effort on filesystems without modes */ }
}

export function readCustomQuery(options: PluginOptions, providerId: string): { query?: CustomQuery; error?: string } {
  const loaded = loadCustomStore(options)
  return { query: loaded.store.queries[providerId], error: loaded.error }
}

export function writeCustomQuery(options: PluginOptions, providerId: string, query: CustomQuery | undefined): void {
  const loaded = loadCustomStore(options)
  if (loaded.error !== undefined && /读取失败/.test(loaded.error)) throw new Error(loaded.error)
  const queries = { ...loaded.store.queries }
  if (query === undefined) delete queries[providerId]
  else queries[providerId] = query
  saveCustomStore(options, { version: 1, queries })
}
