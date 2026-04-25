import React from "react";
import { Box, type BoxProps } from "@chakra-ui/react";

export type SurfaceVariant = "flat" | "raised" | "inset";

export interface SurfaceProps extends BoxProps {
  variant?: SurfaceVariant;
  interactive?: boolean;
  accent?: "up" | "down" | "warn" | "info" | "accent";
}

/**
 * Canonical card/panel for the finance workspace: flat, bordered, compact,
 * and quiet until interaction or signal state needs emphasis.
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
        borderColor={variant === "raised" ? "border.default" : "border.subtle"}
        borderRadius="lg"
        boxShadow={variant === "raised" ? "elevation.raised" : undefined}
        borderLeftWidth={accentBorder ? "3px" : undefined}
        borderLeftColor={accentBorder}
        transition="border-color 120ms ease, background 120ms ease, box-shadow 120ms ease, transform 120ms ease"
        {...(interactive && {
          cursor: "pointer",
          _hover: {
            bg: variant === "inset" ? "bg.emphasized" : "bg.muted",
            borderColor: "border.emphasis",
          },
          _active: { transform: "translateY(1px)" },
        })}
        {...rest}
      >
        {children}
      </Box>
    );
  }
);
