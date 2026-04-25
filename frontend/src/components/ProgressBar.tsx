import React, { createElement } from 'react';
import {
  Box,
  Text,
  HStack,
  VStack,
  SimpleGrid,
} from '@chakra-ui/react';
import { IoCheckmarkCircle, IoWarning, IoTime } from 'react-icons/io5';
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
          <SignalBadge tone={percentage === 100 ? 'up' : 'accent'} fontSize="sm" px={2.5} py={1} className="num" data-num="">
            {typeof percentage === 'number' && !isNaN(percentage) ? percentage.toFixed(1) : '0.0'}%
          </SignalBadge>
        </HStack>

        <ProgressRoot
          value={percentage}
          size="lg"
          colorPalette={percentage === 100 ? 'green' : 'blue'}
          striped
          animated={percentage < 100}
        >
          <ChakraProgressBar borderRadius="sm" />
        </ProgressRoot>

        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
          <Box>
            <HStack gap={1.5} mb={1} color="fg.muted">
              {createElement(IoTime as any, { style: { width: '12px', height: '12px' } })}
              <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider">Total Stocks</Text>
            </HStack>
            <Num value={progress.total_stocks} decimals={0} fontSize="2xl" fontWeight="semibold" />
          </Box>

          <Box>
            <HStack gap={1.5} mb={1} color="signal.up.fg">
              {createElement(IoCheckmarkCircle as any, { style: { width: '12px', height: '12px' } })}
              <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider" color="fg.muted">Analyzed</Text>
            </HStack>
            <Num value={progress.analyzed} decimals={0} intent="up" fontSize="2xl" fontWeight="semibold" />
          </Box>

          <Box>
            <HStack gap={1.5} mb={1} color={progress.errors > 0 ? 'signal.down.fg' : 'fg.muted'}>
              {createElement(IoWarning as any, { style: { width: '12px', height: '12px' } })}
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
            <Text className="num" data-num="" fontSize="2xl" fontWeight="semibold" color="accent.fg">
              {cycleMinutes}:{cycleSeconds.toString().padStart(2, '0')}
            </Text>
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
              {createElement(IoCheckmarkCircle as any, { style: { width: '18px', height: '18px' } })}
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
