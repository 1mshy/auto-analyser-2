import React from "react";
import { Box, type BoxProps } from "@chakra-ui/react";

export type SurfaceVariant = "flat" | "raised" | "inset";

export interface SurfaceProps extends BoxProps {
  variant?: SurfaceVariant;
  interactive?: boolean;
  accent?: "up" | "down" | "warn" | "info" | "accent";
}

/**
 * Canonical card/panel. Linear-style: hairline border, flat bg, subtle hover
 * that shifts the border — never the background.
 */
export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  function Surface(
    { variant = "flat", interactive, accent, children, ...rest },
    ref
  ) {
    const bgMap: Record<SurfaceVariant, string> = {
      flat: "bg.surface",
      raised: "bg.surfaceRaised",
      inset: "bg.inset",
    };

    const accentBorder = accent
      ? {
          up: "signal.up.solid",
          down: "signal.down.solid",
          warn: "signal.warn.solid",
          info: "signal.info.solid",
          accent: "accent.solid",
        }[accent]
      : undefined;

    return (
      <Box
        ref={ref}
        bg={bgMap[variant]}
        borderWidth="1px"
        borderColor="border.subtle"
        borderRadius="md"
        borderLeftWidth={accentBorder ? "2px" : undefined}
        borderLeftColor={accentBorder}
        transition="border-color 120ms ease, background 120ms ease"
        {...(interactive && {
          cursor: "pointer",
          _hover: { borderColor: "border.emphasis" },
        })}
        {...rest}
      >
        {children}
      </Box>
    );
  }
);
