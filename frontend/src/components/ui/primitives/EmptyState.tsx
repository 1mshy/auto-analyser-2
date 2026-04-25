import React from "react";
import { Heading, Text, VStack } from "@chakra-ui/react";
import { Surface } from "./Surface";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  py?: number | string;
}

/**
 * Standard empty/no-results state.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  py = 12,
}) => {
  return (
    <Surface variant="inset" py={py} px={6} textAlign="center">
      <VStack gap={3}>
        {icon && <div style={{ color: "var(--chakra-colors-fg-subtle)" }}>{icon}</div>}
        <Heading size="md" color="fg.default" fontWeight="semibold">
          {title}
        </Heading>
        {description && (
          <Text fontSize="sm" color="fg.muted" maxW="md">
            {description}
          </Text>
        )}
        {action}
      </VStack>
    </Surface>
  );
};
