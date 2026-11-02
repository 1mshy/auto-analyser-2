# Project architecture

## Repository boundaries

| Location | Responsibility |
| --- | --- |
| `src/` | Rust data ingestion, technical analysis, persistence, HTTP/WebSocket APIs |
| `src/notifications/` | Alert evaluation, watchlists, channels and delivery |
| `frontend/src/app/` | Route definitions, shared application frame and navigation model |
| `frontend/src/pages/` | Route-level orchestration; screens stay lazy-loaded |
| `frontend/src/features/workspace/` | Named dashboard layouts, validated local persistence, panel configuration |
| `frontend/src/features/dashboard/` | Market snapshot and dashboard panel renderers |
| `frontend/src/features/stocks/` | Stock filter URL codec, saved views, columns, density, results and controls |
| `frontend/src/features/charts/` | Historical-data preparation, indicators, chart controls and preferences |
| `frontend/src/features/research/` | AI questions, comparisons, submitted-answer state and source evidence |
| `frontend/src/pages/stock-detail/` | Company research tabs and external advanced chart integration |
| `frontend/src/components/` | Cross-feature components; shared primitives remain under `ui/primitives/` |
| `frontend/src/contexts/` | Shared settings and WebSocket analysis progress |
| `frontend/src/api.ts`, `queries.ts` | Transport contracts and TanStack Query server-state hooks |
| `frontend/src/theme/` | Portable CSS tokens, Chakra adapter, responsive utilities, Recharts adapter |
| `docs/` | Current architecture, design research and documentation entry point |

`src/ai_research.rs` provides bounded, read-only AI research over stored stock analyses. It uses the existing OpenAI-compatible client in `src/openrouter.rs`; configuration and model discovery stay on the server.

## Dependency direction

Routes compose features. Features consume shared components, API query hooks, types and formatting helpers. Shared primitives must not import pages or feature controllers. Keep server state in TanStack Query; keep URL filters in the router; keep visual preferences in validated browser storage.

`App.tsx` owns providers. `app/AppShell.tsx` owns navigation and the main landmark. `app/AppRoutes.tsx` owns lazy route registration and the not-found page. `app/navigation.ts` is the single navigation model for desktop and mobile.

The Rust backend remains in its established module layout. Domain-specific frontend logic was extracted without moving deployment paths or deleting existing routes. AI research adds its own endpoint while preserving existing API payloads.

## State ownership

| State | Owner | Persistence |
| --- | --- | --- |
| Quotes, historical prices, sectors, news, watchlists | Query hooks / server | MongoDB + server caches where applicable |
| Analysis connection / progress | `ProgressProvider` | WebSocket with polling fallback |
| Universe constraints | `SettingsContext` | Existing browser settings key |
| Search, filters, sort and pagination | Stock feature codec / URL | Shareable URL |
| Stock table columns, view and density | Stock workspace hook | Browser local storage |
| Named stock views | Stock workspace hook | Browser local storage; includes filters and display preferences |
| Dashboard layouts and panel order/width | Workspace feature | Versioned browser local storage |
| Chart range, scale, overlays and panes | Chart preferences | Versioned browser local storage |
| AI research draft, submitted answer and source snapshot | Research feature / mutation hook | In-memory only; no automatic generation |

Personal layouts and saved views are browser-local, not account-synchronized. Global universe constraints are applied in addition to page filters. Sharing a filter URL does not transfer the sender's private layouts or change the receiver's universe settings.

## Extending the frontend

- **Add a route:** create a page, lazy-load it in `app/AppRoutes.tsx`, and add a navigation item if it belongs in the rail.
- **Add a dashboard panel:** extend the registry in `features/workspace/model.ts`, its renderer in `features/dashboard/DashboardWidgets.tsx`, and destination mapping in `pages/Dashboard.tsx`. The storage parser drops unrecognized panel IDs and preserves valid layouts.
- **Add a stock filter:** update the shared backend/client contract, then the feature's parser/serializer, visible chips, validation and form. Test URL round-tripping and effective universe constraints.
- **Add a chart indicator:** calculate it in `features/charts/history.ts` using full available history before selecting the visible range. Document its warm-up and unit; use a separate pane when its scale differs from price.
- **Change colours:** edit `theme/tokens.css` and the semantic adapter. Nested Chakra paths override built-in tokens; Recharts uses the portable colours. Root `tokens.css` re-exports the same frontend file without breaking Docker's frontend-only build context.

## Validation

Run `npm run build` and `npm test` from `frontend/`. The existing CI budget for initial JavaScript remains unchanged. Validate responsive layouts at 320, 375, 414, 768px and desktop, and test keyboard focus, mobile navigation, saved preferences, errors and empty results. Browser QA fixtures must be isolated from the production entry point and removed after validation.
