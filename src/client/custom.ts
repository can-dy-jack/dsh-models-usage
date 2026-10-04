/** Custom query editor calls over the same `commands` Remote channel. */

import { isRecord } from '../shared'
import { encodeCommandJson, type CustomQuery } from '../custom-query'
import type { BalanceInfo } from '../payload'
import type { ClientContext } from './context'
import { executeCommand } from './data'

export type CustomTest = {
  ok: boolean
  status?: number
  error?: string
  endpoint?: string
  data?: unknown
  text?: string
  truncated?: boolean
  balance: BalanceInfo
}

export type CustomResponse =
  | { ok: true; query?: CustomQuery | null; storePath?: string; storeError?: string; test?: CustomTest }
  | { ok: false; error?: string; errors?: string[] }

export type CustomApi = {
  get(providerId: string): Promise<CustomResponse>
  save(providerId: string, query: CustomQuery): Promise<CustomResponse>
  remove(providerId: string): Promise<CustomResponse>
  test(providerId: string, query: CustomQuery): Promise<CustomResponse>
}

export function createCustomApi(ctx: ClientContext, sessionId: string | undefined): CustomApi {
  const run = async (action: string, providerId: string, query?: CustomQuery): Promise<CustomResponse> => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return { ok: false, error: 'no-session' }
    const args = action + ' provider=' + encodeURIComponent(providerId) + (query === undefined ? '' : ' ' + encodeCommandJson(query))
    const executed = await executeCommand(ctx, sessionId, args)
    if (!executed.ok) return { ok: false, error: executed.error }
    try {
      const value: unknown = JSON.parse(executed.text)
      if (!isRecord(value)) return { ok: false, error: 'invalid-response' }
      if (value.ok !== true) {
        return { ok: false, errors: Array.isArray(value.errors) ? value.errors.map(String) : undefined, error: typeof value.error === 'string' ? value.error : undefined }
      }
      return value as CustomResponse
    } catch (error) {
      return { ok: false, error: String((error as { message?: unknown } | null)?.message || error) }
    }
  }
  return {
    get: (providerId) => run('custom-get', providerId),
    save: (providerId, query) => run('custom-set', providerId, query),
    remove: (providerId) => run('custom-delete', providerId),
    test: (providerId, query) => run('custom-test', providerId, query),
  }
}
