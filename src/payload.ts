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
  kind: string
}

export type BalanceStatus =
  | 'ready'
  | 'unsupported'
  | 'no-credential'
  | 'failed'
  | 'unavailable'
  | 'not-signed-in'

export type BalanceInfo = {
  status: BalanceStatus
  message?: string
  link?: string
  endpoint?: string
  isAvailable?: boolean
  wallets?: Wallet[]
  bonusWallets?: Wallet[]
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
  providers: ProviderEntry[]
  counts: {
    providers: number
    activeProviders: number
    models: number
  }
}
