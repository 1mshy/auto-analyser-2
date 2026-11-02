/**
 * Dark-first visual system for the stock analyzer UI.
 *
 * Direction: Koyfin-like finance workspace - calm, editorial, data dense,
 * with flat surfaces, precise borders, and tabular numeric typography.
 */

export const designTokens = {
  color: {
    canvas: "var(--color-paper)",
    surface: "var(--color-paper-2)",
    surfaceRaised: "var(--color-paper-3)",
    surfaceInset: "var(--color-paper)",
    rowHover: "var(--color-paper-3)",
    rowActive: "var(--color-paper-3)",
    borderSubtle: "var(--color-rule)",
    borderDefault: "var(--color-rule)",
    borderStrong: "#384355",
    textPrimary: "var(--color-ink)",
    textSecondary: "var(--color-ink-2)",
    textMuted: "var(--color-ink-2)",
    accent: "#4ea1ff",
    accentMuted: "rgba(78, 161, 255, 0.16)",
    positive: "#2ebd85",
    negative: "#ff5c70",
  },
  typography: {
    ui: "var(--font-body)",
    numeric: "var(--font-outlier)",
    features: '"cv11", "ss01", "ss03"',
    numericFeatures: '"tnum", "zero"',
  },
  space: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    "2xl": "32px",
    "3xl": "48px",
  },
  radii: {
    xs: "2px",
    sm: "4px",
    md: "6px",
    lg: "8px",
    xl: "10px",
    pill: "999px",
  },
  shadow: {
    raised: "0 1px 0 rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04)",
    overlay: "0 18px 48px rgba(0, 0, 0, 0.52)",
  },
  motion: {
    fast: "120ms ease",
    standard: "180ms ease",
    slow: "240ms ease",
  },
  layout: {
    pageMaxWidth: "1440px",
    densePanelWidth: "360px",
    navHeight: "56px",
  },
} as const;

/**
 * Breakpoint scale in px — the single source of truth for both Chakra's
 * responsive system (via `chakraBreakpoints`) and the JS-level helpers in
 * `responsive.ts`. Change values here and both layers stay in sync.
 */
export const breakpointPx = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

/** Chakra `theme.breakpoints` form (px strings) derived from `breakpointPx`. */
export const chakraBreakpoints = {
  sm: `${breakpointPx.sm}px`,
  md: `${breakpointPx.md}px`,
  lg: `${breakpointPx.lg}px`,
  xl: `${breakpointPx.xl}px`,
  "2xl": `${breakpointPx["2xl"]}px`,
};

export const chakraGlobalCss = {
  "html, body": {
    bg: "bg.canvas",
    color: "fg.default",
    fontFeatureSettings: designTokens.typography.features,
  },
  "*::selection": {
    bg: "accent.muted",
    color: "accent.fg",
  },
  "*:focus-visible": {
    outline: "2px solid",
    outlineColor: "accent.solid",
    outlineOffset: "2px",
  },
  "::-webkit-scrollbar": {
    width: "10px",
    height: "10px",
  },
  "::-webkit-scrollbar-track": {
    bg: "transparent",
  },
  "::-webkit-scrollbar-thumb": {
    bg: "border.default",
    borderRadius: "md",
  },
  "::-webkit-scrollbar-thumb:hover": {
    bg: "border.emphasis",
  },
  "@media (prefers-reduced-motion: reduce)": {
    "*, *::before, *::after": {
      transition: "none !important",
    },
  },
};

export const chakraTokens = {
  fonts: {
    body: {
      value: designTokens.typography.ui,
    },
    heading: {
      value: designTokens.typography.ui,
    },
    mono: {
      value: designTokens.typography.numeric,
    },
  },
  spacing: {
    xs: { value: designTokens.space.xs },
    sm: { value: designTokens.space.sm },
    md: { value: designTokens.space.md },
    lg: { value: designTokens.space.lg },
    xl: { value: designTokens.space.xl },
    "2xl": { value: designTokens.space["2xl"] },
    "3xl": { value: designTokens.space["3xl"] },
  },
  radii: {
    xs: { value: designTokens.radii.xs },
    sm: { value: designTokens.radii.sm },
    md: { value: designTokens.radii.md },
    lg: { value: designTokens.radii.lg },
    xl: { value: designTokens.radii.xl },
    full: { value: designTokens.radii.pill },
  },
  sizes: {
    page: { value: designTokens.layout.pageMaxWidth },
    densePanel: { value: designTokens.layout.densePanelWidth },
    nav: { value: designTokens.layout.navHeight },
  },
  durations: {
    fast: { value: "120ms" },
    standard: { value: "180ms" },
    slow: { value: "240ms" },
  },
  colors: {
    canvas: { value: designTokens.color.canvas },
    surface: { value: designTokens.color.surface },
    surfaceRaised: { value: designTokens.color.surfaceRaised },
    surfaceInset: { value: designTokens.color.surfaceInset },
    hairline: { value: designTokens.color.borderSubtle },
    hairlineDefault: { value: designTokens.color.borderDefault },
    hairlineStrong: { value: designTokens.color.borderStrong },
    rowHover: { value: designTokens.color.rowHover },
    rowActive: { value: designTokens.color.rowActive },
    textPrimary: { value: designTokens.color.textPrimary },
    textSecondary: { value: designTokens.color.textSecondary },
    textMuted: { value: designTokens.color.textMuted },
    accent: {
      50: { value: "#edf6ff" },
      100: { value: "#d5eaff" },
      200: { value: "#add7ff" },
      300: { value: "#84c3ff" },
      400: { value: "#67b2ff" },
      500: { value: designTokens.color.accent },
      600: { value: "#2f7fd4" },
      700: { value: "#2262a6" },
      800: { value: "#164878" },
      900: { value: "#0d2f50" },
    },
    signalUp: {
      50: { value: "#e7f8f0" },
      100: { value: "#c4ecd9" },
      200: { value: "#99dfbd" },
      300: { value: "#6dd29f" },
      400: { value: "#45c486" },
      500: { value: designTokens.color.positive },
      600: { value: "#239c6c" },
      700: { value: "#1a7954" },
      800: { value: "#11563b" },
      900: { value: "#083523" },
    },
    signalDown: {
      50: { value: "#fff0f2" },
      100: { value: "#ffd7dd" },
      200: { value: "#ffb3bf" },
      300: { value: "#ff8a9a" },
      400: { value: "#ff7083" },
      500: { value: designTokens.color.negative },
      600: { value: "#d93d51" },
      700: { value: "#a92d3f" },
      800: { value: "#771d2c" },
      900: { value: "#480f19" },
    },
    signalWarn: {
      50: { value: "#fdf3e0" },
      100: { value: "#fbe2b8" },
      200: { value: "#f8cd84" },
      300: { value: "#f5c46b" },
      400: { value: "#f5b13f" },
      500: { value: "#f5a524" },
      600: { value: "#d4860a" },
      700: { value: "#a66708" },
      800: { value: "#7a4c08" },
      900: { value: "#4d3005" },
    },
    signalInfo: {
      50: { value: "#eaf5ff" },
      100: { value: "#cfe8ff" },
      200: { value: "#a6d4fb" },
      300: { value: "#9ccdf9" },
      400: { value: "#7ec0f8" },
      500: { value: "#64b5f6" },
      600: { value: "#3f93d8" },
      700: { value: "#2f72ab" },
      800: { value: "#21527c" },
      900: { value: "#14334e" },
    },
  },
} as const;

export const chakraSemanticTokens = {
  colors: {
    "bg.canvas": {
      value: "var(--color-paper)",
    },
    "bg.surface": {
      value: "var(--color-paper-2)",
    },
    "bg.surfaceRaised": {
      value: "var(--color-paper-3)",
    },
    "bg.inset": {
      value: "var(--color-paper)",
    },
    "bg.muted": {
      value: "var(--color-paper-3)",
    },
    "bg.emphasized": {
      value: "var(--color-paper-3)",
    },
    "bg.subtle": {
      value: "var(--color-paper)",
    },
    "bg.panel": {
      value: "var(--color-paper-2)",
    },

    "border.subtle": {
      value: "var(--color-rule)",
    },
    "border.default": {
      value: "var(--color-rule)",
    },
    "border.emphasis": {
      value: { _light: "{colors.gray.400}", _dark: "{colors.hairlineStrong}" },
    },
    "border.muted": {
      value: "var(--color-rule)",
    },
    "border.emphasized": {
      value: { _light: "{colors.gray.300}", _dark: "{colors.hairlineStrong}" },
    },

    "fg.default": {
      value: "var(--color-ink)",
    },
    "fg.muted": {
      value: "var(--color-ink-2)",
    },
    "fg.subtle": {
      value: "var(--color-ink-2)",
    },

    "accent.solid": {
      value: { _light: "{colors.accent.600}", _dark: "{colors.accent.500}" },
    },
    "accent.muted": {
      value: { _light: "{colors.accent.100}", _dark: designTokens.color.accentMuted },
    },
    "accent.subtle": {
      value: { _light: "{colors.accent.50}", _dark: "rgba(78, 161, 255, 0.08)" },
    },
    "accent.fg": {
      value: { _light: "{colors.accent.700}", _dark: "{colors.accent.300}" },
    },
    "accent.emphasis": {
      value: { _light: "{colors.accent.700}", _dark: "{colors.accent.400}" },
    },

    "signal.up.solid": {
      value: { _light: "{colors.signalUp.600}", _dark: "{colors.signalUp.500}" },
    },
    "signal.up.fg": {
      value: { _light: "{colors.signalUp.700}", _dark: "{colors.signalUp.300}" },
    },
    "signal.up.muted": {
      value: { _light: "{colors.signalUp.100}", _dark: "rgba(46, 189, 133, 0.16)" },
    },
    "signal.up.subtle": {
      value: { _light: "{colors.signalUp.50}", _dark: "rgba(46, 189, 133, 0.08)" },
    },

    "signal.down.solid": {
      value: { _light: "{colors.signalDown.600}", _dark: "{colors.signalDown.500}" },
    },
    "signal.down.fg": {
      value: { _light: "{colors.signalDown.700}", _dark: "{colors.signalDown.300}" },
    },
    "signal.down.muted": {
      value: { _light: "{colors.signalDown.100}", _dark: "rgba(255, 92, 112, 0.16)" },
    },
    "signal.down.subtle": {
      value: { _light: "{colors.signalDown.50}", _dark: "rgba(255, 92, 112, 0.08)" },
    },

    "signal.warn.solid": {
      value: { _light: "{colors.signalWarn.600}", _dark: "{colors.signalWarn.500}" },
    },
    "signal.warn.fg": {
      value: { _light: "{colors.signalWarn.700}", _dark: "{colors.signalWarn.300}" },
    },
    "signal.warn.muted": {
      value: { _light: "{colors.signalWarn.100}", _dark: "rgba(245, 165, 36, 0.16)" },
    },
    "signal.warn.subtle": {
      value: { _light: "{colors.signalWarn.50}", _dark: "rgba(245, 165, 36, 0.08)" },
    },

    "signal.info.solid": {
      value: { _light: "{colors.signalInfo.600}", _dark: "{colors.signalInfo.500}" },
    },
    "signal.info.fg": {
      value: { _light: "{colors.signalInfo.700}", _dark: "{colors.signalInfo.300}" },
    },
    "signal.info.muted": {
      value: { _light: "{colors.signalInfo.100}", _dark: "rgba(100, 181, 246, 0.16)" },
    },
    "signal.info.subtle": {
      value: { _light: "{colors.signalInfo.50}", _dark: "rgba(100, 181, 246, 0.08)" },
    },

    "skeleton.base": {
      value: { _light: "#e4e4e7", _dark: "#151b24" },
    },
    "skeleton.highlight": {
      value: { _light: "#f4f4f5", _dark: "#202633" },
    },

    "chart.grid": {
      value: "var(--color-rule)",
    },
    "chart.axis": {
      value: "var(--color-ink-2)",
    },
    "chart.series.1": { value: "var(--color-accent)" },
    "chart.series.2": { value: "var(--color-positive)" },
    "chart.series.3": { value: "var(--color-chart-warn)" },
    "chart.series.4": { value: "var(--color-negative)" },
    "chart.series.5": { value: "var(--color-chart-info)" },
    "chart.series.6": { value: "var(--color-chart-alternate)" },
  },
  shadows: {
    "elevation.raised": {
      value: {
        _light: "0 1px 0 rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)",
        _dark: designTokens.shadow.raised,
      },
    },
    "elevation.overlay": {
      value: {
        _light: "0 8px 24px rgba(15, 23, 42, 0.08)",
        _dark: designTokens.shadow.overlay,
      },
    },
  },
} as const;
