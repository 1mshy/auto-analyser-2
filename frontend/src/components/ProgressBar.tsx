import React from 'react';
import {
  Box,
  Text,
  HStack,
  VStack,
  SimpleGrid,
} from '@chakra-ui/react';
import { CircleCheck, Clock, TriangleAlert } from 'lucide-react';
import { AnalysisProgress } from '../types';
import { ProgressRoot, ProgressBar as ChakraProgressBar } from './ui/progress';
import { Surface, Num, SignalBadge } from './ui/primitives';

interface ProgressBarProps {
  progress: AnalysisProgress;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  const percentage = progress.total_stocks > 0
    ? (progress.analyzed / progress.total_stocks) * 100
    : 0;

  const cycleTime = new Date().getTime() - new Date(progress.cycle_start).getTime();
  const cycleMinutes = Math.floor(cycleTime / 60000);
  const cycleSeconds = Math.floor((cycleTime % 60000) / 1000);

  return (
    <Surface p={6}>
      <VStack gap={4} align="stretch">
        <HStack justify="space-between">
          <Text fontSize="lg" fontWeight="semibold" color="fg.default">
            Analysis Progress
          </Text>
          <SignalBadge tone={percentage === 100 ? 'up' : 'accent'} fontSize="sm" px={2.5} py={1}>
            <Num as="span" value={percentage} decimals={1} suffix="%" color="inherit" fontSize="sm" fallback="0.0%" />
          </SignalBadge>
        </HStack>

        <ProgressRoot
          value={percentage}
          size="lg"
          striped
          animated={percentage < 100}
          css={{
            '& .chakra-progress__range': {
              bg: percentage === 100 ? 'signal.up.solid' : 'accent.solid',
            },
          }}
        >
          <ChakraProgressBar borderRadius="sm" />
        </ProgressRoot>

        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
          <Box>
            <HStack gap={1.5} mb={1} color="fg.muted">
              <Clock size={12} />
              <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider">Total Stocks</Text>
            </HStack>
            <Num value={progress.total_stocks} decimals={0} fontSize="2xl" fontWeight="semibold" />
          </Box>

          <Box>
            <HStack gap={1.5} mb={1} color="signal.up.fg">
              <CircleCheck size={12} />
              <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider" color="fg.muted">Analyzed</Text>
            </HStack>
            <Num value={progress.analyzed} decimals={0} intent="up" fontSize="2xl" fontWeight="semibold" />
          </Box>

          <Box>
            <HStack gap={1.5} mb={1} color={progress.errors > 0 ? 'signal.down.fg' : 'fg.muted'}>
              <TriangleAlert size={12} />
              <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider" color="fg.muted">Errors</Text>
            </HStack>
            <Num
              value={progress.errors}
              decimals={0}
              intent={progress.errors > 0 ? 'down' : 'neutral'}
              fontSize="2xl"
              fontWeight="semibold"
            />
          </Box>

          <Box>
            <Text fontSize="xs" color="fg.muted" mb={1} textTransform="uppercase" letterSpacing="wider">Cycle Time</Text>
            <Num
              value={cycleMinutes > 0 ? cycleTime / 60000 : cycleSeconds}
              decimals={cycleMinutes > 0 ? 1 : 0}
              suffix={cycleMinutes > 0 ? 'm' : 's'}
              fontSize="2xl"
              fontWeight="semibold"
              color="accent.fg"
            />
          </Box>
        </SimpleGrid>

        {progress.current_symbol && (
          <Box
            bg="accent.subtle"
            p={3}
            borderRadius="md"
            borderWidth="1px"
            borderColor="border.subtle"
          >
            <HStack justify="space-between">
              <Text fontSize="sm" color="fg.muted">
                Currently Analyzing:
              </Text>
              <SignalBadge tone="accent" fontSize="sm">
                {progress.current_symbol}
              </SignalBadge>
            </HStack>
          </Box>
        )}

        {percentage === 100 && (
          <Box
            bg="signal.up.subtle"
            p={3}
            borderRadius="md"
            borderWidth="1px"
            borderColor="border.subtle"
          >
            <HStack gap={2} color="signal.up.fg">
              <CircleCheck size={18} />
              <Text fontSize="sm" fontWeight="medium">
                Analysis cycle complete! Next cycle will begin shortly.
              </Text>
            </HStack>
          </Box>
        )}
      </VStack>
    </Surface>
  );
};

export default ProgressBar;
