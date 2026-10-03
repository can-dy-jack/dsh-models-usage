/**
 * dsh-models-usage — Host half.
 *
 * Purpose: read the *current model list* (every provider route the running Host
 * knows about, plus every model each route advertises) and attach whatever
 * balance information can actually be obtained for that provider.
 *
 * Data sources, all host-side services:
 *   - `ctx.llm.listProviders()`              → registered routes        `{id, name}`
 *   - `ctx.llm.listConfigurableProviders()`  → provider directory       `{provider, displayName, settingsNs, settingsPath, declared?, error?}`
 *   - `ctx.llm.listModels(id)`               → advertised catalog       `{provider, id, name, description?, inputModalities?}`
 *   - `ctx.llm.resolveModelInfo(id, model)`  → exact model metadata     `{contextWindow, maxTokens, reasoning.efforts, …}`
 *   - `ctx.settings.describe()`              → live config values       `llm-pi-ai` / `llm-deepseek` / … (baseURL, api, apiKeyEnv, models)
 *   - `ctx.credentials.describe(ref)`        → configured? (never a value)
 *   - `ctx.get('deepseekAccount').getBalance(client)` → DeepSeek account wallets
 *
 * Balance is always *account/provider* scoped, never per model: a model id is a
 * price/route fact, while a wallet belongs to the provider account behind it.
 * Providers whose API key cannot query a balance endpoint are reported as such
 * instead of being given a fabricated zero.
 *
 * The Web GUI pulls the JSON payload through the built-in `commands` Remote
 * namespace, so this bundle needs no generated Typert artifacts:
 *   client ctx.remote.commands.execute(sessionId, '/dsh-models-usage detail')
 */

const defineTool = (options) => options

export const name = 'dsh-models-usage'
export const inject = ['llm', 'settings', 'credentials', 'commands', 'tools', 'subprocess']

const COMMAND_NAME = 'dsh-models-usage'
const ACCOUNT_PROVIDER = 'deepseek-account'
const OFFICIAL_PROVIDER = 'deepseek-official'
const CACHE_TTL_MS = 15_000
const HTTP_TIMEOUT_MS = 15_000
const DETAIL_MODEL_CAP = 120
const DETAIL_CONCURRENCY = 6

const DEFAULTS = {
  /** `x-client-version` sent on the DeepSeek-account read; override for another build. */
  clientVersion: '0.2.0-rc.2',
  /** UI locale forwarded to the account read (`zh-CN` or `en`). */
  locale: 'zh-CN',
  /** Include per-model context/reasoning metadata in the payload. */
  includeModelDetails: true,
  /** Also list declared-but-dormant routes (no registered adapter, no models). */
  includeDormantProviders: false,
}

/** Child process body: reads a request spec on stdin and prints `{status, body}`. */
const REQUEST_SCRIPT = [
  "let raw='';",
  "process.stdin.setEncoding('utf8');",
  "process.stdin.on('data',chunk=>{raw+=chunk});",
  "process.stdin.on('end',async()=>{",
  '  let out;',
  '  try {',
  '    const spec=JSON.parse(raw);',
  '    const response=await fetch(spec.url,{method:spec.method||"GET",headers:spec.headers||{},signal:AbortSignal.timeout(spec.timeoutMs||15000)});',
  '    out={status:response.status,body:await response.text()};',
  '  } catch (error) {',
  '    out={status:0,body:String((error&&error.message)||error)};',
  '  }',
  '  process.stdout.write(JSON.stringify(out));',
  '});',
].join('\n')

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

function asString(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function originOf(baseURL) {
  const raw = asString(baseURL)
  if (raw === undefined) return undefined
  try {
    return new URL(raw).origin
  } catch {
    return undefined
  }
}

function hostOf(baseURL) {
  const raw = asString(baseURL)
  if (raw === undefined) return undefined
  try {
    return new URL(raw).hostname
  } catch {
    return undefined
  }
}

/** Console/usage page a user can open when no balance endpoint exists. */
function consoleLink(providerId, baseURL) {
  const host = hostOf(baseURL)
  if (host !== undefined) {
    if (host.endsWith('volces.com')) return 'https://console.volcengine.com/ark'
    if (host === 'openrouter.ai') return 'https://openrouter.ai/settings/credits'
    if (host.endsWith('moonshot.cn') || host.endsWith('moonshot.ai')) return 'https://platform.moonshot.cn/console/info'
    if (host.endsWith('bigmodel.cn')) return 'https://bigmodel.cn/usercenter/proj-mgmt/account'
    if (host.endsWith('aliyuncs.com')) return 'https://bailian.console.aliyun.com/'
    if (host.endsWith('siliconflow.cn')) return 'https://cloud.siliconflow.cn/account/ak'
  }
  if (providerId === 'ark') return 'https://console.volcengine.com/ark'
  return originOf(baseURL)
}

/** Which balance endpoint, if any, belongs to one provider route. */
function balanceTarget(providerId, baseURL) {
  if (providerId === ACCOUNT_PROVIDER) return { kind: 'account' }
  const host = hostOf(baseURL)
  if (providerId === OFFICIAL_PROVIDER || (host !== undefined && (host === 'api.deepseek.com' || host.endsWith('.deepseek.com')))) {
    return { kind: 'deepseek', url: `${originOf(baseURL) ?? 'https://api.deepseek.com'}/user/balance` }
  }
  if (host === 'openrouter.ai') return { kind: 'openrouter', url: 'https://openrouter.ai/api/v1/credits' }
  return { kind: 'unsupported' }
}

function providerOrder(providerId) {
  if (providerId === ACCOUNT_PROVIDER) return 0
  if (providerId === OFFICIAL_PROVIDER) return 1
  return 2
}

export function apply(ctx, config) {
  const options = { ...DEFAULTS, ...(isRecord(config) ? config : {}) }

  const service = (serviceName) => {
    try {
      return ctx.get(serviceName)
    } catch {
      return undefined
    }
  }

  // ─── Live configuration reads ────────────────────────────────────────────

  /** Every active profile entry's live value, keyed by settings namespace. */
  const readSettingsRows = () => {
    const settings = service('settings')
    const rows = new Map()
    if (settings === undefined || typeof settings.describe !== 'function') return rows
    let described
    try {
      described = settings.describe()
    } catch {
      return rows
    }
    for (const row of Array.isArray(described) ? described : []) {
      if (isRecord(row) && typeof row.ns === 'string') rows.set(row.ns, row)
    }
    return rows
  }

  /** Walk a descriptor's `value` down the provider's settings path. */
  const configNodeAt = (settingsRows, settingsNs, settingsPath) => {
    if (settingsNs === undefined) return undefined
    const row = settingsRows.get(settingsNs)
    if (row === undefined) return undefined
    let node = row.value
    for (const segment of Array.isArray(settingsPath) ? settingsPath : []) {
      if (!isRecord(node)) return undefined
      node = node[segment]
    }
    return isRecord(node) ? node : undefined
  }

  // ─── Model list ──────────────────────────────────────────────────────────

  /**
   * The providers this payload reports.
   *
   * `ctx.llm.listProviders()` is the set of routes with a **registered adapter** —
   * exactly what the running composition actually offers. The configurable-provider
   * directory also lists *declared but dormant* routes (a bare `llm-pi-ai` offers
   * its whole installed catalog, e.g. `amazon-bedrock`); those have no adapter, so
   * asking them for models fails with `NO_ADAPTER`. They are omitted by default and
   * only contribute display metadata to routes that really exist.
   */
  const listProviderEntries = () => {
    const llm = service('llm')
    const entries = new Map()
    if (llm !== undefined && typeof llm.listProviders === 'function') {
      let registered
      try {
        registered = llm.listProviders()
      } catch {
        registered = []
      }
      for (const info of Array.isArray(registered) ? registered : []) {
        if (!isRecord(info) || typeof info.id !== 'string') continue
        entries.set(info.id, { id: info.id, routeName: asString(info.name), active: true })
      }
    }
    if (llm !== undefined && typeof llm.listConfigurableProviders === 'function') {
      let directory
      try {
        directory = llm.listConfigurableProviders()
      } catch {
        directory = []
      }
      for (const entry of Array.isArray(directory) ? directory : []) {
        if (!isRecord(entry) || typeof entry.provider !== 'string') continue
        const known = entries.get(entry.provider)
        // A dormant route only appears when the caller asked for it.
        if (known === undefined && options.includeDormantProviders !== true) continue
        const merged = known ?? { id: entry.provider, active: false }
        entries.set(entry.provider, {
          ...merged,
          displayName: asString(entry.displayName),
          settingsNs: asString(entry.settingsNs),
          settingsPath: Array.isArray(entry.settingsPath) ? entry.settingsPath : [],
          declared: entry.declared === true,
          configError: asString(entry.error),
        })
      }
    }
    return [...entries.values()].sort((left, right) => {
      const byGroup = providerOrder(left.id) - providerOrder(right.id)
      return byGroup !== 0 ? byGroup : left.id.localeCompare(right.id)
    })
  }

  /** Advertised catalog for one route; a dormant or failing route is reported, not thrown. */
  const listModels = async (providerId) => {
    const llm = service('llm')
    if (llm === undefined || typeof llm.listModels !== 'function') return { models: [], error: undefined }
    try {
      const listed = await llm.listModels(providerId)
      const models = []
      for (const model of Array.isArray(listed) ? listed : []) {
        if (!isRecord(model) || typeof model.id !== 'string') continue
        models.push({
          id: model.id,
          name: asString(model.name) ?? model.id,
          description: asString(model.description),
          inputModalities: Array.isArray(model.inputModalities) ? model.inputModalities.filter((item) => typeof item === 'string') : undefined,
        })
      }
      return { models, error: undefined }
    } catch (error) {
      return { models: [], error: errorText(error) }
    }
  }

  /** Fold the settings-configured catalog in when the adapter advertises nothing. */
  const modelsFromConfig = (node) => {
    const models = []
    for (const model of isRecord(node) && Array.isArray(node.models) ? node.models : []) {
      if (!isRecord(model) || typeof model.id !== 'string') continue
      models.push({
        id: model.id,
        name: asString(model.name) ?? model.id,
        description: asString(model.description),
        contextWindow: typeof model.contextWindow === 'number' ? model.contextWindow : undefined,
        maxTokens: typeof model.maxTokens === 'number' ? model.maxTokens : undefined,
        inputModalities: Array.isArray(model.inputModalities)
          ? model.inputModalities.filter((item) => typeof item === 'string')
          : Array.isArray(model.input)
            ? model.input.filter((item) => typeof item === 'string')
            : undefined,
        source: 'settings',
      })
    }
    return models
  }

  /** Exact per-model metadata (context window, output cap, reasoning efforts). */
  const enrichModels = async (providerId, models) => {
    const llm = service('llm')
    if (llm === undefined || typeof llm.resolveModelInfo !== 'function') return models
    const targets = models.slice(0, DETAIL_MODEL_CAP)
    const enriched = new Map()
    let cursor = 0
    const worker = async () => {
      while (cursor < targets.length) {
        const index = cursor
        cursor += 1
        const model = targets[index]
        try {
          const info = await llm.resolveModelInfo(providerId, model.id)
          if (isRecord(info)) {
            enriched.set(model.id, {
              contextWindow: isRecord(info.context) && typeof info.context.contextWindow === 'number' ? info.context.contextWindow : undefined,
              maxTokens: typeof info.defaultMaxTokens === 'number' ? info.defaultMaxTokens : undefined,
              inputModalities: Array.isArray(info.inputModalities) ? info.inputModalities.filter((item) => typeof item === 'string') : undefined,
              reasoning: isRecord(info.reasoning) && Array.isArray(info.reasoning.efforts)
                ? {
                    efforts: info.reasoning.efforts.filter(isRecord).map((effort) => ({
                      id: String(effort.id ?? ''),
                      name: String(effort.name ?? effort.id ?? ''),
                    })),
                    defaultEffort: asString(info.reasoning.defaultEffort),
                  }
                : undefined,
            })
          }
        } catch (error) {
          enriched.set(model.id, { detailError: errorText(error) })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, targets.length) }, worker))
    return models.map((model) => {
      const detail = enriched.get(model.id)
      return detail === undefined ? model : { ...model, ...detail }
    })
  }

  // ─── Credentials ─────────────────────────────────────────────────────────

  const describeCredential = async (ref) => {
    if (ref === undefined) return null
    const credentials = service('credentials')
    if (credentials === undefined || typeof credentials.describe !== 'function') {
      return { ref, configured: false, unknown: true }
    }
    try {
      const described = await credentials.describe(ref)
      if (isRecord(described)) {
        return {
          ref,
          configured: described.configured === true,
          source: asString(described.source),
          writable: described.writable === true,
        }
      }
      return { ref, configured: false }
    } catch (error) {
      return { ref, configured: false, error: errorText(error) }
    }
  }

  const resolveSecret = async (ref) => {
    const credentials = service('credentials')
    if (credentials === undefined || typeof credentials.resolve !== 'function') return undefined
    try {
      const resolved = await credentials.resolve(ref)
      if (typeof resolved === 'string') return resolved
      if (isRecord(resolved) && typeof resolved.value === 'string') return resolved.value
      return undefined
    } catch {
      return undefined
    }
  }

  /**
   * Interactive pi-ai routes authenticate from a credential *record*
   * (`<settingsNs>/<providerId>`) instead of a reference. Presence is reported
   * by `describeRecord`; only an `api-key` record can serve a balance call.
   */
  const describeRecordCredential = async (settingsNs, providerId) => {
    if (settingsNs === undefined) return undefined
    const credentials = service('credentials')
    if (credentials === undefined || typeof credentials.describeRecord !== 'function') return undefined
    const key = `${settingsNs}/${providerId}`
    try {
      const described = await credentials.describeRecord(key)
      if (isRecord(described) && described.configured === true) {
        return { key, kind: asString(described.kind), writable: described.writable === true }
      }
    } catch {
      return undefined
    }
    return undefined
  }

  const resolveRecordSecret = async (key) => {
    const credentials = service('credentials')
    if (credentials === undefined || typeof credentials.readRecord !== 'function') return undefined
    try {
      const record = await credentials.readRecord(key)
      if (isRecord(record) && record.kind === 'api-key' && typeof record.key === 'string') return record.key
      return undefined
    } catch {
      return undefined
    }
  }

  // ─── Balance transport ───────────────────────────────────────────────────
  //
  // Preferred transport is one bounded node subprocess: the API key travels only
  // over the child's stdin, so it never reaches argv, the host's logs, or any
  // output. When the subprocess seam is absent, the shipped adapters' own
  // approach — global `fetch` in the Host process — is used instead.

  const interpret = (status, body) => {
    if (status === 0) return { ok: false, status, error: `网络请求失败: ${body.slice(0, 300)}` }
    if (status === 401 || status === 403) return { ok: false, status, error: `凭据无效或已过期 (HTTP ${String(status)})` }
    if (status === 429) return { ok: false, status, error: '请求过于频繁 (HTTP 429)，请稍后重试' }
    if (status < 200 || status >= 300) return { ok: false, status, error: `接口返回 HTTP ${String(status)}: ${body.slice(0, 300)}` }
    try {
      return { ok: true, status, data: JSON.parse(body) }
    } catch (error) {
      return { ok: false, status, error: `响应不是 JSON: ${errorText(error)}` }
    }
  }

  const directRequest = async (url, headers, signal) => {
    if (typeof fetch !== 'function') return { ok: false, error: '宿主进程没有可用的 fetch' }
    const timeout = AbortSignal.timeout(HTTP_TIMEOUT_MS)
    const combined = signal !== undefined && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([signal, timeout])
      : timeout
    try {
      const response = await fetch(url, { method: 'GET', headers, signal: combined })
      return interpret(response.status, await response.text())
    } catch (error) {
      return interpret(0, errorText(error))
    }
  }

  const requestJson = async (url, headers, signal) => {
    const subprocess = service('subprocess')
    if (subprocess === undefined) return directRequest(url, headers, signal)
    let node
    try {
      node = await subprocess.resolveExecutable('node')
    } catch {
      try {
        node = await subprocess.resolveExecutable('node.exe')
      } catch {
        return directRequest(url, headers, signal)
      }
    }
    let cwd = '.'
    const policy = service('sandboxPolicy')
    if (isRecord(policy) && typeof policy.workspaceRoot === 'string' && policy.workspaceRoot.length > 0) {
      cwd = policy.workspaceRoot
    }
    let handle
    try {
      handle = subprocess.spawn({
        argv: [node, '-e', REQUEST_SCRIPT],
        cwd,
        stdio: {
          stdin: { data: JSON.stringify({ url, method: 'GET', headers, timeoutMs: HTTP_TIMEOUT_MS }) },
          stdout: { mode: 'collect', maxBytes: 200_000 },
          stderr: { mode: 'collect', maxBytes: 4_096 },
        },
        graceMs: 5_000,
        signal,
      })
    } catch {
      return directRequest(url, headers, signal)
    }
    let outcome
    try {
      outcome = await handle.done
    } catch (error) {
      return { ok: false, error: `查询子进程异常: ${errorText(error)}` }
    }
    if (outcome.exitCode !== 0) {
      let detail = ''
      const stderr = handle.collected.stderr
      if (stderr !== undefined) detail = stderr.readFrom(0).text.trim().slice(0, 300)
      return { ok: false, error: `查询子进程退出码 ${String(outcome.exitCode)}${detail.length > 0 ? `: ${detail}` : ''}` }
    }
    let parsed
    try {
      const stdout = handle.collected.stdout
      parsed = JSON.parse((stdout !== undefined ? stdout.readFrom(0).text : '') || '{}')
    } catch (error) {
      return { ok: false, error: `无法解析查询结果: ${errorText(error)}` }
    }
    const status = typeof parsed.status === 'number' ? parsed.status : 0
    const body = typeof parsed.body === 'string' ? parsed.body : ''
    return interpret(status, body)
  }

  const clientMetadata = () => ({
    version: asString(options.clientVersion) ?? asString(process.env.DSH_CLIENT_VERSION) ?? DEFAULTS.clientVersion,
    locale: asString(options.locale) ?? DEFAULTS.locale,
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  })

  const accountBalance = async () => {
    const account = service('deepseekAccount')
    if (account === undefined || typeof account.getBalance !== 'function') {
      return { status: 'unavailable', message: '账号服务未挂载（未登录或非 Desktop 组合）' }
    }
    try {
      const result = await account.getBalance(clientMetadata())
      if (result === null || result === undefined) {
        return { status: 'not-signed-in', message: '未登录 DeepSeek 账号' }
      }
      if (isRecord(result) && result.status === 'ready') {
        const wallets = (Array.isArray(result.value) ? result.value : [])
          .filter(isRecord)
          .map((wallet) => ({ currency: String(wallet.currency ?? ''), balance: String(wallet.balance ?? ''), kind: 'topped-up' }))
        const bonusWallets = (Array.isArray(result.bonusWallets) ? result.bonusWallets : [])
          .filter(isRecord)
          .map((wallet) => ({ currency: String(wallet.currency ?? ''), balance: String(wallet.balance ?? ''), kind: 'granted' }))
        return { status: 'ready', wallets, bonusWallets }
      }
      return { status: 'failed', message: '账号余额读取失败（可稍后重试）' }
    } catch (error) {
      return { status: 'failed', message: `账号余额读取失败: ${errorText(error)}` }
    }
  }

  /**
   * @param resolveKey - resolves the provider's API key (reference or record), or undefined.
   * @param label - what to name in a "not configured" message.
   */
  const providerBalance = async (providerId, baseURL, resolveKey, label, signal) => {
    const target = balanceTarget(providerId, baseURL)
    if (target.kind === 'account') return accountBalance()
    if (target.kind === 'unsupported') {
      return {
        status: 'unsupported',
        message: '该服务商未提供可用模型密钥查询的余额接口',
        link: consoleLink(providerId, baseURL),
      }
    }
    if (label === undefined) {
      return { status: 'unsupported', message: '未声明凭据引用，无法查询余额', link: consoleLink(providerId, baseURL) }
    }
    const key = await resolveKey()
    if (key === undefined || key.length === 0) {
      return { status: 'no-credential', message: `未配置 ${label}`, link: consoleLink(providerId, baseURL) }
    }
    const headers = { Authorization: `Bearer ${key}`, Accept: 'application/json' }
    const response = await requestJson(target.url, headers, signal)
    if (response.ok !== true) {
      return { status: 'failed', message: response.error, link: consoleLink(providerId, baseURL) }
    }
    const data = response.data
    if (target.kind === 'deepseek') {
      const infos = isRecord(data) && Array.isArray(data.balance_infos) ? data.balance_infos.filter(isRecord) : []
      return {
        status: 'ready',
        endpoint: target.url,
        isAvailable: isRecord(data) ? data.is_available === true : false,
        wallets: infos.map((info) => ({
          currency: String(info.currency ?? ''),
          balance: String(info.total_balance ?? ''),
          granted: String(info.granted_balance ?? ''),
          toppedUp: String(info.topped_up_balance ?? ''),
          kind: 'topped-up',
        })),
      }
    }
    const credits = isRecord(data) && isRecord(data.data) ? data.data : undefined
    const total = credits !== undefined ? Number(credits.total_credits) : Number.NaN
    const used = credits !== undefined ? Number(credits.total_usage) : Number.NaN
    if (!Number.isFinite(total)) return { status: 'failed', message: '响应结构无法识别', link: consoleLink(providerId, baseURL) }
    const remaining = total - (Number.isFinite(used) ? used : 0)
    return {
      status: 'ready',
      endpoint: target.url,
      wallets: [{ currency: 'USD', balance: remaining.toFixed(2), toppedUp: total.toFixed(2), granted: '0.00', kind: 'topped-up' }],
    }
  }

  // ─── Payload assembly ────────────────────────────────────────────────────

  let cache

  const collectProvider = async (entry, settingsRows, signal) => {
    const settingsNode = configNodeAt(settingsRows, entry.settingsNs, entry.settingsPath)
    const baseURL = asString(settingsNode?.baseURL)
    const apiKeyEnv = asString(settingsNode?.apiKeyEnv)
    const { models: advertised, error: catalogError } = await listModels(entry.id)
    let models = advertised.length > 0 ? advertised : modelsFromConfig(settingsNode)
    if (options.includeModelDetails !== false && models.length > 0) {
      models = await enrichModels(entry.id, models)
    }

    // Credential: a settings reference first, then the interactive pi-ai record.
    const byReference = await describeCredential(apiKeyEnv)
    const byRecord = byReference === null || byReference.configured !== true
      ? await describeRecordCredential(entry.settingsNs, entry.id)
      : undefined
    const credential = byRecord !== undefined
      ? { ref: byRecord.key, configured: true, source: 'record', kind: byRecord.kind }
      : byReference
    const resolveKey = async () => {
      if (apiKeyEnv !== undefined) {
        const value = await resolveSecret(apiKeyEnv)
        if (value !== undefined && value.length > 0) return value
      }
      if (byRecord !== undefined && byRecord.kind === 'api-key') return resolveRecordSecret(byRecord.key)
      return undefined
    }
    const label = apiKeyEnv ?? byRecord?.key ?? (balanceTarget(entry.id, baseURL).kind === 'deepseek' ? 'DEEPSEEK_API_KEY' : undefined)

    const balance = await providerBalance(entry.id, baseURL, resolveKey, label, signal)
    return {
      id: entry.id,
      displayName: entry.displayName ?? entry.routeName ?? entry.id,
      active: entry.active === true,
      declared: entry.declared === true,
      settingsNs: entry.settingsNs,
      settingsPath: entry.settingsPath,
      baseURL,
      api: asString(settingsNode?.api),
      configError: entry.configError ?? catalogError,
      credential,
      balance,
      modelCount: models.length,
      models,
    }
  }

  const buildPayload = async (detail, signal) => {
    const settingsRows = readSettingsRows()
    const entries = listProviderEntries()
    const providers = []
    for (const entry of entries) {
      providers.push(await collectProvider(entry, settingsRows, signal))
    }
    const payload = {
      ok: true,
      command: COMMAND_NAME,
      detail: detail === true,
      fetchedAt: new Date().toISOString(),
      providers: providers.map((provider) => (detail === true ? provider : { ...provider, models: [] })),
      counts: {
        providers: providers.length,
        activeProviders: providers.filter((provider) => provider.active).length,
        models: providers.reduce((total, provider) => total + provider.modelCount, 0),
      },
    }
    return payload
  }

  const payloadFor = async (detail, signal) => {
    const now = Date.now()
    if (cache !== undefined && cache.detail === detail && now - cache.at < CACHE_TTL_MS) return cache.payload
    const payload = await buildPayload(detail, signal)
    cache = { at: now, detail, payload }
    return payload
  }

  // ─── Remote entry point (the Client reaches this through `remote.commands`) ──

  ctx.commands.register({
    name: COMMAND_NAME,
    description: '列出当前模型列表中的服务商与模型，并查询可获得的余额信息。',
    input: { hint: 'summary | detail | refresh' },
    recordInput: false,
    handler: async (invocation) => {
      const raw = String(invocation.rawInput ?? '').trim().toLowerCase()
      const detail = raw !== 'summary'
      try {
        const payload = await payloadFor(detail, undefined)
        return { kind: 'success', text: JSON.stringify(payload) }
      } catch (error) {
        return { kind: 'error', text: `采集模型清单失败: ${errorText(error)}` }
      }
    },
  })

  // ─── Model-facing tool ───────────────────────────────────────────────────

  ctx.tools.register(defineTool({
    name: 'models_balance',
    description: '列出当前 Harness 模型列表中的全部服务商与模型，并给出每个服务商可查询到的余额信息'
      + '（DeepSeek 开放平台 / DeepSeek 账号由官方接口返回；未提供余额接口的服务商会被明确标注）。'
      + '无参数。',
    parameters: {},
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(_args, exec) {
      const payload = await payloadFor(true, exec?.signal)
      return payload
    },
  }))
}
