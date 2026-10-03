# dsh-models-usage（模型用量与余额）

DeepSeek Harness（DSH）的**组合插件**（host + web client 双半）：把当前模型列表里的
每个 provider、每个 model 列出来，并附上该服务商实际可查到的余额信息。
TypeScript 源码（`src/`）→ esbuild 转译产物（`lib/`，gitignored），无测试框架。

## 仓库结构

| 文件 | 作用 |
| --- | --- |
| `src/index.ts` | Host 半入口：导出 `name`/`inject`/`apply`，注册 `/dsh-models-usage` 命令与 `models_balance` 工具，组装 `HostEnv` 交给 `createPayloadLoader`。 |
| `src/host/` | Host 半按职责拆分：`context.ts`（服务结构接口 + `ServiceLookup`/`createServiceLookup`）、`options.ts`（常量 + config 契约）、`links.ts`（控制台链接/余额端点/排序）、`net.ts`（子进程 JSON 传输 + fetch 回退）、`settings.ts`（settings 行与路径取值）、`models.ts`（路由枚举 + 模型目录 + resolveModelInfo 富化）、`credentials.ts`（凭据探测与密钥解析）、`balance.ts`（账户/服务商余额）、`collect.ts`（逐 provider 采集 + 15s 缓存）。 |
| `src/client.tsx` | 浏览器半入口：`window.__ModuleLoader__.load` 工厂内 `initReact` + `ensureStyle`，然后 `apply` 注册 `sidebar.panellist`+`main`、`conversation.session.header.utilities`、`conversation.chat.commandview` 四个槽位注入。 |
| `src/client/` | 浏览器半按职责拆分：`context.ts`（loader + `ClientContext`/`SlotProps`/`SessionStore`）、`react.ts`（共享 React 单例，`initReact` 后各模块用 live binding 取 `React`/`h`）、`css.ts`、`i18n.ts`、`format.ts`、`session.ts`（活动会话解析）、`data.ts`（commands-Remote reader + `usePayload`）、`ui/`（TSX 组件：chip=顶栏徽章、balance、models=行+弹窗、card=服务商卡、panel=主面板、icon）。 |
| `src/payload.ts` | 两半共享的载荷类型契约（`UsagePayload`/`ProviderEntry`/`BalanceInfo`…），type alias 而非 interface，保持对 `JsonValue` 可赋值。 |
| `src/shared.ts` | `isRecord`/`errorText`/`asString`（两半 bundle 内共享）。 |
| `tools/build.mjs` | esbuild **bundle**：`src/index.ts`→`lib/index.js`（node, esm, `external: @deepseek-ai/*`）、`src/client.ts`→`lib/client.js`（browser, **iife**——产物以 script 方式执行，绝不能残留 import/export）。`--watch` 可用。 |
| `tsconfig.json` | 只做 `tsc --noEmit`（strict）；产物由 esbuild 出。 |
| `cordis.patch.yml` | bundle patch：向 profile roster 插入 `id: models-usage` 行。 |
| `package.json` | `exports`（`.`→lib/index.js、`./client`→lib/client.js）、`peerDependencies`（`@deepseek-ai/dsh-tools`）、`dsh.client.inject`。 |
| `locale/{zh,en}.json` | 插件 meta 文案（标题/描述）。 |
| `.scratch/` | **不进包**的本地验证工具（见下）。 |

## 构建与类型检查

```sh
npm install        # 首次；dsh-tools 仅以 --legacy-peer-deps 装类型用
npm run build      # esbuild bundle → lib/{index,client}.js
npm run dev        # watch
npm run typecheck  # tsc --noEmit
```

红线：`lib/client.js` 以 script 执行——可以拆成任意多 `src/client/*` 模块
（bundle 会内联），但**不能引入裸包名 import、也不能有顶层 export**；
host 半随意，`@deepseek-ai/*` 一律 external 由运行时解析。
TSX 用 classic transform（`React.createElement`/`React.Fragment`），`React`
解析到 `client/react.ts` 的宿主共享实例——**不要**切 `react-jsx` 自动运行时
（会产生 `react/jsx-runtime` 裸包名）；JSX 类型契约是 `react.ts` 里的宽松
`declare global JSX`，组件 props 仍各自严格检查。

`@deepseek-ai/dsh-tools` 的 `.d.ts` 引用了未安装的内部包（cordis、dsh-llm…），
`skipLibCheck` 吸收这些错误，其导入类型降级为 `any`，不影响本包自身检查。

## 关键约束（改代码前必读）

- **安装副本是硬链接快照**：插件管理器把本目录以硬链接复制到
  `~/.dsh/profiles/<p>/node_modules/@local/dsh-models-usage/`。「写新文件再替换」
  （很多编辑器和 `edit` 工具的默认行为）会断开硬链接，副本停在旧版本。
  改完 `src/` 必须 `npm run build` 再把 `lib/` + `package.json` 同步进副本
  （README 有 `cmp`/`cp` 循环）；宿主监听变化后自动发新 rev，无需重启。
- **`peerDependencies` 不可删**：本地路径安装走 `link:` 软链 → `linked` 解析分层，
  只拦截 `peerDependencies` 里声明过的 `@deepseek-ai/*` 包名。删掉会
  `failed to import`。
- **client→host 通道是内置 `commands` Remote**：
  `ctx.remote.commands.execute(sessionId, line, [] /*必须传*/, signal?)`，恰好 3 个业务参数；
  `sessionId` 必须绑定活动会话——没有活动会话时面板只能提示先开会话。
- **余额永远是账户级**，不是模型级；不支持查询的服务商（火山方舟、Moonshot 等）
  明确标注 + 给控制台链接，不要伪造 0。
- **Host 半不 import 任何 Harness 内部包**（除 `dsh-tools` 的 `defineTool`）；
  余额查询走有界 node 子进程，API key 只经 stdin，不进 argv/日志；子进程失败回退全局 `fetch`。
- `ctx.llm.listModels()` 对没有 adapter 的 provider 会抛错；默认只列
  `listProviders()`（已注册路由），`includeDormantProviders: true` 才看全量目录。
- 侧栏入口的 `id` 即主面板的 `key`（均为 `models-usage`），shell 据此渲染中央列。

## 配置（`cordis.patch.yml` 该行的 `config`）

`clientVersion`（默认 `0.2.0-rc.2`）、`locale`（`zh-CN`）、
`includeModelDetails`（`true`）、`includeDormantProviders`（`false`）——
默认值见 `src/index.ts` 的 `DEFAULTS`。

## 验证

无 lint/test 脚手架，用 `.scratch/` 里的独立脚本（均可用 `node` 直接跑，不属于插件包）：

```sh
node .scratch/harness.mjs          # 用 mock Cordis 服务加载 lib/index.js，打印完整 JSON 载荷
node .scratch/client-harness.mjs   # 用假 ModuleLoader+React shim 加载 lib/client.js，断言槽位渲染
node .scratch/verify.mjs [marker]  # 对比宿主实际下发的 client.js 与工作区 lib/ 是否一致（需宿主在跑）
```

`verify.mjs` 从 `~/.dsh/.credentials.yaml` 读 browser-session grant 伪造 cookie
（secret 不打印），`DSH_WEB_URL`/`DSH_HOME` 可覆盖默认值。

注意：`client-harness.mjs` 的图标断言（`icon parts`/`card is notched`/`coin has rim`）
是旧的图标结构（mask+card+coin），现图标为 mask+g 两子节点——这三项失败是
**测试落后**，非回归。

## 安装（用户侧）

先 `npm run build` 产出 `lib/`，然后宿主 UI：Plugins → Add plugin → 填本目录绝对路径
→ Enable now。
