# Notifications subsystem — scoped notes

`AlertEngine` is the only public surface. Everything else here is internal.

## Files

- `models.rs` — `ChannelKind`, `ChannelConfig`, rule trees (`AND`/`OR`/`NOT` + leaf conditions), `PendingNotification`, `DeliveryResult`.
- `repo.rs` — Mongo CRUD for channels / rules / watchlists / history. Creates own indexes at startup (best-effort, non-fatal).
- `evaluator.rs` — state-aware evaluation: cooldowns committed **after** successful delivery, `require_consecutive` hysteresis, MACD bullish/bearish cross detection (uses previous cycle's histogram), timezone-aware `quiet_hours`.
- `dispatcher.rs` — fans out to channels. Per-channel errors do not abort the batch. Substitutes `{{symbol}}`, `{{price}}`, `{{rsi}}`, `{{change_pct}}`, `{{matched}}`, `{{52w_low/high}}`, `{{market_cap}}`, `{{sector}}`, `{{rule_name}}`. Unknown placeholders left intact (typos visible).
- `channels/mod.rs` — `Channel` trait + `build_channel` registration point.
- `channels/discord.rs` — Discord webhook impl.
- `api.rs` — `/api/watchlists*`, `/api/alerts/channels*`, `/api/alerts/rules*`, `/api/alerts/history*`, `/api/alerts/status`.

## Adding a new channel (e.g. Telegram, Email)

1. Extend `ChannelKind` + `ChannelConfig` in `models.rs`.
2. Add impl under `channels/` (one file per channel).
3. Wire into `build_channel` in `channels/mod.rs`.
4. Mirror config shape in `frontend/src/types.ts`.

The evaluator/dispatcher/API are channel-agnostic — you do not edit them.

## Hard rules

- Webhook URLs live **per-channel in MongoDB**, NOT in env vars.
- API response shape: `{ success: true, ... }` / `{ success: false, error: "..." }`.
- Don't add early `?` returns in dispatcher fan-out — per-channel errors must be swallowed.
