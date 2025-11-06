import React, { createElement } from 'react';
import {
  Box,
  Text,
  HStack,
  VStack,
  Badge,
  SimpleGrid,
} from '@chakra-ui/react';
import { IoCheckmarkCircle, IoWarning, IoTime } from 'react-icons/io5';
import { AnalysisProgress } from '../types';
import { ProgressRoot, ProgressBar as ChakraProgressBar } from './ui/progress';

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
    <Box
      bg="white"
      p={6}
      borderRadius="lg"
      boxShadow="md"
      borderWidth="1px"
      borderColor="gray.200"
    >
      <VStack gap={4} align="stretch">
        {/* Header */}
        <HStack justify="space-between">
          <Text fontSize="xl" fontWeight="bold" color="gray.800">
            Analysis Progress
          </Text>
          <Badge colorScheme={percentage === 100 ? 'green' : 'blue'} fontSize="md" px={3} py={1}>
            {percentage.toFixed(1)}%
          </Badge>
        </HStack>

        {/* Progress Bar */}
        <ProgressRoot
          value={percentage}
          size="lg"
          colorPalette={percentage === 100 ? 'green' : 'blue'}
          striped
          animated={percentage < 100}
        >
          <ChakraProgressBar borderRadius="md" />
        </ProgressRoot>

        {/* Stats Grid */}
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
          <Box>
            <HStack gap={1} mb={1}>
              {createElement(IoTime as any, { style: { width: '12px', height: '12px' } })}
              <Text fontSize="xs" color="gray.600">Total Stocks</Text>
            </HStack>
            <Text fontSize="2xl" fontWeight="bold">{progress.total_stocks}</Text>
          </Box>

          <Box>
            <HStack gap={1} mb={1}>
              {createElement(IoCheckmarkCircle as any, { style: { width: '12px', height: '12px', color: '#48BB78' } })}
              <Text fontSize="xs" color="gray.600">Analyzed</Text>
            </HStack>
            <Text fontSize="2xl" fontWeight="bold" color="green.600">
              {progress.analyzed}
            </Text>
          </Box>

          <Box>
            <HStack gap={1} mb={1}>
              {createElement(IoWarning as any, { style: { width: '12px', height: '12px', color: '#F56565' } })}
              <Text fontSize="xs" color="gray.600">Errors</Text>
            </HStack>
            <Text fontSize="2xl" fontWeight="bold" color={progress.errors > 0 ? 'red.600' : 'gray.400'}>
              {progress.errors}
            </Text>
          </Box>

          <Box>
            <Text fontSize="xs" color="gray.600" mb={1}>Cycle Time</Text>
            <Text fontSize="2xl" fontWeight="bold" color="blue.600">
              {cycleMinutes}:{cycleSeconds.toString().padStart(2, '0')}
            </Text>
          </Box>
        </SimpleGrid>

        {/* Current Symbol */}
        {progress.current_symbol && (
          <Box
            bg="blue.50"
            p={3}
            borderRadius="md"
            borderWidth="1px"
            borderColor="blue.200"
          >
            <HStack justify="space-between">
              <Text fontSize="sm" color="gray.600">
                Currently Analyzing:
              </Text>
              <Badge colorScheme="blue" fontSize="md">
                {progress.current_symbol}
              </Badge>
            </HStack>
          </Box>
        )}

        {/* Completion Message */}
        {percentage === 100 && (
          <Box
            bg="green.50"
            p={3}
            borderRadius="md"
            borderWidth="1px"
            borderColor="green.200"
          >
            <HStack>
              {createElement(IoCheckmarkCircle as any, { style: { width: '20px', height: '20px', color: '#48BB78' } })}
              <Text fontSize="sm" color="green.700" fontWeight="medium">
                Analysis cycle complete! Next cycle will begin shortly.
              </Text>
            </HStack>
          </Box>
        )}
      </VStack>
    </Box>
  );
};

export default ProgressBar;
