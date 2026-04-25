import React from "react";
import { Text, type TextProps } from "@chakra-ui/react";

export type NumIntent = "up" | "down" | "warn" | "info" | "neutral";

export interface NumProps extends Omit<TextProps, "children"> {
  value: number | null | undefined;
  intent?: NumIntent | "auto";
  /** Force sign display: always "+/-", never none, or "auto" (negatives only). */
  sign?: "auto" | "always" | "never";
  prefix?: string;
  suffix?: string;
  decimals?: number;
  /** Compact notation for large numbers (e.g. 1.2B, 420M). */
  compact?: boolean;
  fallback?: string;
}

const intentToColor: Record<NumIntent, string> = {
  up: "signal.up.fg",
  down: "signal.down.fg",
  warn: "signal.warn.fg",
  info: "signal.info.fg",
  neutral: "fg.default",
};

function formatNumber(
  value: number,
  decimals: number | undefined,
  compact: boolean | undefined,
  sign: "auto" | "always" | "never"
) {
  const absValue = Math.abs(value);
  const fractionDigits =
    decimals !== undefined
      ? decimals
      : compact
      ? absValue >= 100
        ? 0
        : 1
      : absValue >= 100
      ? 2
      : absValue >= 1
      ? 2
      : 4;

  const formatted = compact
    ? new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: fractionDigits,
      }).format(absValue)
    : absValue.toLocaleString("en-US", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      });

  if (sign === "never") return formatted;
  if (sign === "always") return `${value >= 0 ? "+" : "-"}${formatted}`;
  return value < 0 ? `-${formatted}` : formatted;
}

/**
 * Tabular numeric display. Use for prices, %, volumes, ratios — everywhere
 * a number would otherwise align inconsistently.
 */
export const Num = React.forwardRef<HTMLParagraphElement, NumProps>(
  function Num(
    {
      value,
      intent = "neutral",
      sign = "auto",
      prefix,
      suffix,
      decimals,
      compact,
      fallback = "—",
      ...rest
    },
    ref
  ) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return (
        <Text ref={ref} color="fg.subtle" {...rest}>
          {fallback}
        </Text>
      );
    }

    const resolvedIntent: NumIntent =
      intent === "auto"
        ? value > 0
          ? "up"
          : value < 0
          ? "down"
          : "neutral"
        : intent;

    const body = formatNumber(value, decimals, compact, sign);

    return (
      <Text
        ref={ref}
        className="num"
        data-num=""
        color={intentToColor[resolvedIntent]}
        {...rest}
      >
        {prefix}
        {body}
        {suffix}
      </Text>
    );
  }
);
