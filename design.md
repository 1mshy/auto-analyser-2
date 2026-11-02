# Design — Auto Analyser

A shared design system for the stock research workspace. Extend this system rather than choosing a different theme for each page.

## Direction
Modern minimal research workbench. Dark blue-grey surfaces, restrained blue accent, numeric typography, persistent grouped side navigation, and full-width content. Preserve the existing Inter / JetBrains Mono pairing to keep financial data readable and avoid unnecessary font downloads. Headings are upright, clear, and compact. No ornamental images, gradients, hero sections, or invented metrics.

## Structure
- App shell: grouped desktop sidebar, mobile drawer, global symbol search, connection state, appearance and universe settings.
- Overview: named personal layouts containing independently configurable panels. Loading, failure, and empty states belong to each data source.
- Discovery: saved views above a unified search/filter toolbar and wide sortable table. Pagination stays below data.
- Stock research: price chart first, non-price indicators in separate panes, secondary research in tabs.
- Remaining routes retain their domain workflows and inherit shared page headers, surfaces, theme and navigation.

## Tokens and typography
Canonical portable tokens: `tokens.css`. Chakra adapter: `frontend/src/theme/design-tokens.ts`. Recharts uses semantic CSS variables through `frontend/src/theme/chartTheme.ts`, so charts follow appearance changes.
- Body: Inter, 400/500; headings: Inter, 700; numbers: JetBrains Mono, tabular.
- Spacing follows the existing 4px scale; panels use 16–24px internal space.
- Controls use modest 4–8px radii and visible focus rings. Panels are flat, separated by quiet borders.
- Colour is reinforced by signs, arrows, labels, and chart descriptions.

## Interaction
Customization is local to this browser. Changes apply immediately, with named presets and reset. Every reorder operation has explicit up/down buttons. Server mutation forms use draft state until Apply/Save. No automatic chart animation or decorative motion; reduced-motion is respected. Navigation and control labels stay on one line; containers reflow. Root overflow is clipped, while wide tables use labelled local scrolling regions.

## Data integrity
Never infer market-wide breadth from capped leaderboards. Show observed shortlist sizes only as shortlist sizes. Display currencies from source data. Missing prices/RSI remain unavailable, never zero. Disconnected streaming does not imply market closure. Do not fabricate historical data or investment outcomes.

## Exports

The app executes the portable CSS and Chakra adapter. The other formats below are copies for reuse in another project; no Tailwind or shadcn runtime was added. Regenerate these examples when the canonical token file changes.

### CSS custom properties

Root `tokens.css` re-exports `frontend/src/theme/tokens.css`. This keeps the frontend Docker build self-contained. The complete portable values are:

```css
/* Hallmark · macrostructure: Workbench · tone: technical · anchor hue: blue
 * genre: modern-minimal · design-system: design.md · designed-as-app
 * pre-emit critique: P4 H4 E4 S5 R5 V4 */
:root {
  --color-paper: oklch(98% 0.004 255);
  --color-paper-2: oklch(99.5% 0.002 255);
  --color-paper-3: oklch(96% 0.006 255);
  --color-ink: oklch(24% 0.025 255);
  --color-ink-2: oklch(44% 0.025 255);
  --color-rule: oklch(89% 0.012 255);
  --color-accent: oklch(52% 0.17 255);
  --color-accent-ink: oklch(98% 0.004 255);
  --color-focus: oklch(58% 0.18 255);
  --color-positive: oklch(48% 0.11 165);
  --color-negative: oklch(52% 0.18 20);
  --color-chart-warn: oklch(53% 0.12 75);
  --color-chart-info: oklch(49% 0.10 220);
  --color-chart-alternate: oklch(52% 0.16 300);
  --font-display: Inter, ui-sans-serif, sans-serif;
  --font-body: Inter, ui-sans-serif, sans-serif;
  --font-outlier: 'JetBrains Mono', ui-monospace, monospace;
  --space-xs: 4px; --space-sm: 8px; --space-md: 12px; --space-lg: 16px;
  --space-xl: 24px; --space-2xl: 32px; --space-3xl: 48px;
  --text-xs: .75rem; --text-sm: .875rem; --text-base: 1rem;
  --text-lg: 1.25rem; --text-xl: 1.75rem; --text-display: clamp(1.5rem, 2vw, 2rem);
  --ease-out: cubic-bezier(.16,1,.3,1); --ease-in: cubic-bezier(.7,0,.84,0);
  --ease-in-out: cubic-bezier(.65,0,.35,1);
  --dur-micro: 120ms; --dur-short: 220ms;
  --rule-width: 1px; --radius-sm: 4px; --radius-md: 6px; --radius-lg: 8px;
  --sidebar-width: 216px;
}
.dark {
  --color-paper: oklch(16% 0.018 255);
  --color-paper-2: oklch(19% 0.02 255);
  --color-paper-3: oklch(23% 0.022 255);
  --color-ink: oklch(95% 0.008 255);
  --color-ink-2: oklch(72% 0.018 255);
  --color-rule: oklch(30% 0.022 255);
  --color-accent: oklch(74% 0.135 250);
  --color-accent-ink: oklch(16% 0.018 255);
  --color-focus: oklch(78% 0.135 250);
  --color-positive: oklch(77% 0.14 165);
  --color-negative: oklch(74% 0.15 20);
  --color-chart-warn: oklch(80% 0.14 80);
  --color-chart-info: oklch(78% 0.10 220);
  --color-chart-alternate: oklch(76% 0.13 300);
}
```

### Tailwind v4

Use this with Tailwind in a separate project. Dark-mode colors override the same names.

```css
@theme {
  --color-paper: oklch(98% 0.004 255);
  --color-paper-2: oklch(99.5% 0.002 255);
  --color-paper-3: oklch(96% 0.006 255);
  --color-ink: oklch(24% 0.025 255);
  --color-ink-2: oklch(44% 0.025 255);
  --color-rule: oklch(89% 0.012 255);
  --color-accent: oklch(52% 0.17 255);
  --color-accent-ink: oklch(98% 0.004 255);
  --color-focus: oklch(58% 0.18 255);
  --color-positive: oklch(48% 0.11 165);
  --color-negative: oklch(52% 0.18 20);
  --color-chart-warn: oklch(53% 0.12 75);
  --color-chart-info: oklch(49% 0.10 220);
  --color-chart-alternate: oklch(52% 0.16 300);
  --font-display: Inter, ui-sans-serif, sans-serif;
  --font-body: Inter, ui-sans-serif, sans-serif;
  --font-outlier: 'JetBrains Mono', ui-monospace, monospace;
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 24px;
  --spacing-2xl: 32px;
  --spacing-3xl: 48px;
  --text-xs: .75rem;
  --text-sm: .875rem;
  --text-base: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.75rem;
  --text-display: clamp(1.5rem, 2vw, 2rem);
  --ease-out: cubic-bezier(.16,1,.3,1);
  --ease-in: cubic-bezier(.7,0,.84,0);
  --ease-in-out: cubic-bezier(.65,0,.35,1);
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
}
.dark {
  --color-paper: oklch(16% 0.018 255);
  --color-paper-2: oklch(19% 0.02 255);
  --color-paper-3: oklch(23% 0.022 255);
  --color-ink: oklch(95% 0.008 255);
  --color-ink-2: oklch(72% 0.018 255);
  --color-rule: oklch(30% 0.022 255);
  --color-accent: oklch(74% 0.135 250);
  --color-accent-ink: oklch(16% 0.018 255);
  --color-focus: oklch(78% 0.135 250);
  --color-positive: oklch(77% 0.14 165);
  --color-negative: oklch(74% 0.15 20);
  --color-chart-warn: oklch(80% 0.14 80);
  --color-chart-info: oklch(78% 0.10 220);
  --color-chart-alternate: oklch(76% 0.13 300);
}
```

### DTCG JSON

Merge the dark group over light when selecting dark mode. The responsive display size exports its maximum of `2rem`; retain the clamp in CSS.

```json
{
  "light": {
    "color-paper": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.98,0.004,255.0]}},
    "color-paper-2": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.995,0.002,255.0]}},
    "color-paper-3": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.96,0.006,255.0]}},
    "color-ink": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.24,0.025,255.0]}},
    "color-ink-2": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.44,0.025,255.0]}},
    "color-rule": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.89,0.012,255.0]}},
    "color-accent": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.52,0.17,255.0]}},
    "color-accent-ink": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.98,0.004,255.0]}},
    "color-focus": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.58,0.18,255.0]}},
    "color-positive": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.48,0.11,165.0]}},
    "color-negative": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.52,0.18,20.0]}},
    "color-chart-warn": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.53,0.12,75.0]}},
    "color-chart-info": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.49,0.1,220.0]}},
    "color-chart-alternate": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.52,0.16,300.0]}},
    "font-display": {"$type": "fontFamily","$value": ["Inter","ui-sans-serif","sans-serif"]},
    "font-body": {"$type": "fontFamily","$value": ["Inter","ui-sans-serif","sans-serif"]},
    "font-outlier": {"$type": "fontFamily","$value": ["JetBrains Mono","ui-monospace","monospace"]},
    "space-xs": {"$type": "dimension","$value": {"value": 4.0,"unit": "px"}},
    "space-sm": {"$type": "dimension","$value": {"value": 8.0,"unit": "px"}},
    "space-md": {"$type": "dimension","$value": {"value": 12.0,"unit": "px"}},
    "space-lg": {"$type": "dimension","$value": {"value": 16.0,"unit": "px"}},
    "space-xl": {"$type": "dimension","$value": {"value": 24.0,"unit": "px"}},
    "space-2xl": {"$type": "dimension","$value": {"value": 32.0,"unit": "px"}},
    "space-3xl": {"$type": "dimension","$value": {"value": 48.0,"unit": "px"}},
    "text-xs": {"$type": "dimension","$value": {"value": 0.75,"unit": "rem"}},
    "text-sm": {"$type": "dimension","$value": {"value": 0.875,"unit": "rem"}},
    "text-base": {"$type": "dimension","$value": {"value": 1.0,"unit": "rem"}},
    "text-lg": {"$type": "dimension","$value": {"value": 1.25,"unit": "rem"}},
    "text-xl": {"$type": "dimension","$value": {"value": 1.75,"unit": "rem"}},
    "text-display": {"$type": "dimension","$value": {"value": 2.0,"unit": "rem"}},
    "ease-out": {"$type": "cubicBezier","$value": [0.16,1.0,0.3,1.0]},
    "ease-in": {"$type": "cubicBezier","$value": [0.7,0.0,0.84,0.0]},
    "ease-in-out": {"$type": "cubicBezier","$value": [0.65,0.0,0.35,1.0]},
    "dur-micro": {"$type": "duration","$value": {"value": 120.0,"unit": "ms"}},
    "dur-short": {"$type": "duration","$value": {"value": 220.0,"unit": "ms"}},
    "rule-width": {"$type": "dimension","$value": {"value": 1.0,"unit": "px"}},
    "radius-sm": {"$type": "dimension","$value": {"value": 4.0,"unit": "px"}},
    "radius-md": {"$type": "dimension","$value": {"value": 6.0,"unit": "px"}},
    "radius-lg": {"$type": "dimension","$value": {"value": 8.0,"unit": "px"}},
    "sidebar-width": {"$type": "dimension","$value": {"value": 216.0,"unit": "px"}}
  },
  "dark": {
    "color-paper": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.16,0.018,255.0]}},
    "color-paper-2": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.19,0.02,255.0]}},
    "color-paper-3": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.23,0.022,255.0]}},
    "color-ink": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.95,0.008,255.0]}},
    "color-ink-2": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.72,0.018,255.0]}},
    "color-rule": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.3,0.022,255.0]}},
    "color-accent": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.74,0.135,250.0]}},
    "color-accent-ink": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.16,0.018,255.0]}},
    "color-focus": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.78,0.135,250.0]}},
    "color-positive": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.77,0.14,165.0]}},
    "color-negative": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.74,0.15,20.0]}},
    "color-chart-warn": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.8,0.14,80.0]}},
    "color-chart-info": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.78,0.1,220.0]}},
    "color-chart-alternate": {"$type": "color","$value": {"colorSpace": "oklch","components": [0.76,0.13,300.0]}}
  }
}
```

### shadcn/ui CSS variables

Import the canonical CSS first. This adapter uses complete CSS color values and follows the light/dark tokens automatically; consumers can reference `var(--background)` directly.

```css
:root {
  --background: var(--color-paper);
  --foreground: var(--color-ink);
  --card: var(--color-paper-2);
  --card-foreground: var(--color-ink);
  --popover: var(--color-paper-2);
  --popover-foreground: var(--color-ink);
  --primary: var(--color-accent);
  --primary-foreground: var(--color-accent-ink);
  --secondary: var(--color-paper-3);
  --secondary-foreground: var(--color-ink-2);
  --muted: var(--color-paper-3);
  --muted-foreground: var(--color-ink-2);
  --accent: var(--color-paper-3);
  --accent-foreground: var(--color-ink);
  --destructive: var(--color-negative);
  --border: var(--color-rule);
  --input: var(--color-rule);
  --ring: var(--color-focus);
  --radius: var(--radius-lg);
}
```
