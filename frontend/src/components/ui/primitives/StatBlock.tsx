import React from "react";
import { Box, HStack, Text, VStack, type BoxProps } from "@chakra-ui/react";
import { Num, type NumIntent } from "./Num";
import { Surface } from "./Surface";

export interface StatBlockProps extends Omit<BoxProps, "children"> {
  label: string;
  value: number | string | null | undefined;
  /** If provided and value is a number, renders via `Num`. */
  valueIntent?: NumIntent | "auto";
  valuePrefix?: string;
  valueSuffix?: string;
  valueDecimals?: number;
  valueCompact?: boolean;
  valueSign?: "auto" | "always" | "never";
  /** Optional change/delta indicator below the value. */
  delta?: number | null;
  deltaSuffix?: string;
  hint?: string;
  icon?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Wrap in a Surface (default) or render bare. */
  bare?: boolean;
}

const sizeMap = {
  sm: { p: 3, valueSize: "lg", labelSize: "xs", labelGap: 0.5 },
  md: { p: 4, valueSize: "xl", labelSize: "xs", labelGap: 1 },
  lg: { p: 5, valueSize: "2xl", labelSize: "sm", labelGap: 1 },
} as const;

/**
 * Consistent metric card: label (uppercase, muted) + value (mono, large) +
 * optional delta + optional hint. Replaces duplicated Stat/Card markup.
 */
export const StatBlock = React.forwardRef<HTMLDivElement, StatBlockProps>(
  function StatBlock(
    {
      label,
      value,
      valueIntent = "neutral",
      valuePrefix,
      valueSuffix,
      valueDecimals,
      valueCompact,
      valueSign,
      delta,
      deltaSuffix,
      hint,
      icon,
      size = "md",
      bare = false,
      ...rest
    },
    ref
  ) {
    const sizing = sizeMap[size];

    const valueNode =
      typeof value === "number" || value === null || value === undefined ? (
        <Num
          value={value as number | null | undefined}
          intent={valueIntent}
          sign={valueSign}
          prefix={valuePrefix}
          suffix={valueSuffix}
          decimals={valueDecimals}
          compact={valueCompact}
          fontSize={sizing.valueSize}
          fontWeight="semibold"
        />
      ) : (
        <Text
          className="num"
          data-num=""
          fontSize={sizing.valueSize}
          fontWeight="semibold"
          color="fg.default"
        >
          {valuePrefix}
          {value}
          {valueSuffix}
        </Text>
      );

    const content = (
      <VStack align="stretch" gap={sizing.labelGap}>
        <HStack gap={2} color="fg.muted">
          {icon}
          <Text
            fontSize={sizing.labelSize}
            fontWeight="medium"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            {label}
          </Text>
        </HStack>
        {valueNode}
        {delta !== null && delta !== undefined && (
          <Num
            value={delta}
            intent="auto"
            sign="always"
            suffix={deltaSuffix}
            fontSize="sm"
            fontWeight="medium"
          />
        )}
        {hint && (
          <Text fontSize="xs" color="fg.subtle">
            {hint}
          </Text>
        )}
      </VStack>
    );

    if (bare) {
      return (
        <Box ref={ref} p={sizing.p} {...rest}>
          {content}
        </Box>
      );
    }

    return (
      <Surface ref={ref} p={sizing.p} {...rest}>
        {content}
      </Surface>
    );
  }
);
