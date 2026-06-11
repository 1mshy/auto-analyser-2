import React from 'react';
import { Box, Button, Flex, Heading, HStack, Separator, Text, VStack } from '@chakra-ui/react';
import { Bot, Brain, RefreshCw, Sparkles, Zap } from 'lucide-react';
import MarkdownContent from '../../components/MarkdownContent';
import { AIAnalysisResponse } from '../../types';
import {
  Callout,
  EmptyState,
  SignalBadge,
  SkeletonText,
  Surface,
} from '../../components/ui/primitives';
import { StreamingStatus } from './useAIAnalysisStream';

const stageMeta = (stage: string): { icon: React.ReactNode; label: string } => {
  switch (stage) {
    case 'connecting':
      return { icon: <Bot size={16} />, label: 'Connecting…' };
    case 'analyzing':
      return { icon: <Brain size={16} />, label: 'Analyzing…' };
    default:
      return { icon: <Sparkles size={16} />, label: 'Generating…' };
  }
};

export interface AITabProps {
  aiEnabled: boolean;
  aiAnalysis: AIAnalysisResponse | null;
  aiLoading: boolean;
  isStreaming: boolean;
  streamingText: string;
  streamingStatus: StreamingStatus | null;
  streamingModel: string | null;
  onGenerate: () => void;
}

export const AITab: React.FC<AITabProps> = ({
  aiEnabled,
  aiAnalysis,
  aiLoading,
  isStreaming,
  streamingText,
  streamingStatus,
  streamingModel,
  onGenerate,
}) => {
  return (
    <Surface variant="raised" p={{ base: 4, md: 5 }}>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap" mb={4}>
        <HStack>
          <Box color="accent.solid">
            <Zap size={20} />
          </Box>
          <Heading size="md" color="fg.default">
            AI Analysis
          </Heading>
          {streamingModel && (
            <SignalBadge tone="accent" size="sm">
              {streamingModel}
            </SignalBadge>
          )}
        </HStack>
        <Button
          size="sm"
          minH={{ base: 11, md: 8 }}
          variant="outline"
          borderColor="accent.muted"
          color="accent.fg"
          bg="accent.subtle"
          _hover={{ bg: 'accent.muted' }}
          onClick={onGenerate}
          loading={aiLoading && !isStreaming}
          disabled={!aiEnabled || isStreaming}
        >
          <RefreshCw size={14} />
          {aiAnalysis || streamingText ? 'Refresh' : 'Generate'}
        </Button>
      </Flex>

      {!aiEnabled ? (
        <Callout tone="warn" title="AI analysis is not enabled">
          Set the OPENROUTER_API_KEY_STOCKS environment variable to enable AI-powered insights.
        </Callout>
      ) : isStreaming || streamingText ? (
        <Box>
          {/* Streaming status */}
          {streamingStatus && (
            <Callout
              tone="accent"
              icon={stageMeta(streamingStatus.stage).icon}
              title={stageMeta(streamingStatus.stage).label}
              mb={4}
            >
              {streamingStatus.message}
            </Callout>
          )}

          {/* Streaming text with cursor */}
          <Box position="relative">
            <MarkdownContent>{streamingText}</MarkdownContent>
            {isStreaming && (
              <Box
                as="span"
                display="inline-block"
                w="2px"
                h="1em"
                bg="accent.solid"
                ml="1px"
                animation="blink 1s infinite"
                verticalAlign="text-bottom"
                css={{
                  '@keyframes blink': {
                    '0%, 50%': { opacity: 1 },
                    '51%, 100%': { opacity: 0 },
                  },
                }}
              />
            )}
          </Box>

          {/* Completion info */}
          {!isStreaming && streamingText && (
            <>
              <Separator my={4} />
              <HStack justify="space-between">
                <Text color="fg.subtle" fontSize="sm">
                  Model: {streamingModel || aiAnalysis?.model_used || 'Unknown'}
                </Text>
                <Text color="fg.subtle" fontSize="sm" className="num" data-num="">
                  Generated:{' '}
                  {aiAnalysis?.generated_at
                    ? new Date(aiAnalysis.generated_at).toLocaleString()
                    : new Date().toLocaleString()}
                </Text>
              </HStack>
            </>
          )}
        </Box>
      ) : aiLoading ? (
        <VStack align="stretch" gap={3} py={2}>
          <SkeletonText lines={2} />
          <SkeletonText lines={5} />
        </VStack>
      ) : aiAnalysis?.success ? (
        <Box>
          <MarkdownContent>{aiAnalysis.analysis || ''}</MarkdownContent>
          <Separator my={4} />
          <HStack justify="space-between">
            <Text color="fg.subtle" fontSize="sm">
              Model: {aiAnalysis.model_used}
            </Text>
            <Text color="fg.subtle" fontSize="sm" className="num" data-num="">
              Generated:{' '}
              {aiAnalysis.generated_at ? new Date(aiAnalysis.generated_at).toLocaleString() : '—'}
            </Text>
          </HStack>
        </Box>
      ) : aiAnalysis ? (
        <Callout tone="down" title="Analysis failed">
          {aiAnalysis.error}
        </Callout>
      ) : (
        <EmptyState
          icon={<Sparkles size={28} />}
          title="No AI analysis yet"
          description='Click "Generate" to get AI-powered analysis for this stock.'
          py={8}
        />
      )}
    </Surface>
  );
};
