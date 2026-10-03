/** 顶栏徽章：余额合计 chip，点击刷新并切到主面板。 */

import type { Wallet } from '../../payload'
import { React } from '../react'
import type { Reader } from '../data'
import { usePayload } from '../data'
import type { SlotProps } from '../context'
import { sessionIdFromProps } from '../session'
import { activeLanguage, translate, type Translate } from '../i18n'
import { currencySymbol, formatAmount } from '../format'

export function UsageChip(props: { read: Reader; open(): void } & SlotProps) {
  const read = props.read
  const lang = activeLanguage()
  const t: Translate = (key, values) => translate(lang, key, values)
  const sessionId = sessionIdFromProps(props)
  const [token, setToken] = React.useState(0)
  const state = usePayload(read, sessionId, false, token)

  let label = '…'
  if (state.kind === 'ready') {
    const providers = Array.isArray(state.payload.providers) ? state.payload.providers : []
    const wallets: Wallet[] = []
    for (const provider of providers) {
      const balance = provider.balance
      if (balance && balance.status === 'ready' && Array.isArray(balance.wallets)) {
        for (const wallet of balance.wallets) wallets.push(wallet)
      }
    }
    label = wallets.length === 0
      ? String(state.payload.counts ? state.payload.counts.models : 0) + ' models'
      : wallets.map((wallet) => currencySymbol(wallet.currency) + formatAmount(wallet.balance)).join(' / ')
  } else if (state.kind === 'error') {
    label = '—'
  }

  return (
    <button
      type="button"
      className="dmu-chip"
      title={t('openPanel')}
      onClick={() => { setToken((value) => value + 1); props.open() }}
    >
      <span>{label}</span>
    </button>
  )
}
