/**
 * Credential probes — describe without ever surfacing a value, resolve the
 * secret only for the in-process balance call.
 */

import { asString, errorText, isRecord } from '../shared'
import type { CredentialInfo } from '../payload'
import type { CredentialsService, ServiceLookup } from './context'

export async function describeCredential(service: ServiceLookup, ref: string | undefined): Promise<CredentialInfo | null> {
  if (ref === undefined) return null
  const credentials = service<CredentialsService>('credentials')
  if (credentials === undefined || typeof credentials.describe !== 'function') {
    return { ref, configured: false, unknown: true }
  }
  try {
    const described = await credentials.describe(ref)
    if (isRecord(described)) {
      return {
        ref,
        configured: described.configured === true,
        source: asString(described.source),
        writable: described.writable === true,
      }
    }
    return { ref, configured: false }
  } catch (error) {
    return { ref, configured: false, error: errorText(error) }
  }
}

export async function resolveSecret(service: ServiceLookup, ref: string): Promise<string | undefined> {
  const credentials = service<CredentialsService>('credentials')
  if (credentials === undefined || typeof credentials.resolve !== 'function') return undefined
  try {
    const resolved = await credentials.resolve(ref)
    if (typeof resolved === 'string') return resolved
    if (isRecord(resolved) && typeof resolved.value === 'string') return resolved.value
    return undefined
  } catch {
    return undefined
  }
}

export interface RecordCredential {
  key: string
  kind?: string
  writable?: boolean
}

/**
 * Interactive pi-ai routes authenticate from a credential *record*
 * (`<settingsNs>/<providerId>`) instead of a reference. Presence is reported
 * by `describeRecord`; only an `api-key` record can serve a balance call.
 */
export async function describeRecordCredential(service: ServiceLookup, settingsNs: string | undefined, providerId: string): Promise<RecordCredential | undefined> {
  if (settingsNs === undefined) return undefined
  const credentials = service<CredentialsService>('credentials')
  if (credentials === undefined || typeof credentials.describeRecord !== 'function') return undefined
  const key = `${settingsNs}/${providerId}`
  try {
    const described = await credentials.describeRecord(key)
    if (isRecord(described) && described.configured === true) {
      return { key, kind: asString(described.kind), writable: described.writable === true }
    }
  } catch {
    return undefined
  }
  return undefined
}

export async function resolveRecordSecret(service: ServiceLookup, key: string): Promise<string | undefined> {
  const credentials = service<CredentialsService>('credentials')
  if (credentials === undefined || typeof credentials.readRecord !== 'function') return undefined
  try {
    const record = await credentials.readRecord(key)
    if (isRecord(record) && record.kind === 'api-key' && typeof record.key === 'string') return record.key
    return undefined
  } catch {
    return undefined
  }
}
