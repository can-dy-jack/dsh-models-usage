/** Provider balance summary with a model count that opens the model dialog. */

import type { ModelEntry, ProviderEntry } from '../../payload'
import { React } from '../react'
import type { Translate } from '../i18n'
import { formatUpdatedAt } from '../format'
import { BalanceBlock } from './balance'
import { ModelModal } from './models'
import { CustomQueryModal } from './custom-query'
import type { CustomApi } from '../custom'

/** Keep elapsed-time copy current while the card stays open. */
function UpdatedAt(props: { value: string; t: Translate }) {
  const updated = new Date(props.value)
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [props.value])
  if (!Number.isFinite(updated.getTime())) return null
  return (
    <time className="dmu-updatedAt" dateTime={props.value} title={updated.toLocaleString()}>
      {props.t('updatedAt', { time: formatUpdatedAt(updated, props.t, now) })}
    </time>
  )
}

export function ProviderCard(props: {
  provider: ProviderEntry
  models?: ModelEntry[]
  t: Translate
  onRefresh(): void
  refreshing?: boolean
  refreshDisabled?: boolean
  refreshError?: string
  /** Absent without an active session; the editor needs the commands Remote. */
  customApi?: CustomApi
  onCustomSaved?(): void
}) {
  const provider = props.provider
  const t = props.t
  const models = props.models ?? (Array.isArray(provider.models) ? provider.models : [])
  const updatedAt = provider.balance?.fetchedAt
  const [expanded, setExpanded] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const credential = provider.credential
  const badges: unknown[] = []
  if (provider.api) badges.push(<span key="api" className="dmu-badge">{provider.api}</span>)
  if (provider.customQuery) {
    badges.push(
      <span key="custom" className={'dmu-badge' + (provider.customQuery.enabled ? ' ok' : '')}
        title={t(provider.customQuery.enabled ? 'customActiveHint' : 'customDisabledHint')}>
        {t(provider.customQuery.enabled ? 'customBadge' : 'customBadgeDisabled')}
      </span>,
    )
  }
  if (credential && !credential.configured) {
    badges.push(
      <span
        key="cred" className="dmu-badge warn"
        title={t('credential', { ref: credential.ref }) + ' · ' + t('credentialMissing')}
      >
        {t('credentialNotConfigured')}
      </span>,
    )
  }
  return (
    <section className="dmu-card" aria-label={provider.displayName || provider.id} aria-busy={props.refreshing === true}>
      <div className="dmu-providerSummary">
        <div className="dmu-card-head">
          <div className="dmu-cardTitle">
            <h2 className="dmu-name">{provider.displayName || provider.id}</h2>
            {updatedAt ? <UpdatedAt value={updatedAt} t={t} /> : null}
          </div>
          <div className="dmu-cardActions">
            <span className={'dmu-badge dmu-providerState' + (provider.active ? ' ok' : '')}>
              {t(provider.active ? 'active' : 'dormant')}
            </span>
            <button
              type="button" className="dmu-providerCustom" aria-haspopup="dialog"
              disabled={props.customApi === undefined}
              title={t('customOpen', { provider: provider.displayName || provider.id })}
              aria-label={t('customOpen', { provider: provider.displayName || provider.id })}
              onClick={() => setEditing(true)}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden={true}>
                <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
                <circle cx={16} cy={6} r={2} />
                <circle cx={10} cy={12} r={2} />
                <circle cx={18} cy={18} r={2} />
              </svg>
            </button>
            <button
              type="button"
              className={'dmu-providerRefresh' + (props.refreshing ? ' is-refreshing' : '')}
              disabled={props.refreshing === true || props.refreshDisabled === true}
              title={props.refreshing ? t('refreshing') : t('refreshProvider', { provider: provider.displayName || provider.id })}
              aria-label={t('refreshProvider', { provider: provider.displayName || provider.id })}
              onClick={props.onRefresh}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden={true}>
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              </svg>
            </button>
          </div>
        </div>
        <div className="dmu-providerMeta">
          {provider.displayName && provider.displayName !== provider.id ? <span className="dmu-id">{provider.id}</span> : null}
          {badges.length > 0 ? <div className="dmu-badges">{badges}</div> : null}
          <button
            type="button" className="dmu-modelsTrigger" disabled={models.length === 0}
            title={models.length === 0 ? t('noModels') : t('showAll', { count: models.length })}
            aria-label={t('showAll', { count: models.length })} aria-haspopup="dialog"
            onClick={() => setExpanded(true)}
          >
            <span>{t('models')}</span>
            <span className="dmu-modelCount" title={t('filteredModelCount', { count: models.length, total: provider.modelCount })}>
              {models.length === provider.modelCount ? provider.modelCount : models.length + ' / ' + provider.modelCount}
            </span>
          </button>
        </div>
        {provider.baseURL ? <div className="dmu-endpoint" title={provider.baseURL}>{provider.baseURL}</div> : null}
        <BalanceBlock balance={provider.balance} t={t} />
        {props.refreshError ? <div className="dmu-error" role="status">{t('providerRefreshFailed', {
          error: props.refreshError === 'invalid-provider-response' ? t('providerRefreshUnavailable') : props.refreshError,
        })}</div> : null}
        {provider.configError ? <div className="dmu-error">{provider.configError}</div> : null}
      </div>
      {expanded ? <ModelModal provider={provider} models={models} t={t} onClose={() => setExpanded(false)} /> : null}
      {editing && props.customApi !== undefined
        ? <CustomQueryModal provider={provider} api={props.customApi} t={t} onClose={() => setEditing(false)} onSaved={() => props.onCustomSaved?.()} />
        : null}
    </section>
  )
}
