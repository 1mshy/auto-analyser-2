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

/**
 * Normalized status badge. Replaces ad-hoc `colorScheme` / `colorPalette`
 * mixing so green-up / red-down / orange-warn are consistent everywhere.
 */
export const SignalBadge = React.forwardRef<HTMLDivElement, SignalBadgeProps>(
  function SignalBadge({ tone = "neutral", variant = "subtle", ...rest }, ref) {
    return (
      <Badge
        ref={ref}
        colorPalette={toneToPalette[tone]}
        variant={variant}
        {...rest}
      />
    );
  }
);
