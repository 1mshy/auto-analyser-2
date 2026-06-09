import React from "react";
import { Box } from "@chakra-ui/react";
import { SignalBadge } from "./SignalBadge";

export interface FreshnessChipProps {
  cached?: boolean;
  isLive?: boolean;
}

/** Tiny data-source chip: pulsing "live" dot or a neutral "cached" marker. */
export const FreshnessChip: React.FC<FreshnessChipProps> = ({ cached, isLive }) => {
  if (isLive) {
    return (
      <SignalBadge tone="up" fontSize="xs" whiteSpace="nowrap">
        <Box
          w="2px"
          h="2px"
          flexShrink={0}
          borderRadius="full"
          bg="signal.up.solid"
          animation="skeleton-pulse 1.4s ease-in-out infinite"
          _motionReduce={{ animation: "none" }}
        />
        live
      </SignalBadge>
    );
  }
  if (cached) {
    return (
      <SignalBadge tone="neutral" fontSize="xs" whiteSpace="nowrap">
        cached
      </SignalBadge>
    );
  }
  return null;
};
