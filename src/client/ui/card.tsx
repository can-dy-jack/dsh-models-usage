/** Provider card: header badges, balance, collapsed model preview + modal. */

import type { CredentialInfo, ProviderEntry } from '../../payload'
import { React } from '../react'
import type { Translate } from '../i18n'
import { BalanceBlock } from './balance'
import { ModelModal, ModelRow } from './models'

/** How many models a card shows before the rest move into the dialog. */
const MODEL_PREVIEW = 6

export function ProviderCard(props: { provider: ProviderEntry; t: Translate }) {
  const provider = props.provider
  const t = props.t
  const models = Array.isArray(provider.models) ? provider.models : []
  const [expanded, setExpanded] = React.useState(false)
  const credential: CredentialInfo | null | undefined = provider.credential
  const badges: unknown[] = []
  badges.push(
    <span key="state" className={'dmu-badge' + (provider.active ? ' ok' : '')}>
      {t(provider.active ? 'active' : 'dormant')}
    </span>,
  )
  if (provider.api) badges.push(<span key="api" className="dmu-badge">{provider.api}</span>)
  if (credential) {
    badges.push(
      <span key="cred" className={'dmu-badge' + (credential.configured ? ' ok' : ' warn')}>
        {t('credential', { ref: credential.ref }) + ' · ' + t(credential.configured ? 'credentialOk' : 'credentialMissing')}
      </span>,
    )
  } else {
    badges.push(<span key="cred" className="dmu-badge">{t('credentialNone')}</span>)
  }
  return (
    <div className="dmu-card">
      <div className="dmu-card-head">
        <div>
          <div className="dmu-name">{provider.displayName || provider.id}</div>
          <div className="dmu-id">{provider.id + (provider.baseURL ? ' · ' + provider.baseURL : '')}</div>
        </div>
        <div className="dmu-badges">{badges}</div>
      </div>
      <BalanceBlock balance={provider.balance} t={t} />
      {provider.configError
        ? <div className="dmu-error">{provider.configError}</div>
        : null}
      <div className="dmu-models">
        <div className="dmu-muted">{t('models') + ' · ' + provider.modelCount}</div>
        {models.length === 0
          ? <div className="dmu-empty">{t('noModels')}</div>
          : models.slice(0, MODEL_PREVIEW).map((model) => <ModelRow key={model.id} model={model} />)}
        {models.length > MODEL_PREVIEW
          ? (
            <button type="button" className="dmu-more" onClick={() => setExpanded(true)}>
              {t('showAll', { count: models.length })}
            </button>
          )
          : null}
      </div>
      {expanded ? <ModelModal provider={provider} models={models} t={t} onClose={() => setExpanded(false)} /> : null}
    </div>
  )
}
