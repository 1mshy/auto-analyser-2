import React from "react";
import { Box, HStack, Text, type BoxProps } from "@chakra-ui/react";
import { AlertTriangle, Info } from "lucide-react";

export type CalloutTone = "info" | "warn" | "up" | "down" | "accent" | "neutral";

export interface CalloutProps extends Omit<BoxProps, "title"> {
  tone?: CalloutTone;
  icon?: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
}

const toneToStyle: Record<
  CalloutTone,
  { bg: string; accentBorder: string; iconColor: string }
> = {
  info: {
    bg: "signal.info.subtle",
    accentBorder: "signal.info.solid",
    iconColor: "signal.info.fg",
  },
  warn: {
    bg: "signal.warn.subtle",
    accentBorder: "signal.warn.solid",
    iconColor: "signal.warn.fg",
  },
  up: {
    bg: "signal.up.subtle",
    accentBorder: "signal.up.solid",
    iconColor: "signal.up.fg",
  },
  down: {
    bg: "signal.down.subtle",
    accentBorder: "signal.down.solid",
    iconColor: "signal.down.fg",
  },
  accent: {
    bg: "accent.subtle",
    accentBorder: "accent.solid",
    iconColor: "accent.fg",
  },
  neutral: {
    bg: "bg.inset",
    accentBorder: "border.emphasis",
    iconColor: "fg.muted",
  },
};

const toneToDefaultIcon: Record<CalloutTone, React.ReactNode> = {
  info: <Info size={16} />,
  warn: <AlertTriangle size={16} />,
  up: <Info size={16} />,
  down: <AlertTriangle size={16} />,
  accent: <Info size={16} />,
  neutral: <Info size={16} />,
};

/**
 * Inline banner for contextual notices. Quiet by default; the left accent
 * border and tone background carry the signal.
 */
export const Callout = React.forwardRef<HTMLDivElement, CalloutProps>(
  function Callout({ tone = "info", icon, title, children, action, ...rest }, ref) {
    const style = toneToStyle[tone];
    const resolvedIcon = icon !== undefined ? icon : toneToDefaultIcon[tone];

    return (
      <Box
        ref={ref}
        bg={style.bg}
        borderWidth="1px"
        borderColor="border.subtle"
        borderLeftWidth="3px"
        borderLeftColor={style.accentBorder}
        borderRadius="md"
        px={4}
        py={3}
        {...rest}
      >
        <HStack gap={3} align="flex-start">
          {resolvedIcon && (
            <Box color={style.iconColor} mt="2px" lineHeight={0} flexShrink={0}>
              {resolvedIcon}
            </Box>
          )}
          <Box flex="1" minW={0}>
            {title && (
              <Text fontSize="sm" fontWeight="semibold" color="fg.default">
                {title}
              </Text>
            )}
            {children != null && (
              <Text fontSize="sm" color={title ? "fg.muted" : "fg.default"}>
                {children}
              </Text>
            )}
          </Box>
          {action && <Box flexShrink={0}>{action}</Box>}
        </HStack>
      </Box>
    );
  }
);
