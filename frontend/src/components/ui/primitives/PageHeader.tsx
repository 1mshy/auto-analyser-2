import React from "react";
import { Flex, Heading, HStack, Text, VStack } from "@chakra-ui/react";

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  mb?: number | string;
}

/**
 * Consistent page-level header. Replaces hand-rolled `Flex + Heading + Text`
 * variations across pages.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  actions,
  mb = 6,
}) => {
  return (
    <Flex
      align={{ base: "flex-start", md: "center" }}
      justify="space-between"
      gap={4}
      mb={mb}
      direction={{ base: "column", md: "row" }}
    >
      <HStack gap={3} align="center">
        {icon && <span style={{ color: "var(--chakra-colors-accent-fg)" }}>{icon}</span>}
        <VStack align="flex-start" gap={0.5}>
          <Heading size="lg" color="fg.default" fontWeight="semibold">
            {title}
          </Heading>
          {subtitle && (
            <Text fontSize="sm" color="fg.muted">
              {subtitle}
            </Text>
          )}
        </VStack>
      </HStack>
      {actions && <HStack gap={2}>{actions}</HStack>}
    </Flex>
  );
};
