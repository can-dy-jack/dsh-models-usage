/**
 * dsh-models-usage — browser half.
 *
 * Registers three surfaces over data the Host computes:
 *   - `sidebar.panellist` + `main`              → 左侧栏入口 + 中央主面板（模型清单与余额页）
 *   - `conversation.session.header.utilities`   → 会话顶栏余额徽章
 *   - `conversation.chat.commandview`           → 隐藏自身刷新产生的命令行
 *
 * The Host half is reached through the built-in `commands` Remote namespace, so
 * this plugin needs no generated Remote artifacts of its own.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-models-usage',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const CSS_ID = '@local/dsh-models-usage/client.css'
    const CSS = `
.dmu-page{box-sizing:border-box;height:100%;display:flex;flex-direction:column;align-items:center;gap:24px;padding:0 clamp(24px,4vw,48px) 48px;overflow:auto;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.dmu-page>*{width:100%;max-width:960px}
.dmu-pageBody{display:flex;flex-direction:column;gap:12px}
.dmu-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-top:28px}
[data-platform=darwin] .dmu-head{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
.dmu-title{margin:0;font-size:20px;font-weight:500;line-height:28px}
.dmu-sub{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
.dmu-actions{display:flex;align-items:center;gap:8px}
.dmu-button{box-sizing:border-box;height:28px;padding:0 12px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer}
.dmu-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dmu-button:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dmu-card{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border:0.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l1));border-radius:var(--dsw-radius-xl,12px);background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1))}
.dmu-card-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.dmu-name{font-size:14px;font-weight:500}
.dmu-id{color:var(--dsw-alias-label-tertiary);font-size:12px}
.dmu-badges{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dmu-badge{padding:1px 8px;border-radius:999px;border:0.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-size:11px}
.dmu-badge.ok{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.dmu-badge.warn{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.dmu-badge.err{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.dmu-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.dmu-muted{color:var(--dsw-alias-label-tertiary)}
.dmu-amount{font-size:16px;font-weight:600}
.dmu-amount small{font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary);margin-left:6px}
.dmu-link{color:var(--dsw-alias-state-business-primary);text-decoration:none}
.dmu-link:hover{text-decoration:underline}
.dmu-models{display:flex;flex-direction:column;gap:2px;border-top:0.5px solid var(--dsw-alias-border-l2);padding-top:8px}
/* One model is two stacked lines: id/name, then metadata. Stacking keeps a long
   id or a long capability list inside its own box instead of overlapping. */
.dmu-model{display:flex;flex-direction:column;gap:2px;min-width:0;padding:4px 0}
.dmu-modelHead{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap}
.dmu-model-id{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;min-width:0;overflow-wrap:anywhere}
.dmu-model-name{color:var(--dsw-alias-label-secondary);font-size:12px;min-width:0;overflow-wrap:anywhere}
.dmu-model-meta{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;overflow-wrap:anywhere}
.dmu-error{color:var(--dsw-alias-state-error-primary);white-space:pre-wrap}
.dmu-chip{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 10px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}
.dmu-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dmu-empty{color:var(--dsw-alias-label-tertiary)}
.dmu-more{align-self:flex-start;margin-top:2px;padding:0;border:0;background:transparent;color:var(--dsw-alias-state-business-primary);font-size:12px;line-height:18px;cursor:pointer}
.dmu-more:hover{text-decoration:underline}
.dmu-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:max(24px,var(--dsh-frame-overlay-top,24px)) 24px}
.dmu-mask{position:absolute;inset:var(--dsh-frame-chrome-top,0px) 0 0;backdrop-filter:var(--dsw-mask-blur)}
.dmu-mask::after{content:'';position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1)}
.dmu-modal{box-sizing:border-box;position:relative;z-index:1;display:flex;flex-direction:column;width:min(720px,100%);max-height:100%;overflow:hidden;border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent)}
.dmu-modal:focus{outline:none}
.dmu-modalHead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:22px 14px 12px 24px}
.dmu-modalTitle{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dmu-modalBody{display:flex;flex-direction:column;gap:0;min-height:0;overflow-y:auto;padding:0 24px 24px}
.dmu-modalBody .dmu-model{border-bottom:0.5px solid var(--dsw-alias-border-l2);padding:8px 0}
.dmu-modalBody .dmu-model:last-child{border-bottom:0}
.dmu-modalClose{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dmu-modalClose:hover{background:var(--dsw-alias-interactive-bg-hover)}
/* The refresh path runs a slash command; its transcript row is a pure side
   effect of the plugin's own UI, so it renders as a hidden stamp instead. */
[data-chat-flow-kind="command"]:has([data-dmu-command-row]){display:none}
`
    if (typeof document !== 'undefined'
      && document.querySelector('style[data-plugin-css="' + CSS_ID + '"]') === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = '@local/dsh-models-usage'
      tag.dataset.pluginCss = CSS_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    const COPY = {
      zh: {
        nav: '模型用量与余额',
        openPanel: '打开模型用量与余额面板',
        title: '模型清单与余额',
        subtitle: '{providers} 个服务商 · {models} 个模型',
        refresh: '刷新',
        refreshing: '刷新中…',
        updatedAt: '更新于 {time}',
        noSession: '未找到活动会话：请先打开任意会话，再点「刷新」。',
        empty: '未发现任何服务商。',
        loading: '正在读取模型清单…',
        failed: '读取失败：{error}',
        active: '已启用',
        dormant: '未启用',
        declared: '已声明',
        credential: '凭据 {ref}',
        credentialOk: '已配置',
        credentialMissing: '未配置',
        credentialNone: '无需凭据',
        balance: '余额',
        granted: '赠送 {amount}',
        toppedUp: '充值 {amount}',
        unsupported: '该服务商未提供可用模型密钥查询的余额接口',
        noCredential: '未配置 API Key',
        notSignedIn: '未登录',
        openConsole: '打开控制台',
        models: '模型',
        noModels: '该服务商未提供模型目录',
        showAll: '查看全部 {count} 个模型',
        close: '关闭',
      },
      en: {
        nav: 'Model usage & balance',
        openPanel: 'Open the model usage & balance panel',
        title: 'Model list and balance',
        subtitle: '{providers} providers · {models} models',
        refresh: 'Refresh',
        refreshing: 'Refreshing…',
        updatedAt: 'Updated {time}',
        noSession: 'No active session: open a session, then select Refresh.',
        empty: 'No provider found.',
        loading: 'Reading the model list…',
        failed: 'Read failed: {error}',
        active: 'Active',
        dormant: 'Dormant',
        declared: 'Declared',
        credential: 'Credential {ref}',
        credentialOk: 'configured',
        credentialMissing: 'missing',
        credentialNone: 'not required',
        balance: 'Balance',
        granted: 'granted {amount}',
        toppedUp: 'topped up {amount}',
        unsupported: 'This provider exposes no balance endpoint usable with a model API key',
        noCredential: 'API key not configured',
        notSignedIn: 'Not signed in',
        openConsole: 'Open console',
        models: 'Models',
        noModels: 'This provider advertises no model catalog',
        showAll: 'Show all {count} models',
        close: 'Close',
      },
    }

    function activeLanguage() {
      if (typeof document !== 'undefined') {
        const lang = document.documentElement.lang || navigator.language || 'zh-CN'
        return /^zh/i.test(lang) ? 'zh' : 'en'
      }
      return 'zh'
    }

    function translate(lang, key, values) {
      const table = COPY[lang] || COPY.zh
      let text = table[key] || key
      for (const [name, value] of Object.entries(values || {})) {
        text = text.split('{' + name + '}').join(String(value))
      }
      return text
    }

    function isRecord(value) {
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    }

    function currencySymbol(currency) {      if (currency === 'CNY') return '¥'
      if (currency === 'USD') return '$'
      return currency.length > 0 ? currency + ' ' : ''
    }

    function formatAmount(value) {
      const numeric = Number(value)
      if (!Number.isFinite(numeric)) return String(value ?? '')
      if (numeric > 0 && numeric < 0.01) return '<0.01'
      return numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }

    function describeModelMeta(model) {
      const parts = []
      if (typeof model.contextWindow === 'number' && model.contextWindow > 0) {
        parts.push(Math.round(model.contextWindow / 1000) + 'K ctx')
      }
      if (typeof model.maxTokens === 'number' && model.maxTokens > 0) parts.push('≤' + model.maxTokens + ' out')
      if (Array.isArray(model.inputModalities) && model.inputModalities.length > 0) parts.push(model.inputModalities.join('+'))
      if (model.reasoning && Array.isArray(model.reasoning.efforts) && model.reasoning.efforts.length > 0) {
        parts.push('effort: ' + model.reasoning.efforts.map((effort) => effort.id).join('/'))
      }
      return parts.join(' · ')
    }

    /** Read the Host payload through the built-in commands namespace. */
    function createReader(ctx) {
      return async function read(sessionId, detail) {
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          return { ok: false, error: 'no-session' }
        }
        const line = '/dsh-models-usage ' + (detail ? 'detail' : 'summary')
        try {
          // The client Remote validates the business argument count: three
          // (agentId, line, submittedAttachments) plus an optional AbortSignal.
          const execution = await ctx.remote.commands.execute(sessionId, line, [])
          const envelope = isRecord(execution) && typeof execution.ok === 'boolean'
            ? execution
            : { ok: true, value: execution }
          if (envelope.ok !== true) {
            return { ok: false, error: String(envelope.error === undefined ? 'remote-error' : envelope.error) }
          }
          const value = envelope.value
          const result = isRecord(value) && isRecord(value.result) ? value.result : undefined
          if (result === undefined) return { ok: false, error: 'empty-result' }
          if (result.kind === 'error') return { ok: false, error: String(result.text === undefined ? 'command-failed' : result.text) }
          const text = typeof result.text === 'string' ? result.text : undefined
          if (text === undefined || text.length === 0) {
            return { ok: false, error: 'empty-result' }
          }
          return { ok: true, payload: JSON.parse(text) }
        } catch (error) {
          return { ok: false, error: String((error && error.message) || error) }
        }
      }
    }

    function usePayload(read, sessionId, detail, manualToken) {
      const [state, setState] = React.useState({ kind: 'loading' })
      React.useEffect(() => {
        let disposed = false
        setState((previous) => (previous.kind === 'ready' ? previous : { kind: 'loading' }))
        read(sessionId, detail).then((result) => {
          if (disposed) return
          if (result.ok) setState({ kind: 'ready', payload: result.payload })
          else setState({ kind: 'error', error: result.error })
        })
        return () => { disposed = true }
      }, [sessionId, detail, manualToken])
      return state
    }

    /* ─── 顶栏徽章 ─────────────────────────────────────────────────────── */

    /**
     * The session the main view is showing. The store state is
     * `{ ids, byId, phase }` — there is no `current` field — so the active
     * session is the row retained by the main view, exactly as the shipped
     * `ui-session` / `ui-settings-general` pages select it.
     */
    function currentSessionId(state) {
      const byId = state && typeof state === 'object' && isRecord(state.byId) ? state.byId : undefined
      if (byId === undefined) return undefined
      const main = Object.values(byId).find((session) => session && (session.retainedBy ? session.retainedBy.mainView : 0) > 0)
      if (main !== undefined && typeof main.id === 'string') return main.id
      for (const id of Array.isArray(state.ids) ? state.ids : []) {
        const row = byId[id]
        if (row && row.origin !== 'subagent' && typeof row.id === 'string') return row.id
      }
      return undefined
    }

    /** A session id from slot props: the explicit one first, then the session store. */
    function sessionIdFromProps(props) {
      if (props !== null && typeof props === 'object' && typeof props.sessionId === 'string' && props.sessionId.length > 0) {
        return props.sessionId
      }
      if (props !== null && typeof props === 'object' && typeof props.useSessions === 'function') {
        return props.useSessions(currentSessionId)
      }
      return undefined
    }

    function UsageChip(props) {
      const read = props.read
      const lang = activeLanguage()
      const t = (key, values) => translate(lang, key, values)
      const sessionId = sessionIdFromProps(props)
      const [token, setToken] = React.useState(0)
      const state = usePayload(read, sessionId, false, token)

      let label = '…'
      if (state.kind === 'ready') {
        const providers = Array.isArray(state.payload.providers) ? state.payload.providers : []
        const wallets = []
        for (const provider of providers) {
          const balance = provider.balance
          if (balance && balance.status === 'ready' && Array.isArray(balance.wallets)) {
            for (const wallet of balance.wallets) wallets.push(wallet)
          }
        }
        label = wallets.length === 0
          ? String(state.payload.counts ? state.payload.counts.models : 0) + ' models'
          : wallets.map((wallet) => currencySymbol(wallet.currency) + formatAmount(wallet.balance)).join(' / ')
      } else if (state.kind === 'error') {
        label = '—'
      }

      return h('button', {
        type: 'button',
        className: 'dmu-chip',
        title: t('openPanel'),
        onClick: () => { setToken((value) => value + 1); props.open() },
      }, h('span', null, label))
    }

    /* ─── 设置页 ───────────────────────────────────────────────────────── */

    function WalletLine(props) {
      const wallet = props.wallet
      const parts = []
      if (wallet.toppedUp !== undefined && String(wallet.toppedUp).length > 0) {
        parts.push(props.t('toppedUp', { amount: currencySymbol(wallet.currency) + formatAmount(wallet.toppedUp) }))
      }
      if (wallet.granted !== undefined && String(wallet.granted).length > 0 && Number(wallet.granted) !== 0) {
        parts.push(props.t('granted', { amount: currencySymbol(wallet.currency) + formatAmount(wallet.granted) }))
      }
      return h('div', { className: 'dmu-row' },
        h('span', { className: 'dmu-amount' },
          currencySymbol(wallet.currency) + formatAmount(wallet.balance),
          parts.length > 0 ? h('small', null, parts.join(' · ')) : null),
        h('span', { className: 'dmu-muted' }, wallet.kind === 'granted' ? 'bonus' : 'wallet'))
    }

    function BalanceBlock(props) {
      const balance = props.balance
      const t = props.t
      if (balance === undefined || balance === null) {
        return h('div', { className: 'dmu-muted' }, '—')
      }
      if (balance.status === 'ready') {
        const wallets = Array.isArray(balance.wallets) ? balance.wallets : []
        const bonus = Array.isArray(balance.bonusWallets) ? balance.bonusWallets.filter((wallet) => Number(wallet.balance) > 0) : []
        return h('div', { className: 'dmu-models' },
          wallets.length === 0 ? h('div', { className: 'dmu-muted' }, '—') : wallets.map((wallet, index) => h(WalletLine, { key: 'w' + index, wallet, t })),
          bonus.map((wallet, index) => h(WalletLine, { key: 'b' + index, wallet, t })))
      }
      const message = balance.status === 'no-credential'
        ? t('noCredential')
        : balance.status === 'not-signed-in'
          ? t('notSignedIn')
          : balance.status === 'unsupported'
            ? t('unsupported')
            : (balance.message || balance.status)
      return h('div', { className: 'dmu-row' },
        h('span', { className: balance.status === 'failed' ? 'dmu-error' : 'dmu-muted' }, message),
        typeof balance.link === 'string' && balance.link.length > 0
          ? h('a', { className: 'dmu-link', href: balance.link, target: '_blank', rel: 'noreferrer' }, t('openConsole'))
          : null)
    }

    /** How many models a card shows before the rest move into the dialog. */
    const MODEL_PREVIEW = 6

    function ModelRow(props) {
      const model = props.model
      const meta = describeModelMeta(model)
      return h('div', { className: 'dmu-model' },
        h('div', { className: 'dmu-modelHead' },
          h('span', { className: 'dmu-model-id' }, model.id),
          model.name && model.name !== model.id ? h('span', { className: 'dmu-model-name' }, model.name) : null),
        meta.length > 0 ? h('div', { className: 'dmu-model-meta' }, meta) : null)
    }

    /** All of one provider's models; markup and styling follow the host's Modal. */
    function ModelModal(props) {
      const t = props.t
      const models = props.models
      const dialogRef = React.useRef(null)
      React.useEffect(() => {
        const previous = typeof document === 'undefined' ? null : document.activeElement
        if (dialogRef.current !== null && typeof dialogRef.current.focus === 'function') dialogRef.current.focus()
        const onKey = (event) => {
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
      return h('div', {
        className: 'dmu-overlay',
        onMouseDown: (event) => { if (event.target === event.currentTarget) props.onClose() },
      },
        h('div', { className: 'dmu-mask', 'aria-hidden': true }),
        h('div', {
          className: 'dmu-modal', role: 'dialog', 'aria-modal': 'true',
          'aria-labelledby': 'dmu-modal-title', tabIndex: -1, ref: dialogRef,
        },
          h('div', { className: 'dmu-modalHead' },
            h('div', null,
              h('h2', { className: 'dmu-modalTitle', id: 'dmu-modal-title' }, props.provider.displayName || props.provider.id),
              h('p', { className: 'dmu-sub' }, props.provider.id + ' · ' + t('models') + ' ' + models.length)),
            h('button', {
              type: 'button', className: 'dmu-modalClose', title: t('close'), 'aria-label': t('close'),
              onClick: props.onClose,
            }, '\u2715')),
          h('div', { className: 'dmu-modalBody' }, models.map((model) => h(ModelRow, { key: model.id, model })))))
    }

    function ProviderCard(props) {
      const provider = props.provider
      const t = props.t
      const models = Array.isArray(provider.models) ? provider.models : []
      const [expanded, setExpanded] = React.useState(false)
      const credential = provider.credential
      const badges = []
      badges.push(h('span', {
        key: 'state',
        className: 'dmu-badge' + (provider.active ? ' ok' : ''),
      }, t(provider.active ? 'active' : 'dormant')))
      if (provider.api) badges.push(h('span', { key: 'api', className: 'dmu-badge' }, provider.api))
      if (credential) {
        badges.push(h('span', {
          key: 'cred',
          className: 'dmu-badge' + (credential.configured ? ' ok' : ' warn'),
        }, t('credential', { ref: credential.ref }) + ' · ' + t(credential.configured ? 'credentialOk' : 'credentialMissing')))
      } else {
        badges.push(h('span', { key: 'cred', className: 'dmu-badge' }, t('credentialNone')))
      }
      return h('div', { className: 'dmu-card' },
        h('div', { className: 'dmu-card-head' },
          h('div', null,
            h('div', { className: 'dmu-name' }, provider.displayName || provider.id),
            h('div', { className: 'dmu-id' }, provider.id + (provider.baseURL ? ' · ' + provider.baseURL : ''))),
          h('div', { className: 'dmu-badges' }, badges)),
        h(BalanceBlock, { balance: provider.balance, t }),
        provider.configError
          ? h('div', { className: 'dmu-error' }, provider.configError)
          : null,
        h('div', { className: 'dmu-models' },
          h('div', { className: 'dmu-muted' }, t('models') + ' · ' + provider.modelCount),
          models.length === 0
            ? h('div', { className: 'dmu-empty' }, t('noModels'))
            : models.slice(0, MODEL_PREVIEW).map((model) => h(ModelRow, { key: model.id, model })),
          models.length > MODEL_PREVIEW
            ? h('button', {
                type: 'button', className: 'dmu-more',
                onClick: () => setExpanded(true),
              }, t('showAll', { count: models.length }))
            : null),
        expanded ? h(ModelModal, { provider, models, t, onClose: () => setExpanded(false) }) : null)
    }

    function ModelsUsagePanel(props) {
      const read = props.read
      const diag = props.diag
      const lang = props.lang
      const t = (key, values) => translate(lang, key, values)
      const sessionId = props.sessionId
      const [token, setToken] = React.useState(0)
      const state = usePayload(read, sessionId, true, token)

      const header = h('div', { className: 'dmu-head' },
        h('div', null,
          h('h1', { className: 'dmu-title' }, t('title')),
          h('p', { className: 'dmu-sub' }, state.kind === 'ready'
            ? t('subtitle', { providers: state.payload.counts.providers, models: state.payload.counts.models })
              + (state.payload.fetchedAt ? ' · ' + t('updatedAt', { time: new Date(state.payload.fetchedAt).toLocaleTimeString() }) : '')
            : '')),
        h('div', { className: 'dmu-actions' },
          h('button', {
            type: 'button',
            className: 'dmu-button',
            disabled: state.kind === 'loading',
            onClick: () => setToken((value) => value + 1),
          }, t(state.kind === 'loading' ? 'refreshing' : 'refresh'))))

      let body
      if (state.kind === 'loading') {
        body = h('div', { className: 'dmu-muted' }, t('loading'))
      } else if (state.kind === 'error') {
        body = state.error === 'no-session'
          ? h('div', null,
              h('div', { className: 'dmu-muted' }, t('noSession')),
              h('div', { className: 'dmu-id' }, 'store: ' + String(diag)))
          : h('div', { className: 'dmu-error' }, t('failed', { error: state.error }))
      } else {
        const providers = Array.isArray(state.payload.providers) ? state.payload.providers : []
        body = providers.length === 0
          ? h('div', { className: 'dmu-empty' }, t('empty'))
          : h(React.Fragment, null, providers.map((provider) => h(ProviderCard, { key: provider.id, provider, t })))
      }

      return h('div', { className: 'dmu-page' }, header, h('div', { className: 'dmu-pageBody' }, body))
    }

    /**
     * Left-rail entry icon; the sidebar owns the button around it.
     *
     * A model list card whose bottom-right corner is notched by a coin. The mask
     * clears a ring of space so the coin never touches the card's outline; its
     * literal black/white content is mask geometry, not visible colour, and the
     * visible strokes follow `currentColor` so the rail's own states apply.
     */
    const ICON_GAP_ID = 'dmu-icon-gap'

    function PanelIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 20
      const stroke = { stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true,
        style: { display: 'block' },
      },
        h('mask', { id: ICON_GAP_ID, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 24, height: 24 },
          h('rect', { x: 0, y: 0, width: 24, height: 24, fill: '#fff' }),
          h('circle', { cx: 17.25, cy: 16.75, r: 5.75, fill: '#000' })),
        h('g', { mask: 'url(#' + ICON_GAP_ID + ')', ...stroke },
          h('rect', { x: 2.5, y: 3.75, width: 19, height: 13.5, rx: 3 }),
          h('path', { d: 'M6.4 8.3h6.4' }),
          h('path', { d: 'M6.4 11.3h4' })),
        h('g', stroke,
          h('circle', { cx: 17.25, cy: 16.75, r: 4.35 }),
          h('circle', { cx: 17.25, cy: 16.75, r: 2.26 })))
    }

    /* ─── plugin ───────────────────────────────────────────────────────── */

    /** One id shared by the sidebar entry and the main panel it opens. */
    const PANEL_ID = 'models-usage'

    /** Select this plugin's main panel; the shell ignores an unknown id. */
    function openPanel(ctx) {
      try {
        ctx.layout.selectPanel(PANEL_ID)
      } catch {
        /* the layout service is optional; the entry still works when it is absent */
      }
    }

    const inject = ['slots', 'remote', 'remote.commands', 'layout']

    function apply(ctx) {
      const read = createReader(ctx)

      // Hide the `/dsh-models-usage ...` rows this plugin's own refreshes append.
      ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register(
        { name: 'conversation.chat.commandview', key: 'dsh-models-usage' },
        () => h('div', { 'data-dmu-command-row': 'true' }),
      ))

      // The page itself: `sidebar.panellist` supplies the left-rail entry whose id
      // is exactly the `main` key the shell dispatches, so clicking the entry
      // selects this panel in the central column.
      ctx.slots.inject('main', () => ctx.slots.register(
        { name: 'main', key: PANEL_ID },
        (props) => {
          const sessionId = sessionIdFromProps(props)
          // Diagnostic only: proves what the session store held when no id was found.
          const diag = typeof props.useSessions === 'function'
            ? props.useSessions((state) => {
                const byId = isRecord(state && state.byId) ? state.byId : {}
                const rows = Object.values(byId)
                const retained = rows.filter((row) => row && (row.retainedBy ? row.retainedBy.mainView : 0) > 0).length
                return String(state && state.phase) + '/rows=' + rows.length + '/main=' + retained
              })
            : 'no-hook'
          const [lang, setLang] = React.useState(activeLanguage())
          React.useEffect(() => {
            const timer = setInterval(() => {
              const next = activeLanguage()
              setLang((previous) => (previous === next ? previous : next))
            }, 5000)
            return () => clearInterval(timer)
          }, [])
          return h(ModelsUsagePanel, { read, sessionId, lang, diag })
        },
      ))

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
        { name: 'sidebar.panellist', id: PANEL_ID, order: 6, label: translate(activeLanguage(), 'nav') },
        PanelIcon,
      ))

      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register(
        { name: 'conversation.session.header.utilities', id: 'models-usage', order: 11, label: translate(activeLanguage(), 'nav') },
        (props) => h(UsageChip, { read, sessionId: sessionIdFromProps(props), open: () => openPanel(ctx) }),
      ))
    }

    return { name: '@local/dsh-models-usage', inject, apply }
  },
})
