/** Plugin support catalog; available independently of sessions and balance reads. */
import { SUPPORTED_BALANCE_QUERIES } from '../../balance-support'
import { React } from '../react'
import type { Translate } from '../i18n'

export function BalanceSupportModal(props: { t: Translate; onClose(): void }) {
  const t = props.t
  const dialogRef = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    if (typeof document === 'undefined') return
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        props.onClose()
      } else if (event.key === 'Tab' && dialogRef.current !== null) {
        const buttons = dialogRef.current.querySelectorAll<HTMLButtonElement>('button')
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (first === undefined) return
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      previous?.focus()
    }
  }, [])

  return (
    <div className="dmu-overlay"
      onMouseDown={(event: MouseEvent) => { if (event.target === event.currentTarget) props.onClose() }}>
      <div className="dmu-mask" aria-hidden={true} />
      <div className="dmu-modal dmu-supportModal" role="dialog" aria-modal="true" tabIndex={-1} ref={dialogRef}
        aria-labelledby="dmu-support-title" aria-describedby="dmu-support-intro">
        <div className="dmu-modalHead">
          <h2 className="dmu-modalTitle" id="dmu-support-title">{t('supportedQueriesTitle')}</h2>
          <button type="button" className="dmu-modalClose" title={t('close')} aria-label={t('close')}
            onClick={props.onClose}>{'✕'}</button>
        </div>
        <div className="dmu-modalBody">
          <p className="dmu-supportIntro" id="dmu-support-intro">{t('supportedQueriesIntro')}</p>
          <ul className="dmu-supportList">
            {SUPPORTED_BALANCE_QUERIES.map((query) => (
              <li className="dmu-supportItem" key={query.id}>
                <div className="dmu-supportHead">
                  <h3 className="dmu-name">{t(query.name)}</h3>
                  <span className="dmu-badge">{t(query.credential)}</span>
                </div>
                <p className="dmu-supportDetails">{t(query.details)}</p>
              </li>
            ))}
          </ul>
          <p className="dmu-supportNote">{t('supportedQueriesNote')}</p>
        </div>
      </div>
    </div>
  )
}
