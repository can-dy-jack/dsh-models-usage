/** Plugin support catalog; available independently of sessions and balance reads. */
import { BUILTIN_PROVIDER_QUERY_SUPPORT, BUILTIN_PROVIDER_QUERY_SUPPORT_GROUPS, type ProviderQuerySupport } from '../../balance-support'
import { React } from '../react'
import type { Translate } from '../i18n'

function SupportStatus(props: { provider: ProviderQuerySupport; t: Translate }) {
  return (
    <span className={'dmu-badge dmu-supportStatus' + (props.provider.status === 'supported' ? ' ok' : '')}>
      {props.t(props.provider.statusLabel)}
    </span>
  )
}

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
        const controls = dialogRef.current.querySelectorAll<HTMLElement>('button, a[href]')
        const first = controls[0]
        const last = controls[controls.length - 1]
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
          <p className="dmu-supportIntro" id="dmu-support-intro">
            {t('supportedQueriesIntro', { count: BUILTIN_PROVIDER_QUERY_SUPPORT.length })}
          </p>
          {BUILTIN_PROVIDER_QUERY_SUPPORT_GROUPS.map((group) => (
            <section className="dmu-supportGroup" key={group.id} aria-labelledby={'dmu-support-' + group.id}>
              <div className="dmu-supportHead">
                <h3 className="dmu-supportGroupTitle" id={'dmu-support-' + group.id}>
                  {t('supportGroupTitle', { name: group.translatedName ? t(group.name) : group.name, count: group.providers.length })}
                </h3>
                {group.providers.length === 1 ? <SupportStatus provider={group.providers[0]} t={t} /> : null}
              </div>
              <ul className="dmu-supportList">
                {group.providers.map((provider) => (
                  <li className="dmu-supportItem" key={provider.id}>
                    {group.providers.length > 1 ? (
                      <div className="dmu-supportHead">
                        <h4 className="dmu-name">{provider.translatedName ? t(provider.name) : provider.name}</h4>
                        <SupportStatus provider={provider} t={t} />
                      </div>
                    ) : null}
                    <div className="dmu-id">{provider.id}</div>
                    <p className="dmu-supportDetails">{t(provider.details)}</p>
                    {provider.credential || provider.documentation ? (
                      <div className="dmu-supportMeta">
                        {provider.credential ? <span>{t(provider.credential)}</span> : null}
                        {provider.documentation ? (
                          <a className="dmu-link" href={provider.documentation} target="_blank" rel="noopener noreferrer">
                            {t('supportOfficialDocs')}
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="dmu-supportNote">{t('supportedQueriesNote')}</p>
        </div>
      </div>
    </div>
  )
}
