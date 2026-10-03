/** Provider card 中的余额区块：钱包行 + 状态/控制台链接。 */

import type { BalanceInfo, QuotaWindow, Wallet } from '../../payload'
import { React } from '../react'
import type { Translate } from '../i18n'
import { currencySymbol, formatAmount, formatLocalDateTime, formatPercent } from '../format'

export function quotaLabel(entry: QuotaWindow, t: Translate): string {
  if (['five-hour', 'weekly', 'monthly', 'month-total', 'month-code'].includes(entry.id)) return t('quota-' + entry.id)
  if (entry.name) return entry.name
  if (entry.windowSeconds) return t('quotaWindow', { hours: entry.windowSeconds / 3600 })
  return t('quota')
}

function QuotaLine(props: { quota: QuotaWindow; t: Translate }) {
  const entry = props.quota
  const remaining = Math.max(0, Math.min(100, entry.remainingPercent))
  const level = remaining >= 50 ? 'high' : remaining >= 20 ? 'medium' : 'low'
  const label = quotaLabel(entry, props.t)
  const remainingText = props.t('quotaRemaining', { percent: formatPercent(remaining) })
  const resetAt = entry.resetAt ? new Date(entry.resetAt) : undefined
  return (
    <div className="dmu-quota" data-level={level}>
      <div className="dmu-row">
        <span>{label}</span>
        <span className="dmu-amount">{remainingText}</span>
      </div>
      <div
        className="dmu-quotaProgress" role="progressbar" aria-label={label}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={remaining} aria-valuetext={remainingText}
      >
        <span className="dmu-quotaProgressFill" style={{ width: remaining + '%' }} />
      </div>
      {resetAt && Number.isFinite(resetAt.getTime())
        ? <time className="dmu-muted" dateTime={entry.resetAt} title={resetAt.toLocaleString(undefined, { timeZoneName: 'short' })}>
            {props.t('quotaReset', { time: formatLocalDateTime(resetAt) })}
          </time>
        : null}
    </div>
  )
}

function WalletLine(props: { wallet: Wallet; t: Translate }) {
  const wallet = props.wallet
  const parts: string[] = []
  if (wallet.toppedUp !== undefined && String(wallet.toppedUp).length > 0) {
    parts.push(props.t('toppedUp', { amount: currencySymbol(wallet.currency) + formatAmount(wallet.toppedUp) }))
  }
  if (wallet.granted !== undefined && String(wallet.granted).length > 0 && Number(wallet.granted) !== 0) {
    parts.push(props.t('granted', { amount: currencySymbol(wallet.currency) + formatAmount(wallet.granted) }))
  }
  return (
    <div className="dmu-wallet">
      <div className="dmu-balanceRow">
        <span className="dmu-balanceLabel">{props.t(wallet.kind === 'extra-usage' ? 'extraUsage' : wallet.kind === 'granted' ? 'bonusBalance' : 'accountBalance')}</span>
        <span className="dmu-amount">{currencySymbol(wallet.currency) + formatAmount(wallet.balance)}</span>
      </div>
      {parts.length > 0 ? <small className="dmu-walletDetails">{parts.join(' · ')}</small> : null}
    </div>
  )
}

export function BalanceBlock(props: { balance: BalanceInfo | null | undefined; t: Translate }) {
  const balance = props.balance
  const t = props.t
  if (balance === undefined || balance === null) {
    return <div className="dmu-balance dmu-muted">{t('balanceUnavailable')}</div>
  }
  if (balance.status === 'ready') {
    const wallets = Array.isArray(balance.wallets) ? balance.wallets : []
    const quotas = Array.isArray(balance.quotas) ? balance.quotas : []
    const bonus = Array.isArray(balance.bonusWallets) ? balance.bonusWallets.filter((wallet) => Number(wallet.balance) > 0) : []
    return (
      <div className="dmu-balance">
        {quotas.map((entry) => <QuotaLine key={entry.id} quota={entry} t={t} />)}
        {wallets.length === 0 && quotas.length === 0
          ? <div className="dmu-muted">{t('balanceUnavailable')}</div>
          : wallets.map((wallet, index) => <WalletLine key={'w' + index} wallet={wallet} t={t} />)}
        {bonus.map((wallet, index) => <WalletLine key={'b' + index} wallet={wallet} t={t} />)}
        {balance.refreshError
          ? <div className="dmu-error" role="status">{t('balanceRefreshFailed', {
              error: balance.refreshError,
            })}</div>
          : null}
        {balance.link
          ? <a className="dmu-link" href={balance.link} target="_blank" rel="noreferrer">{t('openConsole')}</a>
          : null}
      </div>
    )
  }
  const message = balance.status === 'no-credential'
    ? t('noCredential')
    : balance.status === 'not-signed-in'
      ? t('notSignedIn')
      : balance.status === 'unsupported'
        ? t('unsupported')
        : (balance.message || balance.status)
  return (
    <div className="dmu-balance">
      <div className="dmu-balanceStatus">
        <span
          className={balance.status === 'failed' ? 'dmu-error' : 'dmu-muted'}
          title={message}
        >{balance.status === 'unsupported' ? t('balanceUnsupported') : message}</span>
        {typeof balance.link === 'string' && balance.link.length > 0
          ? <a className="dmu-link" href={balance.link} target="_blank" rel="noreferrer">{t('openConsole')}</a>
          : null}
      </div>
    </div>
  )
}
