/**
 * Recharts theming adapter for the chart.* semantic tokens.
 *
 * Recharts consumes plain color strings (SVG attributes), not Chakra props,
 * so this module resolves the token values directly from the same constants
 * `design-tokens.ts` feeds into the Chakra theme. Resolved values are the
 * dark-mode set (the app is dark-first).
 */

import type { CSSProperties } from "react";

import { chakraSemanticTokens, designTokens } from "./design-tokens";

const chartTokens = chakraSemanticTokens.colors;

export const chartColors: { grid: string; axis: string; series: string[] } = {
  grid: chartTokens["chart.grid"].value._dark,
  axis: chartTokens["chart.axis"].value._dark,
  series: [
    chartTokens["chart.series.1"].value,
    chartTokens["chart.series.2"].value,
    chartTokens["chart.series.3"].value,
    chartTokens["chart.series.4"].value,
    chartTokens["chart.series.5"].value,
    chartTokens["chart.series.6"].value,
  ],
};

export const axisProps = {
  stroke: chartColors.axis,
  tick: { fill: chartColors.axis, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: chartColors.grid },
} as const;

export const gridProps = {
  stroke: chartColors.grid,
  strokeDasharray: "3 3",
} as const;

export const tooltipStyles: {
  contentStyle: CSSProperties;
  labelStyle: CSSProperties;
  itemStyle: CSSProperties;
} = {
  contentStyle: {
    backgroundColor: designTokens.color.surfaceRaised,
    border: `1px solid ${designTokens.color.borderSubtle}`,
    borderRadius: 8,
    fontSize: 12,
    color: designTokens.color.textPrimary,
  },
  labelStyle: {
    color: designTokens.color.textPrimary,
    fontSize: 12,
    fontWeight: 600,
  },
  itemStyle: {
    color: designTokens.color.textPrimary,
    fontSize: 12,
  },
};

export function seriesColor(index: number): string {
  const count = chartColors.series.length;
  return chartColors.series[((index % count) + count) % count];
}
