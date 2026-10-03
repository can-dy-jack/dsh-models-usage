/** Model list rows and the "show all" dialog (markup follows the host's Modal). */

import type { ModelEntry, ProviderEntry } from '../../payload'
import { React } from '../react'
import type { Translate } from '../i18n'
import { describeModelMeta } from '../format'

export function ModelRow(props: { model: ModelEntry }) {
  const model = props.model
  const meta = describeModelMeta(model)
  return (
    <div className="dmu-model">
      <div className="dmu-modelHead">
        <span className="dmu-model-id">{model.id}</span>
        {model.name && model.name !== model.id
          ? <span className="dmu-model-name">{model.name}</span>
          : null}
      </div>
      {meta.length > 0 ? <div className="dmu-model-meta">{meta}</div> : null}
    </div>
  )
}

/** All of one provider's models; markup and styling follow the host's Modal. */
export function ModelModal(props: { provider: ProviderEntry; models: ModelEntry[]; t: Translate; onClose(): void }) {
  const t = props.t
  const models = props.models
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
            <p className="dmu-sub">{props.provider.id + ' · ' + t('models') + ' ' + models.length}</p>
          </div>
          <button
            type="button" className="dmu-modalClose" title={t('close')} aria-label={t('close')}
            onClick={props.onClose}
          >{'✕'}</button>
        </div>
        <div className="dmu-modalBody">
          {models.map((model) => <ModelRow key={model.id} model={model} />)}
        </div>
      </div>
    </div>
  )
}
