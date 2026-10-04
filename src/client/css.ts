/** Panel styles; reuse the same <style> tag across module revisions. */

const CSS_ID = '@local/dsh-models-usage/client.css'

const CSS = `
.dmu-page{position:relative;box-sizing:border-box;height:100%;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden;container:dmu-page / inline-size;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.dmu-page>*{flex:none;min-width:0;width:100%;box-sizing:border-box}
/* Keep the compact header outside the list's scroll container. */
.dmu-pageBody{flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;padding:12px 20px 24px;overflow-y:auto}
.dmu-pageBody>*{flex:none}
/* Anchor the loading group to the whole panel, including the header's height. */
.dmu-pageBody.is-loading{overflow:hidden}
.dmu-loading{position:absolute;inset:0;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;pointer-events:none;text-align:center;color:var(--dsw-alias-label-secondary)}
.dmu-loadingIcon{display:block;flex:none;color:var(--dsw-alias-state-business-primary,#4d6bfe);transform-origin:center;animation:dmu-whale-float 1.8s ease-in-out infinite}
.dmu-loadingText{margin:0;max-width:100%;font-size:13px;line-height:20px;overflow-wrap:anywhere}
@keyframes dmu-whale-float{0%,100%{transform:translateY(2px) rotate(-3deg)}50%{transform:translateY(-3px) rotate(3deg)}}
@media (prefers-reduced-motion:reduce){.dmu-loadingIcon{animation:none}}
/* Keep card widths consistent even when the last row has fewer providers. */
.dmu-providerGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));grid-auto-rows:1fr;gap:12px;align-items:stretch;min-width:0}
.dmu-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 20px 10px;border-bottom:0.5px solid var(--dsw-alias-border-l2)}
[data-platform=darwin] .dmu-head{padding-left:max(20px,calc(var(--dsh-frame-leading-clearance,0px) + 12px))}
.dmu-title{margin:0;font-size:18px;font-weight:500;line-height:26px}
.dmu-sub{margin:2px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dmu-actions{display:flex;align-items:center;flex-wrap:wrap;gap:6px;max-width:100%;flex:none}
.dmu-button{box-sizing:border-box;height:28px;padding:0 12px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer}
.dmu-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dmu-button:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dmu-filterBar{box-sizing:border-box;min-width:0;padding:8px 20px 10px;border-bottom:0.5px solid var(--dsw-alias-border-l2)}
.dmu-page>.dmu-filterBar{max-height:45%;overflow-y:auto}
.dmu-filterDisclosure{display:flex;align-items:center;flex-wrap:wrap;gap:4px 12px;min-width:0}
.dmu-filterToggle{display:inline-flex;align-items:center;gap:6px;flex:none;min-height:24px;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.dmu-filterToggle:hover{color:var(--dsw-alias-label-primary)}
.dmu-filterToggle:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px}
.dmu-filterToggle[aria-expanded=true] svg{transform:rotate(90deg)}
.dmu-filterActive{color:var(--dsw-alias-state-business-primary);font-size:10px}
.dmu-filterDisclosure .dmu-filterSummary{margin:0}
.dmu-filterContent:not([hidden]){margin-top:8px}
.dmu-filters{display:flex;align-items:flex-end;flex-wrap:wrap;gap:8px;min-width:0}
.dmu-filterField{display:flex;flex:1 1 120px;flex-direction:column;gap:3px;min-width:0;color:var(--dsw-alias-label-secondary);font-size:11px}
.dmu-filterSearch{flex:2 1 240px}
.dmu-filterInput{box-sizing:border-box;width:100%;min-width:0;height:30px;padding:0 8px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.dmu-filterInput::placeholder{color:var(--dsw-alias-label-tertiary)}
.dmu-filterCheck{display:flex;align-items:center;gap:5px;flex:none;min-height:30px;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer}
.dmu-filterCheck input{margin:0;accent-color:var(--dsw-alias-state-business-primary)}
.dmu-filterInput:focus-visible,.dmu-filterCheck input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dmu-filterReset{flex:none;height:30px}
.dmu-filterSummary{margin:6px 0 0;color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.dmu-filterHint{margin:3px 0 0;color:var(--dsw-alias-label-tertiary);font-size:11px;overflow-wrap:anywhere}
.dmu-noResults{padding:12px 0}
.dmu-noResults .dmu-empty{margin:0 0 8px}
.dmu-card{box-sizing:border-box;display:flex;flex-direction:column;min-width:0;min-height:160px;padding:10px 12px;border:0.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l1));border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1))}
.dmu-providerSummary{display:flex;flex-direction:column;flex:1;min-width:0}
.dmu-providerMeta{display:flex;align-items:center;flex-wrap:wrap;gap:4px 6px;margin-top:4px}
.dmu-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.dmu-cardTitle{min-width:0}
.dmu-cardActions{display:flex;align-items:center;gap:4px;flex:none}
.dmu-providerRefresh,.dmu-providerCustom{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:var(--dsw-radius-sm,4px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dmu-providerRefresh:hover:not(:disabled),.dmu-providerCustom:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dmu-providerRefresh:disabled,.dmu-providerCustom:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dmu-providerRefresh:focus-visible,.dmu-providerCustom:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dmu-providerRefresh.is-refreshing svg{animation:dmu-refresh-spin 1s linear infinite}
@keyframes dmu-refresh-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.dmu-providerRefresh.is-refreshing svg{animation:none}}
.dmu-name{margin:0;min-width:0;font-size:14px;font-weight:500;line-height:20px;overflow-wrap:anywhere}
.dmu-id{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px;overflow-wrap:anywhere}
.dmu-endpoint{margin-top:4px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;overflow-wrap:anywhere}
.dmu-updatedAt{display:block;margin-top:2px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px}
.dmu-badges{display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-width:0}
.dmu-badge{box-sizing:border-box;max-width:100%;padding:0 6px;border-radius:4px;border:0.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-size:10px;line-height:17px;overflow-wrap:anywhere}
.dmu-providerState{flex:none;border:0;padding:0;color:var(--dsw-alias-label-tertiary)}
.dmu-providerState::before{content:'';display:inline-block;width:5px;height:5px;margin:0 4px 1px 0;border-radius:50%;background:currentColor}
.dmu-badge.ok{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.dmu-badge.warn{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.dmu-badge.err{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.dmu-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.dmu-quota{--dmu-quota-color:var(--dsw-alias-state-success-primary);display:flex;flex-direction:column;gap:1px;padding:2px 0}
.dmu-quota[data-level=medium]{--dmu-quota-color:var(--dsw-alias-state-warn-primary)}
.dmu-quota[data-level=low]{--dmu-quota-color:var(--dsw-alias-state-error-primary)}
.dmu-quota .dmu-row{flex-wrap:wrap;gap:4px 6px}
.dmu-quota .dmu-amount{color:var(--dmu-quota-color);font-size:12px;line-height:18px}
.dmu-quota .dmu-muted{font-size:10px;line-height:14px;overflow-wrap:anywhere}
.dmu-quotaProgress{height:6px;margin:4px 0;border-radius:999px;background:var(--dsw-alias-border-l2);overflow:hidden}
.dmu-quotaProgressFill{display:block;height:100%;border-radius:inherit;background:var(--dmu-quota-color)}
.dmu-muted{color:var(--dsw-alias-label-tertiary)}
.dmu-balance{display:flex;flex-direction:column;gap:4px;margin-top:8px;padding-top:7px;border-top:0.5px solid var(--dsw-alias-border-l2);font-size:11px}
.dmu-balanceRow{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap}
.dmu-balanceLabel{color:var(--dsw-alias-label-secondary)}
.dmu-amount{font-size:16px;font-weight:600;line-height:22px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.dmu-walletDetails{display:block;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;overflow-wrap:anywhere}
.dmu-balanceStatus{display:flex;align-items:baseline;gap:4px 8px;flex-wrap:wrap;overflow-wrap:anywhere}
.dmu-link{color:var(--dsw-alias-state-business-primary);text-decoration:none}
.dmu-link:hover{text-decoration:underline}
.dmu-modelsTrigger{display:inline-flex;align-items:center;gap:6px;min-height:20px;padding:0;border:0;background:transparent;color:var(--dsw-alias-state-business-primary);font:inherit;font-size:11px;cursor:pointer}
.dmu-modelsTrigger:hover:not(:disabled){text-decoration:underline}
.dmu-modelsTrigger:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dmu-modelCount{padding:0 5px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:4px;font-size:10px;line-height:15px;font-variant-numeric:tabular-nums}
/* Model metadata shares a row in wide dialogs and stacks in narrow dialogs. */
.dmu-model{display:grid;grid-template-columns:minmax(0,1fr) fit-content(260px);align-items:baseline;gap:2px 12px;min-width:0;padding:5px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2)}
.dmu-model:last-child{border-bottom:0}
.dmu-modelHead{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap}
.dmu-model-id{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;min-width:0;overflow-wrap:anywhere}
.dmu-model-name{color:var(--dsw-alias-label-secondary);font-size:11px;min-width:0;overflow-wrap:anywhere}
.dmu-model-meta{--dmu-model-tags-align:flex-end;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;text-align:right;overflow-wrap:anywhere}
.dmu-model-capabilities{display:flex;justify-content:var(--dmu-model-tags-align);flex-wrap:wrap;gap:4px;min-width:0;margin:3px 0 0;padding:0;list-style:none}
.dmu-model-capabilities:first-child{margin-top:0}
.dmu-error{color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;overflow-wrap:anywhere}
.dmu-empty{color:var(--dsw-alias-label-tertiary)}
.dmu-button:focus-visible,.dmu-modelsTrigger:focus-visible,.dmu-link:focus-visible,.dmu-modalClose:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px}
@container dmu-page (max-width:760px){
  .dmu-filterSearch{flex-basis:100%}
}
@container dmu-page (max-width:540px){
  .dmu-balance{margin-top:6px;padding-top:6px}
  .dmu-head{gap:8px}
}
.dmu-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:max(24px,var(--dsh-frame-overlay-top,24px)) 24px}
.dmu-mask{position:absolute;inset:var(--dsh-frame-chrome-top,0px) 0 0;backdrop-filter:var(--dsw-mask-blur)}
.dmu-mask::after{content:'';position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1)}
.dmu-modal{box-sizing:border-box;position:relative;z-index:1;display:flex;flex-direction:column;width:min(820px,100%);max-height:100%;overflow:hidden;container:dmu-modal / inline-size;border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent)}
.dmu-modal:focus{outline:none}
.dmu-modalHead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:16px 12px 10px 20px}
.dmu-modalTitle{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dmu-modalBody{display:flex;flex-direction:column;gap:0;min-height:0;overflow-y:auto;padding:0 20px 16px}
.dmu-modalHead{flex:none}
.dmu-modalFilters{flex:none;max-height:45%;overflow-y:auto;margin-bottom:6px}
.dmu-modalBody .dmu-model{grid-template-columns:minmax(0,1fr) fit-content(260px);padding:6px 0}
.dmu-modalBody .dmu-model-meta{--dmu-model-tags-align:flex-end;text-align:right}
@container dmu-modal (max-width:600px){
  .dmu-filterSearch{flex-basis:100%}
  .dmu-modalBody .dmu-model{grid-template-columns:minmax(0,1fr)}
  .dmu-modalBody .dmu-model-meta{--dmu-model-tags-align:flex-start;text-align:left}
}
.dmu-modalClose{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dmu-modalClose:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dmu-supportModal{width:min(640px,100%)}
.dmu-supportIntro{margin:0 0 6px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dmu-supportGroup{margin-top:12px;padding:12px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm)}
.dmu-supportGroupTitle{margin:0;font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dmu-supportList{margin:0;padding:0;list-style:none}
.dmu-supportItem{padding:10px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2)}
.dmu-supportItem:last-child{padding-bottom:0;border-bottom:0}
.dmu-supportHead{display:flex;align-items:center;justify-content:space-between;gap:6px 12px;flex-wrap:wrap}
.dmu-supportStatus{flex:none}
.dmu-supportDetails{margin:5px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.dmu-supportMeta{display:flex;align-items:center;gap:4px 12px;flex-wrap:wrap;margin-top:5px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}
.dmu-supportNote{margin:12px 0 0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}
.dmu-customModal{width:min(1080px,100%);height:min(860px,100%)}
.dmu-customBody{flex:1;padding-bottom:12px}
.dmu-customLayout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:16px;align-items:start;min-width:0}
.dmu-customEditor{display:flex;flex-direction:column;gap:10px;min-width:0}
.dmu-customSide{position:sticky;top:0;display:flex;flex-direction:column;gap:10px;min-width:0;max-height:100%}
.dmu-customSideHead{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dmu-customGroup{display:flex;flex-direction:column;gap:6px;min-width:0;margin:0;padding:8px 10px 10px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px)}
.dmu-customGroup>legend{padding:0 4px;color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600}
.dmu-customGroup>.dmu-button{align-self:flex-start}
.dmu-customRule{display:flex;flex-direction:column;gap:6px;padding:8px 0;border-bottom:0.5px dashed var(--dsw-alias-border-l2)}
.dmu-customRow{display:flex;align-items:flex-end;flex-wrap:wrap;gap:6px 8px;min-width:0}
.dmu-customField{flex:1 1 140px}
.dmu-customField.is-wide{flex:3 1 260px}
.dmu-customRemove{flex:none;width:30px;height:30px;padding:0}
.dmu-mono{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace)}
.dmu-customBodyInput{height:auto;min-height:90px;padding:6px 8px;resize:vertical}
.dmu-customTest{display:flex;flex-direction:column;gap:6px;min-height:0;max-height:420px;overflow:auto;padding:8px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1)}
.dmu-customRaw{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px}
.dmu-customPreview .dmu-balance{margin-top:4px}
.dmu-customFooter{flex:none;display:flex;align-items:flex-end;justify-content:space-between;gap:8px 16px;flex-wrap:wrap;padding:10px 20px 16px;border-top:0.5px solid var(--dsw-alias-border-l2)}
.dmu-customMessages{flex:1 1 240px;min-width:0;max-height:96px;overflow-y:auto;font-size:12px}
.dmu-customOk{color:var(--dsw-alias-state-success-primary)}
.dmu-buttonPrimary{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}
.dmu-jsonList{margin:0;padding:0 0 0 14px;list-style:none;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px;line-height:18px}
.dmu-jsonRoot{padding-left:0}
.dmu-jsonRow{display:flex;align-items:baseline;gap:4px;min-width:0}
.dmu-jsonToggle{display:inline-block;flex:none;width:14px;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer}
.dmu-jsonKey,.dmu-jsonArray{flex:none;padding:0 2px;border:0;border-radius:3px;background:transparent;color:var(--dsw-alias-state-business-primary);font:inherit;cursor:pointer}
.dmu-jsonKey:hover,.dmu-jsonArray:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dmu-jsonArray{color:var(--dsw-alias-label-secondary)}
.dmu-jsonValue{min-width:0;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dmu-jsonKey:focus-visible,.dmu-jsonArray:focus-visible,.dmu-jsonToggle:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
@container dmu-modal (max-width:760px){
  .dmu-customLayout{grid-template-columns:minmax(0,1fr)}
  .dmu-customSide{position:static}
}
/* The refresh path runs a slash command; its transcript row is a pure side
   effect of the plugin's own UI, so it renders as a hidden stamp instead. */
[data-chat-flow-kind="command"]:has([data-dmu-command-row]){display:none}
`

export function ensureStyle(): void {
  if (typeof document === 'undefined') return
  const existing = document.querySelector('style[data-plugin-css="' + CSS_ID + '"]')
  if (existing !== null) {
    // The host replaces the module on a new revision without reloading the page.
    if (existing.textContent !== CSS) existing.textContent = CSS
  } else {
    const tag = document.createElement('style')
    tag.dataset.plugin = '@local/dsh-models-usage'
    tag.dataset.pluginCss = CSS_ID
    tag.textContent = CSS
    document.head.appendChild(tag)
  }
}
