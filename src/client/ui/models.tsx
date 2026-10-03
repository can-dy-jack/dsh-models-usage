/** Model list rows and the "show all" dialog (markup follows the host's Modal). */

import type { ModelEntry, ProviderEntry } from '../../payload'
import { React } from '../react'
import type { Translate } from '../i18n'
import { capabilityLabel, describeModelMeta } from '../format'
import { defaultFilters, filterModels, inputModalities } from '../filter'
import { FilterControls, FilterSection, NoFilterResults } from './filters'

export function ModelRow(props: { model: ModelEntry; t: Translate }) {
  const model = props.model
  const meta = describeModelMeta(model, props.t)
  const modalities = Array.isArray(model.inputModalities) ? model.inputModalities : []
  return (
    <div className="dmu-model">
      <div className="dmu-modelHead">
        <span className="dmu-model-id">{model.id}</span>
        {model.name && model.name !== model.id
          ? <span className="dmu-model-name">{model.name}</span>
          : null}
      </div>
      {meta.length > 0 || modalities.length > 0 ? (
        <div className="dmu-model-meta">
          {meta.length > 0 ? <div>{meta}</div> : null}
          {modalities.length > 0 ? (
            <ul className="dmu-model-capabilities" aria-label={props.t('modelCapabilities')}>
              {modalities.map((modality, index) => (
                <li key={modality + '-' + index} className="dmu-badge">
                  {capabilityLabel('modality', modality, props.t)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** All of one provider's models; markup and styling follow the host's Modal. */
export function ModelModal(props: { provider: ProviderEntry; models: ModelEntry[]; t: Translate; onClose(): void }) {
  const t = props.t
  const [filters, setFilters] = React.useState(defaultFilters)
  const models = filterModels(props.models, filters)
  const resetFilters = () => setFilters(defaultFilters())
  const dialogRef = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    const previous = typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null
    if (dialogRef.current !== null && typeof dialogRef.current.focus === 'function') dialogRef.current.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      props.onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (previous !== null && typeof previous.focus === 'function') previous.focus()
    }
  }, [])
  return (
    <div
      className="dmu-overlay"
      onMouseDown={(event: MouseEvent) => { if (event.target === event.currentTarget) props.onClose() }}
    >
      <div className="dmu-mask" aria-hidden={true} />
      <div
        className="dmu-modal" role="dialog" aria-modal="true"
        aria-labelledby="dmu-modal-title" tabIndex={-1} ref={dialogRef}
      >
        <div className="dmu-modalHead">
          <div>
            <h2 className="dmu-modalTitle" id="dmu-modal-title">{props.provider.displayName || props.provider.id}</h2>
            <p className="dmu-sub">{props.provider.id + ' · ' + t('modelCount', { count: props.provider.modelCount })}</p>
          </div>
          <button
            type="button" className="dmu-modalClose" title={t('close')} aria-label={t('close')}
            onClick={props.onClose}
          >{'✕'}</button>
        </div>
        <FilterSection id="dmu-modal-filters" className="dmu-modalFilters" value={filters} t={t}
          summary={t('filteredModelCount', { count: models.length, total: props.models.length })}>
          <FilterControls value={filters} onChange={setFilters} onReset={resetFilters}
            modalities={inputModalities(props.provider.models)} t={t} />
          <p className="dmu-filterHint">{t('modalFilterScope')}</p>
          {filters.modality || filters.reasoningOnly ? <p className="dmu-filterHint">{t('knownCapabilitiesOnly')}</p> : null}
        </FilterSection>
        <div className="dmu-modalBody">
          {models.length === 0
            ? <NoFilterResults t={t} onReset={resetFilters} />
            : models.map((model) => <ModelRow key={model.id} model={model} t={t} />)}
        </div>
      </div>
    </div>
  )
}
