/**
 * dsh-models-usage — browser half (entry).
 *
 * Registers two surfaces over data the Host computes:
 *   - `sidebar.panellist` + `main`              → 左侧栏入口 + 中央主面板（模型清单与余额页）
 *   - `conversation.chat.commandview`           → 隐藏自身刷新产生的命令行
 *
 * The Host half is reached through the built-in `commands` Remote namespace, so
 * this plugin needs no generated Remote artifacts of its own.
 *
 * NOTE: this bundle is built with esbuild `bundle + iife` into a single
 * lib/client.js — the host serves it as a *script* evaluated by
 * `window.__ModuleLoader__`. Relative imports and JSX are fine here (JSX
 * compiles to `React.createElement` on the shared React binding); what must
 * never reach the output is a bare specifier or a top-level `export`.
 *
 * Layout: `client/` is split by responsibility —
 *   context.ts   module loader + injected service surfaces
 *   react.ts     shared React singleton (init inside the factory) + JSX contract
 *   css.ts       panel stylesheet
 *   i18n.ts      zh/en copy tables
 *   format.ts    currency/amount/model-meta formatting
 *   session.ts   active-session resolution
 *   data.ts      commands-Remote reader + payload hook
 *   filter.ts    pure search/capability projections + instance filter state
 *   ui/          TSX components (balance, filters, models, card, panel, icon)
 */

import { initReact, React } from './client/react'
import { ensureStyle } from './client/css'
import { createReader } from './client/data'
import { createFilterStore } from './client/filter'
import { isRecord } from './shared'
import { activeLanguage, translate } from './client/i18n'
import { sessionIdFromProps } from './client/session'
import { PanelIcon } from './client/ui/icon'
import { ModelsUsagePanel } from './client/ui/panel'
import type { ClientContext, ModuleRequire, SessionRow, SessionStore } from './client/context'

window.__ModuleLoader__.load({
  id: '@local/dsh-models-usage',
  factory(require: ModuleRequire) {
    initReact(require('react'))
    ensureStyle()

    /** One id shared by the sidebar entry and the main panel it opens. */
    const PANEL_ID = 'models-usage'

    /**
     * Open the host Settings modal directly on one section (default: models).
     * The settings shell (ui-settings-general) mounts as the `sidebar.settings`
     * entry carrying a store whose instance actions include `openSection` —
     * the same action its own onboarding steps and the Cmd+, shortcut call.
     */
    function openSettingsSection(ctx: ClientContext, id = 'models') {
      try {
        for (const entry of ctx.slots.entries('sidebar.settings')) {
          const store = isRecord(entry) ? entry.store : undefined
          const instance = isRecord(store) && typeof store.create === 'function' ? store.create() : undefined
          const actions = isRecord(instance) ? instance.actions : undefined
          if (!isRecord(actions)) continue
          if (typeof actions.openSection === 'function') { actions.openSection(id); return }
          if (typeof actions.select === 'function' && typeof actions.open === 'function') { actions.select(id); actions.open(); return }
          if (typeof actions.open === 'function') { actions.open(); return }
        }
      } catch {
        /* the settings shell is optional; the button silently no-ops without it */
      }
    }

    const inject = ['slots', 'remote', 'remote.commands']

    function apply(ctx: ClientContext) {
      const read = createReader(ctx)
      const filters = createFilterStore()

      // Hide the `/dsh-models-usage ...` rows this plugin's own refreshes append.
      ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register(
        { name: 'conversation.chat.commandview', key: 'dsh-models-usage' },
        () => <div data-dmu-command-row="true" />,
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
            ? props.useSessions((state: SessionStore) => {
                const byId: Record<string, SessionRow | undefined> = state && isRecord(state.byId) ? state.byId : {}
                const rows = Object.values(byId)
                const retained = rows.filter((row) => (row?.retainedBy?.mainView ?? 0) > 0).length
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
          return <ModelsUsagePanel read={read} filters={filters} sessionId={sessionId} lang={lang} diag={diag} openSettings={() => openSettingsSection(ctx)} />
        },
      ))

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
        { name: 'sidebar.panellist', id: PANEL_ID, order: 6, label: translate(activeLanguage(), 'nav') },
        PanelIcon,
      ))
    }

    return { name: '@local/dsh-models-usage', inject, apply }
  },
})
