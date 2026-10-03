/** Native controls shared by the main panel and its model dialog. */

import type { ProviderEntry } from '../../payload'
import { hasActiveFilters, type FilterState } from '../filter'
import { React } from '../react'
import type { Translate } from '../i18n'
import { capabilityLabel } from '../format'

/** Collapsing hides controls without changing the conditions owned by the caller. */
export function FilterSection(props: {
  id: string
  value: FilterState
  summary: string
  className?: string
  t: Translate
  children?: unknown
}) {
  const [expanded, setExpanded] = React.useState(false)
  const active = hasActiveFilters(props.value)
  return (
    <div className={'dmu-filterBar' + (props.className ? ' ' + props.className : '')}>
      <div className="dmu-filterDisclosure">
        <button type="button" className="dmu-filterToggle" aria-expanded={expanded} aria-controls={props.id}
          title={props.t(expanded ? 'collapseFilters' : 'expandFilters')}
          onClick={() => setExpanded((value) => !value)}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden={true}><path d="m9 5 7 7-7 7" /></svg>
          <span>{props.t('searchAndFilter')}</span>
          {active ? <span className="dmu-filterActive">{props.t('filtersActive')}</span> : null}
        </button>
        <p className="dmu-filterSummary" role="status" aria-live="polite">{props.summary}</p>
      </div>
      <div id={props.id} className="dmu-filterContent" hidden={!expanded}>
        {expanded ? props.children : null}
      </div>
    </div>
  )
}

export function FilterControls(props: {
  value: FilterState
  onChange(next: FilterState): void
  onReset(): void
  providers?: ProviderEntry[]
  modalities: string[]
  t: Translate
}) {
  const { value, t } = props
  const update = (patch: Partial<FilterState>) => props.onChange({ ...value, ...patch })
  const hasFilters = hasActiveFilters(value)
  return (
    <div className="dmu-filters" role="group" aria-label={t('searchAndFilter')}>
      <label className="dmu-filterField dmu-filterSearch">
        <span>{t('search')}</span>
        <input
          type="search" className="dmu-filterInput" value={value.query}
          placeholder={t(props.providers === undefined ? 'searchModelsPlaceholder' : 'searchPlaceholder')}
          onChange={(event: { currentTarget: HTMLInputElement }) => update({ query: event.currentTarget.value })}
        />
      </label>
      {props.providers === undefined ? null : <>
        <label className="dmu-filterField">
          <span>{t('filterProvider')}</span>
          <select className="dmu-filterInput" value={value.providerId}
            onChange={(event: { currentTarget: HTMLSelectElement }) => update({ providerId: event.currentTarget.value })}>
            <option value="">{t('allProviders')}</option>
            {props.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName || provider.id}</option>)}
            {value.providerId && !props.providers.some((provider) => provider.id === value.providerId)
              ? <option value={value.providerId}>{t('filterOptionMissing', { value: value.providerId })}</option> : null}
          </select>
        </label>
        <label className="dmu-filterField">
          <span>{t('filterActivation')}</span>
          <select className="dmu-filterInput" value={value.activation}
            onChange={(event: { currentTarget: HTMLSelectElement }) => update({ activation: event.currentTarget.value as FilterState['activation'] })}>
            <option value="all">{t('allActivations')}</option>
            <option value="active">{t('active')}</option>
            <option value="dormant">{t('dormant')}</option>
          </select>
        </label>
      </>}
      <label className="dmu-filterField">
        <span>{t('filterModality')}</span>
        <select className="dmu-filterInput" value={value.modality}
          onChange={(event: { currentTarget: HTMLSelectElement }) => update({ modality: event.currentTarget.value })}>
          <option value="">{t('allModalities')}</option>
          {props.modalities.map((modality) => <option key={modality} value={modality}>{capabilityLabel('modality', modality, t)}</option>)}
          {value.modality && !props.modalities.includes(value.modality)
            ? <option value={value.modality}>{t('filterOptionMissing', { value: capabilityLabel('modality', value.modality, t) })}</option> : null}
        </select>
      </label>
      <label className="dmu-filterCheck">
        <input type="checkbox" checked={value.reasoningOnly}
          onChange={(event: { currentTarget: HTMLInputElement }) => update({ reasoningOnly: event.currentTarget.checked })} />
        <span>{t('filterReasoning')}</span>
      </label>
      <button type="button" className="dmu-button dmu-filterReset" disabled={!hasFilters} onClick={props.onReset}>{t('resetFilters')}</button>
    </div>
  )
}

export function NoFilterResults(props: { t: Translate; onReset(): void }) {
  return (
    <div className="dmu-noResults">
      <p className="dmu-empty" role="status">{props.t('noFilterResults')}</p>
      <button type="button" className="dmu-button dmu-filterReset" onClick={props.onReset}>{props.t('resetFilters')}</button>
    </div>
  )
}
