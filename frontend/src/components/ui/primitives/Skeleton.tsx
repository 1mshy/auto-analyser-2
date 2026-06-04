import React from "react";
import { Box, type BoxProps, HStack, Stack, type StackProps } from "@chakra-ui/react";
import { Surface } from "./Surface";

export interface SkeletonProps extends BoxProps {}

/**
 * Base skeleton block. Colors come from the `skeleton.*` semantic tokens (so it
 * adapts to color mode); the pulse keyframe lives in `index.css` and is disabled
 * under `prefers-reduced-motion`.
 */
export const Skeleton: React.FC<SkeletonProps> = ({ borderRadius = "sm", ...rest }) => (
  <Box
    data-skeleton
    bg="skeleton.base"
    borderRadius={borderRadius}
    animation="skeleton-pulse 1.4s ease-in-out infinite"
    {...rest}
  />
);

export interface SkeletonTextProps extends StackProps {
  lines?: number;
}

/** A stack of text-line skeletons; the last line is shortened. */
export const SkeletonText: React.FC<SkeletonTextProps> = ({ lines = 3, gap = 2, ...rest }) => (
  <Stack gap={gap} {...rest}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} h="3" w={i === lines - 1 ? "60%" : "100%"} />
    ))}
  </Stack>
);

/** KPI placeholder matching the StatBlock shape (label + value). */
export const SkeletonStat: React.FC<StackProps> = (props) => (
  <Stack gap={2} {...props}>
    <Skeleton h="2.5" w="40%" />
    <Skeleton h="5" w="70%" />
  </Stack>
);

export interface SkeletonRowProps extends StackProps {
  cols?: number;
}

/** A single dense table-row placeholder. */
export const SkeletonRow: React.FC<SkeletonRowProps> = ({ cols = 5, ...rest }) => (
  <HStack gap={4} {...rest}>
    {Array.from({ length: cols }).map((_, i) => (
      <Skeleton key={i} h="3.5" flex="1" />
    ))}
  </HStack>
);

export interface SkeletonCardProps {
  lines?: number;
}

/** A Surface-backed card placeholder (title + body lines). */
export const SkeletonCard: React.FC<SkeletonCardProps> = ({ lines = 3 }) => (
  <Surface variant="flat" p={4}>
    <Stack gap={3}>
      <Skeleton h="4" w="50%" />
      <SkeletonText lines={lines} />
    </Stack>
  </Surface>
);
