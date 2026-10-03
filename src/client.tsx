/**
 * dsh-models-usage — browser half (entry).
 *
 * Registers three surfaces over data the Host computes:
 *   - `sidebar.panellist` + `main`              → 左侧栏入口 + 中央主面板（模型清单与余额页）
 *   - `conversation.session.header.utilities`   → 会话顶栏余额徽章
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
 *   ui/          TSX components (chip, balance, models, card, panel, icon)
 */

import { initReact, React } from './client/react'
import { ensureStyle } from './client/css'
import { createReader } from './client/data'
import { isRecord } from './shared'
import { activeLanguage, translate } from './client/i18n'
import { sessionIdFromProps } from './client/session'
import { UsageChip } from './client/ui/chip'
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

    /** Select this plugin's main panel; the shell ignores an unknown id. */
    function openPanel(ctx: ClientContext) {
      try {
        ctx.layout.selectPanel(PANEL_ID)
      } catch {
        /* the layout service is optional; the entry still works when it is absent */
      }
    }

    const inject = ['slots', 'remote', 'remote.commands', 'layout']

    function apply(ctx: ClientContext) {
      const read = createReader(ctx)

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
          return <ModelsUsagePanel read={read} sessionId={sessionId} lang={lang} diag={diag} />
        },
      ))

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
        { name: 'sidebar.panellist', id: PANEL_ID, order: 6, label: translate(activeLanguage(), 'nav') },
        PanelIcon,
      ))

      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register(
        { name: 'conversation.session.header.utilities', id: 'models-usage', order: 11, label: translate(activeLanguage(), 'nav') },
        (props) => <UsageChip read={read} sessionId={sessionIdFromProps(props)} open={() => openPanel(ctx)} />,
      ))
    }

    return { name: '@local/dsh-models-usage', inject, apply }
  },
})
