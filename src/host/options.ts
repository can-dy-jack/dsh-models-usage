/** Plugin constants and the cordis.patch.yml `config` contract. */

export const COMMAND_NAME = 'dsh-models-usage'
export const ACCOUNT_PROVIDER = 'deepseek-account'
export const OFFICIAL_PROVIDER = 'deepseek-official'
export const HTTP_TIMEOUT_MS = 15_000
export const DETAIL_MODEL_CAP = 120
export const DETAIL_CONCURRENCY = 6

export interface PluginOptions {
  /** `x-client-version` sent on the DeepSeek-account read; override for another build. */
  clientVersion: string
  /** UI locale forwarded to the account read (`zh-CN` or `en`). */
  locale: string
  /** Include per-model context/reasoning metadata in the payload. */
  includeModelDetails: boolean
  /** Also list declared-but-dormant routes (no registered adapter, no models). */
  includeDormantProviders: boolean
  /** Custom query store path; empty uses `$DSH_HOME/storages/dsh-models-usage.custom-queries.json`. */
  customQueryFile: string
}

export const DEFAULTS: PluginOptions = {
  clientVersion: '0.2.0-rc.2',
  locale: 'zh-CN',
  includeModelDetails: true,
  includeDormantProviders: false,
  customQueryFile: '',
}
