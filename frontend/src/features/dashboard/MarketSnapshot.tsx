import { Box, Button, Flex, HStack, SimpleGrid, Text } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useMarketIndexes } from '../../queries';
import { Num, Skeleton } from '../../components/ui/primitives';

export function MarketSnapshot() {
  const query = useMarketIndexes();
  if (query.isLoading)
    return (
      <SimpleGrid columns={{ base: 2, xl: 4 }} gap={3} mb={6}>
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} h="88px" />
        ))}
      </SimpleGrid>
    );
  if (query.isError && !query.data)
    return (
      <Flex
        p={3}
        mb={5}
        borderWidth="1px"
        borderColor="border.subtle"
        gap={3}
        align="center"
        wrap="wrap"
      >
        <Text color="fg.muted" fontSize="sm">
          Index quotes are unavailable.
        </Text>
        <Button size="xs" variant="ghost" onClick={() => query.refetch()}>
          Retry quotes
        </Button>
      </Flex>
    );
  if (!query.data?.length) return null;
  return (
    <Box mb={6}>
      <SimpleGrid
        columns={{ base: 2, xl: 4 }}
        borderWidth="1px"
        borderColor="border.subtle"
        borderRadius="lg"
        overflow="hidden"
        bg="bg.surface"
      >
        {query.data.slice(0, 4).map((index) => (
          <Box
            key={index.id}
            p={{ base: 3, md: 4 }}
            borderRightWidth="1px"
            borderColor="border.subtle"
            minW={0}
          >
            <Flex justify="space-between" align="center" mb={2} gap={2}>
              <Text fontSize="xs" fontWeight="medium" color="fg.muted" truncate>
                {index.name}
              </Text>
              <Box color="fg.subtle" display={{ base: 'none', md: 'block' }}>
                <ArrowUpRight size={14} />
              </Box>
            </Flex>
            {index.value == null ? (
              <Text fontSize="sm" color="fg.subtle">
                Quote unavailable
              </Text>
            ) : (
              <Flex
                gap={2}
                align="baseline"
                justify="space-between"
                wrap="wrap"
              >
                <Num
                  value={index.value}
                  fontSize={{ base: 'md', md: 'xl' }}
                  fontWeight="semibold"
                  decimals={2}
                />
                <HStack
                  gap={0.5}
                  color={
                    index.change_percent == null
                      ? 'fg.muted'
                      : index.change_percent >= 0
                        ? 'signal.up.fg'
                        : 'signal.down.fg'
                  }
                >
                  {index.change_percent != null &&
                    (index.change_percent >= 0 ? (
                      <ArrowUpRight size={13} />
                    ) : (
                      <ArrowDownRight size={13} />
                    ))}
                  <Num
                    value={index.change_percent}
                    sign="always"
                    decimals={2}
                    suffix="%"
                    fontSize="xs"
                    color="inherit"
                  />
                </HStack>
              </Flex>
            )}
          </Box>
        ))}
      </SimpleGrid>
      <Flex justify="space-between" gap={2} mt={2}>
        <Text color="fg.subtle" fontSize="xs">
          Latest available index quotes · may be delayed
        </Text>
        <Link to="/sectors">
          <Text color="accent.fg" fontSize="xs" whiteSpace="nowrap">
            All indexes →
          </Text>
        </Link>
      </Flex>
    </Box>
  );
}
