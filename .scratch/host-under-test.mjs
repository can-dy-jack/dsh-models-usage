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
      if (provider.balance.status !== "failed" || old?.balance.status !== "ready" || old.baseURL !== provider.baseURL || old.balance.source !== provider.balance.source || old.settingsNs !== provider.settingsNs || old.credential?.ref !== provider.credential?.ref || old.credential?.source !== provider.credential?.source || old.credential?.kind !== provider.credential?.kind || old.credential?.configured !== provider.credential?.configured) {
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
  includeDormantProviders: false,
  customQueryFile: ""
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
function isAntLingRoute(providerId, baseURL) {
  return providerId === "ant-ling" || hostOf(baseURL) === "api.ant-ling.com";
}
function xiaomiBillingMode(providerId, baseURL) {
  const host = hostOf(baseURL);
  if (host === "api.xiaomimimo.com") return "api";
  if (host !== void 0 && /^token-plan-(?:cn|sgp|ams)\.xiaomimimo\.com$/.test(host)) return "token-plan";
  if (providerId === "xiaomi") return "api";
  if (["xiaomi-token-plan-cn", "xiaomi-token-plan-sgp", "xiaomi-token-plan-ams"].includes(providerId)) return "token-plan";
  return void 0;
}
function qwenBillingRoute(providerId, baseURL) {
  const host = hostOf(baseURL);
  if (host === "token-plan.cn-beijing.maas.aliyuncs.com") return { mode: "token-plan", region: "cn-beijing" };
  if (host === "token-plan.ap-southeast-1.maas.aliyuncs.com") return { mode: "token-plan", region: "ap-southeast-1" };
  if (host === "coding.dashscope.aliyuncs.com") return { mode: "coding-plan", region: "cn-beijing" };
  if (host === "coding-intl.dashscope.aliyuncs.com") return { mode: "coding-plan", region: "ap-southeast-1" };
  const regions = {
    "dashscope.aliyuncs.com": "cn-beijing",
    "dashscope-intl.aliyuncs.com": "ap-southeast-1",
    "dashscope-us.aliyuncs.com": "us-east-1",
    "cn-hongkong.dashscope.aliyuncs.com": "cn-hongkong"
  };
  if (host !== void 0) {
    const region = regions[host] ?? (/^token-plan\./.test(host) ? void 0 : /^[a-z0-9-]+\.(cn-beijing|ap-southeast-1|us-east-1|cn-hongkong|ap-northeast-1|eu-central-1)\.maas\.aliyuncs\.com$/.exec(host)?.[1]);
    if (region !== void 0) return { mode: "api", region };
  }
  if (providerId === "qwen-token-plan-cn") return { mode: "token-plan", region: "cn-beijing" };
  if (providerId === "qwen-token-plan" || providerId === "qwen-token-plan-individual") {
    return { mode: "token-plan", region: "ap-southeast-1" };
  }
  return void 0;
}
function zaiPlatform(providerId, baseURL) {
  const host = hostOf(baseURL);
  if (host === "api.z.ai") return "zai";
  if (host === "open.bigmodel.cn" || host === "dev.bigmodel.cn") return "zai-cn";
  return providerId === "zai" ? "zai" : providerId === "zai-coding-cn" ? "zai-cn" : void 0;
}
function consoleLink(providerId, baseURL) {
  const host = hostOf(baseURL);
  if (isAntLingRoute(providerId, baseURL)) return "https://chat.ant-ling.com/open";
  const xiaomi = xiaomiBillingMode(providerId, baseURL);
  if (xiaomi !== void 0) return `https://platform.xiaomimimo.com/console/${xiaomi === "api" ? "balance" : "plan-manage"}`;
  const qwen = qwenBillingRoute(providerId, baseURL);
  if (qwen !== void 0) {
    const domestic = qwen.region === "cn-beijing";
    const console = `https://${domestic ? "bailian.console.aliyun.com" : "modelstudio.console.alibabacloud.com"}/${qwen.region}`;
    return console + (qwen.mode === "token-plan" ? `/subscription/${domestic ? "overview" : "token-plan"}` : qwen.mode === "coding-plan" ? "/subscription/coding-plan" : "");
  }
  const zai = zaiPlatform(providerId, baseURL);
  if (zai !== void 0) {
    const coding = zaiUsageTarget(providerId, baseURL) !== void 0;
    return zai === "zai" ? `https://z.ai/manage-apikey/${coding ? "coding-plan/personal/usage" : "billing"}` : `https://bigmodel.cn/usercenter/${coding ? "glm-coding/usage" : "proj-mgmt/account"}`;
  }
  if (providerId === "openrouter" || host === "openrouter.ai") return "https://openrouter.ai/settings/credits";
  if (providerId === "opencode-go" || host === "opencode.ai") return "https://opencode.ai/workspace";
  if (kimiUsageURL(providerId, baseURL) !== void 0) {
    return host === "api.kimi.ai" ? "https://www.kimi.ai/code/console" : "https://www.kimi.com/code/console";
  }
  const moonshot = moonshotBalanceTarget(providerId, baseURL);
  if (moonshot !== void 0) {
    return moonshot.kind === "moonshot-cn" ? "https://platform.moonshot.cn/console/info" : "https://platform.moonshot.ai/console/info";
  }
  const minimax = minimaxBalanceTarget(providerId, baseURL);
  if (minimax !== void 0) {
    return minimax.kind === "minimax-cn" ? "https://platform.minimax.cn/user-center/payment/token-plan" : "https://platform.minimax.io/user-center/payment/token-plan";
  }
  if (host !== void 0) {
    if (host.endsWith("volces.com")) return "https://console.volcengine.com/ark";
    if (host.endsWith("bigmodel.cn")) return "https://bigmodel.cn/usercenter/proj-mgmt/account";
    if (host.endsWith("aliyuncs.com")) return "https://bailian.console.aliyun.com/";
    if (host.endsWith("siliconflow.cn")) return "https://cloud.siliconflow.cn/account/ak";
  }
  if (providerId === "ark") return "https://console.volcengine.com/ark";
  return originOf(baseURL);
}
function zaiUsageTarget(providerId, baseURL) {
  const kind = zaiPlatform(providerId, baseURL);
  if (kind === void 0) return void 0;
  try {
    const url = new URL(baseURL ?? (kind === "zai-cn" ? "https://open.bigmodel.cn/api/coding/paas/v4" : "https://api.z.ai/api/coding/paas/v4"));
    if (url.protocol !== "https:" && url.protocol !== "http:") return void 0;
    const official = ["api.z.ai", "open.bigmodel.cn", "dev.bigmodel.cn"].includes(url.hostname);
    const path = url.pathname.replace(/\/+$/, "");
    const codingSuffix = /\/api\/(?:coding\/paas\/v4|anthropic(?:\/v1)?)$/;
    if (official ? !/^\/api\/(?:coding\/paas\/v4|anthropic(?:\/v1)?)$/.test(path) : /\/api\/paas\/v4$/.test(path)) return void 0;
    const prefix = official ? "" : codingSuffix.test(path) ? path.replace(codingSuffix, "") : path.replace(/\/v1$/, "");
    url.pathname = prefix + "/api/monitor/usage/quota/limit";
    url.search = "";
    url.hash = "";
    return { kind, url: url.href };
  } catch {
    return void 0;
  }
}
function minimaxBalanceTarget(providerId, baseURL) {
  const routeKind = providerId === "minimax-cn" ? "minimax-cn" : providerId === "minimax" ? "minimax" : void 0;
  if (baseURL === void 0 && routeKind === void 0) return void 0;
  try {
    const url = new URL(baseURL ?? (routeKind === "minimax-cn" ? "https://api.minimaxi.com" : "https://api.minimax.io"));
    if (url.protocol !== "https:" && url.protocol !== "http:") return void 0;
    const officialKind = url.hostname === "api.minimax.io" ? "minimax" : url.hostname === "api.minimaxi.com" || url.hostname === "api.minimax.cn" ? "minimax-cn" : void 0;
    const kind = officialKind ?? routeKind;
    if (kind === void 0) return void 0;
    const path = url.pathname.replace(/\/+$/, "");
    const prefix = officialKind !== void 0 ? "" : path.replace(/\/(?:anthropic(?:\/v1)?|v1)$/, "");
    url.search = "";
    url.hash = "";
    url.pathname = prefix + "/account/query_balance";
    const balanceURL = url.href;
    url.pathname = prefix + "/v1/token_plan/remains";
    return { kind, url: url.href, balanceURL };
  } catch {
    return void 0;
  }
}
function openRouterCreditsURL(providerId, baseURL) {
  if (baseURL === void 0) return providerId === "openrouter" ? "https://openrouter.ai/api/v1/credits" : void 0;
  try {
    const url = new URL(baseURL);
    if (url.protocol !== "https:" && url.protocol !== "http:") return void 0;
    const official = url.hostname === "openrouter.ai";
    if (providerId !== "openrouter" && !official) return void 0;
    const path = url.pathname.replace(/\/+$/, "");
    url.pathname = official ? "/api/v1/credits" : path + (path.endsWith("/v1") ? "/credits" : "/api/v1/credits");
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return void 0;
  }
}
function moonshotBalanceTarget(providerId, baseURL) {
  const routeKind = providerId === "moonshotai-cn" ? "moonshot-cn" : providerId === "moonshotai" ? "moonshot" : void 0;
  if (baseURL === void 0) {
    if (routeKind === void 0) return void 0;
    return { kind: routeKind, url: `https://api.moonshot.${routeKind === "moonshot-cn" ? "cn" : "ai"}/v1/users/me/balance` };
  }
  try {
    const url = new URL(baseURL);
    if (url.protocol !== "https:" && url.protocol !== "http:") return void 0;
    const officialKind = url.hostname === "api.moonshot.cn" ? "moonshot-cn" : url.hostname === "api.moonshot.ai" ? "moonshot" : void 0;
    const kind = officialKind ?? routeKind;
    if (kind === void 0) return void 0;
    const path = url.pathname.replace(/\/+$/, "");
    url.pathname = officialKind !== void 0 ? "/v1/users/me/balance" : path + (path.endsWith("/v1") ? "/users/me/balance" : "/v1/users/me/balance");
    url.search = "";
    url.hash = "";
    return { kind, url: url.href };
  } catch {
    return void 0;
  }
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
function openCodeGoUsageURL(providerId, baseURL) {
  if (baseURL === void 0) return providerId === "opencode-go" ? "https://opencode.ai/zen/go/v1/usage" : void 0;
  try {
    const url = new URL(baseURL);
    if (url.protocol !== "https:" && url.protocol !== "http:") return void 0;
    const path = url.pathname.replace(/\/+$/, "");
    const official = url.hostname === "opencode.ai" && /^\/zen\/go(?:\/v1)?$/.test(path);
    if (url.hostname === "opencode.ai" ? !official : providerId !== "opencode-go") return void 0;
    url.pathname = path + (path.endsWith("/v1") ? "/usage" : "/v1/usage");
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return void 0;
  }
}
function balanceTarget(providerId, baseURL) {
  if (providerId === ACCOUNT_PROVIDER) return { kind: "account" };
  if (isAntLingRoute(providerId, baseURL)) return { kind: "unsupported" };
  if (xiaomiBillingMode(providerId, baseURL) !== void 0) return { kind: "unsupported" };
  if (qwenBillingRoute(providerId, baseURL) !== void 0) return { kind: "unsupported" };
  const host = hostOf(baseURL);
  if (providerId === OFFICIAL_PROVIDER || host !== void 0 && (host === "api.deepseek.com" || host.endsWith(".deepseek.com"))) {
    return { kind: "deepseek", url: `${originOf(baseURL) ?? "https://api.deepseek.com"}/user/balance` };
  }
  const creditsURL = openRouterCreditsURL(providerId, baseURL);
  if (creditsURL !== void 0) return { kind: "openrouter", url: creditsURL };
  const kimiURL = kimiUsageURL(providerId, baseURL);
  if (kimiURL !== void 0) return { kind: "kimi-coding", url: kimiURL };
  const moonshot = moonshotBalanceTarget(providerId, baseURL);
  if (moonshot !== void 0) return moonshot;
  const goURL = openCodeGoUsageURL(providerId, baseURL);
  if (goURL !== void 0) return { kind: "opencode-go", url: goURL };
  const minimax = minimaxBalanceTarget(providerId, baseURL);
  if (minimax !== void 0) return minimax;
  const zai = zaiUsageTarget(providerId, baseURL);
  if (zai !== void 0) return zai;
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
  const number2 = Number(value);
  return Number.isFinite(number2) && number2 >= 0 ? number2 : void 0;
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

// src/host/moonshot.ts
function amount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : void 0;
  if (typeof value !== "string") return void 0;
  const text2 = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text2)) return void 0;
  return Number.isFinite(Number(text2)) ? text2 : void 0;
}
function parseMoonshotBalance(data, currency) {
  const failed = { status: "failed", message: "Moonshot AI \u8FD4\u56DE\u7684\u4F59\u989D\u54CD\u5E94\u65E0\u6CD5\u8BC6\u522B" };
  if (!isRecord(data) || data.code !== 0 || data.status !== true || !isRecord(data.data)) return failed;
  const available = amount(data.data.available_balance);
  const cash = amount(data.data.cash_balance);
  const voucher = amount(data.data.voucher_balance);
  if (available === void 0 || data.data.cash_balance !== void 0 && cash === void 0 || data.data.voucher_balance !== void 0 && voucher === void 0 || voucher !== void 0 && Number(voucher) < 0) return failed;
  return {
    status: "ready",
    isAvailable: Number(available) > 0,
    wallets: [{ currency, balance: available, cash, voucher, kind: "account" }]
  };
}

// src/host/minimax.ts
function numeric2(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return void 0;
  const number2 = Number(value);
  return Number.isFinite(number2) ? number2 : void 0;
}
function failure(data) {
  if (!isRecord(data)) return { status: "failed", message: "MiniMax \u54CD\u5E94\u7ED3\u6784\u65E0\u6CD5\u8BC6\u522B" };
  if (data.base_resp !== void 0) {
    const code = isRecord(data.base_resp) ? numeric2(data.base_resp.status_code) : void 0;
    if (code !== 0) {
      const message = isRecord(data.base_resp) ? asString(data.base_resp.status_msg) : void 0;
      if (message !== void 0 && /no active (?:token|coding) plan subscription/i.test(message)) {
        return { status: "failed", message: "MiniMax \u672A\u68C0\u6D4B\u5230\u6709\u6548\u7684 Token / Coding Plan \u8BA2\u9605\uFF0C\u8BF7\u68C0\u67E5\u8BE5\u5730\u533A\u7684\u8BA2\u9605\u72B6\u6001\u53CA\u4E13\u7528\u5BC6\u94A5" };
      }
      return { status: "failed", message: `MiniMax \u67E5\u8BE2\u5931\u8D25${code !== void 0 ? ` (${code})` : ""}\uFF0C\u8BF7\u68C0\u67E5\u5BC6\u94A5\u7C7B\u578B\u3001\u5730\u533A\u548C\u8D26\u6237\u72B6\u6001` };
    }
  }
  return void 0;
}
function parseMiniMaxBalance(data, currency) {
  const error = failure(data);
  if (error !== void 0) return error;
  if (!isRecord(data) || !isRecord(data.base_resp) || data.available_amount === void 0) {
    return { status: "failed", message: "MiniMax \u4F59\u989D\u54CD\u5E94\u7ED3\u6784\u65E0\u6CD5\u8BC6\u522B" };
  }
  const available = numeric2(data.available_amount);
  if (available === void 0) return { status: "failed", message: "MiniMax \u672A\u8FD4\u56DE\u6709\u6548\u7684\u53EF\u7528\u4F59\u989D" };
  const wallet = { currency, balance: String(data.available_amount).trim(), kind: "account" };
  for (const [field, key] of [["cash_balance", "cash"], ["voucher_balance", "voucher"], ["credit_balance", "credit"], ["owed_amount", "owed"]]) {
    if (data[field] === void 0) continue;
    const value = numeric2(data[field]);
    if (value === void 0 || key !== "cash" && value < 0) return { status: "failed", message: "MiniMax \u4F59\u989D\u660E\u7EC6\u65E0\u6548" };
    wallet[key] = String(data[field]).trim();
  }
  return { status: "ready", isAvailable: available > 0, wallets: [wallet] };
}
function resetAt2(end, countdown, now) {
  const epoch = numeric2(end);
  const milliseconds = epoch !== void 0 && epoch > 0 ? epoch : void 0;
  const remaining = numeric2(countdown);
  const time = milliseconds ?? (remaining !== void 0 && remaining >= 0 ? now + remaining : void 0);
  if (time === void 0 || !Number.isFinite(new Date(time).getTime())) return void 0;
  return new Date(time).toISOString();
}
function quota2(item, period, scope, now) {
  const weekly = period === "weekly";
  const prefix = weekly ? "current_weekly" : "current_interval";
  const status = numeric2(item[prefix + "_status"]);
  const percent = numeric2(item[prefix + "_remaining_percent"]);
  const total = numeric2(item[prefix + "_total_count"]);
  const reported = numeric2(item[prefix + "_usage_count"]);
  let counts;
  if (total !== void 0 && total > 0 && reported !== void 0 && reported >= 0 && reported <= total) {
    let remaining = reported;
    const leftDistance = percent === void 0 ? 0 : Math.abs(reported / total * 100 - percent);
    const usedDistance = percent === void 0 ? Infinity : Math.abs((total - reported) / total * 100 - percent);
    if (Math.min(leftDistance, usedDistance) <= 1) {
      if (usedDistance < leftDistance) remaining = total - reported;
      counts = { limit: total, used: total - remaining, remaining };
    }
  }
  const basePercent = status === 3 ? 100 : status === 2 ? 0 : percent !== void 0 && percent >= 0 ? percent : counts !== void 0 ? counts.remaining / counts.limit * 100 : void 0;
  if (basePercent === void 0) return void 0;
  const boost = weekly ? numeric2(item.weekly_boost_permille) : void 0;
  const remainingPercent = basePercent * (boost !== void 0 && boost > 0 && status !== 3 ? boost / 1e3 : 1);
  if (!Number.isFinite(remainingPercent)) return void 0;
  const start = numeric2(item[weekly ? "weekly_start_time" : "start_time"]);
  const end = numeric2(item[weekly ? "weekly_end_time" : "end_time"]);
  const windowSeconds2 = start !== void 0 && end !== void 0 && end > start ? (end - start) / 1e3 : void 0;
  return {
    id: scope === void 0 ? period : `${scope}:${period}`,
    period,
    scope,
    windowSeconds: windowSeconds2,
    usedPercent: Math.max(0, 100 - basePercent),
    remainingPercent,
    resetAt: status === 3 ? void 0 : resetAt2(end, item[weekly ? "weekly_remains_time" : "remains_time"], now),
    ...status === 3 ? { unlimited: true } : {},
    ...status === 2 || status === 3 ? {} : counts
  };
}
function parseMiniMaxUsage(data, now = Date.now()) {
  const error = failure(data);
  if (error !== void 0) return error;
  if (!isRecord(data) || !Array.isArray(data.model_remains)) return { status: "failed", message: "MiniMax \u5957\u9910\u989D\u5EA6\u54CD\u5E94\u7ED3\u6784\u65E0\u6CD5\u8BC6\u522B" };
  const quotas = [];
  for (const item of data.model_remains) {
    if (!isRecord(item)) continue;
    const scope = asString(item.model_name);
    for (const period of ["five-hour", "weekly"]) {
      const entry = quota2(item, period, scope, now);
      if (entry !== void 0 && !quotas.some((existing) => existing.id === entry.id)) quotas.push(entry);
    }
  }
  if (quotas.length === 0) return { status: "failed", message: "MiniMax \u672A\u8FD4\u56DE\u53EF\u8BC6\u522B\u7684\u5957\u9910\u989D\u5EA6\uFF0C\u8BF7\u786E\u8BA4\u4F7F\u7528\u5BF9\u5E94\u5730\u533A\u7684\u8BA2\u9605\u5BC6\u94A5" };
  return { status: "ready", quotas, wallets: [] };
}

// src/host/opencode.ts
function parseOpenCodeGoUsage(data) {
  if (!isRecord(data) || !isRecord(data.usage)) {
    return { status: "failed", message: "OpenCode Go \u989D\u5EA6\u54CD\u5E94\u7ED3\u6784\u65E0\u6CD5\u8BC6\u522B" };
  }
  const quotas = [];
  for (const [field, id] of [["rolling", "five-hour"], ["weekly", "weekly"], ["monthly", "monthly"]]) {
    const window = data.usage[field];
    if (!isRecord(window) || window.status !== "ok" && window.status !== "rate-limited") continue;
    const raw = window.percent;
    if (typeof raw !== "number" && (typeof raw !== "string" || raw.trim().length === 0)) continue;
    const usedPercent = Number(raw);
    if (!Number.isFinite(usedPercent) || usedPercent < 0) continue;
    const resetAt4 = asString(window.resetsAt);
    quotas.push({
      id,
      usedPercent,
      remainingPercent: Math.max(0, 100 - usedPercent),
      resetAt: resetAt4 !== void 0 && Number.isFinite(Date.parse(resetAt4)) ? resetAt4 : void 0
    });
  }
  if (quotas.length === 0) return { status: "failed", message: "OpenCode Go \u672A\u8FD4\u56DE\u53EF\u8BC6\u522B\u7684\u989D\u5EA6\u6570\u636E" };
  return { status: "ready", quotas, wallets: [] };
}

// src/host/zai.ts
function numeric3(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return void 0;
  const number2 = Number(value);
  return Number.isFinite(number2) && number2 >= 0 ? number2 : void 0;
}
function resetAt3(value) {
  const milliseconds = numeric3(value);
  if (milliseconds === void 0 || milliseconds < 1e12) return void 0;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : void 0;
}
function quotaId(item) {
  const unit = numeric3(item.unit);
  const count = numeric3(item.number);
  if (item.unit !== void 0 && unit === void 0 || item.number !== void 0 && count === void 0) return void 0;
  if (item.type === "TIME_LIMIT") {
    return (unit === void 0 || unit === 5) && (count === void 0 || count === 1) ? "mcp-monthly" : void 0;
  }
  if (item.type !== "TOKENS_LIMIT" && item.type !== "CREDIT_LIMIT") return void 0;
  if (unit === void 0 || unit === 3) return count === void 0 || count === 5 ? "five-hour" : void 0;
  return unit === 6 && (count === void 0 || count === 1) ? "weekly" : void 0;
}
function parseZaiUsage(data) {
  if (!isRecord(data)) return { status: "failed", message: "Z.AI Coding Plan \u989D\u5EA6\u54CD\u5E94\u7ED3\u6784\u65E0\u6CD5\u8BC6\u522B" };
  if (data.success !== void 0 && data.success !== true || data.code !== void 0 && numeric3(data.code) !== 200) {
    const code = numeric3(data.code);
    return { status: "failed", message: `Z.AI \u989D\u5EA6\u67E5\u8BE2\u5931\u8D25${code !== void 0 ? ` (${code})` : ""}\uFF0C\u8BF7\u68C0\u67E5\u5730\u533A\u3001\u5957\u9910\u72B6\u6001\u53CA API Key \u662F\u5426\u5173\u8054 Coding Plan` };
  }
  const payload = isRecord(data.data) ? data.data : data;
  if (!Array.isArray(payload.limits)) return { status: "failed", message: "Z.AI Coding Plan \u672A\u8FD4\u56DE\u989D\u5EA6\u5217\u8868" };
  const quotas = [];
  for (const item of payload.limits) {
    if (!isRecord(item)) continue;
    const id = quotaId(item);
    if (id === void 0) continue;
    const limit = numeric3(item.usage);
    const used = numeric3(item.currentValue);
    const reportedRemaining = numeric3(item.remaining);
    const remaining = reportedRemaining ?? (limit !== void 0 && used !== void 0 ? Math.max(0, limit - used) : void 0);
    const percent = item.percentage === void 0 ? limit !== void 0 && limit > 0 && used !== void 0 ? used / limit * 100 : void 0 : numeric3(item.percentage);
    if (percent === void 0 || !Number.isFinite(percent)) continue;
    const entry = {
      id,
      usedPercent: percent,
      remainingPercent: Math.max(0, 100 - percent),
      resetAt: resetAt3(item.nextResetTime),
      ...limit !== void 0 && limit > 0 && used !== void 0 && remaining !== void 0 ? { limit, used, remaining } : {}
    };
    const index = quotas.findIndex((existing) => existing.id === id);
    if (index < 0) quotas.push(entry);
    else if (item.type === "CREDIT_LIMIT") quotas[index] = entry;
  }
  if (quotas.length === 0) return { status: "failed", message: "Z.AI \u672A\u8FD4\u56DE\u53EF\u8BC6\u522B\u7684 Coding Plan \u989D\u5EA6\uFF0C\u8BF7\u786E\u8BA4\u5957\u9910\u4E0E\u5BC6\u94A5\u6743\u9650\uFF1B\u90E8\u5206\u56E2\u961F\u5957\u9910\u53EF\u80FD\u4E0D\u652F\u6301\u6B64\u67E5\u8BE2" };
  quotas.sort((a, b) => ["five-hour", "weekly", "mcp-monthly"].indexOf(a.id) - ["five-hour", "weekly", "mcp-monthly"].indexOf(b.id));
  return { status: "ready", quotas, wallets: [] };
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
  '    const response=await fetch(spec.url,{method:spec.method||"GET",headers:spec.headers||{},body:spec.body,signal:AbortSignal.timeout(spec.timeoutMs||15000)});',
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
async function directRequest(url, headers, signal, request) {
  if (typeof fetch !== "function") return { error: "\u5BBF\u4E3B\u8FDB\u7A0B\u6CA1\u6709\u53EF\u7528\u7684 fetch" };
  const timeout = AbortSignal.timeout(HTTP_TIMEOUT_MS);
  const combined = signal !== void 0 && typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await fetch(url, { method: request.method ?? "GET", headers, body: request.body, signal: combined });
    return { status: response.status, body: await response.text() };
  } catch (error) {
    return { status: 0, body: errorText(error) };
  }
}
async function requestJson(service, url, headers, signal, request = {}) {
  const raw = await requestRaw(service, url, headers, signal, request);
  return raw.status === void 0 ? { ok: false, error: raw.error } : interpret(raw.status, raw.body);
}
async function requestRaw(service, url, headers, signal, request = {}) {
  const subprocess = service("subprocess");
  if (subprocess === void 0 || typeof subprocess.resolveExecutable !== "function" || typeof subprocess.spawn !== "function") {
    return directRequest(url, headers, signal, request);
  }
  let node;
  try {
    node = await subprocess.resolveExecutable("node");
  } catch {
    try {
      node = await subprocess.resolveExecutable("node.exe");
    } catch {
      return directRequest(url, headers, signal, request);
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
        stdin: { data: JSON.stringify({ url, method: request.method ?? "GET", headers, body: request.body, timeoutMs: HTTP_TIMEOUT_MS }) },
        stdout: { mode: "collect", maxBytes: 2e5 },
        stderr: { mode: "collect", maxBytes: 4096 }
      },
      graceMs: 5e3,
      signal
    });
  } catch {
    return directRequest(url, headers, signal, request);
  }
  let outcome;
  try {
    outcome = await handle.done;
  } catch (error) {
    return { error: `\u67E5\u8BE2\u5B50\u8FDB\u7A0B\u5F02\u5E38: ${errorText(error)}` };
  }
  if (outcome.exitCode !== 0) {
    let detail = "";
    const stderr = handle.collected.stderr;
    if (stderr !== void 0) detail = stderr.readFrom(0).text.trim().slice(0, 300);
    return { error: `\u67E5\u8BE2\u5B50\u8FDB\u7A0B\u9000\u51FA\u7801 ${String(outcome.exitCode)}${detail.length > 0 ? `: ${detail}` : ""}` };
  }
  let parsed;
  try {
    const stdout = handle.collected.stdout;
    parsed = JSON.parse((stdout !== void 0 ? stdout.readFrom(0).text : "") || "{}");
  } catch (error) {
    return { error: `\u65E0\u6CD5\u89E3\u6790\u67E5\u8BE2\u7ED3\u679C: ${errorText(error)}` };
  }
  const status = typeof parsed.status === "number" ? parsed.status : 0;
  const body = typeof parsed.body === "string" ? parsed.body : "";
  return { status, body };
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
    const antLing = isAntLingRoute(providerId, baseURL);
    const xiaomi = xiaomiBillingMode(providerId, baseURL);
    const qwen = qwenBillingRoute(providerId, baseURL);
    const zai2 = zaiPlatform(providerId, baseURL);
    return {
      status: "unsupported",
      message: antLing ? "\u6682\u4E0D\u652F\u6301\u767E\u7075\u4F59\u989D\u67E5\u8BE2\uFF1B\u6A21\u578B API Key \u65E0\u6CD5\u8BA4\u8BC1\u63A7\u5236\u53F0\u94B1\u5305\u63A5\u53E3\uFF0C\u8BF7\u767B\u5F55\u5B98\u65B9\u63A7\u5236\u53F0\u67E5\u770B" : xiaomi === "api" ? "Xiaomi MiMo \u666E\u901A API \u4F59\u989D\u9700\u767B\u5F55\u63A7\u5236\u53F0\u67E5\u770B\uFF1B\u5B98\u65B9\u672A\u516C\u5F00\u4F7F\u7528\u6A21\u578B API Key \u67E5\u8BE2\u8D26\u6237\u4F59\u989D\u7684\u63A5\u53E3" : xiaomi === "token-plan" ? "Xiaomi Token Plan \u989D\u5EA6\u9700\u767B\u5F55\u63A7\u5236\u53F0\u67E5\u770B\uFF1B\u5957\u9910\u5BC6\u94A5\u4E0D\u80FD\u7528\u4E8E\u63A7\u5236\u53F0\u767B\u5F55\uFF0C\u5B98\u65B9\u672A\u516C\u5F00\u5BC6\u94A5\u989D\u5EA6\u67E5\u8BE2\u63A5\u53E3" : qwen?.mode === "token-plan" ? "Qwen Token Plan \u989D\u5EA6\u4E0D\u652F\u6301\u7528\u5957\u9910\u5BC6\u94A5\u67E5\u8BE2\uFF1B\u5B98\u65B9\u767E\u70BC CLI \u7528\u91CF\u67E5\u8BE2\u8981\u6C42\u63A7\u5236\u53F0\u8BA4\u8BC1\uFF0C\u8BF7\u767B\u5F55\u5BF9\u5E94\u5730\u533A\u63A7\u5236\u53F0\u67E5\u770B" : qwen?.mode === "coding-plan" ? "Qwen Coding Plan \u989D\u5EA6\u4E0D\u652F\u6301\u7528\u5957\u9910\u5BC6\u94A5\u67E5\u8BE2\uFF1B\u5B98\u65B9\u767E\u70BC CLI \u7528\u91CF\u67E5\u8BE2\u8981\u6C42\u63A7\u5236\u53F0\u8BA4\u8BC1\uFF0C\u8BF7\u767B\u5F55\u5BF9\u5E94\u5730\u533A\u63A7\u5236\u53F0\u67E5\u770B" : qwen?.mode === "api" ? "\u767E\u70BC\u6A21\u578B API Key \u65E0\u6CD5\u67E5\u8BE2\u963F\u91CC\u4E91\u8D26\u6237\u4F59\u989D\uFF1B\u5B98\u65B9\u8D26\u5355\u63A5\u53E3\u9700\u8981\u989D\u5916 AccessKey \u548C\u8D26\u5355\u6743\u9650\uFF0C\u8BF7\u767B\u5F55\u63A7\u5236\u53F0\u67E5\u770B" : zai2 !== void 0 ? "Z.AI / \u667A\u8C31\u4EC5\u652F\u6301 Coding Plan \u989D\u5EA6\u67E5\u8BE2\uFF1B\u666E\u901A API \u73B0\u91D1\u4F59\u989D\u6CA1\u6709\u516C\u5F00\u7684\u6A21\u578B\u5BC6\u94A5\u67E5\u8BE2\u63A5\u53E3\uFF0C\u8BF7\u767B\u5F55\u63A7\u5236\u53F0\u67E5\u770B" : "\u8BE5\u670D\u52A1\u5546\u672A\u63D0\u4F9B\u53EF\u7528\u6A21\u578B\u5BC6\u94A5\u67E5\u8BE2\u7684\u4F59\u989D\u63A5\u53E3",
      ...antLing ? { messageKey: "supportAntLingConsoleDetails" } : xiaomi !== void 0 ? { messageKey: xiaomi === "api" ? "supportXiaomiApiDetails" : "supportXiaomiPlanDetails" } : qwen !== void 0 ? { messageKey: qwen.mode === "api" ? "supportQwenApiDetails" : qwen.mode === "coding-plan" ? "supportQwenCodingDetails" : "supportQwenUsageDetails" } : zai2 !== void 0 ? { messageKey: "supportZaiApiUnsupportedDetails" } : {},
      link: consoleLink(providerId, baseURL)
    };
  }
  const credentialLabel = label ?? (target.kind === "openrouter" ? "OpenRouter API Key" : target.kind === "moonshot" || target.kind === "moonshot-cn" ? "Moonshot API Key" : target.kind === "zai" || target.kind === "zai-cn" ? "Z.AI Coding Plan API Key" : target.kind === "minimax" || target.kind === "minimax-cn" ? "MiniMax API / Subscription Key" : void 0);
  if (credentialLabel === void 0) {
    return { status: "unsupported", message: "\u672A\u58F0\u660E\u51ED\u636E\u5F15\u7528\uFF0C\u65E0\u6CD5\u67E5\u8BE2\u4F59\u989D", link: consoleLink(providerId, baseURL) };
  }
  const key = await resolveKey();
  if (key === void 0 || key.length === 0) {
    return { status: "no-credential", message: `\u672A\u914D\u7F6E ${credentialLabel}`, link: consoleLink(providerId, baseURL) };
  }
  const minimax = target.kind === "minimax" || target.kind === "minimax-cn";
  const zai = target.kind === "zai" || target.kind === "zai-cn";
  const minimaxAccount = minimax && key.startsWith("sk-api-");
  const endpoint = minimaxAccount ? target.balanceURL : target.url;
  const headers = {
    Authorization: zai ? key : `Bearer ${key}`,
    Accept: "application/json",
    ...minimax || zai ? { "Content-Type": "application/json" } : {},
    ...zai ? { "Accept-Language": "en-US,en" } : {}
  };
  const response = await requestJson(service, endpoint, headers, signal);
  if (response.ok !== true) {
    const message = target.kind === "opencode-go" && response.status === 403 ? "OpenCode Go \u62D2\u7EDD\u989D\u5EA6\u67E5\u8BE2\uFF0C\u8BF7\u68C0\u67E5\u8BA2\u9605\u72B6\u6001\u53CA API Key \u662F\u5426\u5173\u8054\u8BA2\u9605 (HTTP 403)" : target.kind === "openrouter" && response.status === 403 ? "OpenRouter \u62D2\u7EDD\u4F59\u989D\u67E5\u8BE2\uFF0C\u8BF7\u786E\u8BA4 API Key \u6709\u8D26\u6237\u4F59\u989D\u67E5\u8BE2\u6743\u9650\uFF08\u5B98\u65B9\u6587\u6863\u8981\u6C42\u7BA1\u7406\u5BC6\u94A5\uFF09(HTTP 403)" : minimax && (response.status === 401 || response.status === 403) ? `MiniMax \u62D2\u7EDD\u67E5\u8BE2\uFF0C\u8BF7\u68C0\u67E5\u5BC6\u94A5\u7C7B\u578B\u53CA\u56FD\u5185/\u56FD\u9645\u5730\u533A\u662F\u5426\u5339\u914D (HTTP ${response.status})` : zai && (response.status === 401 || response.status === 403) ? `Z.AI \u62D2\u7EDD\u989D\u5EA6\u67E5\u8BE2\uFF0C\u8BF7\u68C0\u67E5\u56FD\u5185/\u56FD\u9645\u5730\u533A\u3001Coding Plan \u72B6\u6001\u53CA\u5BC6\u94A5\u6743\u9650 (HTTP ${response.status})` : response.error;
    return { status: "failed", message, link: consoleLink(providerId, baseURL) };
  }
  const data = response.data;
  if (zai) return { ...parseZaiUsage(data), endpoint, link: consoleLink(providerId, baseURL) };
  if (minimax) {
    return {
      ...minimaxAccount ? parseMiniMaxBalance(data, target.kind === "minimax-cn" ? "CNY" : "USD") : parseMiniMaxUsage(data),
      endpoint,
      link: consoleLink(providerId, baseURL)
    };
  }
  if (target.kind === "kimi-coding") {
    return { ...parseKimiUsage(data), endpoint: target.url, link: consoleLink(providerId, baseURL) };
  }
  if (target.kind === "opencode-go") {
    return { ...parseOpenCodeGoUsage(data), endpoint: target.url, link: consoleLink(providerId, baseURL) };
  }
  if (target.kind === "moonshot" || target.kind === "moonshot-cn") {
    return {
      ...parseMoonshotBalance(data, target.kind === "moonshot-cn" ? "CNY" : "USD"),
      endpoint: target.url,
      link: consoleLink(providerId, baseURL)
    };
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

// src/custom-query.ts
var CUSTOM_QUERY_MAX_BYTES = 64 * 1024;
var CUSTOM_QUERY_MAX_RULES = 20;
var TEMPLATE_VARIABLES = ["apiKey", "baseURL", "origin", "providerId", "now.iso", "now.unix", "monthStart.iso", "today"];
var PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;
function parsePath(path) {
  const segments = [];
  const source = path.trim();
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === ".") {
      if (index === 0 || index === source.length - 1 || source[index + 1] === "." || source[index + 1] === "[") return void 0;
      index += 1;
      continue;
    }
    if (char === "[") {
      const close = source.indexOf("]", index);
      if (close < 0) return void 0;
      const inner = source.slice(index + 1, close).trim();
      if (inner === "*") segments.push("*");
      else if (/^\d+$/.test(inner)) segments.push(Number(inner));
      else if (/^(["']).*\1$/.test(inner)) segments.push(inner.slice(1, -1));
      else return void 0;
      index = close + 1;
      continue;
    }
    let end = index;
    while (end < source.length && source[end] !== "." && source[end] !== "[") end += 1;
    segments.push(source.slice(index, end));
    index = end;
  }
  return segments;
}
function step(node, segment) {
  if (typeof segment === "number") return Array.isArray(node) ? node[segment] : void 0;
  if (isRecord(node)) return node[segment];
  if (Array.isArray(node) && /^\d+$/.test(String(segment))) return node[Number(segment)];
  return void 0;
}
function getPath(data, path) {
  if (path === void 0) return void 0;
  const segments = parsePath(path);
  if (segments === void 0 || segments.includes("*")) return void 0;
  let node = data;
  for (const segment of segments) {
    node = step(node, segment);
    if (node === void 0) return void 0;
  }
  return node;
}
function expandItems(data, itemsPath2) {
  if (itemsPath2 === void 0 || itemsPath2.trim().length === 0) return [data];
  const segments = parsePath(itemsPath2);
  if (segments === void 0) return [];
  let nodes = [data];
  for (const segment of segments) {
    const next = [];
    for (const node of nodes) {
      if (segment === "*") {
        if (Array.isArray(node)) next.push(...node);
        else if (isRecord(node)) next.push(...Object.values(node));
      } else {
        const value = step(node, segment);
        if (value !== void 0) next.push(value);
      }
    }
    nodes = next;
  }
  return nodes;
}
function templateVariables(input) {
  const now = input.now ?? /* @__PURE__ */ new Date();
  let origin;
  try {
    origin = input.baseURL === void 0 ? void 0 : new URL(input.baseURL).origin;
  } catch {
    origin = void 0;
  }
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    apiKey: input.apiKey,
    baseURL: input.baseURL?.replace(/\/+$/, ""),
    origin,
    providerId: input.providerId,
    "now.iso": now.toISOString(),
    "now.unix": String(Math.floor(now.getTime() / 1e3)),
    "monthStart.iso": monthStart.toISOString(),
    today: now.toISOString().slice(0, 10)
  };
}
function usesVariable(query, name2) {
  const texts = [
    query.request.url,
    query.request.body ?? "",
    ...query.request.headers.flatMap((entry) => [entry.name, entry.value]),
    ...query.request.query.flatMap((entry) => [entry.name, entry.value])
  ];
  return texts.some((text2) => Array.from(text2.matchAll(PLACEHOLDER)).some((match) => match[1] === name2));
}
function unknownPlaceholders(text2) {
  return Array.from(text2.matchAll(PLACEHOLDER)).map((match) => match[1]).filter((name2) => !TEMPLATE_VARIABLES.includes(name2));
}
function renderTemplate(text2, vars, mode) {
  return text2.replace(PLACEHOLDER, (_match, name2) => {
    const value = vars[name2];
    if (value === void 0) throw new Error(`\u5360\u4F4D\u7B26 {{${name2}}} \u6CA1\u6709\u53EF\u7528\u7684\u503C`);
    return mode === "url" && name2 !== "baseURL" && name2 !== "origin" ? encodeURIComponent(value) : value;
  });
}
function renderJson(node, vars) {
  if (typeof node === "string") return renderTemplate(node, vars, "raw");
  if (Array.isArray(node)) return node.map((item) => renderJson(item, vars));
  if (isRecord(node)) return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, renderJson(value, vars)]));
  return node;
}
function renderRequest(query, vars) {
  const url = new URL(renderTemplate(query.request.url, vars, "url"));
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("\u67E5\u8BE2 URL \u53EA\u652F\u6301 http/https");
  for (const entry of query.request.query) {
    if (entry.name.trim().length === 0) continue;
    url.searchParams.append(renderTemplate(entry.name, vars, "raw"), renderTemplate(entry.value, vars, "raw"));
  }
  const headers = {};
  for (const entry of query.request.headers) {
    if (entry.name.trim().length === 0) continue;
    headers[renderTemplate(entry.name, vars, "raw").trim()] = renderTemplate(entry.value, vars, "raw");
  }
  let body;
  const rawBody = query.request.body?.trim();
  if (query.request.method === "POST" && rawBody !== void 0 && rawBody.length > 0) {
    let parsed;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      parsed = void 0;
    }
    body = parsed === void 0 ? renderTemplate(rawBody, vars, "raw") : JSON.stringify(renderJson(parsed, vars));
    if (parsed !== void 0 && !Object.keys(headers).some((name2) => name2.toLowerCase() === "content-type")) {
      headers["Content-Type"] = "application/json";
    }
  }
  return { method: query.request.method, url: url.href, headers, body };
}
function text(value, max = 4096) {
  return typeof value === "string" && value.length <= max ? value : void 0;
}
function valueRef(raw, errors, label) {
  if (raw === void 0 || raw === null) return void 0;
  if (!isRecord(raw)) {
    errors.push(`${label} \u683C\u5F0F\u9519\u8BEF`);
    return void 0;
  }
  const path = text(raw.path, 512)?.trim();
  const fixed = text(raw.fixed, 256);
  if (path !== void 0 && path.length > 0) {
    const segments = parsePath(path);
    if (segments === void 0 || segments.includes("*")) errors.push(`${label} \u8DEF\u5F84\u65E0\u6548: ${path}`);
    return { path };
  }
  if (fixed !== void 0 && fixed.length > 0) return { fixed };
  return void 0;
}
function itemsPath(raw, errors, label) {
  const path = text(raw, 512)?.trim();
  if (path === void 0 || path.length === 0) return void 0;
  if (parsePath(path) === void 0) errors.push(`${label} \u6570\u7EC4\u8DEF\u5F84\u65E0\u6548: ${path}`);
  return path;
}
function keyValues(raw, errors, label) {
  if (raw === void 0) return [];
  if (!Array.isArray(raw) || raw.length > 50) {
    errors.push(`${label} \u683C\u5F0F\u9519\u8BEF`);
    return [];
  }
  const entries = [];
  for (const entry of raw) {
    const name2 = isRecord(entry) ? text(entry.name, 256) : void 0;
    const value = isRecord(entry) ? text(entry.value) : void 0;
    if (name2 === void 0 || value === void 0) {
      errors.push(`${label} \u6761\u76EE\u683C\u5F0F\u9519\u8BEF`);
      continue;
    }
    if (name2.trim().length === 0 && value.trim().length === 0) continue;
    if (name2.trim().length === 0) {
      errors.push(`${label} \u7F3A\u5C11\u540D\u79F0`);
      continue;
    }
    entries.push({ name: name2.trim(), value });
  }
  return entries;
}
var PERIODS = ["five-hour", "weekly", "monthly"];
var KINDS = ["topped-up", "granted", "extra-usage"];
var RESET_FORMATS = ["auto", "iso", "unix-s", "unix-ms", "seconds-from-now"];
function positive(raw) {
  const number2 = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim().length > 0 ? Number(raw) : Number.NaN;
  return Number.isFinite(number2) && number2 > 0 ? number2 : void 0;
}
function validateCustomQuery(raw) {
  const errors = [];
  if (!isRecord(raw) || !isRecord(raw.request)) return { ok: false, errors: ["\u914D\u7F6E\u683C\u5F0F\u9519\u8BEF"] };
  const method = raw.request.method === "POST" ? "POST" : raw.request.method === "GET" || raw.request.method === void 0 ? "GET" : void 0;
  if (method === void 0) errors.push("\u8BF7\u6C42\u65B9\u6CD5\u53EA\u652F\u6301 GET / POST");
  const url = text(raw.request.url, 2048)?.trim();
  if (url === void 0 || url.length === 0) errors.push("\u7F3A\u5C11\u67E5\u8BE2 URL");
  else if (!/^(https?:\/\/|\{\{\s*(baseURL|origin)\s*\}\})/i.test(url)) errors.push("\u67E5\u8BE2 URL \u5FC5\u987B\u4EE5 http(s):// \u6216 {{baseURL}} / {{origin}} \u5F00\u5934");
  const body = text(raw.request.body, 16384);
  const credentialRef = text(raw.credentialRef, 256)?.trim();
  const query = {
    enabled: raw.enabled !== false,
    ...credentialRef ? { credentialRef } : {},
    request: {
      method: method ?? "GET",
      url: url ?? "",
      headers: keyValues(raw.request.headers, errors, "Header"),
      query: keyValues(raw.request.query, errors, "Query \u53C2\u6570"),
      ...body !== void 0 && body.trim().length > 0 ? { body } : {}
    },
    wallets: [],
    quotas: []
  };
  for (const value of [query.request.url, query.request.body ?? "", ...query.request.headers.flatMap((e) => [e.name, e.value]), ...query.request.query.flatMap((e) => [e.name, e.value])]) {
    for (const name2 of unknownPlaceholders(value)) errors.push(`\u672A\u77E5\u5360\u4F4D\u7B26 {{${name2}}}`);
  }
  if (isRecord(raw.success)) {
    const path = text(raw.success.path, 512)?.trim();
    if (path !== void 0 && path.length > 0) {
      if (parsePath(path) === void 0) errors.push(`\u6210\u529F\u6761\u4EF6\u8DEF\u5F84\u65E0\u6548: ${path}`);
      const equals = text(raw.success.equals, 256);
      query.success = { path, ...equals !== void 0 && equals.length > 0 ? { equals } : {} };
    }
  }
  const errorPath = text(raw.errorMessagePath, 512)?.trim();
  if (errorPath !== void 0 && errorPath.length > 0) query.errorMessagePath = errorPath;
  const wallets = Array.isArray(raw.wallets) ? raw.wallets : [];
  const quotas = Array.isArray(raw.quotas) ? raw.quotas : [];
  if (wallets.length > CUSTOM_QUERY_MAX_RULES || quotas.length > CUSTOM_QUERY_MAX_RULES) errors.push(`\u4F59\u989D/\u989D\u5EA6\u89C4\u5219\u5404\u6700\u591A ${CUSTOM_QUERY_MAX_RULES} \u6761`);
  wallets.slice(0, CUSTOM_QUERY_MAX_RULES).forEach((entry, index) => {
    const label = `\u4F59\u989D\u89C4\u5219 ${index + 1}`;
    if (!isRecord(entry)) {
      errors.push(`${label} \u683C\u5F0F\u9519\u8BEF`);
      return;
    }
    const balance = valueRef(entry.balance, errors, `${label} \u91D1\u989D`);
    if (balance === void 0) {
      errors.push(`${label} \u7F3A\u5C11\u91D1\u989D\u5B57\u6BB5`);
      return;
    }
    const mapping = { balance };
    const items = itemsPath(entry.itemsPath, errors, label);
    if (items !== void 0) mapping.itemsPath = items;
    if (KINDS.includes(entry.kind)) mapping.kind = entry.kind;
    for (const key of ["currency", "granted", "toppedUp", "cash", "voucher"]) {
      const ref = valueRef(entry[key], errors, `${label} ${key}`);
      if (ref !== void 0) mapping[key] = ref;
    }
    const divisor = positive(entry.divisor);
    if (divisor !== void 0 && divisor !== 1) mapping.divisor = divisor;
    query.wallets.push(mapping);
  });
  quotas.slice(0, CUSTOM_QUERY_MAX_RULES).forEach((entry, index) => {
    const label = `\u989D\u5EA6\u89C4\u5219 ${index + 1}`;
    if (!isRecord(entry)) {
      errors.push(`${label} \u683C\u5F0F\u9519\u8BEF`);
      return;
    }
    const mapping = {};
    const items = itemsPath(entry.itemsPath, errors, label);
    if (items !== void 0) mapping.itemsPath = items;
    for (const key of ["name", "usedPercent", "remainingPercent", "used", "limit", "remaining", "resetAt"]) {
      const ref = valueRef(entry[key], errors, `${label} ${key}`);
      if (ref !== void 0) mapping[key] = ref;
    }
    if (PERIODS.includes(entry.period)) mapping.period = entry.period;
    const seconds = positive(entry.windowSeconds);
    if (seconds !== void 0) mapping.windowSeconds = seconds;
    if (entry.percentIsRatio === true) mapping.percentIsRatio = true;
    if (RESET_FORMATS.includes(entry.resetFormat) && entry.resetFormat !== "auto") mapping.resetFormat = entry.resetFormat;
    const hasUsage = mapping.usedPercent !== void 0 || mapping.remainingPercent !== void 0 || mapping.limit !== void 0 && (mapping.used !== void 0 || mapping.remaining !== void 0);
    if (!hasUsage) errors.push(`${label} \u9700\u8981\u767E\u5206\u6BD4\u5B57\u6BB5\uFF0C\u6216 limit \u52A0 used/remaining`);
    query.quotas.push(mapping);
  });
  if (query.wallets.length === 0 && query.quotas.length === 0) errors.push("\u81F3\u5C11\u914D\u7F6E\u4E00\u6761\u4F59\u989D\u6216\u989D\u5EA6\u89C4\u5219");
  if (JSON.stringify(query).length > CUSTOM_QUERY_MAX_BYTES) errors.push("\u914D\u7F6E\u8FC7\u5927");
  return errors.length > 0 ? { ok: false, errors } : { ok: true, query };
}
function resolve(item, root, ref) {
  if (ref === void 0) return void 0;
  if (ref.path !== void 0) {
    const relative = getPath(item, ref.path);
    return relative !== void 0 || item === root ? relative : getPath(root, ref.path);
  }
  return ref.fixed;
}
function number(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : void 0;
  if (typeof value !== "string" || value.trim().length === 0) return void 0;
  const parsed = Number(value.replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : void 0;
}
function scalarText(value) {
  return typeof value === "string" && value.length > 0 ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : void 0;
}
function amount2(value, divisor) {
  const parsed = number(value);
  if (parsed === void 0) return void 0;
  if (divisor === void 0 || divisor === 1) return typeof value === "string" ? value.trim() : String(parsed);
  return String(Number((parsed / divisor).toFixed(8)));
}
function normalizeReset(value, format, now = Date.now()) {
  if (value === void 0 || value === null || value === "") return void 0;
  const mode = format ?? "auto";
  const parsed = number(value);
  let time;
  if (mode === "iso" || mode === "auto" && parsed === void 0) {
    const date = Date.parse(String(value));
    time = Number.isFinite(date) ? date : void 0;
  } else if (parsed !== void 0) {
    if (mode === "unix-s") time = parsed * 1e3;
    else if (mode === "unix-ms") time = parsed;
    else if (mode === "seconds-from-now") time = now + parsed * 1e3;
    else time = parsed > 1e12 ? parsed : parsed > 1e9 ? parsed * 1e3 : now + parsed * 1e3;
  }
  return time !== void 0 && Number.isFinite(time) ? new Date(time).toISOString() : void 0;
}
function mapQuota(mapping, item, root, id) {
  const ratio = mapping.percentIsRatio === true ? 100 : 1;
  const limit = number(resolve(item, root, mapping.limit));
  let used = number(resolve(item, root, mapping.used));
  let remaining = number(resolve(item, root, mapping.remaining));
  if (limit !== void 0 && used === void 0 && remaining !== void 0) used = Math.max(0, limit - remaining);
  if (limit !== void 0 && remaining === void 0 && used !== void 0) remaining = Math.max(0, limit - used);
  let usedPercent = number(resolve(item, root, mapping.usedPercent));
  let remainingPercent = number(resolve(item, root, mapping.remainingPercent));
  if (usedPercent !== void 0) usedPercent *= ratio;
  if (remainingPercent !== void 0) remainingPercent *= ratio;
  if (usedPercent === void 0 && remainingPercent !== void 0) usedPercent = 100 - remainingPercent;
  if (usedPercent === void 0 && limit !== void 0 && limit > 0 && used !== void 0) usedPercent = used / limit * 100;
  if (usedPercent === void 0 || !Number.isFinite(usedPercent)) return void 0;
  const clamped = Math.max(0, Math.min(100, usedPercent));
  const quota3 = { id, usedPercent: clamped, remainingPercent: remainingPercent !== void 0 ? Math.max(0, Math.min(100, remainingPercent)) : 100 - clamped };
  const name2 = scalarText(resolve(item, root, mapping.name));
  if (name2 !== void 0) quota3.name = name2;
  if (mapping.period !== void 0 && name2 === void 0) quota3.period = mapping.period;
  if (mapping.windowSeconds !== void 0) quota3.windowSeconds = mapping.windowSeconds;
  const resetAt4 = normalizeReset(resolve(item, root, mapping.resetAt), mapping.resetFormat);
  if (resetAt4 !== void 0) quota3.resetAt = resetAt4;
  if (limit !== void 0) quota3.limit = limit;
  if (used !== void 0) quota3.used = used;
  if (remaining !== void 0) quota3.remaining = remaining;
  return quota3;
}
function mapCustomResponse(query, data) {
  if (query.success !== void 0) {
    const actual = getPath(data, query.success.path);
    const passed = query.success.equals === void 0 ? actual !== void 0 && actual !== null && actual !== false && actual !== 0 && actual !== "" : scalarText(actual) === query.success.equals;
    if (!passed) {
      const detail = scalarText(getPath(data, query.errorMessagePath));
      return { status: "failed", message: detail !== void 0 ? `\u63A5\u53E3\u8FD4\u56DE\u5931\u8D25: ${detail}` : "\u63A5\u53E3\u54CD\u5E94\u672A\u6EE1\u8DB3\u6210\u529F\u6761\u4EF6" };
    }
  }
  const wallets = [];
  for (const mapping of query.wallets) {
    for (const item of expandItems(data, mapping.itemsPath)) {
      const balance = amount2(resolve(item, data, mapping.balance), mapping.divisor);
      if (balance === void 0) continue;
      const wallet = {
        currency: scalarText(resolve(item, data, mapping.currency)) ?? "",
        balance,
        kind: mapping.kind ?? "topped-up"
      };
      for (const key of ["granted", "toppedUp", "cash", "voucher"]) {
        const value = amount2(resolve(item, data, mapping[key]), mapping.divisor);
        if (value !== void 0) wallet[key] = value;
      }
      wallets.push(wallet);
    }
  }
  const quotas = [];
  query.quotas.forEach((mapping, ruleIndex) => {
    expandItems(data, mapping.itemsPath).forEach((item, itemIndex) => {
      const id = `custom-${ruleIndex + 1}-${itemIndex + 1}`;
      const quota3 = mapQuota(mapping, item, data, id);
      if (quota3 !== void 0) quotas.push(quota3);
    });
  });
  if (wallets.length === 0 && quotas.length === 0) {
    const detail = scalarText(getPath(data, query.errorMessagePath));
    return { status: "failed", message: detail !== void 0 ? `\u63A5\u53E3\u8FD4\u56DE\u5931\u8D25: ${detail}` : "\u54CD\u5E94\u4E2D\u6CA1\u6709\u627E\u5230\u5DF2\u914D\u7F6E\u7684\u4F59\u989D\u6216\u989D\u5EA6\u5B57\u6BB5" };
  }
  return { status: "ready", wallets, quotas, source: "custom" };
}
function decodeCommandJson(text2) {
  const base64 = text2.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
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

// src/host/custom.ts
var TEST_RESPONSE_MAX_CHARS = 2e5;
async function prepare(target, query) {
  const link = consoleLink(target.providerId, target.baseURL);
  let secret;
  if (usesVariable(query, "apiKey")) {
    secret = query.credentialRef !== void 0 ? await resolveSecret(target.service, query.credentialRef) : await target.resolveKey();
    if (secret === void 0 || secret.length === 0) {
      return {
        ok: false,
        balance: { status: "no-credential", message: `\u672A\u914D\u7F6E ${query.credentialRef ?? "\u8BE5\u670D\u52A1\u5546\u7684 API Key"}`, link, source: "custom" }
      };
    }
  }
  try {
    const vars = templateVariables({ providerId: target.providerId, baseURL: target.baseURL, apiKey: secret });
    return { ok: true, request: renderRequest(query, vars), secret };
  } catch (error) {
    return { ok: false, balance: { status: "failed", message: `\u81EA\u5B9A\u4E49\u67E5\u8BE2\u914D\u7F6E\u65E0\u6CD5\u751F\u6210\u8BF7\u6C42: ${errorText(error)}`, link, source: "custom" } };
  }
}
function endpointOf(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return url;
  }
}
function redact(text2, secret) {
  return secret === void 0 || secret.length < 4 ? text2 : text2.split(secret).join("***");
}
async function customBalance(target, query) {
  const prepared = await prepare(target, query);
  if (!prepared.ok) return prepared.balance;
  const { request, secret } = prepared;
  const link = consoleLink(target.providerId, target.baseURL);
  const raw = await requestRaw(target.service, request.url, request.headers, target.signal, { method: request.method, body: request.body });
  const endpoint = endpointOf(request.url);
  if (raw.status === void 0) return { status: "failed", message: redact(raw.error, secret), endpoint, link, source: "custom" };
  if (raw.status === 0) return { status: "failed", message: redact(`\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25: ${raw.body.slice(0, 300)}`, secret), endpoint, link, source: "custom" };
  if (raw.status < 200 || raw.status >= 300) {
    return { status: "failed", message: redact(`\u63A5\u53E3\u8FD4\u56DE HTTP ${raw.status}: ${raw.body.slice(0, 300)}`, secret), endpoint, link, source: "custom" };
  }
  let data;
  try {
    data = JSON.parse(raw.body);
  } catch (error) {
    return { status: "failed", message: `\u54CD\u5E94\u4E0D\u662F JSON: ${errorText(error)}`, endpoint, link, source: "custom" };
  }
  const mapped = mapCustomResponse(query, data);
  return { ...mapped, ...mapped.message !== void 0 ? { message: redact(mapped.message, secret) } : {}, endpoint, link, source: "custom" };
}
async function testCustomQuery(target, query) {
  const prepared = await prepare(target, query);
  if (!prepared.ok) return { ok: false, error: prepared.balance.message, balance: prepared.balance };
  const { request, secret } = prepared;
  const endpoint = endpointOf(request.url);
  const raw = await requestRaw(target.service, request.url, request.headers, target.signal, { method: request.method, body: request.body });
  if (raw.status === void 0) {
    const error = redact(raw.error, secret);
    return { ok: false, error, endpoint, balance: { status: "failed", message: error, source: "custom" } };
  }
  const body = redact(raw.body, secret);
  const truncated = body.length > TEST_RESPONSE_MAX_CHARS;
  let data;
  try {
    data = truncated ? void 0 : JSON.parse(body);
  } catch {
    data = void 0;
  }
  const httpOk = raw.status >= 200 && raw.status < 300;
  const balance = raw.status === 0 ? { status: "failed", message: `\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25: ${body.slice(0, 300)}`, source: "custom" } : !httpOk ? { status: "failed", message: `\u63A5\u53E3\u8FD4\u56DE HTTP ${raw.status}`, source: "custom" } : data === void 0 ? { status: "failed", message: "\u54CD\u5E94\u4E0D\u662F JSON", source: "custom" } : mapCustomResponse(query, data);
  return {
    ok: raw.status !== 0 && httpOk && data !== void 0,
    status: raw.status,
    endpoint,
    ...raw.status === 0 ? { error: balance.message } : {},
    ...data !== void 0 ? { data } : { text: body.slice(0, TEST_RESPONSE_MAX_CHARS) },
    ...truncated ? { truncated: true } : {},
    balance
  };
}

// src/host/custom-store.ts
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
function customStorePath(options) {
  if (typeof options.customQueryFile === "string" && options.customQueryFile.length > 0) return options.customQueryFile;
  const home = typeof process.env.DSH_HOME === "string" && process.env.DSH_HOME.length > 0 ? process.env.DSH_HOME : join(homedir(), ".dsh");
  return join(home, "storages", "dsh-models-usage.custom-queries.json");
}
function loadCustomStore(options) {
  let raw;
  try {
    raw = readFileSync(customStorePath(options), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { store: { version: 1, queries: {} } };
    return { store: { version: 1, queries: {} }, error: `\u81EA\u5B9A\u4E49\u67E5\u8BE2\u914D\u7F6E\u8BFB\u53D6\u5931\u8D25: ${errorText(error)}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { store: { version: 1, queries: {} }, error: `\u81EA\u5B9A\u4E49\u67E5\u8BE2\u914D\u7F6E\u5DF2\u635F\u574F: ${errorText(error)}` };
  }
  const queries = {};
  const errors = [];
  for (const [providerId, entry] of Object.entries(isRecord(parsed) && isRecord(parsed.queries) ? parsed.queries : {})) {
    const result = validateCustomQuery(entry);
    if (result.ok) queries[providerId] = result.query;
    else errors.push(`${providerId}: ${result.errors.join("\uFF1B")}`);
  }
  return { store: { version: 1, queries }, ...errors.length > 0 ? { error: `\u81EA\u5B9A\u4E49\u67E5\u8BE2\u914D\u7F6E\u65E0\u6548: ${errors.join(" / ")}` } : {} };
}
function saveCustomStore(options, store) {
  const path = customStorePath(options);
  mkdirSync(dirname(path), { recursive: true, mode: 448 });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, JSON.stringify(store, null, 2) + "\n", { mode: 384 });
  renameSync(temp, path);
  try {
    chmodSync(path, 384);
  } catch {
  }
}
function readCustomQuery(options, providerId) {
  const loaded = loadCustomStore(options);
  return { query: loaded.store.queries[providerId], error: loaded.error };
}
function writeCustomQuery(options, providerId, query) {
  const loaded = loadCustomStore(options);
  if (loaded.error !== void 0 && /读取失败/.test(loaded.error)) throw new Error(loaded.error);
  const queries = { ...loaded.store.queries };
  if (query === void 0) delete queries[providerId];
  else queries[providerId] = query;
  saveCustomStore(options, { version: 1, queries });
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
  const resolve2 = llm.resolveModelInfo;
  const targets = models.slice(0, DETAIL_MODEL_CAP);
  const enriched = /* @__PURE__ */ new Map();
  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const index = cursor;
      cursor += 1;
      const model = targets[index];
      try {
        const info = await resolve2(providerId, model.id);
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
async function providerAccess(env, entry, settingsRows) {
  const settingsNode = configNodeAt(settingsRows, entry.settingsNs, entry.settingsPath);
  const baseURL = asString(settingsNode?.baseURL);
  const apiKeyEnv = asString(settingsNode?.apiKeyEnv);
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
  return { settingsNode, baseURL, credential, resolveKey, label };
}
async function collectProvider(env, entry, settingsRows, customQueries, signal) {
  const { settingsNode, baseURL, credential, resolveKey, label } = await providerAccess(env, entry, settingsRows);
  const { models: advertised, error: catalogError } = await listModels(env.service, entry.id);
  let models = advertised.length > 0 ? advertised : modelsFromConfig(settingsNode);
  if (env.options.includeModelDetails !== false && models.length > 0) {
    models = await enrichModels(env.service, entry.id, models);
  }
  const custom = customQueries[entry.id];
  const balance = custom?.enabled === true ? await customBalance({ service: env.service, providerId: entry.id, baseURL, resolveKey, signal }, custom) : await providerBalance(env.service, env.options, entry.id, baseURL, resolveKey, label, signal);
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
    ...custom !== void 0 ? { customQuery: { enabled: custom.enabled } } : {},
    modelCount: models.length,
    models
  };
}
async function buildPayload(env, providerId) {
  const settingsRows = readSettingsRows(env.service);
  const allEntries = listProviderEntries(env.service, env.options);
  const entries = providerId === void 0 ? allEntries : allEntries.filter((entry) => entry.id === providerId);
  if (providerId !== void 0 && entries.length === 0) throw new Error(`\u672A\u627E\u5230\u670D\u52A1\u5546: ${providerId}`);
  const customQueries = loadCustomStore(env.options).store.queries;
  const providers = [];
  for (const entry of entries) {
    providers.push(await collectProvider(env, entry, settingsRows, customQueries, void 0));
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
  return new Promise((resolve2, reject) => {
    const abort = () => {
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve2, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
async function runCustomTest(env, providerId, query, signal) {
  const entry = listProviderEntries(env.service, env.options).find((candidate) => candidate.id === providerId);
  if (entry === void 0) throw new Error(`\u672A\u627E\u5230\u670D\u52A1\u5546: ${providerId}`);
  const { baseURL, resolveKey } = await providerAccess(env, entry, readSettingsRows(env.service));
  return testCustomQuery({ service: env.service, providerId, baseURL, resolveKey, signal }, query);
}
function createPayloadLoader(env) {
  let cache;
  let pending;
  let failure2;
  const scopedPending = /* @__PURE__ */ new Map();
  const payloadFor = async (detail, signal, force = false, providerId) => {
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
      if (!force && failure2 !== void 0 && Date.now() < failure2.retryAt) throw failure2.error;
      pending = buildPayload(env).then((collected) => {
        const payload2 = retainBalances(cache?.payload, collected);
        const ttl = hasBalanceFailure(payload2) ? CACHE_RETRY_MS : CACHE_TTL_MS;
        cache = { expiresAt: Date.now() + ttl, payload: payload2 };
        failure2 = void 0;
        return payload2;
      }, (error) => {
        failure2 = { retryAt: Date.now() + CACHE_RETRY_MS, error };
        throw error;
      }).finally(() => {
        pending = void 0;
      });
    }
    const payload = await waitForPayload(pending, signal);
    return { ...projectPayload(payload, detail), cacheRemainingMs: Math.max(0, (cache?.expiresAt ?? 0) - Date.now()) };
  };
  return Object.assign(payloadFor, {
    invalidate() {
      if (cache !== void 0) cache.expiresAt = 0;
      failure2 = void 0;
    }
  });
}

// src/index.ts
var name = "dsh-models-usage";
var inject = ["llm", "settings", "credentials", "commands", "tools", "subprocess"];
function apply(ctx, config) {
  const options = { ...DEFAULTS, ...isRecord(config) ? config : {} };
  const service = createServiceLookup(ctx);
  const env = { service, options };
  const payloadFor = createPayloadLoader(env);
  async function handleCustomCommand(args) {
    const action = args[0].toLowerCase();
    const providerArg = args.find((arg) => arg.startsWith("provider="));
    const encoded = args.slice(1).filter((arg) => !arg.startsWith("provider="));
    if (providerArg === void 0 || encoded.length > 1) throw new Error(`\u7528\u6CD5: ${action} provider=<id> [<base64url>]`);
    const providerId = decodeURIComponent(providerArg.slice("provider=".length));
    const base = { ok: true, command: COMMAND_NAME, action, providerId };
    if (action === "custom-get") {
      const { query, error } = readCustomQuery(options, providerId);
      return { ...base, query: query ?? null, storePath: customStorePath(options), ...error !== void 0 ? { storeError: error } : {} };
    }
    if (action === "custom-delete") {
      writeCustomQuery(options, providerId, void 0);
      payloadFor.invalidate();
      return base;
    }
    if (action !== "custom-set" && action !== "custom-test") throw new Error(`\u672A\u77E5\u5B50\u547D\u4EE4: ${action}`);
    if (encoded.length !== 1) throw new Error(`${action} \u9700\u8981\u914D\u7F6E\u8F7D\u8377`);
    let raw;
    try {
      raw = decodeCommandJson(encoded[0]);
    } catch (error) {
      throw new Error(`\u914D\u7F6E\u8F7D\u8377\u65E0\u6CD5\u89E3\u6790: ${error instanceof Error ? error.message : String(error)}`);
    }
    const validated = validateCustomQuery(raw);
    if (!validated.ok) return { ...base, ok: false, errors: validated.errors };
    if (action === "custom-test") {
      return { ...base, test: await runCustomTest(env, providerId, validated.query, void 0) };
    }
    writeCustomQuery(options, providerId, validated.query);
    payloadFor.invalidate();
    return { ...base, query: validated.query };
  }
  ctx.commands.register({
    name: COMMAND_NAME,
    description: "\u5217\u51FA\u5F53\u524D\u6A21\u578B\u5217\u8868\u4E2D\u7684\u670D\u52A1\u5546\u4E0E\u6A21\u578B\uFF0C\u5E76\u67E5\u8BE2\u53EF\u83B7\u5F97\u7684\u4F59\u989D\u4FE1\u606F\u3002",
    input: { hint: "summary | detail | refresh [provider=<id>] | custom-get|custom-set|custom-delete|custom-test provider=<id> [<base64url>]" },
    recordInput: false,
    handler: async (invocation) => {
      try {
        const args = String(invocation.rawInput ?? "").trim().split(/\s+/).filter(Boolean);
        if (args[0]?.toLowerCase().startsWith("custom-")) {
          return { kind: "success", text: JSON.stringify(await handleCustomCommand(args)) };
        }
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
