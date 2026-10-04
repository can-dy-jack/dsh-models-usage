/**
 * Executes a user-defined query. The key is resolved only when a template
 * references `{{apiKey}}`, travels through the bounded transport, and is
 * redacted from anything returned to the browser.
 */

import { errorText } from '../shared'
import type { BalanceInfo } from '../payload'
import { mapCustomResponse, renderRequest, templateVariables, usesVariable, type CustomQuery, type RenderedRequest } from '../custom-query'
import type { ServiceLookup } from './context'
import { resolveSecret } from './credentials'
import { consoleLink } from './links'
import { requestRaw } from './net'

export const TEST_RESPONSE_MAX_CHARS = 200_000

export interface CustomTarget {
  service: ServiceLookup
  providerId: string
  baseURL: string | undefined
  /** The provider's model key (settings reference, then credential record). */
  resolveKey: () => Promise<string | undefined>
  signal?: AbortSignal
}

type Prepared = { ok: true; request: RenderedRequest; secret?: string } | { ok: false; balance: BalanceInfo }

async function prepare(target: CustomTarget, query: CustomQuery): Promise<Prepared> {
  const link = consoleLink(target.providerId, target.baseURL)
  let secret: string | undefined
  if (usesVariable(query, 'apiKey')) {
    secret = query.credentialRef !== undefined
      ? await resolveSecret(target.service, query.credentialRef)
      : await target.resolveKey()
    if (secret === undefined || secret.length === 0) {
      return {
        ok: false,
        balance: { status: 'no-credential', message: `未配置 ${query.credentialRef ?? '该服务商的 API Key'}`, link, source: 'custom' },
      }
    }
  }
  try {
    const vars = templateVariables({ providerId: target.providerId, baseURL: target.baseURL, apiKey: secret })
    return { ok: true, request: renderRequest(query, vars), secret }
  } catch (error) {
    return { ok: false, balance: { status: 'failed', message: `自定义查询配置无法生成请求: ${errorText(error)}`, link, source: 'custom' } }
  }
}

function endpointOf(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.origin + parsed.pathname
  } catch {
    return url
  }
}

export function redact(text: string, secret: string | undefined): string {
  return secret === undefined || secret.length < 4 ? text : text.split(secret).join('***')
}

export async function customBalance(target: CustomTarget, query: CustomQuery): Promise<BalanceInfo> {
  const prepared = await prepare(target, query)
  if (!prepared.ok) return prepared.balance
  const { request, secret } = prepared
  const link = consoleLink(target.providerId, target.baseURL)
  const raw = await requestRaw(target.service, request.url, request.headers, target.signal, { method: request.method, body: request.body })
  const endpoint = endpointOf(request.url)
  if (raw.status === undefined) return { status: 'failed', message: redact(raw.error, secret), endpoint, link, source: 'custom' }
  if (raw.status === 0) return { status: 'failed', message: redact(`网络请求失败: ${raw.body.slice(0, 300)}`, secret), endpoint, link, source: 'custom' }
  if (raw.status < 200 || raw.status >= 300) {
    return { status: 'failed', message: redact(`接口返回 HTTP ${raw.status}: ${raw.body.slice(0, 300)}`, secret), endpoint, link, source: 'custom' }
  }
  let data: unknown
  try {
    data = JSON.parse(raw.body)
  } catch (error) {
    return { status: 'failed', message: `响应不是 JSON: ${errorText(error)}`, endpoint, link, source: 'custom' }
  }
  const mapped = mapCustomResponse(query, data)
  return { ...mapped, ...(mapped.message !== undefined ? { message: redact(mapped.message, secret) } : {}), endpoint, link, source: 'custom' }
}

export type CustomTestResult = {
  ok: boolean
  status?: number
  error?: string
  endpoint?: string
  /** Parsed JSON when possible, otherwise the (truncated) text body. */
  data?: unknown
  text?: string
  truncated?: boolean
  balance: BalanceInfo
}

/** One unsaved query run for the editor; the response is returned redacted. */
export async function testCustomQuery(target: CustomTarget, query: CustomQuery): Promise<CustomTestResult> {
  const prepared = await prepare(target, query)
  if (!prepared.ok) return { ok: false, error: prepared.balance.message, balance: prepared.balance }
  const { request, secret } = prepared
  const endpoint = endpointOf(request.url)
  const raw = await requestRaw(target.service, request.url, request.headers, target.signal, { method: request.method, body: request.body })
  if (raw.status === undefined) {
    const error = redact(raw.error, secret)
    return { ok: false, error, endpoint, balance: { status: 'failed', message: error, source: 'custom' } }
  }
  const body = redact(raw.body, secret)
  const truncated = body.length > TEST_RESPONSE_MAX_CHARS
  let data: unknown
  try { data = truncated ? undefined : JSON.parse(body) } catch { data = undefined }
  const httpOk = raw.status >= 200 && raw.status < 300
  const balance: BalanceInfo = raw.status === 0
    ? { status: 'failed', message: `网络请求失败: ${body.slice(0, 300)}`, source: 'custom' }
    : !httpOk ? { status: 'failed', message: `接口返回 HTTP ${raw.status}`, source: 'custom' }
    : data === undefined ? { status: 'failed', message: '响应不是 JSON', source: 'custom' }
    : mapCustomResponse(query, data)
  return {
    ok: raw.status !== 0 && httpOk && data !== undefined,
    status: raw.status,
    endpoint,
    ...(raw.status === 0 ? { error: balance.message } : {}),
    ...(data !== undefined ? { data } : { text: body.slice(0, TEST_RESPONSE_MAX_CHARS) }),
    ...(truncated ? { truncated: true } : {}),
    balance,
  }
}
