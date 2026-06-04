import React from "react";
import { Box, Button, Heading, Text, VStack } from "@chakra-ui/react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Surface } from "./Surface";

export interface ErrorStateProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  py?: number | string;
}

/**
 * Standard fetch/operation failure state. Distinct from `EmptyState` (which is a
 * successful response with no rows): this signals something went wrong and, when
 * `onRetry` is provided, offers a way to recover. The lucide icon inherits the
 * Chakra-resolved color via `currentColor`.
 */
export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Retry",
  py = 12,
}) => {
  return (
    <Surface variant="inset" py={py} px={6} textAlign="center">
      <VStack gap={3}>
        <Box color="signal.down.fg" lineHeight="0" aria-hidden>
          <AlertTriangle size={28} />
        </Box>
        <Heading size="md" color="fg.default" fontWeight="semibold">
          {title}
        </Heading>
        {description && (
          <Text fontSize="sm" color="fg.muted" maxW="md">
            {description}
          </Text>
        )}
        {onRetry && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            colorPalette="gray"
          >
            <RotateCw size={14} />
            {retryLabel}
          </Button>
        )}
      </VStack>
    </Surface>
  );
};
