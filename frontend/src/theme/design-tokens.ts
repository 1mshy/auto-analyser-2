/**
 * Dark-first visual system for the stock analyzer UI.
 *
 * Direction: Koyfin-like finance workspace - calm, editorial, data dense,
 * with flat surfaces, precise borders, and tabular numeric typography.
 */

export const designTokens = {
  color: {
    canvas: "#080a0f",
    surface: "#0f131a",
    surfaceRaised: "#141922",
    surfaceInset: "#0b0e14",
    rowHover: "#151b24",
    rowActive: "#182231",
    borderSubtle: "#202633",
    borderDefault: "#283141",
    borderStrong: "#384355",
    textPrimary: "#f4f7fb",
    textSecondary: "#a6b0bf",
    textMuted: "#747f8f",
    accent: "#4ea1ff",
    accentMuted: "rgba(78, 161, 255, 0.16)",
    positive: "#2ebd85",
    negative: "#ff5c70",
    warning: "#f5a524",
    info: "#64b5f6",
  },
  typography: {
    ui: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    numeric: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
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
  },
} as const;

export const chakraSemanticTokens = {
  colors: {
    "bg.canvas": {
      value: { _light: "{colors.gray.50}", _dark: "{colors.canvas}" },
    },
    "bg.surface": {
      value: { _light: "{colors.white}", _dark: "{colors.surface}" },
    },
    "bg.surfaceRaised": {
      value: { _light: "{colors.white}", _dark: "{colors.surfaceRaised}" },
    },
    "bg.inset": {
      value: { _light: "{colors.gray.100}", _dark: "{colors.surfaceInset}" },
    },
    "bg.muted": {
      value: { _light: "{colors.gray.100}", _dark: "{colors.rowHover}" },
    },
    "bg.emphasized": {
      value: { _light: "{colors.gray.200}", _dark: "{colors.rowActive}" },
    },
    "bg.subtle": {
      value: { _light: "{colors.gray.50}", _dark: "{colors.surfaceInset}" },
    },
    "bg.panel": {
      value: { _light: "{colors.white}", _dark: "{colors.surface}" },
    },

    "border.subtle": {
      value: { _light: "{colors.gray.100}", _dark: "{colors.hairline}" },
    },
    "border.default": {
      value: { _light: "{colors.gray.200}", _dark: "{colors.hairlineDefault}" },
    },
    "border.emphasis": {
      value: { _light: "{colors.gray.400}", _dark: "{colors.hairlineStrong}" },
    },
    "border.muted": {
      value: { _light: "{colors.gray.100}", _dark: "{colors.hairline}" },
    },
    "border.emphasized": {
      value: { _light: "{colors.gray.300}", _dark: "{colors.hairlineStrong}" },
    },

    "fg.default": {
      value: { _light: "{colors.gray.900}", _dark: "{colors.textPrimary}" },
    },
    "fg.muted": {
      value: { _light: "{colors.gray.600}", _dark: "{colors.textSecondary}" },
    },
    "fg.subtle": {
      value: { _light: "{colors.gray.500}", _dark: "{colors.textMuted}" },
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
      value: { _light: "{colors.orange.600}", _dark: "{colors.orange.400}" },
    },
    "signal.warn.fg": {
      value: { _light: "{colors.orange.700}", _dark: "{colors.orange.300}" },
    },
    "signal.warn.muted": {
      value: { _light: "{colors.orange.100}", _dark: "rgba(245, 165, 36, 0.16)" },
    },
    "signal.warn.subtle": {
      value: { _light: "{colors.orange.50}", _dark: "rgba(245, 165, 36, 0.08)" },
    },

    "signal.info.solid": {
      value: { _light: "{colors.blue.600}", _dark: "{colors.blue.400}" },
    },
    "signal.info.fg": {
      value: { _light: "{colors.blue.700}", _dark: "{colors.blue.300}" },
    },
    "signal.info.muted": {
      value: { _light: "{colors.blue.100}", _dark: "rgba(100, 181, 246, 0.16)" },
    },
    "signal.info.subtle": {
      value: { _light: "{colors.blue.50}", _dark: "rgba(100, 181, 246, 0.08)" },
    },
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
