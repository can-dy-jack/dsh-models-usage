/**
 * Shared payload contract between the Host half (`index.ts`, producer) and the
 * browser half (`client.ts`, consumer). Type aliases (not interfaces) so the
 * shapes stay assignable to recursive JSON types like `JsonValue`.
 */

export type ReasoningEffort = {
  id: string
  name: string
}

export type ModelReasoning = {
  efforts: ReasoningEffort[]
  defaultEffort?: string
}

export type ModelEntry = {
  id: string
  name: string
  description?: string
  contextWindow?: number
  maxTokens?: number
  inputModalities?: string[]
  reasoning?: ModelReasoning
  /** 'settings' when the model came from config rather than the adapter catalog. */
  source?: string
  detailError?: string
}

export type CredentialInfo = {
  ref: string
  configured: boolean
  source?: string
  writable?: boolean
  kind?: string
  unknown?: boolean
  error?: string
}

export type Wallet = {
  currency: string
  balance: string
  granted?: string
  toppedUp?: string
  /** Moonshot reports cash (possibly debt) and vouchers separately. */
  cash?: string
  voucher?: string
  kind: string
}

export type BalanceStatus =
  | 'ready'
  | 'unsupported'
  | 'no-credential'
  | 'failed'
  | 'unavailable'
  | 'not-signed-in'

/** Account quota; the API does not promise a token/request unit for counts. */
export type QuotaWindow = {
  id: string
  name?: string
  windowSeconds?: number
  usedPercent: number
  remainingPercent: number
  resetAt?: string
  limit?: number
  used?: number
  remaining?: number
}

export type BalanceInfo = {
  status: BalanceStatus
  /** Card balance/status read time, preserved when a failed refresh retains it. */
  fetchedAt?: string
  refreshError?: string
  message?: string
  link?: string
  endpoint?: string
  isAvailable?: boolean
  wallets?: Wallet[]
  bonusWallets?: Wallet[]
  quotas?: QuotaWindow[]
}

export type ProviderEntry = {
  id: string
  displayName: string
  active: boolean
  declared: boolean
  settingsNs?: string
  settingsPath?: string[]
  baseURL?: string
  api?: string
  configError?: string
  credential: CredentialInfo | null
  balance: BalanceInfo
  modelCount: number
  models: ModelEntry[]
}

export type UsagePayload = {
  ok: true
  command: string
  detail: boolean
  fetchedAt: string
  /** Remaining Host freshness at response time; avoids renewing an older cache. */
  cacheRemainingMs?: number
  providers: ProviderEntry[]
  counts: {
    providers: number
    activeProviders: number
    models: number
  }
}
