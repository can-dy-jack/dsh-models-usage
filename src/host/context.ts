/**
 * Host service surfaces (structural; only what this plugin touches).
 *
 * The real services are Cordis-registered host internals without published
 * types, so every member is declared optional and call sites keep the
 * `typeof x === 'function'` guards — an absent service degrades, never throws.
 */

export interface LlmService {
  listProviders?(): unknown
  listConfigurableProviders?(): unknown
  listModels?(provider: string): unknown
  resolveModelInfo?(provider: string, model: string): unknown
}

export interface SettingsService {
  describe?(): unknown
}

export interface CredentialsService {
  describe?(ref: string): Promise<unknown>
  resolve?(ref: string): Promise<unknown>
  describeRecord?(key: string): Promise<unknown>
  readRecord?(key: string): Promise<unknown>
}

export interface CollectedOutput {
  readFrom(offset: number): { text: string }
}

export interface SpawnHandle {
  done: Promise<{ exitCode: number }>
  collected: { stdout?: CollectedOutput; stderr?: CollectedOutput }
}

export interface SubprocessService {
  resolveExecutable?(name: string): Promise<string>
  spawn?(spec: {
    argv: string[]
    cwd: string
    stdio: {
      stdin: { data: string }
      stdout: { mode: 'collect'; maxBytes: number }
      stderr: { mode: 'collect'; maxBytes: number }
    }
    graceMs: number
    signal?: AbortSignal
  }): SpawnHandle
}

export interface DeepseekAccountService {
  getBalance?(client: { version: string; locale: string; timezoneOffsetSeconds: number }): Promise<unknown>
}

export interface SandboxPolicyService {
  workspaceRoot?: string
}

export interface CommandInvocation {
  rawInput?: unknown
}

export interface CommandResult {
  kind: 'success' | 'error'
  text: string
}

export interface CommandsService {
  register(command: {
    name: string
    description: string
    input?: { hint: string }
    recordInput?: boolean
    handler(invocation: CommandInvocation): Promise<CommandResult>
  }): unknown
}

export interface ToolsService {
  register(tool: unknown): unknown
}

/** The slice of the Cordis plugin context this bundle uses. */
export interface PluginContext {
  get(serviceName: string): unknown
  commands: CommandsService
  tools: ToolsService
}

/**
 * Safe service lookup: `ctx.get` throws when a service is not mounted, which is
 * reported to callers as `undefined` so every use site can degrade gracefully.
 */
export type ServiceLookup = <T>(serviceName: string) => T | undefined

export function createServiceLookup(ctx: { get(serviceName: string): unknown }): ServiceLookup {
  return <T>(serviceName: string): T | undefined => {
    try {
      return ctx.get(serviceName) as T | undefined
    } catch {
      return undefined
    }
  }
}
