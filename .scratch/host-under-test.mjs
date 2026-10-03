// src/index.ts
const defineTool = (options) => options

// src/shared.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}
function asString(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}

// src/host/context.ts
function createServiceLookup(ctx) {
  return (serviceName) => {
    try {
      return ctx.get(serviceName);
    } catch {
      return void 0;
    }
  };
}

// src/cache.ts
var CACHE_TTL_MS = 6e4;
var CACHE_RETRY_MS = 15e3;
function projectPayload(payload, detail) {
  return detail ? payload : {
    ...payload,
    detail: false,
    providers: payload.providers.map((provider) => ({ ...provider, models: [] }))
  };
}
function retainBalances(previous, next) {
  const byId = new Map(previous?.providers.map((provider) => [provider.id, provider]));
  return {
    ...next,
    providers: next.providers.map((provider) => {
      const old = byId.get(provider.id);
      if (provider.balance.status !== "failed" || old?.balance.status !== "ready" || old.baseURL !== provider.baseURL || old.settingsNs !== provider.settingsNs || old.credential?.ref !== provider.credential?.ref || old.credential?.source !== provider.credential?.source || old.credential?.kind !== provider.credential?.kind || old.credential?.configured !== provider.credential?.configured) {
        return { ...provider, balance: { ...provider.balance, fetchedAt: provider.balance.fetchedAt ?? next.fetchedAt } };
      }
      return {
        ...provider,
        balance: {
          ...old.balance,
          fetchedAt: old.balance.fetchedAt ?? previous?.fetchedAt,
          refreshError: provider.balance.message || "balance-query-failed"
        }
      };
    })
  };
}
function hasBalanceFailure(payload) {
  return payload.providers.some((provider) => provider.balance.status === "failed" || provider.balance.refreshError !== void 0);
}
function mergeProviderPayload(previous, update) {
  const byId = new Map(update.providers.map((provider) => [provider.id, provider]));
  const providers = previous.providers.map((provider) => byId.get(provider.id) ?? provider);
  return {
    ...previous,
    fetchedAt: update.fetchedAt,
    providers,
    counts: {
      providers: providers.length,
      activeProviders: providers.filter((provider) => provider.active).length,
      models: providers.reduce((total, provider) => total + provider.modelCount, 0)
    }
  };
}

// src/host/options.ts
var COMMAND_NAME = "dsh-models-usage";
var ACCOUNT_PROVIDER = "deepseek-account";
var OFFICIAL_PROVIDER = "deepseek-official";
var HTTP_TIMEOUT_MS = 15e3;
var DETAIL_MODEL_CAP = 120;
var DETAIL_CONCURRENCY = 6;
var DEFAULTS = {
  clientVersion: "0.2.0-rc.2",
  locale: "zh-CN",
  includeModelDetails: true,
  includeDormantProviders: false
};

// src/host/links.ts
function originOf(baseURL) {
  const raw = asString(baseURL);
  if (raw === void 0) return void 0;
  try {
    return new URL(raw).origin;
  } catch {
    return void 0;
  }
}
function hostOf(baseURL) {
  const raw = asString(baseURL);
  if (raw === void 0) return void 0;
  try {
    return new URL(raw).hostname;
  } catch {
    return void 0;
  }
}
function consoleLink(providerId, baseURL) {
  const host = hostOf(baseURL);
  if (kimiUsageURL(providerId, baseURL) !== void 0) {
    return host === "api.kimi.ai" ? "https://www.kimi.ai/code/console" : "https://www.kimi.com/code/console";
  }
  if (host !== void 0) {
    if (host.endsWith("volces.com")) return "https://console.volcengine.com/ark";
    if (host === "openrouter.ai") return "https://openrouter.ai/settings/credits";
    if (host.endsWith("moonshot.cn") || host.endsWith("moonshot.ai")) return "https://platform.moonshot.cn/console/info";
    if (host.endsWith("bigmodel.cn")) return "https://bigmodel.cn/usercenter/proj-mgmt/account";
    if (host.endsWith("aliyuncs.com")) return "https://bailian.console.aliyun.com/";
    if (host.endsWith("siliconflow.cn")) return "https://cloud.siliconflow.cn/account/ak";
  }
  if (providerId === "ark") return "https://console.volcengine.com/ark";
  return originOf(baseURL);
}
function kimiUsageURL(providerId, baseURL) {
  if (baseURL === void 0) {
    return providerId === "kimi-coding" ? "https://api.kimi.com/coding/v1/usages" : void 0;
  }
  try {
    const url = new URL(baseURL);
    if (url.protocol !== "https:" && url.protocol !== "http:") return void 0;
    const path = url.pathname.replace(/\/+$/, "");
    const official = (url.hostname === "api.kimi.com" || url.hostname === "api.kimi.ai") && /^\/coding(?:\/v1)?$/.test(path);
    if (providerId !== "kimi-coding" && !official) return void 0;
    url.pathname = path + (path.endsWith("/v1") ? "/usages" : "/v1/usages");
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return void 0;
  }
}
function balanceTarget(providerId, baseURL) {
  if (providerId === ACCOUNT_PROVIDER) return { kind: "account" };
  const host = hostOf(baseURL);
  if (providerId === OFFICIAL_PROVIDER || host !== void 0 && (host === "api.deepseek.com" || host.endsWith(".deepseek.com"))) {
    return { kind: "deepseek", url: `${originOf(baseURL) ?? "https://api.deepseek.com"}/user/balance` };
  }
  if (host === "openrouter.ai") return { kind: "openrouter", url: "https://openrouter.ai/api/v1/credits" };
  const kimiURL = kimiUsageURL(providerId, baseURL);
  if (kimiURL !== void 0) return { kind: "kimi-coding", url: kimiURL };
  return { kind: "unsupported" };
}
function providerOrder(providerId) {
  if (providerId === ACCOUNT_PROVIDER) return 0;
  if (providerId === OFFICIAL_PROVIDER) return 1;
  return 2;
}

// src/host/kimi.ts
function numeric(value) {
  if (typeof value !== "number" && (typeof value !== "string" || value.trim().length === 0)) return void 0;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : void 0;
}
function resetAt(data) {
  for (const key of ["reset_time", "resetTime", "reset_at", "resetAt"]) {
    const value = asString(data[key]);
    if (value !== void 0 && Number.isFinite(Date.parse(value))) return value;
  }
  for (const key of ["reset_in", "resetIn", "ttl"]) {
    const seconds = numeric(data[key]);
    if (seconds !== void 0 && seconds <= 31536e3) return new Date(Date.now() + seconds * 1e3).toISOString();
  }
  return void 0;
}
function quota(id, usedPercent, data) {
  return { id, usedPercent, remainingPercent: Math.max(0, 100 - usedPercent), resetAt: resetAt(data) };
}
function countQuota(id, data) {
  if (!isRecord(data)) return void 0;
  const limit = numeric(data.limit);
  const remaining = numeric(data.remaining);
  const used = numeric(data.used) ?? (limit !== void 0 && remaining !== void 0 ? Math.max(0, limit - remaining) : void 0);
  if (limit === void 0 || limit <= 0 || used === void 0) return void 0;
  const usedPercent = used / limit * 100;
  if (!Number.isFinite(usedPercent)) return void 0;
  return {
    ...quota(id, usedPercent, data),
    limit,
    used,
    remaining: remaining ?? Math.max(0, limit - used)
  };
}
function windowSeconds(item, detail) {
  const window = isRecord(item.window) ? item.window : {};
  const duration = numeric(window.duration ?? item.duration ?? detail.duration);
  if (duration === void 0 || duration <= 0) return void 0;
  const unit = asString(window.timeUnit ?? item.timeUnit ?? detail.timeUnit) ?? "";
  const factor = unit.includes("MINUTE") ? 60 : unit.includes("HOUR") ? 3600 : unit.includes("DAY") ? 86400 : 1;
  const seconds = duration * factor;
  return Number.isFinite(seconds) ? seconds : void 0;
}
function boosterWallet(raw) {
  if (!isRecord(raw) || !isRecord(raw.balance) || raw.balance.type !== "BOOSTER") return void 0;
  const left = numeric(raw.balance.amountLeft);
  if (left === void 0) return void 0;
  const total = numeric(raw.balance.amount);
  const monthlyLimit = isRecord(raw.monthlyChargeLimit) ? raw.monthlyChargeLimit : {};
  const monthlyUsed = isRecord(raw.monthlyUsed) ? raw.monthlyUsed : {};
  return {
    currency: asString(monthlyLimit.currency) ?? asString(monthlyUsed.currency) ?? "USD",
    balance: (left / 1e8).toFixed(8),
    toppedUp: total !== void 0 ? (total / 1e8).toFixed(8) : void 0,
    kind: "extra-usage"
  };
}
function parseKimiUsage(data) {
  if (!isRecord(data)) return { status: "failed", message: "Kimi Code \u7528\u91CF\u54CD\u5E94\u7ED3\u6784\u65E0\u6CD5\u8BC6\u522B" };
  const quotas = [];
  const usages = isRecord(data.usages) ? data.usages : {};
  for (const [field, id] of [
    ["limit_5h", "five-hour"],
    ["limit_7d", "weekly"],
    ["limit_month_total", "month-total"],
    ["limit_month_code", "month-code"]
  ]) {
    const entry = usages[field];
    if (!isRecord(entry)) continue;
    const ratio = numeric(entry.used_ratio);
    if (ratio !== void 0 && Number.isFinite(ratio * 100)) quotas.push(quota(id, ratio * 100, entry));
  }
  const summary = countQuota("weekly", data.usage);
  if (summary !== void 0 && !quotas.some((entry) => entry.id === summary.id)) quotas.push(summary);
  if (Array.isArray(data.limits)) {
    for (const [index, item] of data.limits.entries()) {
      if (!isRecord(item)) continue;
      const detail = isRecord(item.detail) ? item.detail : item;
      const seconds = windowSeconds(item, detail);
      const id = seconds === 18e3 ? "five-hour" : seconds === 604800 ? "weekly" : `limit-${index + 1}`;
      const entry = countQuota(id, detail);
      if (entry === void 0 || quotas.some((existing) => existing.id === id)) continue;
      entry.windowSeconds = seconds;
      entry.name = asString(item.name ?? item.title ?? item.scope ?? detail.name ?? detail.title);
      quotas.push(entry);
    }
  }
  const wallet = boosterWallet(data.boosterWallet);
  if (quotas.length === 0 && wallet === void 0) return { status: "failed", message: "Kimi Code \u672A\u8FD4\u56DE\u53EF\u8BC6\u522B\u7684\u989D\u5EA6\u6216\u4F59\u989D\u6570\u636E" };
  return { status: "ready", quotas, wallets: wallet !== void 0 ? [wallet] : [] };
}

// src/host/net.ts
var REQUEST_SCRIPT = [
  "let raw='';",
  "process.stdin.setEncoding('utf8');",
  "process.stdin.on('data',chunk=>{raw+=chunk});",
  "process.stdin.on('end',async()=>{",
  "  let out;",
  "  try {",
  "    const spec=JSON.parse(raw);",
  '    const response=await fetch(spec.url,{method:spec.method||"GET",headers:spec.headers||{},signal:AbortSignal.timeout(spec.timeoutMs||15000)});',
  "    out={status:response.status,body:await response.text()};",
  "  } catch (error) {",
  "    out={status:0,body:String((error&&error.message)||error)};",
  "  }",
  "  process.stdout.write(JSON.stringify(out));",
  "});"
].join("\n");
function interpret(status, body) {
  if (status === 0) return { ok: false, status, error: `\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25: ${body.slice(0, 300)}` };
  if (status === 401 || status === 403) return { ok: false, status, error: `\u51ED\u636E\u65E0\u6548\u6216\u5DF2\u8FC7\u671F (HTTP ${String(status)})` };
  if (status === 429) return { ok: false, status, error: "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41 (HTTP 429)\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" };
  if (status < 200 || status >= 300) return { ok: false, status, error: `\u63A5\u53E3\u8FD4\u56DE HTTP ${String(status)}: ${body.slice(0, 300)}` };
  try {
    return { ok: true, status, data: JSON.parse(body) };
  } catch (error) {
    return { ok: false, status, error: `\u54CD\u5E94\u4E0D\u662F JSON: ${errorText(error)}` };
  }
}
async function directRequest(url, headers, signal) {
  if (typeof fetch !== "function") return { ok: false, error: "\u5BBF\u4E3B\u8FDB\u7A0B\u6CA1\u6709\u53EF\u7528\u7684 fetch" };
  const timeout = AbortSignal.timeout(HTTP_TIMEOUT_MS);
  const combined = signal !== void 0 && typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await fetch(url, { method: "GET", headers, signal: combined });
    return interpret(response.status, await response.text());
  } catch (error) {
    return interpret(0, errorText(error));
  }
}
async function requestJson(service, url, headers, signal) {
  const subprocess = service("subprocess");
  if (subprocess === void 0 || typeof subprocess.resolveExecutable !== "function" || typeof subprocess.spawn !== "function") {
    return directRequest(url, headers, signal);
  }
  let node;
  try {
    node = await subprocess.resolveExecutable("node");
  } catch {
    try {
      node = await subprocess.resolveExecutable("node.exe");
    } catch {
      return directRequest(url, headers, signal);
    }
  }
  let cwd = ".";
  const policy = service("sandboxPolicy");
  if (isRecord(policy) && typeof policy.workspaceRoot === "string" && policy.workspaceRoot.length > 0) {
    cwd = policy.workspaceRoot;
  }
  let handle;
  try {
    handle = subprocess.spawn({
      argv: [node, "-e", REQUEST_SCRIPT],
      cwd,
      stdio: {
        stdin: { data: JSON.stringify({ url, method: "GET", headers, timeoutMs: HTTP_TIMEOUT_MS }) },
        stdout: { mode: "collect", maxBytes: 2e5 },
        stderr: { mode: "collect", maxBytes: 4096 }
      },
      graceMs: 5e3,
      signal
    });
  } catch {
    return directRequest(url, headers, signal);
  }
  let outcome;
  try {
    outcome = await handle.done;
  } catch (error) {
    return { ok: false, error: `\u67E5\u8BE2\u5B50\u8FDB\u7A0B\u5F02\u5E38: ${errorText(error)}` };
  }
  if (outcome.exitCode !== 0) {
    let detail = "";
    const stderr = handle.collected.stderr;
    if (stderr !== void 0) detail = stderr.readFrom(0).text.trim().slice(0, 300);
    return { ok: false, error: `\u67E5\u8BE2\u5B50\u8FDB\u7A0B\u9000\u51FA\u7801 ${String(outcome.exitCode)}${detail.length > 0 ? `: ${detail}` : ""}` };
  }
  let parsed;
  try {
    const stdout = handle.collected.stdout;
    parsed = JSON.parse((stdout !== void 0 ? stdout.readFrom(0).text : "") || "{}");
  } catch (error) {
    return { ok: false, error: `\u65E0\u6CD5\u89E3\u6790\u67E5\u8BE2\u7ED3\u679C: ${errorText(error)}` };
  }
  const status = typeof parsed.status === "number" ? parsed.status : 0;
  const body = typeof parsed.body === "string" ? parsed.body : "";
  return interpret(status, body);
}
function clientMetadata(options) {
  return {
    version: asString(options.clientVersion) ?? asString(process.env.DSH_CLIENT_VERSION) ?? DEFAULTS.clientVersion,
    locale: asString(options.locale) ?? DEFAULTS.locale,
    timezoneOffsetSeconds: -(/* @__PURE__ */ new Date()).getTimezoneOffset() * 60
  };
}

// src/host/balance.ts
async function accountBalance(service, options) {
  const account = service("deepseekAccount");
  if (account === void 0 || typeof account.getBalance !== "function") {
    return { status: "unavailable", message: "\u8D26\u53F7\u670D\u52A1\u672A\u6302\u8F7D\uFF08\u672A\u767B\u5F55\u6216\u975E Desktop \u7EC4\u5408\uFF09" };
  }
  try {
    const result = await account.getBalance(clientMetadata(options));
    if (result === null || result === void 0) {
      return { status: "not-signed-in", message: "\u672A\u767B\u5F55 DeepSeek \u8D26\u53F7" };
    }
    if (isRecord(result) && result.status === "ready") {
      const wallets = (Array.isArray(result.value) ? result.value : []).filter(isRecord).map((wallet) => ({ currency: String(wallet.currency ?? ""), balance: String(wallet.balance ?? ""), kind: "topped-up" }));
      const bonusWallets = (Array.isArray(result.bonusWallets) ? result.bonusWallets : []).filter(isRecord).map((wallet) => ({ currency: String(wallet.currency ?? ""), balance: String(wallet.balance ?? ""), kind: "granted" }));
      return { status: "ready", wallets, bonusWallets };
    }
    return { status: "failed", message: "\u8D26\u53F7\u4F59\u989D\u8BFB\u53D6\u5931\u8D25\uFF08\u53EF\u7A0D\u540E\u91CD\u8BD5\uFF09" };
  } catch (error) {
    return { status: "failed", message: `\u8D26\u53F7\u4F59\u989D\u8BFB\u53D6\u5931\u8D25: ${errorText(error)}` };
  }
}
async function providerBalance(service, options, providerId, baseURL, resolveKey, label, signal) {
  const target = balanceTarget(providerId, baseURL);
  if (target.kind === "account") return accountBalance(service, options);
  if (target.kind === "unsupported") {
    return {
      status: "unsupported",
      message: "\u8BE5\u670D\u52A1\u5546\u672A\u63D0\u4F9B\u53EF\u7528\u6A21\u578B\u5BC6\u94A5\u67E5\u8BE2\u7684\u4F59\u989D\u63A5\u53E3",
      link: consoleLink(providerId, baseURL)
    };
  }
  if (label === void 0) {
    return { status: "unsupported", message: "\u672A\u58F0\u660E\u51ED\u636E\u5F15\u7528\uFF0C\u65E0\u6CD5\u67E5\u8BE2\u4F59\u989D", link: consoleLink(providerId, baseURL) };
  }
  const key = await resolveKey();
  if (key === void 0 || key.length === 0) {
    return { status: "no-credential", message: `\u672A\u914D\u7F6E ${label}`, link: consoleLink(providerId, baseURL) };
  }
  const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  const response = await requestJson(service, target.url, headers, signal);
  if (response.ok !== true) {
    return { status: "failed", message: response.error, link: consoleLink(providerId, baseURL) };
  }
  const data = response.data;
  if (target.kind === "kimi-coding") {
    return { ...parseKimiUsage(data), endpoint: target.url, link: consoleLink(providerId, baseURL) };
  }
  if (target.kind === "deepseek") {
    const infos = isRecord(data) && Array.isArray(data.balance_infos) ? data.balance_infos.filter(isRecord) : [];
    return {
      status: "ready",
      endpoint: target.url,
      isAvailable: isRecord(data) ? data.is_available === true : false,
      wallets: infos.map((info) => ({
        currency: String(info.currency ?? ""),
        balance: String(info.total_balance ?? ""),
        granted: String(info.granted_balance ?? ""),
        toppedUp: String(info.topped_up_balance ?? ""),
        kind: "topped-up"
      }))
    };
  }
  const credits = isRecord(data) && isRecord(data.data) ? data.data : void 0;
  const total = credits !== void 0 ? Number(credits.total_credits) : Number.NaN;
  const used = credits !== void 0 ? Number(credits.total_usage) : Number.NaN;
  if (!Number.isFinite(total)) return { status: "failed", message: "\u54CD\u5E94\u7ED3\u6784\u65E0\u6CD5\u8BC6\u522B", link: consoleLink(providerId, baseURL) };
  const remaining = total - (Number.isFinite(used) ? used : 0);
  return {
    status: "ready",
    endpoint: target.url,
    wallets: [{ currency: "USD", balance: remaining.toFixed(2), toppedUp: total.toFixed(2), granted: "0.00", kind: "topped-up" }]
  };
}

// src/host/credentials.ts
async function describeCredential(service, ref) {
  if (ref === void 0) return null;
  const credentials = service("credentials");
  if (credentials === void 0 || typeof credentials.describe !== "function") {
    return { ref, configured: false, unknown: true };
  }
  try {
    const described = await credentials.describe(ref);
    if (isRecord(described)) {
      return {
        ref,
        configured: described.configured === true,
        source: asString(described.source),
        writable: described.writable === true
      };
    }
    return { ref, configured: false };
  } catch (error) {
    return { ref, configured: false, error: errorText(error) };
  }
}
async function resolveSecret(service, ref) {
  const credentials = service("credentials");
  if (credentials === void 0 || typeof credentials.resolve !== "function") return void 0;
  try {
    const resolved = await credentials.resolve(ref);
    if (typeof resolved === "string") return resolved;
    if (isRecord(resolved) && typeof resolved.value === "string") return resolved.value;
    return void 0;
  } catch {
    return void 0;
  }
}
async function describeRecordCredential(service, settingsNs, providerId) {
  if (settingsNs === void 0) return void 0;
  const credentials = service("credentials");
  if (credentials === void 0 || typeof credentials.describeRecord !== "function") return void 0;
  const key = `${settingsNs}/${providerId}`;
  try {
    const described = await credentials.describeRecord(key);
    if (isRecord(described) && described.configured === true) {
      return { key, kind: asString(described.kind), writable: described.writable === true };
    }
  } catch {
    return void 0;
  }
  return void 0;
}
async function resolveRecordSecret(service, key) {
  const credentials = service("credentials");
  if (credentials === void 0 || typeof credentials.readRecord !== "function") return void 0;
  try {
    const record = await credentials.readRecord(key);
    if (isRecord(record) && record.kind === "api-key" && typeof record.key === "string") return record.key;
    return void 0;
  } catch {
    return void 0;
  }
}

// src/host/models.ts
function listProviderEntries(service, options) {
  const llm = service("llm");
  const entries = /* @__PURE__ */ new Map();
  if (llm !== void 0 && typeof llm.listProviders === "function") {
    let registered;
    try {
      registered = llm.listProviders();
    } catch {
      registered = [];
    }
    for (const info of Array.isArray(registered) ? registered : []) {
      if (!isRecord(info) || typeof info.id !== "string") continue;
      entries.set(info.id, { id: info.id, routeName: asString(info.name), active: true });
    }
  }
  if (llm !== void 0 && typeof llm.listConfigurableProviders === "function") {
    let directory;
    try {
      directory = llm.listConfigurableProviders();
    } catch {
      directory = [];
    }
    for (const entry of Array.isArray(directory) ? directory : []) {
      if (!isRecord(entry) || typeof entry.provider !== "string") continue;
      const known = entries.get(entry.provider);
      if (known === void 0 && options.includeDormantProviders !== true) continue;
      const merged = known ?? { id: entry.provider, active: false };
      entries.set(entry.provider, {
        ...merged,
        displayName: asString(entry.displayName),
        settingsNs: asString(entry.settingsNs),
        settingsPath: Array.isArray(entry.settingsPath) ? entry.settingsPath : [],
        declared: entry.declared === true,
        configError: asString(entry.error)
      });
    }
  }
  return [...entries.values()].sort((left, right) => {
    const byGroup = providerOrder(left.id) - providerOrder(right.id);
    return byGroup !== 0 ? byGroup : left.id.localeCompare(right.id);
  });
}
async function listModels(service, providerId) {
  const llm = service("llm");
  if (llm === void 0 || typeof llm.listModels !== "function") return { models: [], error: void 0 };
  try {
    const listed = await llm.listModels(providerId);
    const models = [];
    for (const model of Array.isArray(listed) ? listed : []) {
      if (!isRecord(model) || typeof model.id !== "string") continue;
      models.push({
        id: model.id,
        name: asString(model.name) ?? model.id,
        description: asString(model.description),
        inputModalities: Array.isArray(model.inputModalities) ? model.inputModalities.filter((item) => typeof item === "string") : void 0
      });
    }
    return { models, error: void 0 };
  } catch (error) {
    return { models: [], error: errorText(error) };
  }
}
function modelsFromConfig(node) {
  const models = [];
  for (const model of isRecord(node) && Array.isArray(node.models) ? node.models : []) {
    if (!isRecord(model) || typeof model.id !== "string") continue;
    models.push({
      id: model.id,
      name: asString(model.name) ?? model.id,
      description: asString(model.description),
      contextWindow: typeof model.contextWindow === "number" ? model.contextWindow : void 0,
      maxTokens: typeof model.maxTokens === "number" ? model.maxTokens : void 0,
      inputModalities: Array.isArray(model.inputModalities) ? model.inputModalities.filter((item) => typeof item === "string") : Array.isArray(model.input) ? model.input.filter((item) => typeof item === "string") : void 0,
      source: "settings"
    });
  }
  return models;
}
async function enrichModels(service, providerId, models) {
  const llm = service("llm");
  if (llm === void 0 || typeof llm.resolveModelInfo !== "function") return models;
  const resolve = llm.resolveModelInfo;
  const targets = models.slice(0, DETAIL_MODEL_CAP);
  const enriched = /* @__PURE__ */ new Map();
  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const index = cursor;
      cursor += 1;
      const model = targets[index];
      try {
        const info = await resolve(providerId, model.id);
        if (isRecord(info)) {
          enriched.set(model.id, {
            contextWindow: isRecord(info.context) && typeof info.context.contextWindow === "number" ? info.context.contextWindow : void 0,
            maxTokens: typeof info.defaultMaxTokens === "number" ? info.defaultMaxTokens : void 0,
            inputModalities: Array.isArray(info.inputModalities) ? info.inputModalities.filter((item) => typeof item === "string") : void 0,
            reasoning: isRecord(info.reasoning) && Array.isArray(info.reasoning.efforts) ? {
              efforts: info.reasoning.efforts.filter(isRecord).map((effort) => ({
                id: String(effort.id ?? ""),
                name: String(effort.name ?? effort.id ?? "")
              })),
              defaultEffort: asString(info.reasoning.defaultEffort)
            } : void 0
          });
        }
      } catch (error) {
        enriched.set(model.id, { detailError: errorText(error) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, targets.length) }, worker));
  return models.map((model) => {
    const detail = enriched.get(model.id);
    return detail === void 0 ? model : { ...model, ...detail };
  });
}

// src/host/settings.ts
function readSettingsRows(service) {
  const settings = service("settings");
  const rows = /* @__PURE__ */ new Map();
  if (settings === void 0 || typeof settings.describe !== "function") return rows;
  let described;
  try {
    described = settings.describe();
  } catch {
    return rows;
  }
  for (const row of Array.isArray(described) ? described : []) {
    if (isRecord(row) && typeof row.ns === "string") {
      rows.set(row.ns, { ns: row.ns, value: row.value });
    }
  }
  return rows;
}
function configNodeAt(settingsRows, settingsNs, settingsPath) {
  if (settingsNs === void 0) return void 0;
  const row = settingsRows.get(settingsNs);
  if (row === void 0) return void 0;
  let node = row.value;
  for (const segment of Array.isArray(settingsPath) ? settingsPath : []) {
    if (!isRecord(node)) return void 0;
    node = node[segment];
  }
  return isRecord(node) ? node : void 0;
}

// src/host/collect.ts
async function collectProvider(env, entry, settingsRows, signal) {
  const settingsNode = configNodeAt(settingsRows, entry.settingsNs, entry.settingsPath);
  const baseURL = asString(settingsNode?.baseURL);
  const apiKeyEnv = asString(settingsNode?.apiKeyEnv);
  const { models: advertised, error: catalogError } = await listModels(env.service, entry.id);
  let models = advertised.length > 0 ? advertised : modelsFromConfig(settingsNode);
  if (env.options.includeModelDetails !== false && models.length > 0) {
    models = await enrichModels(env.service, entry.id, models);
  }
  const byReference = await describeCredential(env.service, apiKeyEnv);
  const byRecord = byReference === null || byReference.configured !== true ? await describeRecordCredential(env.service, entry.settingsNs, entry.id) : void 0;
  const credential = byRecord !== void 0 ? { ref: byRecord.key, configured: true, source: "record", kind: byRecord.kind } : byReference;
  const resolveKey = async () => {
    if (apiKeyEnv !== void 0) {
      const value = await resolveSecret(env.service, apiKeyEnv);
      if (value !== void 0 && value.length > 0) return value;
    }
    if (byRecord !== void 0 && byRecord.kind === "api-key") return resolveRecordSecret(env.service, byRecord.key);
    return void 0;
  };
  const label = apiKeyEnv ?? byRecord?.key ?? (balanceTarget(entry.id, baseURL).kind === "deepseek" ? "DEEPSEEK_API_KEY" : void 0);
  const balance = await providerBalance(env.service, env.options, entry.id, baseURL, resolveKey, label, signal);
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
    models
  };
}
async function buildPayload(env, providerId) {
  const settingsRows = readSettingsRows(env.service);
  const allEntries = listProviderEntries(env.service, env.options);
  const entries = providerId === void 0 ? allEntries : allEntries.filter((entry) => entry.id === providerId);
  if (providerId !== void 0 && entries.length === 0) throw new Error(`\u672A\u627E\u5230\u670D\u52A1\u5546: ${providerId}`);
  const providers = [];
  for (const entry of entries) {
    providers.push(await collectProvider(env, entry, settingsRows, void 0));
  }
  const payload = {
    ok: true,
    command: COMMAND_NAME,
    detail: true,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    providers,
    counts: {
      providers: providers.length,
      activeProviders: providers.filter((provider) => provider.active).length,
      models: providers.reduce((total, provider) => total + provider.modelCount, 0)
    }
  };
  return payload;
}
function waitForPayload(pending, signal) {
  if (signal === void 0) return pending;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
function createPayloadLoader(env) {
  let cache;
  let pending;
  let failure;
  const scopedPending = /* @__PURE__ */ new Map();
  return async function payloadFor(detail, signal, force = false, providerId) {
    signal?.throwIfAborted();
    if (providerId !== void 0) {
      if (pending !== void 0) {
        const payload2 = await waitForPayload(pending, signal);
        const provider = payload2.providers.find((entry) => entry.id === providerId);
        if (provider === void 0) throw new Error(`\u672A\u627E\u5230\u670D\u52A1\u5546: ${providerId}`);
        return projectPayload({
          ...payload2,
          providers: [provider],
          counts: { providers: 1, activeProviders: provider.active ? 1 : 0, models: provider.modelCount },
          cacheRemainingMs: Math.max(0, (cache?.expiresAt ?? 0) - Date.now())
        }, detail);
      }
      let request = scopedPending.get(providerId);
      if (request === void 0) {
        request = buildPayload(env, providerId).then((collected) => {
          const payload2 = retainBalances(cache?.payload, collected);
          const ttl = hasBalanceFailure(payload2) ? CACHE_RETRY_MS : CACHE_TTL_MS;
          if (cache !== void 0) {
            cache.payload = mergeProviderPayload(cache.payload, payload2);
            cache.expiresAt = Math.min(cache.expiresAt, Date.now() + ttl);
          }
          return { ...payload2, cacheRemainingMs: ttl };
        }).finally(() => {
          scopedPending.delete(providerId);
        });
        scopedPending.set(providerId, request);
      }
      return projectPayload(await waitForPayload(request, signal), detail);
    }
    if (pending === void 0 && scopedPending.size > 0) {
      await waitForPayload(Promise.allSettled(scopedPending.values()), signal);
    }
    if (pending === void 0) {
      if (!force && cache !== void 0 && Date.now() < cache.expiresAt) {
        return { ...projectPayload(cache.payload, detail), cacheRemainingMs: cache.expiresAt - Date.now() };
      }
      if (!force && failure !== void 0 && Date.now() < failure.retryAt) throw failure.error;
      pending = buildPayload(env).then((collected) => {
        const payload2 = retainBalances(cache?.payload, collected);
        const ttl = hasBalanceFailure(payload2) ? CACHE_RETRY_MS : CACHE_TTL_MS;
        cache = { expiresAt: Date.now() + ttl, payload: payload2 };
        failure = void 0;
        return payload2;
      }, (error) => {
        failure = { retryAt: Date.now() + CACHE_RETRY_MS, error };
        throw error;
      }).finally(() => {
        pending = void 0;
      });
    }
    const payload = await waitForPayload(pending, signal);
    return { ...projectPayload(payload, detail), cacheRemainingMs: Math.max(0, (cache?.expiresAt ?? 0) - Date.now()) };
  };
}

// src/index.ts
var name = "dsh-models-usage";
var inject = ["llm", "settings", "credentials", "commands", "tools", "subprocess"];
function apply(ctx, config) {
  const options = { ...DEFAULTS, ...isRecord(config) ? config : {} };
  const service = createServiceLookup(ctx);
  const payloadFor = createPayloadLoader({ service, options });
  ctx.commands.register({
    name: COMMAND_NAME,
    description: "\u5217\u51FA\u5F53\u524D\u6A21\u578B\u5217\u8868\u4E2D\u7684\u670D\u52A1\u5546\u4E0E\u6A21\u578B\uFF0C\u5E76\u67E5\u8BE2\u53EF\u83B7\u5F97\u7684\u4F59\u989D\u4FE1\u606F\u3002",
    input: { hint: "summary | detail | refresh [provider=<id>]" },
    recordInput: false,
    handler: async (invocation) => {
      try {
        const args = String(invocation.rawInput ?? "").trim().split(/\s+/).filter(Boolean);
        const modes = args.map((arg) => arg.toLowerCase());
        const providerArgs = args.filter((arg) => arg.startsWith("provider="));
        if (providerArgs.length > 1 || args.some((arg) => !["summary", "detail", "refresh"].includes(arg.toLowerCase()) && !arg.startsWith("provider="))) {
          throw new Error("\u7528\u6CD5: summary | detail | refresh [provider=<id>]");
        }
        const providerId = providerArgs.length === 0 ? void 0 : decodeURIComponent(providerArgs[0].slice("provider=".length));
        const payload = await payloadFor(!modes.includes("summary"), void 0, modes.includes("refresh"), providerId);
        return { kind: "success", text: JSON.stringify(payload) };
      } catch (error) {
        return { kind: "error", text: `\u91C7\u96C6\u6A21\u578B\u6E05\u5355\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}` };
      }
    }
  });
  ctx.tools.register(defineTool({
    name: "models_balance",
    description: "\u5217\u51FA\u5F53\u524D Harness \u6A21\u578B\u5217\u8868\u4E2D\u7684\u5168\u90E8\u670D\u52A1\u5546\u4E0E\u6A21\u578B\uFF0C\u5E76\u7ED9\u51FA\u6BCF\u4E2A\u670D\u52A1\u5546\u53EF\u67E5\u8BE2\u5230\u7684\u4F59\u989D\u4FE1\u606F\uFF08DeepSeek \u5F00\u653E\u5E73\u53F0 / DeepSeek \u8D26\u53F7\u7531\u5B98\u65B9\u63A5\u53E3\u8FD4\u56DE\uFF1B\u672A\u63D0\u4F9B\u4F59\u989D\u63A5\u53E3\u7684\u670D\u52A1\u5546\u4F1A\u88AB\u660E\u786E\u6807\u6CE8\uFF09\u3002\u65E0\u53C2\u6570\u3002",
    parameters: {},
    output: {
      schema: { type: "json" },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }]
    },
    async execute(_args, exec) {
      const payload = await payloadFor(true, exec?.signal);
      return payload;
    }
  }));
}
export {
  apply,
  inject,
  name
};
