/**
 * User-defined balance/usage queries, shared by both halves: the Host renders
 * and executes the request, the browser previews the same mapping on a test
 * response. Templates never carry a secret; `{{apiKey}}` is resolved Host-side.
 */

import type { BalanceInfo, QuotaWindow, Wallet } from './payload'
import { isRecord } from './shared'

export type KeyValue = { name: string; value: string }
/** A JSON path into the response, or a fixed literal. */
export type ValueRef = { path?: string; fixed?: string }
export type ResetFormat = 'auto' | 'iso' | 'unix-s' | 'unix-ms' | 'seconds-from-now'
export type QuotaPeriod = 'five-hour' | 'weekly' | 'monthly'
export type WalletKind = 'topped-up' | 'granted' | 'extra-usage'

export type WalletMapping = {
  itemsPath?: string
  kind?: WalletKind
  balance: ValueRef
  currency?: ValueRef
  granted?: ValueRef
  toppedUp?: ValueRef
  cash?: ValueRef
  voucher?: ValueRef
  /** e.g. 100 when the API reports cents. */
  divisor?: number
}

export type QuotaMapping = {
  itemsPath?: string
  name?: ValueRef
  period?: QuotaPeriod
  windowSeconds?: number
  usedPercent?: ValueRef
  remainingPercent?: ValueRef
  /** Percent fields hold a 0–1 ratio instead of 0–100. */
  percentIsRatio?: boolean
  used?: ValueRef
  limit?: ValueRef
  remaining?: ValueRef
  resetAt?: ValueRef
  resetFormat?: ResetFormat
}

export type CustomQuery = {
  enabled: boolean
  /** Credential reference to use instead of the provider's model key. */
  credentialRef?: string
  request: { method: 'GET' | 'POST'; url: string; headers: KeyValue[]; query: KeyValue[]; body?: string }
  success?: { path: string; equals?: string }
  errorMessagePath?: string
  wallets: WalletMapping[]
  quotas: QuotaMapping[]
}

export type CustomQueryStore = { version: 1; queries: Record<string, CustomQuery> }

export const CUSTOM_QUERY_MAX_BYTES = 64 * 1024
export const CUSTOM_QUERY_MAX_RULES = 20
export const TEMPLATE_VARIABLES = ['apiKey', 'baseURL', 'origin', 'providerId', 'now.iso', 'now.unix', 'monthStart.iso', 'today'] as const
export type TemplateVariable = typeof TEMPLATE_VARIABLES[number]
export type TemplateVars = Partial<Record<TemplateVariable, string>>

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g

export function defaultCustomQuery(): CustomQuery {
  return {
    enabled: true,
    request: {
      method: 'GET', url: '{{origin}}/',
      headers: [{ name: 'Authorization', value: 'Bearer {{apiKey}}' }, { name: 'Accept', value: 'application/json' }],
      query: [],
    },
    wallets: [{ balance: { path: '' }, currency: { fixed: 'CNY' } }],
    quotas: [],
  }
}

// ─── Paths ─────────────────────────────────────────────────────────────────

type Segment = string | number | '*'

/** `a.b[0].c`, `items[*]`, `["odd key"]`; an empty path is the root. */
export function parsePath(path: string): Segment[] | undefined {
  const segments: Segment[] = []
  const source = path.trim()
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === '.') {
      if (index === 0 || index === source.length - 1 || source[index + 1] === '.' || source[index + 1] === '[') return undefined
      index += 1
      continue
    }
    if (char === '[') {
      const close = source.indexOf(']', index)
      if (close < 0) return undefined
      const inner = source.slice(index + 1, close).trim()
      if (inner === '*') segments.push('*')
      else if (/^\d+$/.test(inner)) segments.push(Number(inner))
      else if (/^(["']).*\1$/.test(inner)) segments.push(inner.slice(1, -1))
      else return undefined
      index = close + 1
      continue
    }
    let end = index
    while (end < source.length && source[end] !== '.' && source[end] !== '[') end += 1
    segments.push(source.slice(index, end))
    index = end
  }
  return segments
}

function step(node: unknown, segment: Segment): unknown {
  if (typeof segment === 'number') return Array.isArray(node) ? node[segment] : undefined
  if (isRecord(node)) return node[segment as string]
  if (Array.isArray(node) && /^\d+$/.test(String(segment))) return node[Number(segment)]
  return undefined
}

/** Read one value; `[*]` is not allowed here (use `expandItems`). */
export function getPath(data: unknown, path: string | undefined): unknown {
  if (path === undefined) return undefined
  const segments = parsePath(path)
  if (segments === undefined || segments.includes('*')) return undefined
  let node = data
  for (const segment of segments) {
    node = step(node, segment)
    if (node === undefined) return undefined
  }
  return node
}

/** Expand every `[*]`; no itemsPath means the whole response is one item. */
export function expandItems(data: unknown, itemsPath: string | undefined): unknown[] {
  if (itemsPath === undefined || itemsPath.trim().length === 0) return [data]
  const segments = parsePath(itemsPath)
  if (segments === undefined) return []
  let nodes: unknown[] = [data]
  for (const segment of segments) {
    const next: unknown[] = []
    for (const node of nodes) {
      if (segment === '*') {
        if (Array.isArray(node)) next.push(...node)
        else if (isRecord(node)) next.push(...Object.values(node))
      } else {
        const value = step(node, segment)
        if (value !== undefined) next.push(value)
      }
    }
    nodes = next
  }
  return nodes
}

// ─── Templates ─────────────────────────────────────────────────────────────

export function templateVariables(input: { providerId: string; baseURL?: string; apiKey?: string; now?: Date }): TemplateVars {
  const now = input.now ?? new Date()
  let origin: string | undefined
  try { origin = input.baseURL === undefined ? undefined : new URL(input.baseURL).origin } catch { origin = undefined }
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return {
    apiKey: input.apiKey,
    baseURL: input.baseURL?.replace(/\/+$/, ''),
    origin,
    providerId: input.providerId,
    'now.iso': now.toISOString(),
    'now.unix': String(Math.floor(now.getTime() / 1000)),
    'monthStart.iso': monthStart.toISOString(),
    today: now.toISOString().slice(0, 10),
  }
}

export function usesVariable(query: CustomQuery, name: TemplateVariable): boolean {
  const texts = [query.request.url, query.request.body ?? '',
    ...query.request.headers.flatMap((entry) => [entry.name, entry.value]),
    ...query.request.query.flatMap((entry) => [entry.name, entry.value])]
  return texts.some((text) => Array.from(text.matchAll(PLACEHOLDER)).some((match) => match[1] === name))
}

function unknownPlaceholders(text: string): string[] {
  return Array.from(text.matchAll(PLACEHOLDER)).map((match) => match[1])
    .filter((name) => !(TEMPLATE_VARIABLES as readonly string[]).includes(name))
}

/** `url` encodes substituted values except the base URL/origin prefixes. */
export function renderTemplate(text: string, vars: TemplateVars, mode: 'url' | 'raw'): string {
  return text.replace(PLACEHOLDER, (_match, name: string) => {
    const value = vars[name as TemplateVariable]
    if (value === undefined) throw new Error(`占位符 {{${name}}} 没有可用的值`)
    return mode === 'url' && name !== 'baseURL' && name !== 'origin' ? encodeURIComponent(value) : value
  })
}

function renderJson(node: unknown, vars: TemplateVars): unknown {
  if (typeof node === 'string') return renderTemplate(node, vars, 'raw')
  if (Array.isArray(node)) return node.map((item) => renderJson(item, vars))
  if (isRecord(node)) return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, renderJson(value, vars)]))
  return node
}

export type RenderedRequest = { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body?: string }

export function renderRequest(query: CustomQuery, vars: TemplateVars): RenderedRequest {
  const url = new URL(renderTemplate(query.request.url, vars, 'url'))
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('查询 URL 只支持 http/https')
  for (const entry of query.request.query) {
    if (entry.name.trim().length === 0) continue
    url.searchParams.append(renderTemplate(entry.name, vars, 'raw'), renderTemplate(entry.value, vars, 'raw'))
  }
  const headers: Record<string, string> = {}
  for (const entry of query.request.headers) {
    if (entry.name.trim().length === 0) continue
    headers[renderTemplate(entry.name, vars, 'raw').trim()] = renderTemplate(entry.value, vars, 'raw')
  }
  let body: string | undefined
  const rawBody = query.request.body?.trim()
  if (query.request.method === 'POST' && rawBody !== undefined && rawBody.length > 0) {
    let parsed: unknown
    try { parsed = JSON.parse(rawBody) } catch { parsed = undefined }
    // JSON bodies substitute inside string values so the result stays valid JSON.
    body = parsed === undefined ? renderTemplate(rawBody, vars, 'raw') : JSON.stringify(renderJson(parsed, vars))
    if (parsed !== undefined && !Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json'
    }
  }
  return { method: query.request.method, url: url.href, headers, body }
}

// ─── Validation ────────────────────────────────────────────────────────────

function text(value: unknown, max = 4096): string | undefined {
  return typeof value === 'string' && value.length <= max ? value : undefined
}

function valueRef(raw: unknown, errors: string[], label: string): ValueRef | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isRecord(raw)) { errors.push(`${label} 格式错误`); return undefined }
  const path = text(raw.path, 512)?.trim()
  const fixed = text(raw.fixed, 256)
  if (path !== undefined && path.length > 0) {
    const segments = parsePath(path)
    if (segments === undefined || segments.includes('*')) errors.push(`${label} 路径无效: ${path}`)
    return { path }
  }
  if (fixed !== undefined && fixed.length > 0) return { fixed }
  return undefined
}

function itemsPath(raw: unknown, errors: string[], label: string): string | undefined {
  const path = text(raw, 512)?.trim()
  if (path === undefined || path.length === 0) return undefined
  if (parsePath(path) === undefined) errors.push(`${label} 数组路径无效: ${path}`)
  return path
}

function keyValues(raw: unknown, errors: string[], label: string): KeyValue[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > 50) { errors.push(`${label} 格式错误`); return [] }
  const entries: KeyValue[] = []
  for (const entry of raw) {
    const name = isRecord(entry) ? text(entry.name, 256) : undefined
    const value = isRecord(entry) ? text(entry.value) : undefined
    if (name === undefined || value === undefined) { errors.push(`${label} 条目格式错误`); continue }
    if (name.trim().length === 0 && value.trim().length === 0) continue
    if (name.trim().length === 0) { errors.push(`${label} 缺少名称`); continue }
    entries.push({ name: name.trim(), value })
  }
  return entries
}

const PERIODS: readonly QuotaPeriod[] = ['five-hour', 'weekly', 'monthly']
const KINDS: readonly WalletKind[] = ['topped-up', 'granted', 'extra-usage']
const RESET_FORMATS: readonly ResetFormat[] = ['auto', 'iso', 'unix-s', 'unix-ms', 'seconds-from-now']

function positive(raw: unknown): number | undefined {
  const number = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim().length > 0 ? Number(raw) : Number.NaN
  return Number.isFinite(number) && number > 0 ? number : undefined
}

export function validateCustomQuery(raw: unknown): { ok: true; query: CustomQuery } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!isRecord(raw) || !isRecord(raw.request)) return { ok: false, errors: ['配置格式错误'] }
  const method = raw.request.method === 'POST' ? 'POST' : raw.request.method === 'GET' || raw.request.method === undefined ? 'GET' : undefined
  if (method === undefined) errors.push('请求方法只支持 GET / POST')
  const url = text(raw.request.url, 2048)?.trim()
  if (url === undefined || url.length === 0) errors.push('缺少查询 URL')
  else if (!/^(https?:\/\/|\{\{\s*(baseURL|origin)\s*\}\})/i.test(url)) errors.push('查询 URL 必须以 http(s):// 或 {{baseURL}} / {{origin}} 开头')
  const body = text(raw.request.body, 16_384)
  const credentialRef = text(raw.credentialRef, 256)?.trim()
  // Omit absent optionals so the stored and round-tripped shapes are identical.
  const query: CustomQuery = {
    enabled: raw.enabled !== false,
    ...(credentialRef ? { credentialRef } : {}),
    request: {
      method: method ?? 'GET', url: url ?? '',
      headers: keyValues(raw.request.headers, errors, 'Header'),
      query: keyValues(raw.request.query, errors, 'Query 参数'),
      ...(body !== undefined && body.trim().length > 0 ? { body } : {}),
    },
    wallets: [],
    quotas: [],
  }
  for (const value of [query.request.url, query.request.body ?? '', ...query.request.headers.flatMap((e) => [e.name, e.value]), ...query.request.query.flatMap((e) => [e.name, e.value])]) {
    for (const name of unknownPlaceholders(value)) errors.push(`未知占位符 {{${name}}}`)
  }
  if (isRecord(raw.success)) {
    const path = text(raw.success.path, 512)?.trim()
    if (path !== undefined && path.length > 0) {
      if (parsePath(path) === undefined) errors.push(`成功条件路径无效: ${path}`)
      const equals = text(raw.success.equals, 256)
      query.success = { path, ...(equals !== undefined && equals.length > 0 ? { equals } : {}) }
    }
  }
  const errorPath = text(raw.errorMessagePath, 512)?.trim()
  if (errorPath !== undefined && errorPath.length > 0) query.errorMessagePath = errorPath
  const wallets = Array.isArray(raw.wallets) ? raw.wallets : []
  const quotas = Array.isArray(raw.quotas) ? raw.quotas : []
  if (wallets.length > CUSTOM_QUERY_MAX_RULES || quotas.length > CUSTOM_QUERY_MAX_RULES) errors.push(`余额/额度规则各最多 ${CUSTOM_QUERY_MAX_RULES} 条`)
  wallets.slice(0, CUSTOM_QUERY_MAX_RULES).forEach((entry, index) => {
    const label = `余额规则 ${index + 1}`
    if (!isRecord(entry)) { errors.push(`${label} 格式错误`); return }
    const balance = valueRef(entry.balance, errors, `${label} 金额`)
    if (balance === undefined) { errors.push(`${label} 缺少金额字段`); return }
    const mapping: WalletMapping = { balance }
    const items = itemsPath(entry.itemsPath, errors, label)
    if (items !== undefined) mapping.itemsPath = items
    if (KINDS.includes(entry.kind as WalletKind)) mapping.kind = entry.kind as WalletKind
    for (const key of ['currency', 'granted', 'toppedUp', 'cash', 'voucher'] as const) {
      const ref = valueRef(entry[key], errors, `${label} ${key}`)
      if (ref !== undefined) mapping[key] = ref
    }
    const divisor = positive(entry.divisor)
    if (divisor !== undefined && divisor !== 1) mapping.divisor = divisor
    query.wallets.push(mapping)
  })
  quotas.slice(0, CUSTOM_QUERY_MAX_RULES).forEach((entry, index) => {
    const label = `额度规则 ${index + 1}`
    if (!isRecord(entry)) { errors.push(`${label} 格式错误`); return }
    const mapping: QuotaMapping = {}
    const items = itemsPath(entry.itemsPath, errors, label)
    if (items !== undefined) mapping.itemsPath = items
    for (const key of ['name', 'usedPercent', 'remainingPercent', 'used', 'limit', 'remaining', 'resetAt'] as const) {
      const ref = valueRef(entry[key], errors, `${label} ${key}`)
      if (ref !== undefined) mapping[key] = ref
    }
    if (PERIODS.includes(entry.period as QuotaPeriod)) mapping.period = entry.period as QuotaPeriod
    const seconds = positive(entry.windowSeconds)
    if (seconds !== undefined) mapping.windowSeconds = seconds
    if (entry.percentIsRatio === true) mapping.percentIsRatio = true
    if (RESET_FORMATS.includes(entry.resetFormat as ResetFormat) && entry.resetFormat !== 'auto') mapping.resetFormat = entry.resetFormat as ResetFormat
    const hasUsage = mapping.usedPercent !== undefined || mapping.remainingPercent !== undefined
      || (mapping.limit !== undefined && (mapping.used !== undefined || mapping.remaining !== undefined))
    if (!hasUsage) errors.push(`${label} 需要百分比字段，或 limit 加 used/remaining`)
    query.quotas.push(mapping)
  })
  if (query.wallets.length === 0 && query.quotas.length === 0) errors.push('至少配置一条余额或额度规则')
  if (JSON.stringify(query).length > CUSTOM_QUERY_MAX_BYTES) errors.push('配置过大')
  return errors.length > 0 ? { ok: false, errors } : { ok: true, query }
}

// ─── Response mapping ──────────────────────────────────────────────────────

function resolve(item: unknown, root: unknown, ref: ValueRef | undefined): unknown {
  if (ref === undefined) return undefined
  if (ref.path !== undefined) {
    // Relative to the expanded item first, then from the response root.
    const relative = getPath(item, ref.path)
    return relative !== undefined || item === root ? relative : getPath(root, ref.path)
  }
  return ref.fixed
}

function number(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  const parsed = Number(value.replace(/[,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

function scalarText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined
}

function amount(value: unknown, divisor: number | undefined): string | undefined {
  const parsed = number(value)
  if (parsed === undefined) return undefined
  if (divisor === undefined || divisor === 1) return typeof value === 'string' ? value.trim() : String(parsed)
  return String(Number((parsed / divisor).toFixed(8)))
}

export function normalizeReset(value: unknown, format: ResetFormat | undefined, now = Date.now()): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const mode = format ?? 'auto'
  const parsed = number(value)
  let time: number | undefined
  if (mode === 'iso' || (mode === 'auto' && parsed === undefined)) {
    const date = Date.parse(String(value))
    time = Number.isFinite(date) ? date : undefined
  } else if (parsed !== undefined) {
    if (mode === 'unix-s') time = parsed * 1000
    else if (mode === 'unix-ms') time = parsed
    else if (mode === 'seconds-from-now') time = now + parsed * 1000
    // auto: >1e12 is milliseconds, >1e9 is seconds, otherwise a relative delay.
    else time = parsed > 1e12 ? parsed : parsed > 1e9 ? parsed * 1000 : now + parsed * 1000
  }
  return time !== undefined && Number.isFinite(time) ? new Date(time).toISOString() : undefined
}

function mapQuota(mapping: QuotaMapping, item: unknown, root: unknown, id: string): QuotaWindow | undefined {
  const ratio = mapping.percentIsRatio === true ? 100 : 1
  const limit = number(resolve(item, root, mapping.limit))
  let used = number(resolve(item, root, mapping.used))
  let remaining = number(resolve(item, root, mapping.remaining))
  if (limit !== undefined && used === undefined && remaining !== undefined) used = Math.max(0, limit - remaining)
  if (limit !== undefined && remaining === undefined && used !== undefined) remaining = Math.max(0, limit - used)
  let usedPercent = number(resolve(item, root, mapping.usedPercent))
  let remainingPercent = number(resolve(item, root, mapping.remainingPercent))
  if (usedPercent !== undefined) usedPercent *= ratio
  if (remainingPercent !== undefined) remainingPercent *= ratio
  if (usedPercent === undefined && remainingPercent !== undefined) usedPercent = 100 - remainingPercent
  if (usedPercent === undefined && limit !== undefined && limit > 0 && used !== undefined) usedPercent = used / limit * 100
  if (usedPercent === undefined || !Number.isFinite(usedPercent)) return undefined
  const clamped = Math.max(0, Math.min(100, usedPercent))
  const quota: QuotaWindow = { id, usedPercent: clamped, remainingPercent: remainingPercent !== undefined ? Math.max(0, Math.min(100, remainingPercent)) : 100 - clamped }
  const name = scalarText(resolve(item, root, mapping.name))
  if (name !== undefined) quota.name = name
  // The UI labels by period before name; a user-mapped name wins.
  if (mapping.period !== undefined && name === undefined) quota.period = mapping.period
  if (mapping.windowSeconds !== undefined) quota.windowSeconds = mapping.windowSeconds
  const resetAt = normalizeReset(resolve(item, root, mapping.resetAt), mapping.resetFormat)
  if (resetAt !== undefined) quota.resetAt = resetAt
  if (limit !== undefined) quota.limit = limit
  if (used !== undefined) quota.used = used
  if (remaining !== undefined) quota.remaining = remaining
  return quota
}

export function mapCustomResponse(query: CustomQuery, data: unknown): BalanceInfo {
  if (query.success !== undefined) {
    const actual = getPath(data, query.success.path)
    const passed = query.success.equals === undefined
      ? actual !== undefined && actual !== null && actual !== false && actual !== 0 && actual !== ''
      : scalarText(actual) === query.success.equals
    if (!passed) {
      const detail = scalarText(getPath(data, query.errorMessagePath))
      return { status: 'failed', message: detail !== undefined ? `接口返回失败: ${detail}` : '接口响应未满足成功条件' }
    }
  }
  const wallets: Wallet[] = []
  for (const mapping of query.wallets) {
    for (const item of expandItems(data, mapping.itemsPath)) {
      const balance = amount(resolve(item, data, mapping.balance), mapping.divisor)
      if (balance === undefined) continue
      const wallet: Wallet = {
        currency: scalarText(resolve(item, data, mapping.currency)) ?? '',
        balance,
        kind: mapping.kind ?? 'topped-up',
      }
      for (const key of ['granted', 'toppedUp', 'cash', 'voucher'] as const) {
        const value = amount(resolve(item, data, mapping[key]), mapping.divisor)
        if (value !== undefined) wallet[key] = value
      }
      wallets.push(wallet)
    }
  }
  const quotas: QuotaWindow[] = []
  query.quotas.forEach((mapping, ruleIndex) => {
    expandItems(data, mapping.itemsPath).forEach((item, itemIndex) => {
      const id = `custom-${ruleIndex + 1}-${itemIndex + 1}`
      const quota = mapQuota(mapping, item, data, id)
      if (quota !== undefined) quotas.push(quota)
    })
  })
  if (wallets.length === 0 && quotas.length === 0) {
    const detail = scalarText(getPath(data, query.errorMessagePath))
    return { status: 'failed', message: detail !== undefined ? `接口返回失败: ${detail}` : '响应中没有找到已配置的余额或额度字段' }
  }
  return { status: 'ready', wallets, quotas, source: 'custom' }
}

// ─── Transport encoding (command lines split on whitespace) ────────────────

export function encodeCommandJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeCommandJson(text: string): unknown {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}
