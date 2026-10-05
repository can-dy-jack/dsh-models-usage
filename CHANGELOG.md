# Changelog

## 0.1.0

首个公开版本。

- 列出当前模型列表中的全部服务商与模型（上下文窗口、最大输出、输入模态、reasoning effort、凭据缺失提示）。
- 内置余额 / 额度查询：DeepSeek 开放平台与账号、Moonshot AI（Kimi 开放平台）、Kimi Code、OpenCode Go、
  MiniMax 国内 / 国际站、Z.AI / 智谱 Coding Plan 等；不支持的服务商明确标注并给出控制台入口。
- 自定义查询：任意服务商可配置请求与响应映射，支持测试、JSON 字段点选与实时预览。
- 侧栏入口 + 主面板、`/dsh-models-usage` 命令与 `models_balance` 工具；60s 缓存、15s 失败重试、单服务商刷新。
