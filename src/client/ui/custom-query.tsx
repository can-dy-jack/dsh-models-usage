/**
 * Custom query editor: request template + response mapping, a Host-side test
 * run with a clickable JSON tree, and a live preview of the mapped balance.
 */

import type { ProviderEntry } from '../../payload'
import {
  defaultCustomQuery, mapCustomResponse, TEMPLATE_VARIABLES, validateCustomQuery,
  type CustomQuery, type KeyValue, type QuotaMapping, type ValueRef, type WalletMapping,
} from '../../custom-query'
import { isRecord } from '../../shared'
import { React } from '../react'
import type { Translate } from '../i18n'
import type { CustomApi, CustomTest } from '../custom'
import { BalanceBlock } from './balance'

type InputEvent = { target: { value: string; checked?: boolean } }

type WalletForm = {
  itemsPath: string; kind: string; balance: string; currency: string; granted: string
  toppedUp: string; cash: string; voucher: string; divisor: string
}
type QuotaForm = {
  itemsPath: string; name: string; period: string; windowSeconds: string; usedPercent: string
  remainingPercent: string; percentIsRatio: boolean; used: string; limit: string; remaining: string
  resetAt: string; resetFormat: string
}
type Form = {
  enabled: boolean; credentialRef: string; method: 'GET' | 'POST'; url: string
  headers: KeyValue[]; query: KeyValue[]; body: string
  successPath: string; successEquals: string; errorMessagePath: string
  wallets: WalletForm[]; quotas: QuotaForm[]
}

/** A field is a JSON path, or a fixed literal when it starts with `=`. */
function refText(ref: ValueRef | undefined): string {
  return ref === undefined ? '' : ref.path !== undefined ? ref.path : '=' + (ref.fixed ?? '')
}

function textRef(text: string): ValueRef | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  return trimmed.startsWith('=') ? (trimmed.length > 1 ? { fixed: trimmed.slice(1) } : undefined) : { path: trimmed }
}

const emptyWallet = (): WalletForm => ({ itemsPath: '', kind: 'topped-up', balance: '', currency: '=CNY', granted: '', toppedUp: '', cash: '', voucher: '', divisor: '' })
const emptyQuota = (): QuotaForm => ({
  itemsPath: '', name: '', period: '', windowSeconds: '', usedPercent: '', remainingPercent: '', percentIsRatio: false,
  used: '', limit: '', remaining: '', resetAt: '', resetFormat: 'auto',
})

function toForm(query: CustomQuery): Form {
  return {
    enabled: query.enabled,
    credentialRef: query.credentialRef ?? '',
    method: query.request.method,
    url: query.request.url,
    headers: query.request.headers.map((entry) => ({ ...entry })),
    query: query.request.query.map((entry) => ({ ...entry })),
    body: query.request.body ?? '',
    successPath: query.success?.path ?? '',
    successEquals: query.success?.equals ?? '',
    errorMessagePath: query.errorMessagePath ?? '',
    wallets: query.wallets.map((entry: WalletMapping) => ({
      itemsPath: entry.itemsPath ?? '', kind: entry.kind ?? 'topped-up', balance: refText(entry.balance),
      currency: refText(entry.currency), granted: refText(entry.granted), toppedUp: refText(entry.toppedUp),
      cash: refText(entry.cash), voucher: refText(entry.voucher), divisor: entry.divisor === undefined ? '' : String(entry.divisor),
    })),
    quotas: query.quotas.map((entry: QuotaMapping) => ({
      itemsPath: entry.itemsPath ?? '', name: refText(entry.name), period: entry.period ?? '',
      windowSeconds: entry.windowSeconds === undefined ? '' : String(entry.windowSeconds),
      usedPercent: refText(entry.usedPercent), remainingPercent: refText(entry.remainingPercent),
      percentIsRatio: entry.percentIsRatio === true, used: refText(entry.used), limit: refText(entry.limit),
      remaining: refText(entry.remaining), resetAt: refText(entry.resetAt), resetFormat: entry.resetFormat ?? 'auto',
    })),
  }
}

/** Raw shape for `validateCustomQuery` (shared with the Host). */
function fromForm(form: Form): unknown {
  return {
    enabled: form.enabled,
    credentialRef: form.credentialRef,
    request: { method: form.method, url: form.url, headers: form.headers, query: form.query, body: form.method === 'POST' ? form.body : undefined },
    success: form.successPath.trim().length > 0 ? { path: form.successPath, equals: form.successEquals } : undefined,
    errorMessagePath: form.errorMessagePath,
    wallets: form.wallets.map((entry) => ({
      itemsPath: entry.itemsPath, kind: entry.kind, balance: textRef(entry.balance), currency: textRef(entry.currency),
      granted: textRef(entry.granted), toppedUp: textRef(entry.toppedUp), cash: textRef(entry.cash),
      voucher: textRef(entry.voucher), divisor: entry.divisor,
    })),
    quotas: form.quotas.map((entry) => ({
      itemsPath: entry.itemsPath, name: textRef(entry.name), period: entry.period || undefined,
      windowSeconds: entry.windowSeconds, usedPercent: textRef(entry.usedPercent),
      remainingPercent: textRef(entry.remainingPercent), percentIsRatio: entry.percentIsRatio,
      used: textRef(entry.used), limit: textRef(entry.limit), remaining: textRef(entry.remaining),
      resetAt: textRef(entry.resetAt), resetFormat: entry.resetFormat,
    })),
  }
}

function initialQuery(provider: ProviderEntry): CustomQuery {
  const query = defaultCustomQuery()
  if (provider.baseURL) query.request.url = '{{baseURL}}/'
  return query
}

/** Strip an itemsPath prefix so a clicked path becomes relative to each item. */
function relativeTo(path: string, itemsPath: string): string {
  if (itemsPath.trim().length === 0) return path
  const escaped = itemsPath.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split('\\[\\*\\]').join('\\[\\d+\\]')
  const match = new RegExp('^' + escaped + '\\.?').exec(path)
  return match !== null && match[0].length < path.length ? path.slice(match[0].length) : path
}

function childPath(parent: string, key: string | number): string {
  if (typeof key === 'number') return parent + '[' + key + ']'
  const safe = /^[A-Za-z_$][\w$-]*$/.test(key) ? key : '["' + key + '"]'
  return parent.length === 0 || safe.startsWith('[') ? parent + safe : parent + '.' + safe
}

function JsonNode(props: { name?: string | number; value: unknown; path: string; depth: number; onPick(path: string): void; t: Translate }) {
  const value = props.value
  const branch = Array.isArray(value) || isRecord(value)
  const [open, setOpen] = React.useState(props.depth < 2)
  const entries: Array<[string | number, unknown]> = Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : isRecord(value) ? Object.entries(value) : []
  const label = props.name === undefined ? '$' : String(props.name)
  return (
    <li className="dmu-jsonNode">
      <div className="dmu-jsonRow">
        {branch
          ? <button type="button" className="dmu-jsonToggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '▾' : '▸'}</button>
          : <span className="dmu-jsonToggle" aria-hidden={true} />}
        <button type="button" className="dmu-jsonKey" title={props.t('customPickPath', { path: props.path || '$' })}
          onClick={() => props.onPick(props.path)}>{label}</button>
        {Array.isArray(value)
          ? <button type="button" className="dmu-jsonArray" title={props.t('customPickItems')}
              onClick={() => props.onPick(props.path + '[*]')}>{'[*] · ' + value.length}</button>
          : branch ? <span className="dmu-muted">{'{' + entries.length + '}'}</span>
          : <span className="dmu-jsonValue">{JSON.stringify(value)}</span>}
      </div>
      {branch && open ? (
        <ul className="dmu-jsonList">
          {entries.slice(0, 100).map(([key, item]) => (
            <JsonNode key={String(key)} name={key} value={item} path={childPath(props.path, key)} depth={props.depth + 1} onPick={props.onPick} t={props.t} />
          ))}
          {entries.length > 100 ? <li className="dmu-muted">{props.t('customTreeMore', { count: entries.length - 100 })}</li> : null}
        </ul>
      ) : null}
    </li>
  )
}

function Field(props: { label: string; value: string; onChange(value: string): void; onFocus?(): void; placeholder?: string; wide?: boolean; mono?: boolean }) {
  return (
    <label className={'dmu-filterField dmu-customField' + (props.wide ? ' is-wide' : '')}>
      <span>{props.label}</span>
      <input className={'dmu-filterInput' + (props.mono ? ' dmu-mono' : '')} value={props.value} placeholder={props.placeholder}
        spellCheck={false} onFocus={props.onFocus} onChange={(event: InputEvent) => props.onChange(event.target.value)} />
    </label>
  )
}

function Select(props: { label: string; value: string; options: Array<[string, string]>; onChange(value: string): void }) {
  return (
    <label className="dmu-filterField dmu-customField">
      <span>{props.label}</span>
      <select className="dmu-filterInput" value={props.value} onChange={(event: InputEvent) => props.onChange(event.target.value)}>
        {props.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  )
}

function KeyValues(props: { label: string; rows: KeyValue[]; onChange(rows: KeyValue[]): void; t: Translate }) {
  const set = (index: number, patch: Partial<KeyValue>) => props.onChange(props.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  return (
    <fieldset className="dmu-customGroup">
      <legend>{props.label}</legend>
      {props.rows.map((row, index) => (
        <div className="dmu-customRow" key={index}>
          <Field label={props.t('customName')} value={row.name} mono onChange={(name) => set(index, { name })} />
          <Field label={props.t('customValue')} value={row.value} mono wide onChange={(value) => set(index, { value })} />
          <button type="button" className="dmu-button dmu-customRemove" aria-label={props.t('customRemove')}
            onClick={() => props.onChange(props.rows.filter((_row, i) => i !== index))}>{'✕'}</button>
        </div>
      ))}
      <button type="button" className="dmu-button" onClick={() => props.onChange([...props.rows, { name: '', value: '' }])}>{props.t('customAdd')}</button>
    </fieldset>
  )
}

export function CustomQueryModal(props: { provider: ProviderEntry; api: CustomApi; t: Translate; onClose(): void; onSaved(): void }) {
  const t = props.t
  const provider = props.provider
  const [form, setForm] = React.useState<Form | undefined>(undefined)
  const [exists, setExists] = React.useState(false)
  const [busy, setBusy] = React.useState<string | undefined>('loading')
  const [message, setMessage] = React.useState<{ kind: 'error' | 'ok'; text: string } | undefined>(undefined)
  const [serverErrors, setServerErrors] = React.useState<string[]>([])
  const [test, setTest] = React.useState<CustomTest | undefined>(undefined)
  const pick = React.useRef<((path: string) => void) | undefined>(undefined)
  const dialogRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    let alive = true
    void props.api.get(provider.id).then((result) => {
      if (!alive) return
      setBusy(undefined)
      if (result.ok) {
        setExists(result.query != null)
        setForm(toForm(result.query ?? initialQuery(provider)))
        if (result.storeError) setMessage({ kind: 'error', text: result.storeError })
      } else {
        setForm(toForm(initialQuery(provider)))
        setMessage({ kind: 'error', text: t('customLoadFailed', { error: result.error === 'no-session' ? t('noSession') : (result.error ?? '') }) })
      }
    })
    const previous = typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      props.onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      alive = false
      document.removeEventListener('keydown', onKey, true)
      previous?.focus()
    }
  }, [])

  const update = (patch: Partial<Form>) => setForm((current) => (current === undefined ? current : { ...current, ...patch }))
  const validated = form === undefined ? undefined : validateCustomQuery(fromForm(form))
  const preview = validated?.ok && test?.data !== undefined ? mapCustomResponse(validated.query, test.data) : test?.balance

  /** Path inputs register themselves as the target of JSON tree clicks. */
  const pathField = (label: string, value: string, onChange: (value: string) => void, itemsPath = '', placeholder?: string) => (
    <Field label={label} value={value} mono placeholder={placeholder} onChange={onChange}
      onFocus={() => { pick.current = (path) => onChange(relativeTo(path, itemsPath)) }} />
  )

  const run = async (action: 'test' | 'save' | 'delete') => {
    if (form === undefined) return
    setMessage(undefined)
    setServerErrors([])
    if (action !== 'delete' && !validated?.ok) {
      setMessage({ kind: 'error', text: t('customInvalid') })
      return
    }
    setBusy(action)
    const result = action === 'delete' ? await props.api.remove(provider.id)
      : action === 'test' ? await props.api.test(provider.id, (validated as { query: CustomQuery }).query)
      : await props.api.save(provider.id, (validated as { query: CustomQuery }).query)
    setBusy(undefined)
    if (!result.ok) {
      setServerErrors(result.errors ?? [])
      setMessage({ kind: 'error', text: result.error === 'no-session' ? t('noSession') : (result.error ?? t('customInvalid')) })
      return
    }
    if (action === 'test') {
      setTest(result.test)
      if (result.test?.error) setMessage({ kind: 'error', text: result.test.error })
      return
    }
    if (action === 'delete') {
      setExists(false)
      setForm(toForm(initialQuery(provider)))
      setMessage({ kind: 'ok', text: t('customDeleted') })
    } else {
      setExists(true)
      setMessage({ kind: 'ok', text: t('customSaved') })
    }
    props.onSaved()
  }

  const walletSet = (index: number, patch: Partial<WalletForm>) => form && update({ wallets: form.wallets.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) })
  const quotaSet = (index: number, patch: Partial<QuotaForm>) => form && update({ quotas: form.quotas.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) })
  const clientErrors = validated !== undefined && !validated.ok ? validated.errors : []

  return (
    <div className="dmu-overlay" onMouseDown={(event: MouseEvent) => { if (event.target === event.currentTarget) props.onClose() }}>
      <div className="dmu-mask" aria-hidden={true} />
      <div className="dmu-modal dmu-customModal" role="dialog" aria-modal="true" aria-labelledby="dmu-custom-title" tabIndex={-1} ref={dialogRef}
        aria-busy={busy !== undefined}>
        <div className="dmu-modalHead">
          <div>
            <h2 className="dmu-modalTitle" id="dmu-custom-title">{t('customTitle', { provider: provider.displayName || provider.id })}</h2>
            <p className="dmu-sub">{t('customIntro')}</p>
          </div>
          <button type="button" className="dmu-modalClose" title={t('close')} aria-label={t('close')} onClick={props.onClose}>{'✕'}</button>
        </div>
        <div className="dmu-modalBody dmu-customBody">
          {form === undefined ? <div className="dmu-muted">{t('loading')}</div> : (
            <div className="dmu-customLayout">
              <div className="dmu-customEditor">
                <label className="dmu-filterCheck">
                  <input type="checkbox" checked={form.enabled} onChange={(event: InputEvent) => update({ enabled: event.target.checked === true })} />
                  {t('customEnabled')}
                </label>
                <fieldset className="dmu-customGroup">
                  <legend>{t('customRequest')}</legend>
                  <div className="dmu-customRow">
                    <Select label={t('customMethod')} value={form.method} options={[['GET', 'GET'], ['POST', 'POST']]}
                      onChange={(method) => update({ method: method === 'POST' ? 'POST' : 'GET' })} />
                    <Field label={t('customUrl')} value={form.url} mono wide placeholder="{{baseURL}}/user/balance" onChange={(url) => update({ url })} />
                  </div>
                  <p className="dmu-filterHint">{t('customPlaceholders', { list: TEMPLATE_VARIABLES.map((name) => '{{' + name + '}}').join(' ') })}</p>
                  <Field label={t('customCredentialRef')} value={form.credentialRef} mono placeholder={t('customCredentialRefHint')}
                    onChange={(credentialRef) => update({ credentialRef })} />
                </fieldset>
                <KeyValues label={t('customHeaders')} rows={form.headers} onChange={(headers) => update({ headers })} t={t} />
                <KeyValues label={t('customQueryParams')} rows={form.query} onChange={(query) => update({ query })} t={t} />
                {form.method === 'POST' ? (
                  <label className="dmu-filterField dmu-customField is-wide">
                    <span>{t('customBody')}</span>
                    <textarea className="dmu-filterInput dmu-mono dmu-customBodyInput" value={form.body} spellCheck={false}
                      placeholder={'{"start": "{{monthStart.iso}}"}'} onChange={(event: InputEvent) => update({ body: event.target.value })} />
                  </label>
                ) : null}
                <fieldset className="dmu-customGroup">
                  <legend>{t('customResponse')}</legend>
                  <p className="dmu-filterHint">{t('customPathHint')}</p>
                  <div className="dmu-customRow">
                    {pathField(t('customSuccessPath'), form.successPath, (successPath) => update({ successPath }), '', 'code')}
                    <Field label={t('customSuccessEquals')} value={form.successEquals} mono placeholder="0" onChange={(successEquals) => update({ successEquals })} />
                    {pathField(t('customErrorPath'), form.errorMessagePath, (errorMessagePath) => update({ errorMessagePath }), '', 'message')}
                  </div>
                </fieldset>
                <fieldset className="dmu-customGroup">
                  <legend>{t('customWallets')}</legend>
                  {form.wallets.map((entry, index) => (
                    <div className="dmu-customRule" key={index}>
                      <div className="dmu-customRow">
                        {pathField(t('customItemsPath'), entry.itemsPath, (itemsPath) => walletSet(index, { itemsPath }), '', 'balance_infos[*]')}
                        <Select label={t('customWalletKind')} value={entry.kind} onChange={(kind) => walletSet(index, { kind })}
                          options={[['topped-up', t('accountBalance')], ['granted', t('bonusBalance')], ['extra-usage', t('extraUsage')]]} />
                        <button type="button" className="dmu-button dmu-customRemove" aria-label={t('customRemove')}
                          onClick={() => update({ wallets: form.wallets.filter((_entry, i) => i !== index) })}>{'✕'}</button>
                      </div>
                      <div className="dmu-customRow">
                        {pathField(t('customBalance'), entry.balance, (balance) => walletSet(index, { balance }), entry.itemsPath, 'total_balance')}
                        {pathField(t('customCurrency'), entry.currency, (currency) => walletSet(index, { currency }), entry.itemsPath, '=CNY')}
                        <Field label={t('customDivisor')} value={entry.divisor} placeholder="1" onChange={(divisor) => walletSet(index, { divisor })} />
                      </div>
                      <div className="dmu-customRow">
                        {pathField(t('customGranted'), entry.granted, (granted) => walletSet(index, { granted }), entry.itemsPath)}
                        {pathField(t('customToppedUp'), entry.toppedUp, (toppedUp) => walletSet(index, { toppedUp }), entry.itemsPath)}
                        {pathField(t('customCash'), entry.cash, (cash) => walletSet(index, { cash }), entry.itemsPath)}
                        {pathField(t('customVoucher'), entry.voucher, (voucher) => walletSet(index, { voucher }), entry.itemsPath)}
                      </div>
                    </div>
                  ))}
                  <button type="button" className="dmu-button" onClick={() => update({ wallets: [...form.wallets, emptyWallet()] })}>{t('customAddWallet')}</button>
                </fieldset>
                <fieldset className="dmu-customGroup">
                  <legend>{t('customQuotas')}</legend>
                  {form.quotas.map((entry, index) => (
                    <div className="dmu-customRule" key={index}>
                      <div className="dmu-customRow">
                        {pathField(t('customItemsPath'), entry.itemsPath, (itemsPath) => quotaSet(index, { itemsPath }), '', 'limits[*]')}
                        {pathField(t('customQuotaName'), entry.name, (name) => quotaSet(index, { name }), entry.itemsPath, '=5h')}
                        <Select label={t('customPeriod')} value={entry.period} onChange={(period) => quotaSet(index, { period })}
                          options={[['', t('customPeriodNone')], ['five-hour', t('quota-five-hour')], ['weekly', t('quota-weekly')], ['monthly', t('quota-monthly')]]} />
                        <button type="button" className="dmu-button dmu-customRemove" aria-label={t('customRemove')}
                          onClick={() => update({ quotas: form.quotas.filter((_entry, i) => i !== index) })}>{'✕'}</button>
                      </div>
                      <div className="dmu-customRow">
                        {pathField(t('customUsedPercent'), entry.usedPercent, (usedPercent) => quotaSet(index, { usedPercent }), entry.itemsPath)}
                        {pathField(t('customRemainingPercent'), entry.remainingPercent, (remainingPercent) => quotaSet(index, { remainingPercent }), entry.itemsPath)}
                        <label className="dmu-filterCheck">
                          <input type="checkbox" checked={entry.percentIsRatio} onChange={(event: InputEvent) => quotaSet(index, { percentIsRatio: event.target.checked === true })} />
                          {t('customPercentIsRatio')}
                        </label>
                      </div>
                      <div className="dmu-customRow">
                        {pathField(t('customUsed'), entry.used, (used) => quotaSet(index, { used }), entry.itemsPath)}
                        {pathField(t('customLimit'), entry.limit, (limit) => quotaSet(index, { limit }), entry.itemsPath)}
                        {pathField(t('customRemaining'), entry.remaining, (remaining) => quotaSet(index, { remaining }), entry.itemsPath)}
                      </div>
                      <div className="dmu-customRow">
                        {pathField(t('customResetAt'), entry.resetAt, (resetAt) => quotaSet(index, { resetAt }), entry.itemsPath)}
                        <Select label={t('customResetFormat')} value={entry.resetFormat} onChange={(resetFormat) => quotaSet(index, { resetFormat })}
                          options={[['auto', t('customResetAuto')], ['iso', 'ISO 8601'], ['unix-s', t('customResetUnixS')], ['unix-ms', t('customResetUnixMs')], ['seconds-from-now', t('customResetRelative')]]} />
                        <Field label={t('customWindowSeconds')} value={entry.windowSeconds} placeholder="18000" onChange={(windowSeconds) => quotaSet(index, { windowSeconds })} />
                      </div>
                    </div>
                  ))}
                  <button type="button" className="dmu-button" onClick={() => update({ quotas: [...form.quotas, emptyQuota()] })}>{t('customAddQuota')}</button>
                </fieldset>
              </div>
              <div className="dmu-customSide">
                <div className="dmu-customSideHead">
                  <h3 className="dmu-supportGroupTitle">{t('customTestTitle')}</h3>
                  {test?.status !== undefined ? <span className={'dmu-badge' + (test.ok ? ' ok' : ' err')}>{'HTTP ' + test.status}</span> : null}
                </div>
                {test === undefined ? <p className="dmu-filterHint">{t('customTestHint')}</p> : (
                  <div className="dmu-customTest">
                    {test.endpoint ? <div className="dmu-endpoint">{test.endpoint}</div> : null}
                    {test.truncated ? <div className="dmu-filterHint">{t('customTruncated')}</div> : null}
                    {test.data !== undefined
                      ? <ul className="dmu-jsonList dmu-jsonRoot"><JsonNode value={test.data} path="" depth={0} t={t} onPick={(path) => pick.current?.(path)} /></ul>
                      : <pre className="dmu-customRaw">{test.text ?? ''}</pre>}
                    <p className="dmu-filterHint">{t('customPickHint')}</p>
                  </div>
                )}
                {preview !== undefined ? (
                  <div className="dmu-customPreview">
                    <h3 className="dmu-supportGroupTitle">{t('customPreview')}</h3>
                    <BalanceBlock balance={preview} t={t} />
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
        <div className="dmu-customFooter">
          <div className="dmu-customMessages" role="status">
            {message ? <div className={message.kind === 'error' ? 'dmu-error' : 'dmu-customOk'}>{message.text}</div> : null}
            {[...serverErrors, ...(message?.kind === 'error' ? clientErrors : [])].map((error, index) => <div key={index} className="dmu-error">{'· ' + error}</div>)}
          </div>
          <div className="dmu-actions">
            {exists ? <button type="button" className="dmu-button" disabled={busy !== undefined} onClick={() => { void run('delete') }}>{t('customDelete')}</button> : null}
            <button type="button" className="dmu-button" disabled={busy !== undefined || form === undefined} onClick={() => { void run('test') }}>
              {busy === 'test' ? t('customTesting') : t('customTest')}
            </button>
            <button type="button" className="dmu-button dmu-buttonPrimary" disabled={busy !== undefined || form === undefined} onClick={() => { void run('save') }}>
              {busy === 'save' ? t('customSaving') : t('customSave')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
