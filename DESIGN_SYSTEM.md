# Stock Analyzer Design System

## Direction

The redesign direction is dark-first and Koyfin-like: professional, calm, dense enough for market scanning, and visually quiet until a price, signal, or alert needs attention. The app should feel like an investor workspace rather than a generic admin dashboard.

The current frontend stack is React 19, TypeScript, CRA, Chakra UI v3, Recharts, TradingView embeds, framer-motion, lucide-react, and next-themes. No Tailwind or shadcn/ui is installed, so the redesign should compose Chakra and the existing primitive layer instead of adding another UI framework.

## Principles

- Data hierarchy first: prices, deltas, RSI, market cap, and active filters get the strongest visual weight. Labels, helper text, timestamps, and metadata stay quiet.
- Flat finance surfaces: use near-black canvases, subtle panels, hairline borders, and restrained elevation. Avoid heavy cards and decorative shadows.
- Semantic color only: blue is action/accent, green is constructive or positive, red is negative or risk, amber is warning. Do not use raw colors in screen code.
- Numeric consistency: all prices, percentages, volumes, ratios, counts, and tickers use tabular figures. Decimal precision should be stable within a table or metric group.
- Responsive density: desktop screens can be information-rich, but mobile at 375px should collapse into readable stacked sections with the same controls preserved.
- Purposeful motion: transitions should clarify hover, focus, active filters, tab changes, or live updates. No decorative animation.

## Tokens

Canonical tokens live in `frontend/src/theme/design-tokens.ts` and are consumed by `frontend/src/theme/system.ts`.

- `bg.canvas`, `bg.surface`, `bg.surfaceRaised`, `bg.inset`: app background, standard panels, lifted panels, and recessed data wells.
- `border.subtle`, `border.default`, `border.emphasis`: hairlines for table grids, cards, active states, and focus-adjacent emphasis.
- `fg.default`, `fg.muted`, `fg.subtle`: primary text, secondary text, and tertiary metadata.
- `accent.*`: navigation active states, primary actions, links, selection, and AI affordances.
- `signal.up.*`, `signal.down.*`, `signal.warn.*`, `signal.info.*`: financial and system states.
- `fonts.body`, `fonts.heading`, `fonts.mono`: Inter for UI, JetBrains Mono fallback stack for prices and tickers.
- `radii.xs` through `radii.xl`: compact radii for panels and controls. Finance tables should favor `sm` or `md`.
- `shadows.elevation.raised`, `shadows.elevation.overlay`: ring-like depth for panels and overlays, not soft marketing-card shadows.

## Component Patterns

- `Surface` is the canonical panel primitive. It should back cards, tables, filter drawers, detail sections, and inset modules.
- `Num` is required for all numeric display. It handles tabular numerals, compact notation, signs, prefixes, suffixes, and positive/negative intent.
- `SignalBadge` is the only badge style for signal states. Screen code should pass `tone` rather than picking ad hoc palettes.
- `StatBlock` is the default KPI pattern: uppercase label, mono value, optional delta and hint.
- `PageHeader` remains the page-level title pattern, but screen redesigns should use its `actions` slot for filters, refresh, save, or watch controls.
- Tables should prefer dense rows, sticky headers where useful, right-aligned numeric columns, muted grid lines, and hover states that do not overpower the data.
- Detail screens should use a primary content rail plus a secondary insight rail on desktop, then collapse to a single column on mobile.

## Audit Notes

- `frontend/src/App.tsx` owns routing and should remain functionally unchanged.
- `frontend/src/components/Navigation.tsx` is the global shell and status surface. It will need responsive treatment before deeper screen work.
- `frontend/src/pages/Dashboard.tsx` is the true dashboard route and should be redesigned first.
- `frontend/src/pages/StockDetailPage.tsx` is the ticker detail page. It is large and contains chart, overview, about, technicals, AI, news, insider, and earnings sections.
- `frontend/src/pages/StocksPage.tsx` is the broad watchlist-like stock browser with table/card view, search, sorting, page size, and pagination.
- `frontend/src/pages/ScreenerPage.tsx` is the advanced screener with saved presets and indicator filters.
- `frontend/src/pages/AlertsPage.tsx` contains actual watchlists plus alert rules, channels, and inbox.

## Refactor Order

1. Foundation pass: `Navigation`, `Surface`, `PageHeader`, `SignalBadge`, `StatBlock`, shared table/filter patterns, and any global numeric utility gaps.
2. Dashboard: `Dashboard.tsx` plus shared market summary row/card patterns. Emphasize market snapshot, top movers, opportunities, and AI insights.
3. Ticker detail: `StockDetailPage.tsx`, `WatchButton`, `MarkdownContent`, and local detail sections. Emphasize quote header, chart, technicals, company context, AI stream, and event/news tabs.
4. Watchlist and screener: `StocksPage.tsx`, `ScreenerPage.tsx`, `AlertsPage.tsx` watchlists tab, and reusable filter/table controls. Preserve every filter, preset, view toggle, pagination control, and watchlist action.
5. Secondary screens: `OpportunitiesPage.tsx`, `FundsPage.tsx`, `NewsPage.tsx`, `SectorPage.tsx`, and alert management tabs so the full app feels cohesive after the primary review cycle.

## Screen Review Protocol

Before each screen implementation, describe the layout, hierarchy, emphasized/de-emphasized content, responsive behavior, and exact components touched. Implement only after review, preserving existing data fetching, routing, and state management.
