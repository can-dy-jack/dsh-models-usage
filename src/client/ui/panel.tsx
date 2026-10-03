/** 主面板：标题栏 + 刷新 + 服务商卡片列表（或状态提示）。 */

import { React } from '../react'
import type { Reader } from '../data'
import { usePayload } from '../data'
import { translate, type Translate } from '../i18n'
import { createFilterStore, filterProviders, inputModalities, type FilterStore } from '../filter'
import { ProviderCard } from './card'
import { FilterControls, FilterSection, NoFilterResults } from './filters'

export function ModelsUsagePanel(props: { read: Reader; diag: string; lang: string; sessionId: string | undefined; filters?: FilterStore; openSettings?(): void }) {
  const read = props.read
  const diag = props.diag
  const lang = props.lang
  const t: Translate = (key, values) => translate(lang, key, values)
  const sessionId = props.sessionId
  const [token, setToken] = React.useState(0)
  const localFilters = React.useRef<FilterStore | undefined>(undefined)
  if (localFilters.current === undefined) localFilters.current = createFilterStore()
  const filterStore = props.filters ?? localFilters.current
  const [, renderFilters] = React.useState(0)
  React.useEffect(() => filterStore.subscribe(() => renderFilters((value) => value + 1)), [filterStore])
  const filters = filterStore.snapshot()
  const state = usePayload(read, sessionId, true, token)
  const refreshing = state.kind === 'loading' || (state.kind === 'ready' && state.refreshing)
  const providerRefreshes = state.kind === 'ready' ? state.providerRefreshes : undefined
  const providerRefreshing = Object.values(providerRefreshes ?? {}).some((entry) => entry.refreshing)

  const header = (
    <div className="dmu-head">
      <div>
        <h1 className="dmu-title">{t('title')}</h1>
        <p className="dmu-sub">
          {state.kind === 'ready'
            ? t('subtitle', { providers: state.payload.counts.providers, models: state.payload.counts.models })
            : ''}
        </p>
      </div>
      <div className="dmu-actions">
        {props.openSettings === undefined ? null : (
          <button type="button" className="dmu-button" onClick={props.openSettings}>
            {t('modelSettings')}
          </button>
        )}
        <button
          type="button"
          className="dmu-button"
          disabled={refreshing || providerRefreshing}
          onClick={() => setToken((value) => value + 1)}
        >
          {t(refreshing ? 'refreshing' : 'refresh')}
        </button>
      </div>
    </div>
  )

  let body
  let controls
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
    const results = filterProviders(providers, filters)
    controls = (
      <FilterSection id="dmu-panel-filters" value={filters} t={t}
        summary={t('filteredCounts', {
            providers: results.length, totalProviders: state.payload.counts.providers,
            models: results.reduce((count, result) => count + result.models.length, 0), totalModels: state.payload.counts.models,
          })}>
        <FilterControls value={filters} onChange={filterStore.set} onReset={filterStore.reset}
          providers={providers} modalities={inputModalities(providers.flatMap((provider) => provider.models ?? []))} t={t} />
        {filters.modality || filters.reasoningOnly ? <p className="dmu-filterHint">{t('knownCapabilitiesOnly')}</p> : null}
      </FilterSection>
    )
    body = providers.length === 0
      ? <div className="dmu-empty">{t('empty')}</div>
      : results.length === 0
      ? <NoFilterResults t={t} onReset={filterStore.reset} />
      : <div className="dmu-providerGrid">{results.map(({ provider, models }) => (
          <ProviderCard
            key={provider.id} provider={provider} models={models} t={t}
            onRefresh={() => { void read.refreshProvider(sessionId, provider.id) }}
            refreshing={providerRefreshes?.[provider.id]?.refreshing}
            refreshDisabled={refreshing}
            refreshError={providerRefreshes?.[provider.id]?.error}
          />
        ))}</div>
  }

  return (
    <div className="dmu-page" aria-busy={refreshing || providerRefreshing}>
      {header}
      {controls}
      <div className="dmu-pageBody">
        {state.kind === 'ready' && state.refreshError
          ? <div className="dmu-error" role="status">{t('cacheRefreshFailed', { error: state.refreshError })}</div>
          : null}
        {body}
      </div>
    </div>
  )
}
