# Frontend research and architecture notes

Research date: 2026-09-18. This is a decision record and recommendation set, not a list of completed features. Observations describe the starting implementation inspected through the codebase graph and source files.

## Product direction

The application serves three connected tasks: monitor the market, investigate a stock, and manage a personal workflow. Use an analysis workspace with persistent navigation and dense, readable data surfaces. Keep the overview selective; give tables and charts more space on investigation pages. Do not make every page another grid of summary cards.

The recommendation is based on the app's existing data and workflows, not user testing. Validate it by completing realistic tasks: find an oversold stock, inspect its price and indicators, add it to a watchlist, create a rule, and revisit a saved view.

## Evidence and application

| Topic | Primary source | Decision for this project |
| --- | --- | --- |
| Dashboard purpose and navigation | [Cloudscape: service dashboards](https://cloudscape.design/patterns/general/service-dashboard/) distinguishes monitoring and investigation, recommends dashboard-first navigation, and distinguishes fixed from configurable layouts. | Put the overview first. Group the remaining routes by research, market context, and personal monitoring. Keep connection/freshness information in the shell. Give overview modules consistent customization capabilities. |
| Customization and placement | [Cloudscape: configurable dashboard](https://cloudscape.design/patterns/general/service-dashboard/configurable-dashboard/) supports moving, adding, removing, resizing, restoring, and retaining dashboard items; its grid stacks on small screens. | Offer sensible presets and a visible Customize action. Persist widget visibility, order, and width; allow reset and restoration. Use stable widget IDs and a versioned preference schema. Stack modules on phones while preserving order. |
| Reordering accessibility | [W3C: WCAG 2.5.7 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) requires a single-pointer alternative to dragging; keyboard equivalence is a separate requirement. | Start with explicit Move up/Move down controls. If drag-and-drop is added, retain those controls. Keep focus on the moved item and announce its new position. |
| Saved views | [Cloudscape: saved filter sets](https://cloudscape.design/patterns/general/filter-patterns/saved-filter-sets/) recommends named reusable configurations, visible temporary changes, and clear save/update actions. | Put saved views beside stock search and filters. Save sorting, selected columns, density, and filters together. Distinguish changing a view from saving it. Explain that browser-local preferences do not synchronize across devices. |
| Chart selection | [IBM Carbon: chart types](https://carbondesignsystem.com/data-visualization/chart-types/) groups charts by comparison, trend, composition, and correlation tasks. | Use lines for history, horizontal bars for ranked sector comparisons, and a heatmap for broad market scanning. Use tables for exact comparisons. Do not substitute decorative gauges or donuts for precise values. |
| Financial comparisons | [TradingView: compare tool](https://www.tradingview.com/support/solutions/43000543053-how-to-use-the-compare-tool/) uses percentage axes when symbols are compared. [TradingView: chart configuration](https://www.tradingview.com/support/solutions/43000748166-how-to-configure-your-supercharts/) documents regular, percentage, indexed, and logarithmic scales. | Keep absolute price as the default for a single stock. Use percentage change or indexed-to-100 when comparing differently priced stocks. Clearly label scale, currency, and visible range. Never silently compare different units on one axis. |
| Nonvisual chart access | [W3C: complex images](https://www.w3.org/WAI/tutorials/images/complex/) recommends an identifying description plus essential values, trends, and relationships in a longer alternative. | Pair each major chart with a short summary and an accessible data table. Provide date, value, and series labels without requiring hover. Show signs/text as well as positive/negative colors. |

## Page composition recommendations

- **Overview:** a compact market summary followed by configurable modules for opportunities, sector breadth, watchlists, and recent alerts. The modules should link directly to their detailed destinations. Missing feeds should have local retry/empty states rather than replacing the whole dashboard.
- **Stocks:** one primary comparison table, with search and saved views above it. Keep symbol/company identity stable while numeric columns use tabular figures. Expose active filters and filtered-result counts. A compact/comfortable density setting is more useful here than oversized cards.
- **Stock detail:** make history the primary surface. Place range and series controls immediately above the chart, a persistent value summary nearby, and financial/AI/news detail beneath. Separate price, volume, and oscillators into aligned panes when units differ. Limit series to those explicitly selected.
- **Sectors and funds:** use ranked comparison charts for exact winners/losers and heatmaps for broad structure. Labels, numeric changes, and a legend must remain available even when color carries the overview.
- **Alerts:** treat watchlists, positions, rules, channels, and inbox as addressable destinations. A notification badge should arrive at the inbox. Keep rule creation and delivery status distinguishable.
- **Backtesting:** separate strategy inputs from results. Keep the selected run and assumptions visible beside equity/drawdown comparisons. Preserve existing calculations and describe missing values honestly.

These placements are design recommendations inferred from the source guidance and current workflows, not universal claims about a best layout.

## Current code seams and gaps

The graph identified strongly connected groups around the application shell, stock investigation, alert management, shared UI primitives, and API queries. These are practical extraction boundaries:

| Boundary | Existing entry points | Recommended ownership |
| --- | --- | --- |
| Application | `frontend/src/App.tsx`, `components/Navigation.tsx`, `contexts/ProgressContext.tsx` | An `app/` area for routing/providers/shell and a single navigation registry. Preserve lazy route loading. |
| Workspace preferences | `contexts/SettingsContext.tsx`, `components/SettingsPanel.tsx` | A feature-owned, validated preference model; keep market filters distinct from layout/display preferences. |
| Stocks | `pages/StocksPage.tsx`, `components/FilterPanel.tsx`, `pages/ScreenerPage.tsx` | A stocks feature for view persistence and table configuration. Existing filter presets overlap and should converge gradually without discarding stored views. |
| Charts | `pages/StockDetailPage.tsx`, `pages/Backtest.tsx`, `theme/` | Shared chart controls, formatting, and accessible summaries; feature-owned data transforms. |
| Alerts | `pages/AlertsPage.tsx`, `components/alerts/`, `queries.ts` | Extract tabs when next edited. Reuse query hooks for shared unread/watchlist data and invalidate those query families after mutations. |
| Design system | `components/ui/primitives/`, `theme/` | Retain existing Surface, PageHeader, Num, EmptyState, and ErrorState ownership; improve tokens once rather than rebuilding parallel primitives. |

Specific starting-state issues:

1. `AlertsPage` selects tabs with local state only. Reloading or linking to an inbox loses the selected destination.
2. Watchlist rows are clickable `HStack` elements, with no keyboard selection behavior. Put selection in a real button and keep deletion a separate sibling action.
3. `SettingsPanel` presets call `applyPreset` immediately, while the drawer presents Cancel and Apply. A preset selection must remain a draft until Apply; closing should discard it.
4. `Navigation` independently polls unread counts even though `useUnreadCount` exists in `queries.ts`. Sharing the query prevents two sources of truth.
5. Alert tabs use bespoke request state while equivalent query hooks already exist. Reusing the existing cache will help inbox, dashboard, and navigation stay consistent after mutations.
6. Existing settings text claims filters apply across all views. Audit each query before making that promise; make any exceptions explicit in product language.

Prefer additive extraction with thin compatibility entry points. Avoid moving backend modules merely to make the directory tree symmetrical; the Rust service already has established notification and data-source boundaries. Update the task-to-file index when ownership moves.

## Verification targets

- Save, reload, modify, reset, and recover malformed browser-local preferences.
- Open each navigation destination directly and use browser Back/Forward.
- Complete customization and watchlist selection using only the keyboard.
- Check charts at empty, single-point, missing-value, and long-history inputs; display source dates and units.
- Check 320, 375, 414, 768, and desktop widths. Tables may scroll within their own region; the page should not overflow.
- Run the existing frontend build/tests and targeted tests for behavioral changes. Use real backend data when available and explicitly identified test fixtures otherwise.

## Bounded interaction fixes accompanying this research

The following fixes are implemented separately from the broader recommendations above:

- `SettingsPanel.tsx`: presets remain draft state until Apply; Cancel/close discards them. Presets are native buttons with selected state. Descriptions now match the actual $500M/25% and $10B/15% thresholds, and sliders represent current preset/custom values with accessible value labels.
- `AlertsPage.tsx`: sections have durable URLs (`/alerts?tab=watchlists`, `positions`, `rules`, `channels`, and `inbox`). `history` is accepted as an alias for inbox. Section links preserve other query parameters and browser history. Watchlist selection uses native buttons; delete/remove actions have specific accessible names.
- Focused interaction tests exercise draft cancellation/application, keyboard slider editing, URL/history behavior, and watchlist control semantics. These tests use the real Chakra components and mocked API responses; they do not establish visual or live-backend correctness.
