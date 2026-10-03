# dsh-models-usage（模型用量与余额）

DeepSeek Harness 的组合插件（Host + Web Client 双半）：把**当前模型列表**里的每个服务商、
每个模型完整列出来，并附上该服务商**实际可查到的余额信息**。

## 它能回答什么

- 现在的模型列表里到底有哪些 provider / model？（含是否已激活、baseURL、协议、凭据状态）
- 每个模型的上下文窗口、最大输出、输入模态（text/image）、可用的 reasoning effort。
- 每个服务商的余额：DeepSeek 开放平台、DeepSeek 账号走官方接口；火山方舟等未提供
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
  「模型清单与余额」整页（服务商卡片 → 余额 → 模型表格），右上角刷新。
  每张卡片的模型表**默认只列前 6 个**，其余收进「查看全部 N 个模型」——
  点开是一个与宿主 Modal 同款样式的弹窗（`--dsw-alias-bg-mask-1` 遮罩、
  `--dsw-mask-blur` 背景模糊、`--dsw-radius-panel` + `--dsw-elevation-prominent`），
  支持 Esc、点遮罩关闭，并在关闭后把焦点还给触发按钮。
  它不在设置里——用的是 `sidebar.panellist` + `main` 这一对槽位：
  **侧栏入口的 `id` 就是主面板的 `key`**，shell 据此把该 key 的面板渲染到中央列。
  标题栏的「模型设置」按钮直接打开宿主的 设置 → 模型 弹窗
  （`sidebar.settings` 条目 store 的 `actions.openSection('models')`）。
- **会话顶栏徽章**：显示各钱包余额合计；点击既刷新，也直接切到上面那个面板
  （通过 `ctx.layout.selectPanel('models-usage')`）。
- **模型工具 `models_balance`**：无参数，返回同一份 JSON 载荷，模型可以自己读。
- **命令**：`/dsh-models-usage [summary|detail|refresh]`（UI 内部就走这条通道）。

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
- **不是所有服务商都能查余额。** 只有官方提供「用模型 API key 查询」接口的才行；
  火山方舟、Moonshot、智谱等需要 AK/SK 签名或控制台，插件只能标注并给链接。
- **余额是账户级**，无法按模型拆分；按模型的花费只能靠会话日志估算（本插件不做）。
- DeepSeek 账号余额会同时出现在 **设置 → 账号**，这里只是并入同一张清单。
- **只显示真正注册了 adapter 的服务商。** pi-ai 会把整份内置目录都声明出来（`amazon-bedrock`、`openai`、`anthropic`…），这些路由没配置就没有 adapter，`ctx.llm.listModels()` 会抛 `no adapter registered for provider "…"`。本插件默认只保留 `listProviders()`（已注册路由）里的服务商，目录仅用于补充显示名与设置路径；要看全量时把 `includeDormantProviders` 设为 `true`。
- 模型级「可用性」不是布尔字段：它由「路由已注册 + 模型在 `listModels` 目录里 +
  适配器自身的凭据/配置诊断」共同决定，插件如实展示这三点。
- 每次刷新会执行一次 `/dsh-models-usage` 命令，因而向会话日志追加 `command/run` +
  `command/done` 事件；这些行在界面上被隐藏（副作用是手敲同名命令的行也会被隐藏）。
- pi-ai 的 OAuth/交互式凭据存放在 record 里：只有 `kind: 'api-key'` 的 record 能用于
  余额查询，`grant` 类型会被标注为凭据已配置但无法用于余额接口。
