/** 主面板：标题栏 + 刷新 + 服务商卡片列表（或状态提示）。 */

import { React } from '../react'
import type { Reader } from '../data'
import { usePayload } from '../data'
import { translate, type Translate } from '../i18n'
import { ProviderCard } from './card'

export function ModelsUsagePanel(props: { read: Reader; diag: string; lang: string; sessionId: string | undefined }) {
  const read = props.read
  const diag = props.diag
  const lang = props.lang
  const t: Translate = (key, values) => translate(lang, key, values)
  const sessionId = props.sessionId
  const [token, setToken] = React.useState(0)
  const state = usePayload(read, sessionId, true, token)

  const header = (
    <div className="dmu-head">
      <div>
        <h1 className="dmu-title">{t('title')}</h1>
        <p className="dmu-sub">
          {state.kind === 'ready'
            ? t('subtitle', { providers: state.payload.counts.providers, models: state.payload.counts.models })
              + (state.payload.fetchedAt ? ' · ' + t('updatedAt', { time: new Date(state.payload.fetchedAt).toLocaleTimeString() }) : '')
            : ''}
        </p>
      </div>
      <div className="dmu-actions">
        <button
          type="button"
          className="dmu-button"
          disabled={state.kind === 'loading'}
          onClick={() => setToken((value) => value + 1)}
        >
          {t(state.kind === 'loading' ? 'refreshing' : 'refresh')}
        </button>
      </div>
    </div>
  )

  let body
  if (state.kind === 'loading') {
    body = <div className="dmu-muted">{t('loading')}</div>
  } else if (state.kind === 'error') {
    body = state.error === 'no-session'
      ? (
        <div>
          <div className="dmu-muted">{t('noSession')}</div>
          <div className="dmu-id">{'store: ' + String(diag)}</div>
        </div>
      )
      : <div className="dmu-error">{t('failed', { error: state.error })}</div>
  } else {
    const providers = Array.isArray(state.payload.providers) ? state.payload.providers : []
    body = providers.length === 0
      ? <div className="dmu-empty">{t('empty')}</div>
      : <>{providers.map((provider) => <ProviderCard key={provider.id} provider={provider} t={t} />)}</>
  }

  return <div className="dmu-page">{header}<div className="dmu-pageBody">{body}</div></div>
}
