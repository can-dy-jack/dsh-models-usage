# dsh-models-usage — Model Usage & Balances

[简体中文](README.md)

A DeepSeek Harness plugin that brings configured providers and models together with each provider's account balance or plan quota.

## Screenshots

![Model list and balance dashboard](public/dsh-models-usage.png)

![Custom query configuration and preview](public/dsh-models-usage-2.png)

## Features

- Browse providers and models, including context limits and input capabilities; search and filter the list.
- Query official balances or quotas for supported providers. Providers without an available query are clearly marked and linked to their console instead of showing a fabricated zero balance.
- Refresh providers individually and view quota reset times, with short-lived caching.
- Configure custom balance or quota queries from a provider card, then test the request and preview field mappings. Saved configurations contain request templates, not API keys.

Balances and quotas belong to the **provider account**, not individual models. Check **View support status** in the panel for current coverage and credential requirements.

## Install and use

Install with the CLI:

```sh
dsh plugin add dsh-models-usage
```

Alternatively, use **Plugins → Add plugin** in Harness to find or enter `dsh-models-usage`, then enable the plugin.

Open **Model Usage & Balances** from the sidebar. The panel requires an active conversation; use the refresh button to update the data. You can also run this command in a conversation:

```text
/dsh-models-usage [summary|detail|refresh] [provider=<id>]
```

The `models_balance` tool returns the same data for model use.

## Configuration

These options are available in the `models-usage` entry in `cordis.patch.yml`:

| Option | Default | Description |
| --- | --- | --- |
| `includeModelDetails` | `true` | Load per-model context and capability details |
| `includeDormantProviders` | `false` | Include providers that are not configured or active |
| `locale` | `zh-CN` | Locale sent to balance APIs |
| `clientVersion` | `0.2.0-rc.2` | Client version sent to balance APIs |
| `customQueryFile` | empty | Custom query configuration path; defaults to `$DSH_HOME/storages/dsh-models-usage.custom-queries.json` |

## Development

```sh
npm install --legacy-peer-deps
npm run typecheck
npm run build
```

## Limitations

- The panel communicates with the Host through the active conversation. Open a conversation first if none is active.
- Not every provider exposes a balance API accessible with a model API key. The plugin does not use console cookies or convert plan quotas into cash balances.
- Balances are account-level data and cannot be split by model.

## License

[MIT](LICENSE)
