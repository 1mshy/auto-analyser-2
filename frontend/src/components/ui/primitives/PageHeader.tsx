import React from "react";
import { Box, Flex, Heading, HStack, Text, VStack } from "@chakra-ui/react";

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
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
  eyebrow,
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
      <HStack gap={3} align="flex-start">
        {icon && (
          <Box
            color="accent.fg"
            bg="accent.subtle"
            borderWidth="1px"
            borderColor="accent.muted"
            borderRadius="lg"
            p={2}
            lineHeight={0}
          >
            {icon}
          </Box>
        )}
        <VStack align="flex-start" gap={1}>
          {eyebrow && (
            <Text
              fontSize="xs"
              color="fg.subtle"
              fontWeight="semibold"
              textTransform="uppercase"
              letterSpacing="0.12em"
            >
              {eyebrow}
            </Text>
          )}
          <Heading size="lg" color="fg.default" fontWeight="semibold" letterSpacing="tight">
            {title}
          </Heading>
          {subtitle && (
            <Text fontSize="sm" color="fg.muted" maxW="3xl">
              {subtitle}
            </Text>
          )}
        </VStack>
      </HStack>
      {actions && (
        <HStack gap={2} alignSelf={{ base: "stretch", md: "center" }} wrap="wrap">
          {actions}
        </HStack>
      )}
    </Flex>
  );
};
