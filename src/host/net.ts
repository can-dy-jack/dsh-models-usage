/**
 * Balance transport.
 *
 * Preferred transport is one bounded node subprocess: the API key travels only
 * over the child's stdin, so it never reaches argv, the host's logs, or any
 * output. When the subprocess seam is absent, the shipped adapters' own
 * approach — global `fetch` in the Host process — is used instead.
 */

import { errorText, isRecord, asString } from '../shared'
import type { SandboxPolicyService, ServiceLookup, SpawnHandle, SubprocessService } from './context'
import { HTTP_TIMEOUT_MS, DEFAULTS, type PluginOptions } from './options'

/** Child process body: reads a request spec on stdin and prints `{status, body}`. */
const REQUEST_SCRIPT = [
  "let raw='';",
  "process.stdin.setEncoding('utf8');",
  "process.stdin.on('data',chunk=>{raw+=chunk});",
  "process.stdin.on('end',async()=>{",
  '  let out;',
  '  try {',
  '    const spec=JSON.parse(raw);',
  '    const response=await fetch(spec.url,{method:spec.method||"GET",headers:spec.headers||{},signal:AbortSignal.timeout(spec.timeoutMs||15000)});',
  '    out={status:response.status,body:await response.text()};',
  '  } catch (error) {',
  '    out={status:0,body:String((error&&error.message)||error)};',
  '  }',
  '  process.stdout.write(JSON.stringify(out));',
  '});',
].join('\n')

export interface JsonResponse {
  ok: boolean
  status?: number
  error?: string
  data?: unknown
}

function interpret(status: number, body: string): JsonResponse {
  if (status === 0) return { ok: false, status, error: `网络请求失败: ${body.slice(0, 300)}` }
  if (status === 401 || status === 403) return { ok: false, status, error: `凭据无效或已过期 (HTTP ${String(status)})` }
  if (status === 429) return { ok: false, status, error: '请求过于频繁 (HTTP 429)，请稍后重试' }
  if (status < 200 || status >= 300) return { ok: false, status, error: `接口返回 HTTP ${String(status)}: ${body.slice(0, 300)}` }
  try {
    return { ok: true, status, data: JSON.parse(body) }
  } catch (error) {
    return { ok: false, status, error: `响应不是 JSON: ${errorText(error)}` }
  }
}

async function directRequest(url: string, headers: Record<string, string>, signal: AbortSignal | undefined): Promise<JsonResponse> {
  if (typeof fetch !== 'function') return { ok: false, error: '宿主进程没有可用的 fetch' }
  const timeout = AbortSignal.timeout(HTTP_TIMEOUT_MS)
  const combined = signal !== undefined && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([signal, timeout])
    : timeout
  try {
    const response = await fetch(url, { method: 'GET', headers, signal: combined })
    return interpret(response.status, await response.text())
  } catch (error) {
    return interpret(0, errorText(error))
  }
}

export async function requestJson(service: ServiceLookup, url: string, headers: Record<string, string>, signal: AbortSignal | undefined): Promise<JsonResponse> {
  const subprocess = service<SubprocessService>('subprocess')
  if (subprocess === undefined || typeof subprocess.resolveExecutable !== 'function' || typeof subprocess.spawn !== 'function') {
    return directRequest(url, headers, signal)
  }
  let node: string
  try {
    node = await subprocess.resolveExecutable('node')
  } catch {
    try {
      node = await subprocess.resolveExecutable('node.exe')
    } catch {
      return directRequest(url, headers, signal)
    }
  }
  let cwd = '.'
  const policy = service<SandboxPolicyService>('sandboxPolicy')
  if (isRecord(policy) && typeof policy.workspaceRoot === 'string' && policy.workspaceRoot.length > 0) {
    cwd = policy.workspaceRoot
  }
  let handle: SpawnHandle
  try {
    handle = subprocess.spawn({
      argv: [node, '-e', REQUEST_SCRIPT],
      cwd,
      stdio: {
        stdin: { data: JSON.stringify({ url, method: 'GET', headers, timeoutMs: HTTP_TIMEOUT_MS }) },
        stdout: { mode: 'collect', maxBytes: 200_000 },
        stderr: { mode: 'collect', maxBytes: 4_096 },
      },
      graceMs: 5_000,
      signal,
    })
  } catch {
    return directRequest(url, headers, signal)
  }
  let outcome: { exitCode: number }
  try {
    outcome = await handle.done
  } catch (error) {
    return { ok: false, error: `查询子进程异常: ${errorText(error)}` }
  }
  if (outcome.exitCode !== 0) {
    let detail = ''
    const stderr = handle.collected.stderr
    if (stderr !== undefined) detail = stderr.readFrom(0).text.trim().slice(0, 300)
    return { ok: false, error: `查询子进程退出码 ${String(outcome.exitCode)}${detail.length > 0 ? `: ${detail}` : ''}` }
  }
  let parsed: { status?: unknown; body?: unknown }
  try {
    const stdout = handle.collected.stdout
    parsed = JSON.parse((stdout !== undefined ? stdout.readFrom(0).text : '') || '{}')
  } catch (error) {
    return { ok: false, error: `无法解析查询结果: ${errorText(error)}` }
  }
  const status = typeof parsed.status === 'number' ? parsed.status : 0
  const body = typeof parsed.body === 'string' ? parsed.body : ''
  return interpret(status, body)
}

export function clientMetadata(options: PluginOptions): { version: string; locale: string; timezoneOffsetSeconds: number } {
  return {
    version: asString(options.clientVersion) ?? asString(process.env.DSH_CLIENT_VERSION) ?? DEFAULTS.clientVersion,
    locale: asString(options.locale) ?? DEFAULTS.locale,
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  }
}
