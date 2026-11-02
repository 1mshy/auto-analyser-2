# Frontend overhaul verification

Verified on 2026-09-18 against the local Rust backend and isolated UI fixtures.

## Automated checks

- Production build and TypeScript validation pass.
- All 67 tests across 19 frontend test files pass. Coverage includes workspace storage recovery and controls, stock filter URL round-tripping and universe constraints, saved views, chart history normalization and range boundaries, indicator warm-up, chart preferences, settings drafts, alert deep links, article/ticker navigation, service-worker lifecycle, AI research submission and cancellation, source evidence, and existing backtesting behavior.
- Initial JavaScript is 256.77 KiB at gzip level 9, below the existing 280 KiB CI gate. Vite still reports its generic large-chunk advisory; the stricter 150 KiB optimization target remains future work. No thresholds were raised.
- `git diff --check` passes. Temporary preview fixtures were removed.

## Browser checks

- Overview, stock results, screener, and stock history checked at 320, 375, 414, 768 pixels and desktop. Both appearance modes checked.
- Navigation, global symbol search, filter chips, table/card controls, column visibility, saved views, dashboard customization, panel ordering, and mobile drawers inspected and exercised.
- Historical charts verified with actual AAPL data. The three-month range uses calendar months and shows actual dates/session counts. Price, volume, and RSI have separate scales; table/CSV alternatives remain available.
- All research and monitoring routes loaded at desktop and 375 pixels. Condition-builder controls also checked at 320 pixels after fixing wrapping and accessible labels.
- Live quotes, analysis progress, stock search, summary data, and historical prices loaded from the running backend. Empty sector classifications are represented explicitly; no sample data replaces missing live results.
- AI research generated a live AAPL/MSFT comparison through the supplied LAN model. Source links and stock-page prefill worked without automatic generation. Completed answers and source cards fit 320, 375, 414 and 768 pixels without horizontal overflow.

## Local preview and boundaries

The existing local frontend environment points at port 3030, while the running backend is on 3333. The review preview uses empty `VITE_API_URL` and `VITE_WS_URL` overrides so Vite's existing proxy reaches port 3333; saved environment files were not changed.

Layouts, saved stock views, and chart preferences are browser-local. This change does not add account synchronization or extend the backend's available historical data. The AI follow-up adds `POST /api/ai/research`; existing endpoint contracts and deployment paths are preserved. The local Docker backend was rebuilt for live AI verification. The review frontend runs on port 3016; the separate Docker frontend on port 80 was not rebuilt. No production deployment was performed.

Live QA was read-only with respect to market records, watchlists, alert rules, channels, and backtest runs. Mutation behavior is covered through isolated tests where applicable.
