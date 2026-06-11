import React from "react";
import {
  SignalBadge,
  type SignalBadgeProps,
  type SignalTone,
} from "./SignalBadge";
import {
  getMarketCapTier,
  getMarketCapTierColor,
  getMarketCapTierLabel,
} from "../../../types";

export interface TierBadgeProps extends Omit<SignalBadgeProps, "tone"> {
  marketCap?: number | null;
  showValue?: boolean;
}

const paletteToTone: Record<string, SignalTone> = {
  purple: "accent",
  blue: "info",
  teal: "up",
  orange: "warn",
  gray: "neutral",
};

const compactUsd = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Market-cap tier badge. Tier thresholds and palette come straight from
 * `getMarketCapTier` / `getMarketCapTierColor` so call sites stay in sync.
 */
export const TierBadge = React.forwardRef<HTMLDivElement, TierBadgeProps>(
  function TierBadge({ marketCap, showValue, ...rest }, ref) {
    const tier = getMarketCapTier(marketCap ?? undefined);
    const tone = paletteToTone[getMarketCapTierColor(tier)] ?? "neutral";

    return (
      <SignalBadge ref={ref} tone={tone} {...rest}>
        {getMarketCapTierLabel(tier)}
        {showValue && marketCap != null
          ? ` · $${compactUsd.format(marketCap)}`
          : null}
      </SignalBadge>
    );
  }
);
