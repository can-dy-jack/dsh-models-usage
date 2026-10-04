# dsh-models-usage（模型用量与余额）

DeepSeek Harness 的组合插件（Host + Web Client 双半）：把**当前模型列表**里的每个服务商、
每个模型完整列出来，并附上该服务商**实际可查到的余额信息**。

## 它能回答什么

- 现在的模型列表里到底有哪些 provider / model？（含是否已激活、baseURL、协议、缺少凭据提示）
- 每个模型的上下文窗口、最大输出、输入模态（text/image）、可用的 reasoning effort。
- 每个服务商的余额或额度：DeepSeek 开放平台、DeepSeek 账号、Moonshot AI（Kimi 开放平台）、Kimi Code、OpenCode Go、MiniMax 国内 / 国际站、Z.AI / 智谱 Coding Plan 走官方接口；火山方舟等未提供
  「用模型密钥查余额」接口的服务商会被**明确标注为不支持**并给出控制台入口，而不是伪造一个 0。

余额永远是**服务商账户级**的，不是模型级：模型 id 只是价格/路由事实，钱包属于它背后的账号。

## 开发

源码在 `src/`（TypeScript），构建产物在 `lib/`（esbuild 转译，不进 git）：

```sh
npm install        # 首次：装 esbuild / typescript / dsh-tools 类型
npm run build      # src/*.ts → lib/index.js + lib/client.js
npm run dev        # 同上，watch 模式
npm run typecheck  # tsc --noEmit
```

`src/payload.ts` 是 Host 半与浏览器半共享的载荷契约，`src/shared.ts` 是共享的
运行时 guard；两半经 esbuild **bundle** 成单文件，相对路径 import 随意用。
唯一红线：`lib/client.js` 以 script 方式喂给 `window.__ModuleLoader__`，产物里
绝不能残留 `import`/`export` 或裸包名（故构建为 iife 格式）。UI 组件写 TSX：
classic transform 编为 `React.createElement`，`React` 解析到 `client/react.ts`
的宿主共享实例——不要切 `react-jsx` 自动运行时，那会引入 `react/jsx-runtime`
裸包名。

Kimi Code 的独立验证：`node .scratch/kimi-harness.mjs`，覆盖接口格式、凭据传输、
错误响应、载荷缓存和中英文渲染；`node .scratch/kimi-live.mjs` 可使用已有
`KIMI_CODING_API_KEY` 只读验证真实接口（不打印密钥）。

缓存行为验证：`node .scratch/cache-harness.mjs`，覆盖两端请求合并、有效期、切换面板/
会话、强制刷新、失败退避、旧余额保留、订阅清理和调用取消。

## 安装

先执行 `npm run build` 产出 `lib/`，然后侧边栏 **Plugins → Add plugin**，填入本目录的
绝对路径：

```
/Users/chenkeheng/project-code/dsh-models-usage
```

安装后打开该 bundle 的开关 **Enable now**。

### ⚠️ 安装副本是硬链接快照，改完源码必须同步

插件管理器把本地路径包以**硬链接**方式复制进 profile
（`$DSH_HOME/profiles/<p>/node_modules/@local/dsh-models-usage/`）。用编辑器/工具
「新建文件再替换」的写法改文件会生成新 inode，**硬链接断开**，于是副本永远
停在安装那一刻——宿主一直下发旧代码，**重启客户端也不会变**。

判断与修复（改完 `src/` 先 `npm run build`，再同步 `lib/`）：

```sh
P="$HOME/.dsh/profiles/desktop/node_modules/@local/dsh-models-usage"
for f in lib/client.js lib/index.js package.json; do
  cmp -s "$f" "$P/$f" && echo "$f same" || echo "$f DIFFERS"
done

mkdir -p "$P/lib" && cp lib/index.js lib/client.js "$P/lib/" && cp package.json "$P/"
# 同步后宿主会监听到变化并给客户端模块换一个新 rev（无需重启宿主）
```

（或每次改完在插件页卸载后重新安装。）

若安装目录是指向工作区的软链接，构建产物已直接共享，无需复制。
客户端产物一致也不代表 Host 已加载新模块：当前 Desktop profile 的宿主会缓存模块，
重新开关插件仍可能复用旧代码；面板刷新后仍是旧行为时，重启一次 Harness 再验证。

> 本 bundle 声明 `@local/dsh-models-usage`，`cordis.patch.yml` 插入的 row id 是
> `models-usage`。它是 host+client 双半插件：`lib/index.js`（编自 `src/index.ts`）
> 在 Host 进程负责采集与查询，`dsh.client` 声明让 `lib/client.js`（编自
> `src/client.ts`）在 Web GUI 挂载 UI。

### ⚠️ 为什么必须声明 `peerDependencies`

DSH 的运行时解析层按模块所在目录分层：**profile 目录内的包**（如 `pnpm add` 装进
`profiles/<p>/node_modules` 的插件）直接用运行时共享包表解析 `@deepseek-ai/*`；而
**本地路径安装是 `link:` 软链**，模块落在 profile 之外，走的是 `linked` 分层——
该分层**只拦截调用方 `package.json` 的 `peerDependencies` 里声明过的包名**
（`dsh-app-boot` 的 `routeLinked` + `readPeerNames`）。

所以软链插件只要 import 了任何 `@deepseek-ai/*`，就必须把它写进 `peerDependencies`，
否则会出现 `did not activate ... failed to import`（Node 原生解析找不到该包）。
本包的 `src/index.ts` 只 import 一个 `@deepseek-ai/dsh-tools`，也已对应声明
（同时作为 devDependency 钉在 `0.2.0-rc.2`，仅为取 `defineTool` 的类型，
`--legacy-peer-deps` 安装以免拖入整棵 peer 树）。
`autoInstallPeers: false` 不会真的去安装它们——声明只用于解析路由。

## 使用

- **主界面**：左侧栏图标栏多出一个入口（钱包图标），点开即把中央主栏切成
  「模型清单与余额」整页，右上角刷新。卡片展示服务商、缺少凭据的提示、模型数量
  与账户余额/额度；卡片根据面板宽度自动排列为多列，窄面板显示单列，最后一行保持
  相同列宽。卡片最小高度为 160px，所有卡片按内容最多的一张统一高度。
  模型名称、参数和能力信息全部放在弹窗中。
  顶部「查看支持现状」按钮列出全部内置供应商路由（包括未启用的供应商），按供应商系列分组：
  例如 Kimi Code 与 Moonshot 国内 / 国际站放在同一组，各项仍标注「已支持」「尚未接入」
  或「官方无公开接口」，展示余额/用量查询范围、凭据要求和官方说明。
  目录包含当前 Harness 的 41 个 pi-ai 路由和 2 个 DeepSeek 原生路由，地区与套餐单独列出；
  没有活动会话时也可打开，不会发起额外余额请求。尚未接入包括官方提供管理/账单 API、
  需要额外权限或专用凭据的供应商；“官方无公开接口”不包含控制台内部接口和单次请求的 token 用量。
  缺少凭据时的引用和不支持余额查询的详细原因可悬停查看，控制台链接仍直接展示。
  每张服务商卡片右上角的刷新图标只更新该服务商的模型与余额/额度；刷新期间保留
  原数据，其他服务商可继续单独刷新，失败提示留在该卡片。
  每张卡片在标题区的服务商名称下显示一条更新时间，余额与所有额度共用，
  与余额区的额度重置时间分开；单卡刷新只更新自己的时间。
  1 分钟内显示「刚刚」，1 小时内显示「N分钟前」，24 小时内显示「Nh前」，更久显示
  年月日时分；停留在面板时自动更新文案，悬停可查看完整时间。
  点击卡片上的「模型 N」即可查看模型列表，只有少量模型的服务商也可打开；
  模型数量为 0 时入口禁用。弹窗采用宿主 Modal 同款样式（`--dsw-alias-bg-mask-1` 遮罩、
  `--dsw-mask-blur` 背景模糊、`--dsw-radius-panel` + `--dsw-elevation-prominent`），
  支持 Esc、点遮罩关闭，并在关闭后把焦点还给触发按钮。
  它不在设置里——用的是 `sidebar.panellist` + `main` 这一对槽位：
  **侧栏入口的 `id` 就是主面板的 `key`**，shell 据此把该 key 的面板渲染到中央列。
  标题栏的「模型设置」按钮直接打开宿主的 设置 → 模型 弹窗
  （`sidebar.settings` 条目 store 的 `actions.openSection('models')`）。
- **模型工具 `models_balance`**：无参数，返回同一份 JSON 载荷，模型可以自己读。
- **命令**：`/dsh-models-usage [summary|detail|refresh] [provider=<id>]`（UI 内部就走这条通道）。
  例如 `/dsh-models-usage refresh provider=kimi-coding` 只重新查询 Kimi Code。

### 搜索与过滤

主面板与模型弹窗的「搜索和过滤」区域默认收起，点击展开后显示搜索框与筛选项。
收起只隐藏控件，已设置的条件继续生效；收起时仍显示匹配计数，有条件时标注「筛选中」。
标题下的搜索框按服务商和模型的名称、ID 做大小写不敏感的子串匹配，忽略搜索词
首尾空白。服务商名称或 ID 命中时匹配该服务商符合能力条件的全部模型；仅模型
命中时匹配相应模型，卡片显示匹配数量，弹窗显示匹配列表。

服务商、启用状态、输入类型和「支持推理」可以组合使用，所有条件取交集。
选项来自当前完整目录，未启用服务商是否返回仍由 `includeDormantProviders` 控制。
能力筛选只匹配明确标注的模型；缺少 `inputModalities` 或有效推理强度元数据的模型
不会被推断为支持该能力，关闭 `includeModelDetails` 时可能缺少推理信息。
筛选只在前端处理已有载荷，不查询新的余额，也不改变服务商的账户余额。

面板显示匹配数与原始总数；卡片只显示模型数量，全部匹配模型均可在弹窗查看。
弹窗内的模型搜索、输入类型和推理条件继续缩小主面板结果，弹窗的「重置筛选」
只清除局部条件，关闭弹窗后局部条件重置。主面板条件在切换面板、会话和刷新时
保留，页面或插件重载后恢复默认；刷新后所选服务商或输入类型消失时保留条件，
显示无结果及当前目录中不存在的选项，可用「重置筛选」恢复完整列表。

验证搜索、弹窗、条件保留与请求次数：`node .scratch/filter-harness.mjs`。

### 余额缓存与刷新

Host 和浏览器分别保留一份插件实例内的完整载荷，默认有效期 **60 秒**，从采集完成
开始计算。`summary` 只在返回时隐藏模型明细；切换面板或会话
不会清空缓存，也不会重复查询。浏览器沿用 Host 返回的剩余有效期，不会把旧结果续期。

过期后再次打开面板或切换会话，先显示已有数据，再后台更新；不做余额定时轮询。
点击「刷新」或执行 `/dsh-models-usage refresh` 会绕过两端缓存。正在进行的请求
仍由各入口共用，刷新期间保留旧数据并禁用刷新按钮，成功后更新面板。
卡片的单独刷新也绕过缓存，但只替换该服务商的数据，不延长其他服务商的缓存有效期。

整体请求失败时保留上次结果及其更新时间；单个服务商查询失败时，若服务商地址与
凭据描述未变，则保留该服务商之前成功读取的余额，并明确显示原时间和更新失败。
失败后自动重试间隔至少 **15 秒**，手动刷新可立即重试；缺少凭据、未登录等状态
不会被旧余额覆盖。缓存只在内存里，页面或插件重载后重新读取。没有活动会话时
仍只提示先打开会话；模型或凭据变更通过手动刷新或缓存到期生效。

## 数据来源（全部是宿主已有服务，不新增宿主改动）

| 内容 | 来源 |
| --- | --- |
| 已注册路由 | `ctx.llm.listProviders()` |
| 服务商目录（含未激活） | `ctx.llm.listConfigurableProviders()` |
| 模型目录 | `ctx.llm.listModels(provider)` |
| 模型精确元数据 | `ctx.llm.resolveModelInfo(provider, model)` |
| baseURL / api / apiKeyEnv / 配置模型 | `ctx.settings.describe()`，按目录里的 `settingsNs` + `settingsPath` 取值 |
| 凭据是否存在 | `ctx.credentials.describe(ref)` / `describeRecord('<settingsNs>/<provider>')` |
| 余额 | DeepSeek 开放平台 `GET /user/balance`；DeepSeek 账号 `ctx.deepseekAccount.getBalance()`；OpenRouter `/api/v1/credits` |
| Kimi Code 账户额度与加油包 | `GET https://api.kimi.com/coding/v1/usages`（海外 `api.kimi.ai`），Bearer 模型 API Key |
| Moonshot AI / Kimi 开放平台账户余额 | `GET https://api.moonshot.cn/v1/users/me/balance`（国际站 `api.moonshot.ai`），Bearer 模型 API Key |
| MiniMax 国内 / 国际账户余额 | `GET /account/query_balance`，Bearer 普通 API Key（`sk-api-`） |
| MiniMax Token / Coding Plan 额度 | `GET /v1/token_plan/remains`，Bearer 订阅专用密钥 |
| OpenCode Go 账户额度 | `GET https://opencode.ai/zen/go/v1/usage`，Bearer 模型 API Key |
| Z.AI / 智谱 Coding Plan 额度 | `GET /api/monitor/usage/quota/limit`，Authorization 原始套餐 API Key（无 Bearer 前缀） |

OpenRouter（`openrouter`）未设置 baseURL 时，按内置路由使用
`https://openrouter.ai/api/v1/credits` 查询账户余额；自定义路由通过官方 API 域名识别，
显式 OpenRouter 代理保留地址和路径前缀。支持 API Key 引用和 `api-key` record。
缺少密钥显示未配置，HTTP 403 提示检查账户余额查询权限；
[官方接口文档](https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits)
要求管理密钥，Key 的消费限额不作为账户余额。

Kimi Code（`kimi-coding`）显示接口实际返回的 5 小时、周、月度总额度、月度编程额度的
剩余百分比与进度条、各窗口的额度刷新时间（按浏览器本地时区显示，接口未返回则不显示），
以及加油包余额（如有）。支持 API Key 引用和 `api-key` record；
未覆盖 baseURL 的内置路由使用官方国内地址，OpenAI `/coding/v1` 与 Anthropic `/coding/`
两种地址均可识别。额度保持账户级，不计入现金钱包；缺失窗口或钱包不补零。
进度条长度表示剩余比例：50% 及以上为绿色，20% 至不足 50% 为橙色，低于 20% 为红色；
剩余百分比使用相同颜色，不再重复显示已用百分比。
新版比例字段和旧版 `usage`/`limits` 格式均按官方 CLI 解析：
[当前官方实现](https://github.com/MoonshotAI/kimi-code/blob/main/packages/oauth/src/managed-usage.ts)、
[旧版官方实现](https://github.com/MoonshotAI/kimi-cli/blob/main/src/kimi_cli/ui/shell/usage.py)。

Moonshot AI（`moonshotai`）和 Moonshot AI CN（`moonshotai-cn`）是 Kimi 开放平台按用量扣费的
API 账户，与 Kimi Code 的订阅额度分开。展示官方返回的可用余额、现金余额和代金券余额；
国内站使用人民币（CNY），国际站使用美元（USD），两站 API Key 不可混用。
未覆盖 baseURL 时按内置路由选择官方地址；自定义路由可通过官方 API 地址识别，
显式 Moonshot 路由的代理地址保留路径前缀。支持 API Key 引用与 `api-key` record。
现金余额可以为负，可用余额直接采用接口值；缺失明细不补零，无法识别的响应或错误状态
报告失败，刷新失败保留上次成功余额。官方文档：[国内站](https://platform.moonshot.cn/docs/api/balance)、
[国际站](https://platform.moonshot.ai/docs/api/balance)。

MiniMax（`minimax`）与 MiniMax CN（`minimax-cn`）覆盖国内 / 国际站的两类查询，
沿用[官方 CLI 的密钥选择规则](https://github.com/MiniMax-AI/cli/blob/main/src/client/endpoints.ts)：
普通 `sk-api-` 密钥读取账户可用余额及现金、代金券、授信、欠款明细；订阅密钥读取
Token / Coding Plan 额度。余额直接采用 `available_amount`，不再次加减明细，
国内显示 CNY，国际显示 USD；不把套餐额度换算成现金余额。

未设置 baseURL 时，国际使用 `https://api.minimax.io`，国内使用
`https://api.minimaxi.com`。自定义路由识别官方域名的 OpenAI（`/v1`）和
Anthropic（`/anthropic`、`/anthropic/v1`）地址，包括国内新域名 `api.minimax.cn`；
显式 MiniMax 代理保留地址与路径前缀。支持 API Key 引用和 `api-key` record，
不跨地区尝试密钥，也不调用需要网页登录的旧控制台接口。

套餐优先使用官方 `*_remaining_percent`，兼容旧版计数格式（旧 `usage_count` 实际是剩余量）；
有百分比时仅保留与其一致的计数，避免新版 `0/0` 导致误报。资源池分别标注，显示
窗口剩余比例、毫秒时间戳 / 倒计时映射的重置时间、周额度加成和不限量状态。
HTTP / 业务错误报告失败，刷新失败保留上次成功数据。查询规范见
[官方响应类型](https://github.com/MiniMax-AI/cli/blob/main/src/types/api.ts)、
[国际套餐说明](https://platform.minimax.io/docs/token-plan/faq)与
[国内套餐说明](https://platform.minimax.cn/docs/token-plan/faq)。
独立验证：`node .scratch/minimax-harness.mjs`。

Z.AI 国际站（`zai`）与智谱国内站（`zai-coding-cn`）接入
[官方 GLM Coding Plan 插件的额度接口](https://github.com/zai-org/zai-coding-plugins/blob/main/plugins/glm-plan-usage/skills/usage-query-skill/scripts/query-usage.mjs)。
内置路由默认分别查询 `api.z.ai` 与 `open.bigmodel.cn` 的
`/api/monitor/usage/quota/limit`，按官方脚本发送原始 API Key 到 Authorization 头。
支持 API Key 引用和 `api-key` record，以及官方 OpenAI `/api/coding/paas/v4`
与 Anthropic `/api/anthropic`（含 `/v1`）地址；国内的 `dev.bigmodel.cn` 也按官方脚本识别。
显式 Z.AI 代理保留地址与路径前缀，不跨地区重试密钥。

按照[官方额度页面](https://z.ai/manage-apikey/coding-plan/personal/usage)的字段定义，
`TOKENS_LIMIT` / `CREDIT_LIMIT` 的 `unit=3` 对应 5 小时窗口，`unit=6` 对应周窗口；
旧套餐 `TIME_LIMIT` 的 `unit=5` 对应 MCP 月额度。优先显示官方 `percentage`（已用百分比），
只有未返回百分比且存在有效计数时才计算比例；重置时间采用 `nextResetTime` 的毫秒时间戳。
新版积分与旧版 Token 套餐均显示剩余比例，缺失窗口或重置时间不补零、不推算。
空响应、HTTP / 业务错误报告失败，刷新失败保留上次成功额度。

普通按量计费 `/api/paas/v4` 的现金余额**不支持自动查询**，提供对应地区控制台入口。
Coding Plan 额度与现金余额相互独立，不将其换算成金额；部分团队套餐可能无法用模型密钥查询，
查询失败时提示检查套餐与权限。套餐规则见[官方说明](https://docs.z.ai/devpack/faq)。
独立验证：`node .scratch/zai-harness.mjs`。

Qwen 的三条内置路由（`qwen-token-plan` 国际站、`qwen-token-plan-cn` 国内站、
`qwen-token-plan-individual` 国际个人版）均标注为**不支持自动查询**，提供对应地区
Token Plan 控制台入口。自定义路由识别国内 / 国际 Token Plan、Coding Plan 的
OpenAI / Anthropic 地址，以及百炼按量付费的 DashScope、业务空间专属域名。
官方域名优先于内置路由的默认地区；显式 Qwen 代理使用路由默认的控制台入口。

截至 2026-10-04，[官方百炼 CLI 命令契约](https://github.com/modelstudioai/cli/blob/main/skills/bailian-cli/reference/usage.md)
将 `usage token-plan` 和 `usage coding-plan` 的认证标为 `Console`。
[认证实现](https://github.com/modelstudioai/cli/blob/main/packages/core/src/auth/resolver.ts)
要求独立的控制台 `access_token`，无法使用模型 / 套餐 API Key；本插件只使用模型密钥，
不读取百炼 CLI 配置或接入控制台 Cookie。支持清单明确标记「不支持余额查询」，
并说明官方 CLI 的额外认证要求，不再显示「尚未接入」。

普通按量付费的阿里云账户余额也不能用模型 API Key 查询。
[官方账单 API](https://help.aliyun.com/zh/user-center/developer-reference/api-bssopenapi-2017-12-14-overview)
提供 `QueryAccountBalance`，但需要额外 AccessKey 与账单权限，当前不接入。
所有上述路由刷新时不读取密钥、不发起余额请求，不将套餐 Credits 或单次请求的 token
用量当作账户余额。国内 / 国际账号使用各自站点；海外 API 域名无法确定账号站点，
控制台入口默认指向国际站，可在自己的账号站点查看对应地域。
独立验证：`node .scratch/qwen-harness.mjs`。

Xiaomi 的四条内置路由（`xiaomi`、`xiaomi-token-plan-cn`、
`xiaomi-token-plan-sgp`、`xiaomi-token-plan-ams`）均标注为**不支持自动查询**。
普通 MiMo API 的 `sk-` 密钥对应按量扣费账户，提供
[账户余额页](https://platform.xiaomimimo.com/console/balance)入口；三个地区的 Token Plan
使用 `tp-` 套餐密钥，提供[套餐管理页](https://platform.xiaomimimo.com/console/plan-manage)入口。
账户现金余额与套餐 Credits 相互独立，不把单次请求的 token 用量当作账户剩余额度。

截至 2026-10-04，[官方 API 文档](https://mimo.mi.com/docs/en-US/api/guidance/rate-limit)
未公开使用模型密钥查询账户余额或套餐额度的接口；控制台内部接口依赖网页登录。
本插件只使用模型密钥，不接入 Xiaomi 控制台 Cookie。四条内置路由省略 baseURL 时
仍提供对应入口，自定义路由也可识别 `api.xiaomimimo.com` 与
`token-plan-{cn,sgp,ams}.xiaomimimo.com` 的 OpenAI / Anthropic 地址。
卡片与支持清单分别说明普通 API 和套餐的查询限制，刷新时不读取密钥或发起余额请求。
详情见[官方认证说明](https://mimo.mi.com/docs/en-US/quick-start/faq/api-integration)与
[支付说明](https://mimo.mi.com/docs/en-US/quick-start/faq/payment)。
独立验证：`node .scratch/xiaomi-harness.mjs`。

Ant Ling（`ant-ling`）及使用 `api.ant-ling.com` 的自定义路由提供
[百灵官方控制台](https://chat.ant-ling.com/open)入口，**暂不支持余额与额度自动查询**。
模型 API Key 无法认证控制台的钱包接口，这些接口依赖网页登录会话，暂不接入。
服务商卡片和支持清单均标记为「不支持余额查询」，账户余额和免费权益请登录控制台查看。
详情见[官方计费升级说明](https://developer.ant-ling.com/zh-CN/docs/getting-started/changelog/billing-upgrade/)。

OpenCode Go（`opencode-go`）显示 5 小时滚动、周、月额度的剩余比例及服务端重置时间。
`usage.{rolling,weekly,monthly}.percent` 是已用百分比，剩余比例按 `100 - percent` 计算；
缺失窗口不补零，无法识别的响应报告失败。支持 API Key 引用和 `api-key` record，
内置路由默认使用官方地址，也能识别官方 `/zen/go/v1`（或 `/zen/go`）地址及显式 Go 路由的代理地址。
查询只读取 Go 订阅额度，不返回 Zen 充值余额；HTTP 403 提示检查订阅与密钥关联。
解析契约见 [官方接口源码](https://github.com/anomalyco/opencode/blob/dev/packages/console/app/src/routes/zen/go/v1/usage.ts)。
独立验证：`node .scratch/opencode-harness.mjs`；配置已有密钥后可用
`node .scratch/opencode-live.mjs` 做只读实测（不输出密钥）。

Host 半不 import 任何 Harness 内部包（除 `@deepseek-ai/dsh-tools` 的 `defineTool`），
余额查询走一个有界的 node 子进程，API key 只经子进程 stdin 传递，不进 argv、日志或输出；
子进程不可用时回退到宿主进程的全局 `fetch`。

## 配置

`cordis.patch.yml` 里 `models-usage` 这一行的 `config`：

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `clientVersion` | `0.2.0-rc.2` | 调用账号余额接口时上报的 `x-client-version` |
| `locale` | `zh-CN` | 上报给账号接口的语言 |
| `includeModelDetails` | `true` | 是否逐个模型调用 `resolveModelInfo`（清单很大时可关掉提速） |
| `includeDormantProviders` | `false` | 是否也列出「已声明但未配置」的路由（没有 adapter、也没有模型） |

## 已知限制

- **面板需要至少一个活动会话。** 客户端→宿主的数据通道是内置的 `commands` Remote，
  它要求**恰好 3 个业务参数**：
  ```js
  ctx.remote.commands.execute(agentId, line, submittedAttachments /* 传 [] */, signal?)
  // 只传 2 个会得到：
  // client api: commands/execute expected 3 business argument(s) plus an optional AbortSignal, got 2
  ```
  第一个参数是**必须绑定活动 Agent 的 SessionId**；本插件不注册自己的 Remote 命名空间，
  所以没有会话时页面只会提示先打开会话。
  取的是「主视图保留的会话」（`state.byId[x].retainedBy.mainView > 0`）——
  这个 store 只有 `{ids, byId, phase}`，**没有 `current` 字段**。
- **不是所有查询都已接入。** 有些供应商未公开账户查询接口；有些已提供接口，但需要
  管理员密钥、云账单权限或独立控制台认证，插件尚未接入，具体范围见「查看支持现状」。
- **余额是账户级**，无法按模型拆分；按模型的花费只能靠会话日志估算（本插件不做）。
- DeepSeek 账号余额会同时出现在 **设置 → 账号**，这里只是并入同一张清单。
- **只显示真正注册了 adapter 的服务商。** pi-ai 会把整份内置目录都声明出来（`amazon-bedrock`、`openai`、`anthropic`…），这些路由没配置就没有 adapter，`ctx.llm.listModels()` 会抛 `no adapter registered for provider "…"`。本插件默认只保留 `listProviders()`（已注册路由）里的服务商，目录仅用于补充显示名与设置路径；要看全量时把 `includeDormantProviders` 设为 `true`。
- 模型级「可用性」不是布尔字段：它由「路由已注册 + 模型在 `listModels` 目录里 +
  适配器自身的凭据/配置诊断」共同决定，插件如实展示这三点。
- 每次刷新会执行一次 `/dsh-models-usage` 命令，因而向会话日志追加 `command/run` +
  `command/done` 事件；这些行在界面上被隐藏（副作用是手敲同名命令的行也会被隐藏）。
- pi-ai 的 OAuth/交互式凭据存放在 record 里：只有 `kind: 'api-key'` 的 record 能用于
  余额查询，`grant` 类型无法用于余额接口。
