/** zh/en copy tables and the tiny templating helper. */

export type Translate = (key: string, values?: Record<string, unknown>) => string

const COPY: Record<string, Record<string, string>> = {
  zh: {
    nav: '模型用量与余额',
    openPanel: '打开模型用量与余额面板',
    title: '模型清单与余额',
    subtitle: '{providers} 个服务商 · {models} 个模型',
    refresh: '刷新',
    refreshing: '刷新中…',
    updatedAt: '更新于 {time}',
    noSession: '未找到活动会话：请先打开任意会话，再点「刷新」。',
    empty: '未发现任何服务商。',
    loading: '正在读取模型清单…',
    failed: '读取失败：{error}',
    active: '已启用',
    dormant: '未启用',
    declared: '已声明',
    credential: '凭据 {ref}',
    credentialOk: '已配置',
    credentialMissing: '未配置',
    credentialNone: '无需凭据',
    balance: '余额',
    granted: '赠送 {amount}',
    toppedUp: '充值 {amount}',
    unsupported: '该服务商未提供可用模型密钥查询的余额接口',
    noCredential: '未配置 API Key',
    notSignedIn: '未登录',
    openConsole: '打开控制台',
    models: '模型',
    noModels: '该服务商未提供模型目录',
    showAll: '查看全部 {count} 个模型',
    close: '关闭',
  },
  en: {
    nav: 'Model usage & balance',
    openPanel: 'Open the model usage & balance panel',
    title: 'Model list and balance',
    subtitle: '{providers} providers · {models} models',
    refresh: 'Refresh',
    refreshing: 'Refreshing…',
    updatedAt: 'Updated {time}',
    noSession: 'No active session: open a session, then select Refresh.',
    empty: 'No provider found.',
    loading: 'Reading the model list…',
    failed: 'Read failed: {error}',
    active: 'Active',
    dormant: 'Dormant',
    declared: 'Declared',
    credential: 'Credential {ref}',
    credentialOk: 'configured',
    credentialMissing: 'missing',
    credentialNone: 'not required',
    balance: 'Balance',
    granted: 'granted {amount}',
    toppedUp: 'topped up {amount}',
    unsupported: 'This provider exposes no balance endpoint usable with a model API key',
    noCredential: 'API key not configured',
    notSignedIn: 'Not signed in',
    openConsole: 'Open console',
    models: 'Models',
    noModels: 'This provider advertises no model catalog',
    showAll: 'Show all {count} models',
    close: 'Close',
  },
}

export function activeLanguage(): string {
  if (typeof document !== 'undefined') {
    const lang = document.documentElement.lang || navigator.language || 'zh-CN'
    return /^zh/i.test(lang) ? 'zh' : 'en'
  }
  return 'zh'
}

export function translate(lang: string, key: string, values?: Record<string, unknown>): string {
  const table = COPY[lang] || COPY.zh
  let text = table[key] || key
  for (const [name, value] of Object.entries(values || {})) {
    text = text.split('{' + name + '}').join(String(value))
  }
  return text
}
