import React from "react";
import { Badge, type BadgeProps } from "@chakra-ui/react";

export type SignalTone = "up" | "down" | "warn" | "info" | "neutral" | "accent";

export interface SignalBadgeProps extends Omit<BadgeProps, "colorPalette"> {
  tone?: SignalTone;
  variant?: "subtle" | "solid" | "outline";
}

const toneToPalette: Record<SignalTone, string> = {
  up: "green",
  down: "red",
  warn: "orange",
  info: "blue",
  neutral: "gray",
  accent: "blue",
};

const toneToStyle: Record<
  SignalTone,
  { bg: string; color: string; borderColor: string; solidBg: string; solidColor: string }
> = {
  up: {
    bg: "signal.up.subtle",
    color: "signal.up.fg",
    borderColor: "signal.up.muted",
    solidBg: "signal.up.solid",
    solidColor: "black",
  },
  down: {
    bg: "signal.down.subtle",
    color: "signal.down.fg",
    borderColor: "signal.down.muted",
    solidBg: "signal.down.solid",
    solidColor: "white",
  },
  warn: {
    bg: "signal.warn.subtle",
    color: "signal.warn.fg",
    borderColor: "signal.warn.muted",
    solidBg: "signal.warn.solid",
    solidColor: "black",
  },
  info: {
    bg: "signal.info.subtle",
    color: "signal.info.fg",
    borderColor: "signal.info.muted",
    solidBg: "signal.info.solid",
    solidColor: "black",
  },
  neutral: {
    bg: "bg.inset",
    color: "fg.muted",
    borderColor: "border.subtle",
    solidBg: "bg.emphasized",
    solidColor: "fg.default",
  },
  accent: {
    bg: "accent.subtle",
    color: "accent.fg",
    borderColor: "accent.muted",
    solidBg: "accent.solid",
    solidColor: "black",
  },
};

/**
 * Normalized status badge. Replaces ad-hoc `colorScheme` / `colorPalette`
 * mixing so green-up / red-down / orange-warn are consistent everywhere.
 */
export const SignalBadge = React.forwardRef<HTMLDivElement, SignalBadgeProps>(
  function SignalBadge({ tone = "neutral", variant = "subtle", ...rest }, ref) {
    const style = toneToStyle[tone];
    const variantStyle =
      variant === "solid"
        ? {
            bg: style.solidBg,
            color: style.solidColor,
            borderColor: style.solidBg,
          }
        : variant === "outline"
        ? {
            bg: "transparent",
            color: style.color,
            borderColor: style.borderColor,
          }
        : {
            bg: style.bg,
            color: style.color,
            borderColor: style.borderColor,
          };

    return (
      <Badge
        ref={ref}
        colorPalette={toneToPalette[tone]}
        variant={variant}
        borderWidth="1px"
        borderRadius="full"
        fontWeight="medium"
        letterSpacing="0.01em"
        {...variantStyle}
        {...rest}
      />
    );
  }
);
