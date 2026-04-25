import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

/**
 * Bloomberg/Linear-inspired dark data UI system.
 *
 * Design principles:
 * - Near-black canvas, hairline borders, flat elevation.
 * - Semantic tokens for surfaces / borders / text / signal / accent so pages
 *   never reach for raw `gray.*` or hex values.
 * - Tabular monospaced numerics applied via the mono font + the `.num`
 *   utility in index.css.
 */

const customConfig = defineConfig({
  globalCss: {
    "html, body": {
      bg: "bg.canvas",
      color: "fg.default",
      fontFeatureSettings: '"cv11", "ss01", "ss03"',
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
  },
  theme: {
    tokens: {
      fonts: {
        body: {
          value:
            'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        },
        heading: {
          value:
            'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        },
        mono: {
          value:
            '"JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
        },
      },
      radii: {
        xs: { value: "2px" },
        sm: { value: "4px" },
        md: { value: "6px" },
        lg: { value: "8px" },
        xl: { value: "10px" },
      },
      colors: {
        // Raw palette for dark data UI. Semantic tokens reference these.
        canvas: { value: "#0b0d11" },
        surface: { value: "#111418" },
        surfaceRaised: { value: "#151a20" },
        surfaceInset: { value: "#0e1115" },
        hairline: { value: "#1d2128" },
        hairlineStrong: { value: "#262b33" },
        rowHover: { value: "#161b22" },
        rowActive: { value: "#1b2129" },

        // Accent (brand) — cooler blue than default for data density.
        accent: {
          50: { value: "#e8f0fe" },
          100: { value: "#c7dafc" },
          200: { value: "#a1c0f9" },
          300: { value: "#77a4f5" },
          400: { value: "#4c87ef" },
          500: { value: "#2e6be3" },
          600: { value: "#1f55c2" },
          700: { value: "#17449b" },
          800: { value: "#0f3276" },
          900: { value: "#0a224f" },
        },

        // Signal scale (9 steps) for heatmaps + two-tone semantics.
        signalUp: {
          50: { value: "#e8f8ef" },
          100: { value: "#c4ead2" },
          200: { value: "#9cdcb3" },
          300: { value: "#6ecd92" },
          400: { value: "#3fbd73" },
          500: { value: "#22a55b" },
          600: { value: "#188a4a" },
          700: { value: "#116c3a" },
          800: { value: "#0b4f2a" },
          900: { value: "#06321b" },
        },
        signalDown: {
          50: { value: "#fdeaec" },
          100: { value: "#f7c6cb" },
          200: { value: "#f09ea8" },
          300: { value: "#e77382" },
          400: { value: "#dc4e62" },
          500: { value: "#c83247" },
          600: { value: "#a52438" },
          700: { value: "#7f1c2c" },
          800: { value: "#59131f" },
          900: { value: "#360a13" },
        },
      },
    },
    semanticTokens: {
      colors: {
        // Surfaces
        "bg.canvas": {
          value: { _light: "{colors.gray.50}", _dark: "{colors.canvas}" },
        },
        "bg.surface": {
          value: { _light: "{colors.white}", _dark: "{colors.surface}" },
        },
        "bg.surfaceRaised": {
          value: {
            _light: "{colors.white}",
            _dark: "{colors.surfaceRaised}",
          },
        },
        "bg.inset": {
          value: { _light: "{colors.gray.100}", _dark: "{colors.surfaceInset}" },
        },
        // Override defaults so `bg.muted` / `bg.emphasized` stay consistent.
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

        // Borders
        "border.subtle": {
          value: { _light: "{colors.gray.100}", _dark: "{colors.hairline}" },
        },
        "border.default": {
          value: { _light: "{colors.gray.200}", _dark: "{colors.hairline}" },
        },
        "border.emphasis": {
          value: {
            _light: "{colors.gray.400}",
            _dark: "{colors.hairlineStrong}",
          },
        },
        "border.muted": {
          value: { _light: "{colors.gray.100}", _dark: "{colors.hairline}" },
        },
        "border.emphasized": {
          value: {
            _light: "{colors.gray.300}",
            _dark: "{colors.hairlineStrong}",
          },
        },

        // Text
        "fg.default": {
          value: { _light: "{colors.gray.900}", _dark: "{colors.gray.50}" },
        },
        "fg.muted": {
          value: { _light: "{colors.gray.600}", _dark: "{colors.gray.400}" },
        },
        "fg.subtle": {
          value: { _light: "{colors.gray.500}", _dark: "{colors.gray.500}" },
        },

        // Accent tokens (paired for badges/buttons/active states)
        "accent.solid": {
          value: { _light: "{colors.accent.600}", _dark: "{colors.accent.500}" },
        },
        "accent.muted": {
          value: {
            _light: "{colors.accent.100}",
            _dark: "rgba(46, 107, 227, 0.16)",
          },
        },
        "accent.subtle": {
          value: {
            _light: "{colors.accent.50}",
            _dark: "rgba(46, 107, 227, 0.08)",
          },
        },
        "accent.fg": {
          value: { _light: "{colors.accent.700}", _dark: "{colors.accent.300}" },
        },
        "accent.emphasis": {
          value: { _light: "{colors.accent.700}", _dark: "{colors.accent.400}" },
        },

        // Signal — up / down / warn / info
        "signal.up.solid": {
          value: {
            _light: "{colors.signalUp.600}",
            _dark: "{colors.signalUp.500}",
          },
        },
        "signal.up.fg": {
          value: {
            _light: "{colors.signalUp.700}",
            _dark: "{colors.signalUp.300}",
          },
        },
        "signal.up.muted": {
          value: {
            _light: "{colors.signalUp.100}",
            _dark: "rgba(34, 165, 91, 0.16)",
          },
        },
        "signal.up.subtle": {
          value: {
            _light: "{colors.signalUp.50}",
            _dark: "rgba(34, 165, 91, 0.08)",
          },
        },

        "signal.down.solid": {
          value: {
            _light: "{colors.signalDown.600}",
            _dark: "{colors.signalDown.500}",
          },
        },
        "signal.down.fg": {
          value: {
            _light: "{colors.signalDown.700}",
            _dark: "{colors.signalDown.300}",
          },
        },
        "signal.down.muted": {
          value: {
            _light: "{colors.signalDown.100}",
            _dark: "rgba(200, 50, 71, 0.16)",
          },
        },
        "signal.down.subtle": {
          value: {
            _light: "{colors.signalDown.50}",
            _dark: "rgba(200, 50, 71, 0.08)",
          },
        },

        "signal.warn.solid": {
          value: { _light: "{colors.orange.600}", _dark: "{colors.orange.400}" },
        },
        "signal.warn.fg": {
          value: { _light: "{colors.orange.700}", _dark: "{colors.orange.300}" },
        },
        "signal.warn.muted": {
          value: {
            _light: "{colors.orange.100}",
            _dark: "rgba(237, 137, 54, 0.16)",
          },
        },
        "signal.warn.subtle": {
          value: {
            _light: "{colors.orange.50}",
            _dark: "rgba(237, 137, 54, 0.08)",
          },
        },

        "signal.info.solid": {
          value: { _light: "{colors.blue.600}", _dark: "{colors.blue.400}" },
        },
        "signal.info.fg": {
          value: { _light: "{colors.blue.700}", _dark: "{colors.blue.300}" },
        },
        "signal.info.muted": {
          value: {
            _light: "{colors.blue.100}",
            _dark: "rgba(66, 153, 225, 0.16)",
          },
        },
        "signal.info.subtle": {
          value: {
            _light: "{colors.blue.50}",
            _dark: "rgba(66, 153, 225, 0.08)",
          },
        },
      },
      shadows: {
        // Flat, ring-based elevation rather than blurry shadows.
        "elevation.raised": {
          value: {
            _light: "0 1px 0 rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)",
            _dark: "0 1px 0 rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)",
          },
        },
        "elevation.overlay": {
          value: {
            _light: "0 8px 24px rgba(15, 23, 42, 0.08)",
            _dark: "0 8px 24px rgba(0, 0, 0, 0.6)",
          },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, customConfig);
