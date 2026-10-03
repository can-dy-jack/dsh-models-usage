/** Provider card 中的余额区块：钱包行 + 状态/控制台链接。 */

import type { BalanceInfo, Wallet } from '../../payload'
import { React } from '../react'
import type { Translate } from '../i18n'
import { currencySymbol, formatAmount } from '../format'

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
    <div className="dmu-row">
      <span className="dmu-amount">
        {currencySymbol(wallet.currency) + formatAmount(wallet.balance)}
        {parts.length > 0 ? <small>{parts.join(' · ')}</small> : null}
      </span>
      <span className="dmu-muted">{wallet.kind === 'granted' ? 'bonus' : 'wallet'}</span>
    </div>
  )
}

export function BalanceBlock(props: { balance: BalanceInfo | null | undefined; t: Translate }) {
  const balance = props.balance
  const t = props.t
  if (balance === undefined || balance === null) {
    return <div className="dmu-muted">{'—'}</div>
  }
  if (balance.status === 'ready') {
    const wallets = Array.isArray(balance.wallets) ? balance.wallets : []
    const bonus = Array.isArray(balance.bonusWallets) ? balance.bonusWallets.filter((wallet) => Number(wallet.balance) > 0) : []
    return (
      <div className="dmu-models">
        {wallets.length === 0
          ? <div className="dmu-muted">{'—'}</div>
          : wallets.map((wallet, index) => <WalletLine key={'w' + index} wallet={wallet} t={t} />)}
        {bonus.map((wallet, index) => <WalletLine key={'b' + index} wallet={wallet} t={t} />)}
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
    <div className="dmu-row">
      <span className={balance.status === 'failed' ? 'dmu-error' : 'dmu-muted'}>{message}</span>
      {typeof balance.link === 'string' && balance.link.length > 0
        ? <a className="dmu-link" href={balance.link} target="_blank" rel="noreferrer">{t('openConsole')}</a>
        : null}
    </div>
  )
}
