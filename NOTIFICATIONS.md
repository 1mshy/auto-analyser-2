# Notifications & Alerts

Auto Analyser 2 ships with a data-driven alert engine. You define *watchlists*
(sets of symbols), *rules* (boolean conditions + cooldowns), and *channels*
(currently Discord webhooks). Every analysis cycle, the engine evaluates each
enabled rule against the freshly computed snapshots and fans out matches to
the configured channels.

Everything is managed from the **Alerts** tab in the UI (`/alerts`). No secrets
live in the environment — webhook URLs are stored per-channel in MongoDB.

## Quick start

1. **Create a Discord webhook.** In Discord: *Server settings → Integrations →
   Webhooks → New Webhook*. Copy the URL.
2. In the app, open **Alerts → Channels**, paste the URL, give it a name, and
   hit *Test*. You should see a "Test notification" embed in Discord.
3. **Alerts → Watchlists**: create a watchlist, add tickers. You can also
   click the star icon on the Opportunities page or a stock detail page.
4. **Alerts → Rules**: create a rule, pick its scope (all watched / specific
   watchlist / explicit symbols / all analyzed), build the condition tree,
   pick channels, save.
5. Wait for the next analysis cycle (or press *Test* to fire one right now).

## Environment variables

| Var                      | Default | Purpose                                                                                   |
|--------------------------|---------|-------------------------------------------------------------------------------------------|
| `NOTIFICATIONS_ENABLED`  | `true`  | Master switch. When `false`, rules don't fire. The UI & API still work so you can edit.   |
| `PUBLIC_BASE_URL`        | _(unset)_ | If set, Discord embeds link back to `/stocks/:symbol` on this host. e.g. `http://localhost:5173` |

## Condition reference

Rules are trees of `AND` / `OR` / `NOT` groups with leaf conditions at the
bottom. Every leaf uses a single stock snapshot (plus, for MACD crosses, the
previous cycle's histogram).

| Condition                   | Fires when                                                                 |
|-----------------------------|----------------------------------------------------------------------------|
| `RSI below`                 | `rsi < value`                                                              |
| `RSI above`                 | `rsi > value`                                                              |
| `Price below / above`       | price in dollars                                                           |
| `Day change % below/above`  | 1-day percentage change                                                    |
| `Within % of 52-week low`   | `|price - 52w_low| / 52w_low × 100 ≤ within_pct`                          |
| `Within % of 52-week high`  | mirror of above                                                            |
| `MACD bullish cross`        | histogram flipped from ≤0 to >0 between the previous and current cycles    |
| `MACD bearish cross`        | histogram flipped from ≥0 to <0                                            |
| `Stochastic %K below/above` | %K value                                                                   |
| `Bollinger bandwidth below` | Volatility-squeeze alert                                                   |
| `Is oversold / overbought`  | Mirrors the `is_oversold` / `is_overbought` flags from the analysis engine |
| `Volume above`              | Raw share volume                                                           |
| `Sector equals`             | Matches the NASDAQ sector string (case-insensitive)                        |
| `Down % from 52w high`      | `(52w_high − price) / 52w_high × 100 ≥ value`                             |

## Anti-spam gates

Each rule supports:

- **`cooldown_minutes`** — after a rule fires for a symbol, it won't fire
  again for that symbol until the cooldown elapses.
- **`require_consecutive`** — how many cycles in a row the condition tree must
  match before the rule fires (hysteresis). Default `1`.
- **`quiet_hours`** — optional UTC window where the rule is silent entirely.
  Wraps midnight if `start_hour > end_hour` (e.g. `22..7`).

## Message template placeholders

If you leave *Message template* blank the engine generates a sensible default.
Otherwise, any of these `{{placeholders}}` are substituted on dispatch.
Unknown placeholders are left alone (so typos are visible in the output).

| Placeholder       | Value                                                |
|-------------------|------------------------------------------------------|
| `{{symbol}}`      | e.g. `AAPL`                                          |
| `{{price}}`       | Formatted to 2dp                                     |
| `{{rsi}}`         | Formatted to 1dp, or `-` if unavailable              |
| `{{change_pct}}`  | Day change % to 2dp                                  |
| `{{rule_name}}`   | The rule's name                                      |
| `{{matched}}`     | Comma-separated list of matched leaf descriptions    |
| `{{52w_low}}`     | 52-week low (from NASDAQ technicals)                 |
| `{{52w_high}}`    | 52-week high                                         |
| `{{market_cap}}`  | Integer dollars                                      |
| `{{sector}}`      | NASDAQ sector                                        |

## API surface

All routes live on the existing HTTP server (default port `3333`). Responses
use `{ "success": true, ... }` / `{ "success": false, "error": "..." }`.

```
GET/POST   /api/watchlists
GET/PATCH/DELETE /api/watchlists/:id
POST       /api/watchlists/:id/symbols               { "symbol": "AAPL" }
DELETE     /api/watchlists/:id/symbols/:symbol

GET/POST   /api/alerts/channels
GET/PUT/DELETE /api/alerts/channels/:id
POST       /api/alerts/channels/:id/test

GET/POST   /api/alerts/rules
GET/PUT/DELETE /api/alerts/rules/:id
POST       /api/alerts/rules/:id/toggle
POST       /api/alerts/rules/:id/test                { "symbol": "AAPL" }

GET        /api/alerts/history?page=&page_size=&rule_id=&symbol=
GET        /api/alerts/history/unread-count
PATCH      /api/alerts/history/:id/read              { "read": true }
GET        /api/alerts/status
```

## Adding a new channel backend

The engine is plugin-style. To add Telegram / Signal / Email / generic webhook:

1. Extend `ChannelKind` and `ChannelConfig` in `src/notifications/models.rs`.
2. Add a new file under `src/notifications/channels/` implementing the `Channel` trait.
3. Wire it into `build_channel` in `src/notifications/channels/mod.rs`.
4. Mirror the new config shape in `frontend/src/types.ts`.

No other code needs to change — the evaluator, dispatcher, and API layer are
channel-agnostic.
