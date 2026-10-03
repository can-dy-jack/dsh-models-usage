/** Panel styles, injected once as a <style> tag. */

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

export function ensureStyle(): void {
  if (typeof document !== 'undefined'
    && document.querySelector('style[data-plugin-css="' + CSS_ID + '"]') === null) {
    const tag = document.createElement('style')
    tag.dataset.plugin = '@local/dsh-models-usage'
    tag.dataset.pluginCss = CSS_ID
    tag.textContent = CSS
    document.head.appendChild(tag)
  }
}
