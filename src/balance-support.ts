/** Supported account queries, shared by Host target types and the help dialog. */
export const SUPPORTED_BALANCE_QUERIES = [
  { id: 'deepseek', name: 'supportDeepseekApi', details: 'supportDeepseekApiDetails', credential: 'supportApiKey' },
  { id: 'account', name: 'supportDeepseekAccount', details: 'supportDeepseekAccountDetails', credential: 'supportAccountLogin' },
  { id: 'openrouter', name: 'supportOpenrouter', details: 'supportOpenrouterDetails', credential: 'supportApiKey' },
  { id: 'kimi-coding', name: 'supportKimiCode', details: 'supportKimiCodeDetails', credential: 'supportApiKey' },
] as const

export type SupportedBalanceQueryKind = typeof SUPPORTED_BALANCE_QUERIES[number]['id']
