# Frontend Overhaul Implementation Plan — auto-analyser-2

**Status:** Proposed · **Date:** 2026-06-02 · **Branch base:** `main`
**Pillars:** (A) Frontend redesign · (B) Feel-fast (build/tooling + perf) · (C) Stock-info-up-to-speed (backend freshness + client data layer)

---

## 1. Executive Summary

A deliberate "big haul" overhaul targeting three goals: **redo the frontend designs**, **make the site feel fast**, and **make stock info up to speed (fresh, live-feeling)**. Six independent audits and four design tracks converge on one verdict: the committed design direction is sound and ~65-70% built; the structural causes of "slow" and "stale" are well understood; the fixes are largely **additive**, not rewrites.

### Relationship to `DESIGN_SYSTEM.md`: **EXTENDS** (keep-and-complete / EVOLVE)

This plan **EXTENDS and becomes the active doc** over `DESIGN_SYSTEM.md` without contradicting its design direction. Every audit area independently returned **KEEP-AND-COMPLETE**. The dark-first, Koyfin-like direction, the token layer (`design-tokens.ts`), the system wiring (`system.ts`), and all six primitives are coherent and well-built. There is **zero evidence of design incoherence** that would justify replacing the system.

- `frontend/src/theme/design-tokens.ts` **remains the single source of truth.** Everything new is additive token groups or an adoption sweep.
- The redesign spine follows DESIGN_SYSTEM.md's documented refactor order (Nav/foundation → Dashboard → StockDetail → watchlist/screener → secondary) and keeps its Screen Review Protocol.
- Where this plan goes **beyond** DESIGN_SYSTEM.md: the build/perf pillar (CRA→Vite) and the freshness pillar (WS data-push, client data layer), neither of which the original doc scoped.

**Stated, justified supersedes of the DESIGN_SYSTEM.md stack line** (must be reconciled in-doc, not left stale):
- **Build tool CRA → Vite.** DESIGN_SYSTEM.md line 7 lists "CRA"; B8 updates that line to "Vite."
- **`framer-motion` removed** (0 import sites; verified **not** a Chakra v3 peer — v3.30.0 peers are only `@emotion/react` / `react` / `react-dom`, so removal is safe). DESIGN_SYSTEM.md line 7 lists framer-motion; B6 strikes it and the frontend `CLAUDE.md` stack line. Motion is re-expressed as registered Chakra CSS-token transitions, which still satisfies the doc's "Purposeful motion" principle.

**Keep / Evolve / Replace verdict per layer:**

| Layer | Verdict | Evidence |
|---|---|---|
| Token system (`design-tokens.ts`/`system.ts`) | **KEEP** (~95%) | dual-mode set complete, wired via `system.ts:8-16`; only motion/skeleton/chart tokens missing |
| Primitives (Surface/Num/SignalBadge/StatBlock/PageHeader/EmptyState) | **KEEP** (6/6 built) | well-implemented; gap is adoption depth |
| Page-level adoption | **EVOLVE** (~85% wired, uneven depth) | 10/10 pages import primitives; StockDetailPage is the laggard |
| Shared-component adoption | **EVOLVE** (~45%) | 5 legacy holdouts unmigrated; 2 dead files |
| Cross-cutting (motion/skeleton/light-mode/chart) | **EXTEND** (~10%) | specced-but-dead token features |
| Build tool (CRA/react-scripts) | **REPLACE the build tool** (keep all source) | react-scripts deprecated; → Vite SPA, **not** Next/Remix |
| Data layer (none today) | **ADD** | introduce TanStack Query |
| Backend freshness pipeline | **EVOLVE** (additive) | add WS broadcast + optional v7 quote layer |

**Most-leveraged moves, in order:** **(P0)** client data layer + cycle-signal revalidation (most of "feel fast" + "up to speed" at near-zero risk), fix the one **critical** interaction bug, complete the token/primitive foundation; **(P1)** Vite migration + route code-splitting + skeletons; **(P2)** WS stock broadcast for true per-ticker liveness; **(P3)** optional v7 batch-quote layer for genuinely fresher data.

> **Path convention (read once):** all primitives — the 6 existing and every new one — live under **`frontend/src/components/ui/primitives/`**, and the single barrel is **`frontend/src/components/ui/primitives/index.ts`** (today it exports exactly Surface/Num/SignalBadge/StatBlock/PageHeader/EmptyState). New primitives are added under that real path and exported from that existing barrel. **Do not** create a second `frontend/src/ui/primitives/` tree or a second barrel.

---

## 2. Scope — Three Pillars (backend explicitly in scope)

**(A) Frontend redesign.** Complete the committed design system across all 21 surfaces: migrate 5 holdout components, delete 2 dead ones, deepen primitive adoption (especially StockDetailPage's 1318 LOC), sweep ~34 raw `<Badge>` → SignalBadge and ~51 `colorPalette` literals → `tone`, route ~110+ `toFixed` call sites through `Num`, add net-new primitives (Skeleton, DataTable, ErrorState, FreshnessChip) + helpers (chartTheme, SideDrawer, SectionLabel, Callout), and register the dead token groups (motion/skeleton/chart, warn/info repoint).

**(B) Feel-fast = build/tooling + perf.** Migrate CRA/react-scripts 5.0.1 → **Vite 5+ SPA** (same React 19 + Chakra source). Add route-level code-splitting (10 routes, currently one 405 KB-gzip bundle), layout-shaped skeletons replacing full-screen spinners, drop `window.location.reload()` at market open, remove unused `framer-motion`, **unify on `lucide-react` removing BOTH `react-icons` and `@chakra-ui/icons`**, raise compile target es5→es2020, memoize list rows, add a bundle budget.

**(C) Stock-info-up-to-speed = BACKEND freshness + frontend data layer.** **Backend is in scope.** Add a `tokio::sync::broadcast::Sender<StockAnalysis>` pushed at the existing per-symbol save site over a tagged WS envelope (perceived liveness). Optionally add an unused Yahoo `v7/finance/quote` batch layer polled for a bounded priority set (genuine freshness). Frontend: TanStack Query data layer with stale-while-revalidate, cycle-signal-driven revalidation, freshness UX (ticking age, live pulse, `cached` chip) — all from data the app already receives but discards.

---

## 3. Current State (grounded, with file:line)

### 3.1 Design-system fidelity
- Token layer ~95%: `design-tokens.ts` has full dual-mode set + `_light` branches (`:173-305`), wired via `system.ts:8-16 createSystem(defaultConfig, customConfig)`. Missing: motion (defined `:56-60` but **not registered** in `chakraTokens :85-169`), skeleton, chart tokens.
- Primitives 6/6 built and well-implemented. Numeric consistency genuinely enforced (`index.css:13-21` binds `.num`/`[data-num]` → JetBrains Mono + tabular-nums; `Num.tsx:103-104` emits `className=num data-num`).
- **Anti-patterns:** raw `<Badge>` ~34 across 11 files (StockDetailPage 16, AlertsPage 4); `colorPalette="green|red|…"` ~51 across 13 files (AlertsPage 13, StockDetailPage 8, FilterPanel 7); hardcoded hex in screen code = 1 (`StockDetailModal.tsx:88 #111418`) + dark-only scrollbar hex (`index.css:32 #262b33`, `:36 #3a414b`); hand-rolled `toFixed` outside Num: 51 in StockDetailPage, 10 in StockDetailModal.
- 5 legacy components import **zero** primitives: `StockDetailModal.tsx`, `FilterPanel.tsx`, `NewsCard.tsx`, `SettingsPanel.tsx`, `alerts/ConditionBuilder.tsx`.
- **2 dead files (zero importers):** `StockDetailModal.tsx` (439 LOC, superseded by StockDetailPage) and `StockCard.tsx` (superseded by inline `StockCardCompact` at `StocksPage.tsx:85`). `StockDetailModal.tsx:38` ships a stray `console.log`.

### 3.2 Core/secondary pages
- **CRITICAL bug:** `ScreenerPage.tsx:133` defines `FilterInput` **inside** the component body, rendered 6× at `:162-167`; new component identity each render remounts the input subtree → loses focus after one keystroke. (Contrast Dashboard's correctly module-level `SectionCard`/`AIAnalysisCard` at `:85/:122`.)
- All loading is full-screen `<Spinner>` (Dashboard:206, Stocks:399, StockDetail:275, Screener:281; AlertsPage 5 spinners at :153/393/547/942/1022). 0 skeletons.
- **Dashboard poll-blanking bug:** `setLoading(true)` at `Dashboard.tsx:151` runs inside `fetchMarketSummary`, which is also the 5-min interval callback at `:190` — so every background poll flips the whole screen to a spinner.
- **StockDetailPage error-vs-not-found conflation:** catch at `:149-153` only `console.error`s on network failure → falls through to the "not in our database" block `:281-303`, so a transient fetch error masquerades as a genuine 404.
- StockDetailPage under-adopts: no PageHeader, no StatBlock, ~9 raw `Card.Root` (`:499,916,949,983,1007,1050,1092,1126,1248`), local `StatCard`/`ProfileMetricCard` (`:88-93`/`:104-111`), 51 `toFixed`, 7 hand-styled tab Buttons (`:377-436`), emoji AI status (`:1163-1165`).
- AlertsPage PositionsTab uses raw `green.500`/`red.500` (`:412,438-439`) and hand-rolled `<Box as='table'>` (`:418-468`) while Backtest's `Table.Root` (`:509-585`) is the in-repo canonical pattern.
- Dashboard off-layout: `container.xl` (`:204,214,226`) vs `maxW='page'` everywhere else.

### 3.3 Build/perf
- CRA `react-scripts 5.0.1` (deprecated) + React 19; `tsconfig target:"es5"`. 10 routes statically imported (`App.tsx:5-14`, rendered `:66-77`), **0 `React.lazy`/`Suspense`** in src.
- Prod build = **one eager chunk 1.4 MB raw / 405 KB gzip** + an 8 KB web-vitals chunk.
- `framer-motion` declared but **0 import sites**. `recharts` 1 import site (`Backtest.tsx:24`). **Three icon libraries in deps:** `lucide-react` (15 files), `react-icons` (4 component files, 22 `createElement(... as any)` casts), and `@chakra-ui/icons` (`^2.2.4`).
- `App.tsx:26-32` market-open refresh does `window.location.reload()` (re-parses the 1.4 MB bundle).

### 3.4 Freshness (frontend + contract)
- **No client data layer** — `api.ts` is bare axios; StocksPage refetches only on params (`:234`), StockDetailPage fetches once on mount (`:255-260`), only Dashboard polls (5-min, summary only `:190`).
- Staleness floor ~15-17 min + **unbounded** client dwell (detail page never refetches after mount).
- WS (`api.rs:565-588`) is a per-connection 2s loop serializing **only** `AnalysisProgress`; `hooks.ts useWebSocket` discards any message lacking `total_stocks`.
- The app already receives `last_cycle_completed` (via 2s WS + 5s poll `App.tsx:43-55`) and drives **no** stock refetch from it. The `cached` flag (`api.ts` getStock/filterStocks) and `isConnected` (`hooks.ts:148`) are returned and **discarded**.
- **Existing provider/context infra already present** (must be composed with, not rediscovered): `App.tsx:18,59` wraps the tree in `<SettingsProvider>` (`contexts/SettingsContext.tsx`); `next-themes` is a dependency and `components/ui/color-mode.tsx` already exists.

### 3.5 Backend freshness pipeline
- Single sequential loop (`analysis.rs:243→270`), `ANALYSIS_INTERVAL_SECS=3600` (`config.rs:85`); per-ticker staleness skip reuses the **same** `interval_secs` (`analysis.rs:309`).
- Per-symbol save+cache+submit at `analysis.rs:404-412` (proven non-blocking publish site via `AlertEngine::submit`).
- Cache TTLs (stock 300s, list 150s, `cache.rs:24-32`) ≪ 1h cycle → reads serve up-to-1h-old data.
- Yahoo uses only v8 chart (`yahoo.rs:476`) + v10 quoteSummary; **v7 batch-quote endpoint is unused**.

---

## 4. Target Design System (evolved tokens / primitives / patterns)

`design-tokens.ts` stays the single source of truth. All values below are render-verified or additive.

### 4.1 Semantic colors — DARK (canonical)
- **Canvas/surfaces:** `bg.canvas #080a0f`, `bg.surface #0f131a`, `bg.surfaceRaised #141922`, `bg.inset #0b0e14`, `bg.muted (rowHover) #151b24`, `bg.emphasized (rowActive) #182231`.
- **Borders:** `border.subtle #202633`, `border.default #283141`, `border.emphasis #384355`.
- **Foreground:** `fg.default #f4f7fb`, `fg.muted #a6b0bf`, `fg.subtle #747f8f`.
- **Accent:** `accent.solid #4ea1ff`, `accent.fg #84c3ff`, `accent.muted rgba(78,161,255,0.16)`, `accent.subtle rgba(78,161,255,0.08)`.
- **Signal up:** `signal.up.solid #2ebd85`, `.fg #6dd29f`, `.muted rgba(46,189,133,0.16)`, `.subtle rgba(46,189,133,0.08)`.
- **Signal down:** `signal.down.solid #ff5c70`, `.fg #ff8a9a`, `.muted rgba(255,92,112,0.16)`, `.subtle rgba(255,92,112,0.08)`.

### 4.2 warn/info repoint (narrow, partial fix)
The system is **internally inconsistent**, not wholesale broken. Verified at `design-tokens.ts:266-290`: `signal.warn.muted/.subtle` and `signal.info.muted/.subtle` **already use the brand rgba** (`rgba(245,165,36,…)` at `:273/276`; `rgba(100,181,246,…)` at `:286/289`). Only the **`.solid` and `.fg`** variants resolve to Chakra ramps off-brand: `signal.warn.solid/.fg → orange.400/orange.300` (`:267/270`) and `signal.info.solid/.fg → blue.400/blue.300` (`:280/283`) in dark (orange.600/blue.600 + .700 in light).
**Decision (scope-limited):** repoint **only** `signal.warn.solid/.fg` onto an amber brand ramp (solid `#f5a524`, fg `#f5c46b`) and `signal.info.solid/.fg` onto a blue brand ramp (solid `#64b5f6`, fg `#9ccdf9`), mirroring up/down. Leave the already-on-brand `.muted/.subtle` untouched. Add matching `_light` brand values. Delete the dead/unreferenced `designTokens.color.warning/info` literals (`design-tokens.ts:26-27`).

### 4.3 Light mode — KEEP `_light` branch
Coverage already exists (`:173-305`) and is render-true (zinc-style gray ramp: `bg.canvas gray.50 #fafafa`, `fg.default gray.900 #18181b`, etc.). **Do not drop it.** The only gap is **reachability**, which is mostly a wiring task — `next-themes` is already a dependency and `components/ui/color-mode.tsx` already exists. Decision deferred to P2/P3 (see §9). Add `_light` scrollbar values when tokenizing `index.css`.

### 4.4 Typography / spacing / density — KEEP
Inter (UI) + JetBrains Mono (`.num`/`[data-num]`). Spacing xs4/sm8/md12/lg16/xl24/2xl32/3xl48. Radii xs2/sm4/md6/lg8/xl10/full (panels `lg`, tables/controls `sm-md`). Elevation `raised` = ring-like (`0 1px 0 rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)`), `overlay` for modals. Layout: `page 1440`, `nav 56`. No scale changes — the work is routing remaining `toFixed` through `Num`.

### 4.5 New token groups (additive)
- **Motion (register into Chakra):** `durations.fast 120ms / .standard 180ms / .slow 240ms` + `transitions.surface` preset; reference from primitives (replace `Surface.tsx:47` hardcoded literal). Respect `prefers-reduced-motion`.
- **Skeleton:** `skeleton.base → bg.muted`, `skeleton.highlight → border.emphasis`-ish, shimmer 1.4s ease-in-out (static fallback under reduced-motion).
- **Chart:** `chart.grid → border.subtle`, `chart.axis → fg.subtle`, `chart.series.1..6` (accent `#4ea1ff`, up `#2ebd85`, warn `#f5a524`, down `#ff5c70`, info `#64b5f6`, purple `#a78bfa`). *(Open question: ship series.1..3 only if >3 simultaneous series is never needed — today only Backtest's single line exists.)*
- **Breakpoints (resolve the divergence — see §4.7):** add an explicit `breakpoints` group to `chakraTokens`.

### 4.6 Primitive contracts (evolved)
- **Surface** — only panel primitive; variants flat/raised/inset, `interactive` (+hover/_active), `accent` (3px left border). **Add `_focusVisible`** (2px `accent.solid`, 2px offset) to the interactive branch. Replace all raw `Card.Root` blocks.
- **SignalBadge** — only signal badge; `tone ∈ {up,down,warn,info,neutral,accent}`, `variant ∈ {subtle,solid,outline}`. Screen code passes `tone`, never `colorPalette`. Never render numbers in it (fix ScreenerPage market-cap-in-badge).
- **StatBlock** — default KPI pattern everywhere; auto-routes value through Num, supports intent/sign/prefix/suffix/decimals/compact/delta/size/bare.
- **DataTable (NEW)** — extracted from Backtest TradeTable (`:509-585`): `Table.Root size='sm'`, sticky `bg.inset` header, sortable column headers (`▲/▼`, `userSelect:none`), right-aligned Num cells, hover via `bg.muted`, scroll container `overflowX/Y auto + maxH`. Column-config array API.
- **Skeleton (NEW)** — SkeletonText/Row/Stat/Card consuming skeleton tokens + shimmer.
- **EmptyState + ErrorState** — EmptyState (icon+title+desc+action, Surface `inset`) for 200-with-empty; **distinct** ErrorState (lucide `AlertTriangle` + Retry) for fetch failures. Never conflate.
- **FreshnessChip (NEW)** — ticking relative "as-of" age, flips to warn tone past threshold (proposed >15 min; confirm vs freshness budget). *Visual only here; data hook owned by freshness workstream.*
- **chartTheme helper (NEW)** — axis/grid/series/tooltip from CSS vars; applied to recharts surfaces.
- **SideDrawer / SectionLabel / Callout (NEW)** — dedup 3 hand-rolled drawer shells and recurring section-label/inline-banner patterns.

### 4.7 Breakpoint single source of truth (decision)
There is a real divergence: `chakraTokens` (`design-tokens.ts:85-118`) has **no** `breakpoints` group, so Chakra falls back to v3 defaults (sm:480, md:768, lg:992, xl:1280), while `responsive.ts:11-16` hard-codes sm:640 / md:768 / lg:1024 / xl:1280.
**Decision:** declare an explicit **`breakpoints` group in `chakraTokens` (`design-tokens.ts`) as the single source of truth** (md:768 stays; pick canonical sm/lg/xl), then **derive `responsive.ts` `BREAKPOINTS` from the same constants** (import/share, do not re-declare). `useIsMobile()` keeps its below-`md` (767) cutoff. This is the **(b)** reading of the divergence and touches `design-tokens.ts` + `system.ts` (registration) + `responsive.ts` (derive) — not an ad-hoc edit of `responsive.ts` alone.

### 4.8 Iconography & hygiene
Standardize on `lucide-react`; migrate **both** `react-icons` (~4 files, remove 22 `createElement(... as any)`) **and** `@chakra-ui/icons`, then remove both deps. Replace emoji-as-icon (`StockDetailPage.tsx:1163-1165`, `StockDetailModal ⚠️`) with lucide + accent. Tokenize scrollbar hex (`index.css:32/36`) into border tokens.

---

## 5. Live-Data Architecture (the freshness contract)

**Keep two axes explicit and never flatten them:**
- **Perceived liveness** (WS broadcast push, freshness UX) — makes the app *feel* live over the **same hourly data**. Does **not** make underlying data fresher.
- **Actual freshness** (v7 batch-quote layer) — the **only** path that genuinely reduces data age, on a bounded priority set.

### 5.1 Tiers
- **T0 (no backend change):** TanStack Query + stale-while-revalidate; invalidate keyed on `last_cycle_completed` (already arriving).
- **T1 (frontend-only):** freshness UX from already-available data — ticking age, live pulse from discarded `isConnected`, surface `cached`, price/RSI change flash.
- **T2 (backend additive):** `tokio::sync::broadcast::Sender<StockAnalysis>` pushed at the per-symbol save site over a tagged WS envelope; routed into the query cache for per-ticker liveness.
- **T3 (optional):** unused Yahoo `v7/finance/quote` batch layer polled for the priority set; genuine freshness on visible/watched symbols.

### 5.2 WS envelope (back-compat discriminator)
Add to `src/models.rs`:
```rust
#[derive(Serialize)]
#[serde(tag = "type")]
enum WsMessage {
    Progress(AnalysisProgress),   // tag "progress"  — WRAP the previously-bare payload
    StockUpdate(StockAnalysis),   // tag "stock_update"
}
```
Mirror as a TS discriminated union in `types.ts`; `useWebSocket` switches on `msg.type`. **Wrap progress too** — do not leave a half-tagged protocol. Both ends ship together (coordinated change).

### 5.3 broadcast primitive & publish site
- `broadcast` (NOT `mpsc` — mpsc is single-consumer; WS needs one `.subscribe()` receiver per connection), capacity 512.
- Created in `main.rs`, cloned into `AppState` (`stock_tx`) + `AnalysisEngine::new`, mirroring `progress`/`get_progress` sharing (`main.rs:107/133/172`).
- Send at `analysis.rs ~407` success branch (after `cache.set_stock`, beside `engine.submit`): `let _ = self.stock_tx.send(analysis.clone());` — non-blocking, drop-on-no-receivers.
- **Lagged handling is a normal path, not an edge case:** rewrite `websocket_connection` as `tokio::select!` (2s progress tick arm + `stock_rx.recv()` arm). `RecvError::Lagged(n)` → log + emit resync signal (client does full `invalidateQueries`); `RecvError::Closed` → break.
- **Payload weight:** strip heavy optional fields (`news`, `technicals` — already `skip_serializing_if`) from the WS clone; fall back to a lean delta if still heavy.

### 5.4 Client data layer
- TanStack Query v5, single `QueryClient` at App root, `staleTime ~120s` (just over the 150s list-cache TTL), `refetchOnWindowFocus`.
- Keys: `['stocks']`, `['stocks','filter',filterKey]` (filterKey mirrors `api.rs:224 format!("{:?}",filter)` semantics), `['stock',symbol]`, `['stock',symbol,'history']`, `['market-summary']`.
- Lift `last_cycle_completed` into context → invalidate `['stocks']`/`['stock']` on change (silent SWR).
- WS `stock_update` → targeted `setQueryData(['stock',sym])` + **coalesced/debounced** (~500ms-1s) list invalidation to avoid render storm; lag → full invalidate.
- Replace `App.tsx:26-32 window.location.reload()` with `invalidateQueries`; drop the 5s progress poll except as `isConnected===false` fallback.
- **Provider composition (compose with existing `SettingsProvider`, do not replace):** in `App.tsx`, layer `QueryClientProvider` > `SettingsProvider` (existing, `:59`) > `Router` > new `ProgressContext`. The new providers wrap/are nested with the existing one; do not remove `<SettingsProvider>`.

### 5.5 Files to change
**Backend:** `src/models.rs`, `src/api.rs` (AppState + websocket_connection), `src/analysis.rs` (engine + new()), `src/main.rs`, `src/yahoo.rs` (T3), `src/config.rs` (T3).
**Frontend:** `frontend/src/types.ts`, `frontend/src/hooks.ts`, `frontend/src/api.ts`, new `frontend/src/queries.ts`, new `frontend/src/queryClient.ts`, `frontend/src/App.tsx`, new `frontend/src/contexts/ProgressContext.tsx`, **existing `frontend/src/contexts/SettingsContext.tsx`** (awareness — provider nesting, no rewrite).

---

## 6. Workstreams — Tasks with files + effort (S/M/L/XL)

### Cross-track ownership & dependency resolution (read first)
The four tracks overlap; ownership is assigned **once** here to prevent conflicting setups:
- **TanStack Query** → **owned by Workstream C (freshness).** Workstream B only *consumes* it (route prefetch; replacing `reload()` with `invalidateQueries`).
- **`StockCard.tsx`** → **DELETE (Workstream A).** It is dead code (zero importers). The freshness track's age-badge/price-flash edits **redirect to `StockCardCompact`** (`StocksPage.tsx:85`), NOT to the deleted file. Do not both delete and add features.
- **Skeleton primitive** → **owned by Workstream A.** Dependency for B's Suspense fallback and C's SWR placeholders. **Sequencing:** ship route-splitting with a plain placeholder if Skeleton isn't ready, then swap in.
- **`_focusVisible` + `@media(hover:hover)` hover-gating** → **one** primitive-layer task (Surface interactive + NavItem + IconButtons), not duplicated across visual/responsive tracks.
- **Icon unification (3 libs → lucide)** → **one** coordinated pass shared by A8 + B7 (covers `react-icons` AND `@chakra-ui/icons`).
- **ScreenerPage `FilterInput` hoist** → owned by Workstream B; **blocks** the mobile filter-sheet task (Workstream A responsive).

### Workstream A — Frontend Redesign

| # | Task | File(s) | Effort |
|---|---|---|---|
| A1 | Token groups: skeleton, chart, registered motion (durations/transitions), explicit **breakpoints** group (single source); repoint **only** warn/info `.solid`/`.fg` onto brand ramps (leave `.muted`/`.subtle`); delete dead `color.warning/info` literals | `theme/design-tokens.ts`, `theme/system.ts` | M |
| A2 | Build Skeleton primitive (Text/Row/Stat/Card) + shimmer; respect reduced-motion; export from barrel | `components/ui/primitives/Skeleton.tsx`, `components/ui/primitives/index.ts` | M |
| A3 | Extract DataTable primitive from Backtest TradeTable; refactor Backtest to consume it | `components/ui/primitives/DataTable.tsx`, `components/ui/primitives/index.ts`, `pages/Backtest.tsx` | L |
| A4 | Extract chartTheme helper + chart tokens; apply to Backtest equity chart | `theme/chartTheme.ts`, `pages/Backtest.tsx`, `theme/design-tokens.ts` | M |
| A5 | Add ErrorState (lucide AlertTriangle + Retry); document EmptyState-vs-Error rule | `components/ui/primitives/ErrorState.tsx`, `components/ui/primitives/index.ts` | S |
| A6 | Bake `_focusVisible` + `@media(hover:hover)` gating + guaranteed `_active` into Surface interactive/NavItem/IconButtons; aria-labels (NewsCard link, WatchButton state) | `components/ui/primitives/Surface.tsx`, `components/Navigation.tsx`, `components/NewsCard.tsx`, `components/WatchButton.tsx`, `pages/StocksPage.tsx` | M |
| A7 | **Delete dead code** `StockDetailModal.tsx` + `StockCard.tsx` + stray console.log (do before sweeps so scope counts are accurate) | `components/StockDetailModal.tsx`, `components/StockCard.tsx` | S |
| A8 | Migrate 5 holdout components to Surface/SignalBadge/Num; unify icons on lucide (covers react-icons **and** @chakra-ui/icons), remove `createElement(... as any)` | `components/FilterPanel.tsx`, `components/SettingsPanel.tsx`, `components/NewsCard.tsx`, `components/alerts/ConditionBuilder.tsx`, `components/ProgressBar.tsx` | L |
| A9 | StockDetailPage adoption: PageHeader, StatBlock (replace StatCard/ProfileMetricCard), Surface for ~9 Card.Root, route 51 toFixed→Num, data-driven tab bar, emoji→lucide; **split error-vs-not-found** (`:149-153` catch → ErrorState+Retry on fetch failure; EmptyState/not-found only on genuine 404) | `pages/StockDetailPage.tsx` | XL |
| A10 | Sweep raw `<Badge colorPalette>`→SignalBadge + `colorPalette` literals→tone; fix AlertsPage green.500/red.500→signal tokens; rebuild PositionsTab on DataTable+StatBlock | `pages/AlertsPage.tsx`, `pages/StocksPage.tsx`, `pages/Dashboard.tsx`, `pages/ScreenerPage.tsx`, `pages/SectorPage.tsx` | L |
| A11 | Dashboard: `container.xl`→`maxW='page'`; **fix poll-blanking** (gate spinner on `summary===null` only; keep stale data + subtle "updating" on background polls — note: largely subsumed once C1 SWR replaces the manual poll); EmptyState for zero-results (clear-filters) on StocksPage + Dashboard sections; ScreenerPage market-cap→Num | `pages/Dashboard.tsx`, `pages/StocksPage.tsx`, `pages/ScreenerPage.tsx` | S |
| A12 | Extract micro-pattern primitives: SideDrawer (3 copies), SectionLabel, Callout; refactor consumers | `components/ui/primitives/{SideDrawer,SectionLabel,Callout}.tsx`, FilterPanel/SettingsPanel/MobileDrawer/OpportunitiesPage | L |
| A13 | Breakpoints: derive `responsive.ts BREAKPOINTS` from the new chakraTokens `breakpoints` group (single source per §4.7); keep `useIsMobile` at md(767) | `theme/responsive.ts` (derive), `theme/design-tokens.ts`, `theme/system.ts` | S |
| A14 | Build ResponsiveTable/DataCard: auto table→all-column labeled-card below md (no column dropped); force StocksPage card mode below md | `components/ui/primitives/ResponsiveTable.tsx`, StocksPage/AlertsPage/Backtest/StockDetailPage | L |
| A15 | Mobile filter bottom-sheet (ScreenerPage all controls; stack ConditionBuilder fixed widths); sticky bars offset `top='nav'` + `env(safe-area-inset-bottom)`; 44px min touch targets | `pages/ScreenerPage.tsx`, `components/alerts/ConditionBuilder.tsx`, `pages/StocksPage.tsx`, `components/Navigation.tsx`, `components/MobileDrawer.tsx` | L |
| A16 | Author/test every screen's `base` (375px) layout; fix 768-1280 icon-only nav band | all `pages/*`, `components/Navigation.tsx` | XL |

### Workstream B — Feel-Fast (build/tooling + perf)

| # | Task | File(s) | Effort |
|---|---|---|---|
| B1 | **Fix ScreenerPage FilterInput remount** (hoist to module scope + React.memo) — CRITICAL | `pages/ScreenerPage.tsx:133,162-167` | S |
| B2 | Memoize list rows (React.memo, keyed by symbol) | `pages/StocksPage.tsx:24,85,417,425` | S |
| B3 | Defer filter/sort/search renders (`useTransition` + `useDeferredValue`) | `pages/StocksPage.tsx`, `pages/ScreenerPage.tsx` | S |
| B4 | Route-level code-splitting: React.lazy all 10 routes + Suspense (skeleton fallback) | `App.tsx:5-14,66-77` | M |
| B5 | Remove `window.location.reload()` at market open (state-driven refetch; later `invalidateQueries`) | `App.tsx:26-32`, `hooks.ts` | S |
| B6 | Remove `framer-motion` dependency (0 import sites); strike it from DESIGN_SYSTEM.md + frontend CLAUDE.md stack lines | `frontend/package.json`, `DESIGN_SYSTEM.md`, `frontend/CLAUDE.md` | S |
| B7 | Standardize icons on lucide-react; drop **react-icons AND @chakra-ui/icons** (coordinate with A8) | FilterPanel/ProgressBar/SettingsPanel/StockCard*, `components/ui/{color-mode,toggle-tip}`, all @chakra-ui/icons sites | M |
| B8 | Migrate build tool CRA→Vite SPA (vite.config: outDir=build, target=es2020, port 3001, proxy /api+/ws ws:true; root index.html; remove react-scripts); update DESIGN_SYSTEM.md + frontend CLAUDE.md stack line to "Vite" | `package.json`, `vite.config.ts` (new), `index.html`, `src/index.tsx`, `public/`, `DESIGN_SYSTEM.md`, `frontend/CLAUDE.md` | M |
| B9 | Rename env vars `REACT_APP_*`→`VITE_*` (`import.meta.env`); update .env.example/Docker build args | `api.ts:4,156`, `.env*`, docker-compose | S |
| B10 | Update frontend Dockerfile for Vite (copy root index.html + vite.config; keep `/app/build`) | `frontend/Dockerfile:15,20,26` | S |
| B11 | Migrate test runner react-scripts test → Vitest (jest.mock→vi.mock in 2 files) | `package.json`, `setupTests.ts`, `Backtest.test.tsx` | S |
| B12 | Raise compile target es5→es2020 (vite build.target + tsconfig); tighten browserslist | `tsconfig.json:3`, `vite.config.ts`, `package.json` | S |
| B13 | Bundle analyzer (rollup-plugin-visualizer) + CI gzip budget (initial route <150 KB vs 405 KB baseline) | `vite.config.ts`, CI, `package.json` | S |
| B14 | recharts render-cost: React.memo EquityChart+TradeTable, useMemo equity transform, downsample long series | `pages/Backtest.tsx` | M |
| B15 | Remove orphaned `build/sw.js` + reassess manifest (no serviceWorker.register in src) | `build/sw.js`, `manifest.json` | S |
| B16 | Hover/link prefetch for route chunks (+ detail data once data layer lands) | `components/Navigation.tsx`, StockCard/row link sites | M |

### Workstream C — Stock-Info-Up-to-Speed (backend freshness + data layer)

| # | Task | File(s) | Effort |
|---|---|---|---|
| C1 | **T0:** TanStack Query + QueryClientProvider (composed with existing SettingsProvider per §5.4); wrap getStocks/filterStocks/getStock/getStockHistory/getMarketSummary in keyed queries (staleTime~120s, SWR) | `App.tsx`, `queryClient.ts` (new), `queries.ts` (new), `api.ts` | M |
| C2 | **T0:** Cycle-signal revalidation — lift `last_cycle_completed` into new ProgressContext; invalidate `['stocks']`/`['stock']` on change | `App.tsx`, `contexts/ProgressContext.tsx` (new), `queries.ts` | S |
| C3 | **T0:** Replace market-open reload with `invalidateQueries`; drop 5s poll (keep as `isConnected===false` fallback) | `App.tsx`, `hooks.ts` | S |
| C4 | **T1:** Live-ticking relative age badge (warn past threshold) in PageHeader actions slot | `components/ui/primitives` (useRelativeTime/AgeBadge), StockDetailPage/StocksPage/ScreenerPage/Dashboard, `StockCardCompact` | M |
| C5 | **T1:** Consume `isConnected` as live-pulse dot in Navigation; surface `cached` as live/cached chip | `App.tsx`, `components/Navigation.tsx`, `hooks.ts`, `queries.ts` | S |
| C6 | **T1:** Subtle flash/pulse on price/RSI change (prev-vs-next) via registered motion token | `StockCardCompact` (StocksPage.tsx:85), `theme/design-tokens.ts`, `theme/system.ts` | M |
| C7 | **T2:** Add `WsMessage` tagged enum in models.rs + mirror TS discriminated union (wrap progress) | `src/models.rs`, `frontend/src/types.ts` | S |
| C8 | **T2:** Add `broadcast::Sender<StockAnalysis>` — create in main.rs, thread into AppState + AnalysisEngine::new | `src/main.rs`, `src/api.rs`, `src/analysis.rs` | M |
| C9 | **T2:** Send at per-symbol save success branch (analysis.rs ~407) — non-blocking, drop-on-no-receivers | `src/analysis.rs` | S |
| C10 | **T2:** Rewrite websocket_connection as `tokio::select!` (2s progress tick + stock_rx.recv); Lagged=skip+resync, Closed=break | `src/api.rs` | M |
| C11 | **T2:** Route stock_update WS → setQueryData(['stock',sym]) + coalesced list invalidation; lag→full invalidate | `frontend/src/hooks.ts`, `queries.ts` | M |
| C12 | **T2:** Strip heavy optional fields (news/technicals) from WS broadcast clone | `src/analysis.rs` (or api.rs serialize path) | S |
| C13 | **T3 (optional):** YahooFinanceClient::get_quotes_batch hitting unused v7/finance/quote, reusing crumb/circuit-breaker | `src/yahoo.rs` | M |
| C14 | **T3 (optional):** Short-cadence priority-refresh task (visible/watched set) patching quote fields + broadcasting; decouple from ANALYSIS_INTERVAL_SECS staleness knob | `src/analysis.rs`, `src/config.rs` | L |

---

## 7. Phased Roadmap (P0 → P3, cross-workstream)

Ordering rationale: front-load the **highest-impact, lowest-risk** changes and the **one critical bug**; sequence by dependency; align the redesign spine to DESIGN_SYSTEM.md's order (Nav/foundation → Dashboard → StockDetail → watchlist/screener → secondary) while interleaving the data-layer + token/primitive foundation underneath it.

### P0 — Foundation (de-risk, unblock everything, capture cheap wins)
*Goal: data layer, token/primitive foundation, and the critical bug — most of "feel fast/up to speed" at near-zero risk, no framework change yet.*
- **B1** ScreenerPage FilterInput remount (CRITICAL — never bury a critical fix late).
- **C1, C2, C3** TanStack Query + cycle-signal revalidation + drop reload/poll. *(Biggest combined feel-fast + freshness win, no backend change. Also subsumes the Dashboard poll-blanking fix per A11.)*
- **A1, A2, A5** token groups (motion/skeleton/chart/breakpoints, warn/info repoint) + Skeleton + ErrorState primitives. *(Unblocks B4 fallback, A10 skeletons, C SWR placeholders.)*
- **A7** delete dead code (before sweeps, so scope counts are accurate).
- **A13** breakpoint derivation (depends on A1's breakpoints group; unblocks all responsive tasks).
- **B6** remove framer-motion (trivial, shrinks install; reconcile design doc).
- **A6** focus-visible + hover-gating at primitive layer (one task, both tracks).

### P1 — Build modernization + perceived speed + Dashboard/Nav redesign
*Goal: Vite migration, code-splitting, skeletons everywhere, and the first redesign screens (foundation→Dashboard) per DESIGN_SYSTEM.md.*
- **B4** route code-splitting (skeleton fallback now available from A2).
- **B8, B9, B10, B11, B12, B13, B15** Vite migration cluster (do **after** B4 so chunking is verifiable; after dep cleanup). Reconcile stack lines.
- **B2, B3** memoize rows + defer renders.
- **A10 (partial), A11** skeleton/empty-state + badge/colorPalette sweep on Dashboard + StocksPage; Dashboard maxW + poll-blanking finalize.
- **C4, C5** freshness UX (age badge + live pulse + cached chip).
- **A8, B7** migrate holdout components + unify icons across all three libs (coordinated single pass).

### P2 — StockDetail + watchlist/screener redesign + WS live push
*Goal: the laggard screen, the dense table/screener surfaces, and true per-ticker liveness.*
- **A9** StockDetailPage XL adoption pass (PageHeader/StatBlock/Surface/Num/tabs/emoji + error-vs-not-found split).
- **A3, A4, A14** DataTable + chartTheme + ResponsiveTable; rebuild AlertsPage PositionsTab.
- **A10 (remainder), A12** finish badge sweep on AlertsPage/Screener/Sector; extract SideDrawer/SectionLabel/Callout.
- **C7, C8, C9, C10, C11, C12** WS broadcast stock-push (perceived liveness) end-to-end.
- **B14, B16** recharts render-cost + route/data prefetch.
- **A15** mobile filter bottom-sheet (after B1 lands).
- **Light-mode reachability decision** (wire the existing color-mode toggle + TradingView theme follows `useColorMode` + scrollbar tokens) — *or defer to P3* (see §9).

### P3 — Genuine freshness + cohesion polish
*Goal: actually-fresher data on the priority set, secondary-screen cohesion, mobile completeness.*
- **C13, C14** optional v7 batch-quote layer + decoupled short-cadence priority refresh.
- **A16** author/test every screen's 375px base + nav band fix.
- Secondary-screen cohesion sweep (Opportunities/Funds/News/Sector remaining items, AlertsPage tabs).
- Light-mode reachability if deferred from P2.

---

## 8. Per-Page / Per-Component Redesign Checklist (all 21 surfaces — none omitted)

### Pages (10)
- **Dashboard** — Fix `container.xl`→`maxW='page'` (A11). **Fix poll-blanking** (spinner only when `summary===null`; keep data + subtle "updating") (A11/C1). EmptyState for empty sections (`:256/271/286/301`). Skeleton replaces full-screen spinner. Add FreshnessChip. Sweep 2 raw Badge.
- **StocksPage** — Force card mode below md; ResponsiveTable. React.memo `StockTableRow`+`StockCardCompact`. EmptyState zero-results (clear-filters). Skeleton rows. AgeBadge + price-flash on `StockCardCompact`. Sweep 2 raw Badge. `useTransition` on filter/sort.
- **StockDetailPage (XL)** — PageHeader for quote header; StatBlock for KPI grids (replace local StatCard/ProfileMetricCard); Surface raised for ~9 Card.Root; route 51 toFixed→Num; data-driven tab bar (replace 7 Buttons); emoji→lucide; **distinct ErrorState (fetch failure) vs not-found 404** (`:149-153`); technical tables→ResponsiveTable; revalidate indicators so they track the live TradingView chart; AgeBadge.
- **ScreenerPage** — **B1 FilterInput hoist (CRITICAL)**. Market-cap→Num (not SignalBadge, `:341-348`). Mobile filter bottom-sheet (all controls). Skeleton. EmptyState already present (good). Sweep 4 colorPalette.
- **AlertsPage** — Rebuild PositionsTab on DataTable + StatBlock (`:401-468`); replace green.500/red.500→signal tokens; fmtMoney/fmtPct→Num; 5 bare spinners→skeletons keeping tab chrome; add catch+toast to InboxTab (`:996-1004`); sweep 13 colorPalette.
- **OpportunitiesPage** — AI banner→Callout primitive; error branch distinct from EmptyState. Already strong (3 Num, 0 raw).
- **FundsPage** — Error+retry branch. Already strong (StatBlock, 2 Num, 0 raw).
- **NewsPage** — NewsCard migration covers it; ensure EmptyState/Error distinct. (0 numerics.)
- **SectorPage** — Performance % inside SignalBadge→Num with sign='always' (`:147-148,162-163`); fetch-failure→ErrorState not EmptyState (`:188-207`).
- **Backtest** — Reference exemplar. Extract DataTable + chartTheme from it (A3/A4); fmtMoney/fmtPct→Num in TradeTable; React.memo + downsample (B14). Keep as the canonical pattern.

### Major components (11)
- **Navigation** — Live-pulse dot (isConnected); wire existing color-mode toggle (if light mode in scope); `_focusVisible` on NavItem; consolidate `formatMarketCap`; 44px touch targets; resolve 768-1280 icon-only band; hover-gating.
- **MobileDrawer** — Becomes SideDrawer consumer (A12); verify 44px rows; placement='bottom' reuse for filter sheets.
- **StockCard** — **DELETE (dead, zero importers, A7).** Freshness features go to `StockCardCompact` (StocksPage.tsx:85), not here.
- **FilterPanel** — Migrate to Surface/SignalBadge/Num; SideDrawer + SectionLabel; lucide (remove `as any`); mobile widths.
- **StockDetailModal** — **DELETE (dead, 439 LOC, zero importers, A7).** Remove stray console.log. If a quick-look is ever wanted, build as a thin wrapper reusing StockDetailPage sections (not a parallel copy).
- **SettingsPanel** — Migrate to Surface/SignalBadge; SideDrawer + SectionLabel; extract `PRICE_CHANGE_TIERS` constant (replace magic-number slider mapping `:253-263`); lucide.
- **ProgressBar** — Already primitives-adopted; finish lucide (remove `as any` casts); Num for cycle time.
- **NewsCard** — Card.Root→Surface raised; raw Badge→SignalBadge (`sentimentTone()`→SignalTone); aria-label on external link; lucide.
- **MarkdownContent** — Verify it renders under code-split StockDetailPage chunk; ensure typography tokens; no raw colors. (Thin: keep — audit for token use during A9.)
- **ConditionBuilder** — Migrate 4 colorPalette→tone; stack fixed-width rows below md (`w='260px'`/`w='120px'`); aria-labels on add/delete IconButtons; SideDrawer where applicable.
- **WatchButton** — `_focusVisible`; represent watch state via `aria-selected`/role, not a `'✓ '` text glyph (`:110`). (Keep — already lucide.)

---

## 9. Risks & Migration Concerns (what to verify)

**CRA → Vite (B8):**
- `build.outDir='build'` is **mandatory** — Vite defaults to `dist/`; without it `Dockerfile:26` (copies `/app/build`→nginx) breaks.
- Vite needs **explicit `/ws` proxy with `ws:true`** — CRA's blanket `package.json` proxy handled WS implicitly; dev WS (`api.getWebSocketUrl→/ws`) breaks otherwise. Prod nginx already upgrades /ws.
- Env-var rename `REACT_APP_*`→`VITE_*` + `import.meta.env` is a breaking config change — update `.env.example`, docker-compose build args, deploy pipeline.
- Move `public/index.html`→root `index.html` (drop `%PUBLIC_URL%`, add `<script type="module">`); Vitest mock conversion (`jest.mock`→`vi.mock`) in 2 test files.
- **Reconcile docs:** update the stack line in `DESIGN_SYSTEM.md` and `frontend/CLAUDE.md` from "CRA" to "Vite" and strike "framer-motion."
- **Verify:** `make rebuild` produces a working image; `./test_api.sh` passes; dev `npm start` proxies /api + /ws.

**WS contract change (C7-C11):**
- The current message is **bare `AnalysisProgress`**; the new tagged enum wraps it — both ends must ship together. Verify old clients aren't left mid-deploy expecting bare payloads.
- **`RecvError::Lagged` is a normal path** (per-symbol sends across a cycle) — must NOT break the connection; route to client revalidation.
- Avoid render storm: targeted `setQueryData` + **coalesced** list invalidation, not per-message list invalidation.
- **Verify:** does any proxy (nginx) buffer WS frames or time out idle sockets? The 2s tick acts as keepalive; the `select!` rewrite must preserve it.

**Backend cadence (C14):**
- Do **not** simply lower `ANALYSIS_INTERVAL_SECS` — it's coupled to the staleness skip (`analysis.rs:309`) and bounded by Yahoo 429, not compute. Decouple long full-universe cycle from short priority refresh.
- v7 quotes are still ~15 min delayed for many feeds — bound priority set + poll interval; reuse crumb/circuit-breaker.

**Light-mode reachability (decision, not a committed must-do):**
- The brief does not mandate light mode; the `_light` tokens stay warm regardless. **This is mostly a wiring task, not build-from-scratch:** `next-themes` is already a dependency and `components/ui/color-mode.tsx` already exists. **Decide in P2/P3:** wire the existing color-mode toggle into Navigation + make the TradingView theme follow `useColorMode` + tokenize scrollbar hex, OR ship dark-only-reachable. Do not pin TradingView dark if light mode ships.

**Provider composition (C1/C2):**
- `App.tsx` already wraps the tree in `<SettingsProvider>` (`:59`). New providers must compose with it — `QueryClientProvider` > `SettingsProvider` > `Router` > `ProgressContext` — not replace it.

**General:** Skeleton primitive sequencing (ship route-split with plain placeholder if not ready); icon migration touches files across A8 and B7 and spans **three** libraries — single coordinated pass; ScreenerPage hoist (B1) must precede mobile filter-sheet (A15).

---

## 10. Definition of Done (per pillar)

**(A) Frontend redesign:**
- 0 raw `<Badge colorPalette>` and 0 `colorPalette="green|red|…"` literals in screen code; SignalBadge used for all signal states.
- 0 hardcoded hex/rgba in screen code (scrollbar tokenized); 5 holdout components import primitives; 2 dead files deleted.
- All numeric display routed through Num (toFixed eliminated from screen code); StatBlock used for all KPI grids.
- All 21 surfaces pass the Screen Review Protocol; every page has distinct empty vs error states; every screen authored/tested at 375px.
- Motion/skeleton/chart/breakpoints tokens registered; warn/info `.solid`/`.fg` on brand ramps; breakpoints single-sourced from `chakraTokens`.

**(B) Feel-fast:**
- Build tool is Vite; `npm run build` emits per-route chunks; initial Dashboard route <150 KB gzip (from 405 KB baseline), enforced by CI budget.
- 0 full-screen spinners on load (skeletons everywhere); ScreenerPage FilterInput retains focus while typing; no `window.location.reload()` in the app; framer-motion removed; **exactly one icon library (lucide-react) — `react-icons` AND `@chakra-ui/icons` removed from deps**; target es2020; Vitest green; Docker image builds and serves.
- `DESIGN_SYSTEM.md` + `frontend/CLAUDE.md` stack lines reconciled (Vite; no framer-motion).

**(C) Stock-info-up-to-speed:**
- Client data layer (TanStack Query) live and composed under the existing SettingsProvider; navigations hit cache; all mounted views silently revalidate on cycle completion; window-focus refetch works.
- Freshness visible: ticking relative age (warn past threshold), live-pulse from isConnected, `cached` chip.
- WS pushes `StockUpdate` over the tagged envelope; detail/list views update without full refetch; Lagged handled via revalidation; no render storm; dwell-time no longer adds unbounded staleness.
- (T3, if shipped) priority-set quote fields refresh on a bounded short cadence without raising 429 incidents.
