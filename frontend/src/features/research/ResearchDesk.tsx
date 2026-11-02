import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Field,
  Flex,
  Heading,
  HStack,
  Input,
  Spinner,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import {
  ArrowRight,
  BookOpen,
  Check,
  MessageSquareText,
  RotateCcw,
  Square,
} from 'lucide-react';
import type { AIResearchInput } from '../../types';
import { useAIResearch, useAIStatus } from '../../queries';
import MarkdownContent from '../../components/MarkdownContent';
import {
  PageHeader,
  SignalBadge,
  Surface,
} from '../../components/ui/primitives';
import {
  MAX_QUESTION_LENGTH,
  RESEARCH_PROMPTS,
  researchInputError,
  researchSymbols,
  researchTimestamp,
  sameResearchInput,
} from './model';
import { ResearchSources } from './ResearchSources';

export function ResearchDesk() {
  const [params] = useSearchParams();
  const urlSymbols = params.getAll('symbols').join(', ');
  const [symbolInput, setSymbolInput] = useState(urlSymbols);
  const [question, setQuestion] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const status = useAIStatus();
  const research = useAIResearch();
  const input: AIResearchInput = {
    symbols: researchSymbols(symbolInput),
    question: question.trim(),
  };
  const error = researchInputError(input);
  const symbolError = researchInputError({
    ...input,
    question: 'Validate symbols',
  });
  const modelDiscovered =
    !!status.data?.current_model?.trim() ||
    (status.data?.available_models_count ?? 0) > 0;
  const available =
    status.data?.enabled === true && modelDiscovered && !status.isError;
  const submitted = research.variables?.input;
  const answer = research.isSuccess ? research.data : undefined;
  const edited = submitted != null && !sameResearchInput(input, submitted);

  useEffect(() => {
    setSymbolInput(urlSymbols);
  }, [urlSymbols]);
  useEffect(() => () => controller.current?.abort(), []);

  const ask = (request: AIResearchInput) => {
    if (!available || researchInputError(request) || research.isPending) return;
    controller.current?.abort();
    controller.current = new AbortController();
    setCancelled(false);
    research.mutate({
      input: {
        symbols: [...request.symbols],
        question: request.question.trim(),
      },
      signal: controller.current.signal,
    });
  };
  const cancel = () => {
    controller.current?.abort();
    research.reset();
    setCancelled(true);
  };

  return (
    <Container maxW="page" py={{ base: 5, md: 8 }}>
      <PageHeader
        eyebrow="Research desk"
        title="AI research"
        subtitle="Ask a focused question. Inspect the data behind the answer."
        actions={
          <HStack gap={2} wrap="wrap">
            <SignalBadge tone={available ? 'up' : 'neutral'}>
              {status.isLoading
                ? 'Checking model'
                : available
                  ? 'Model available'
                  : 'Model unavailable'}
            </SignalBadge>
            {available && status.data?.current_model && (
              <Text
                color="fg.muted"
                fontSize="xs"
                maxW="240px"
                overflowWrap="anywhere"
              >
                {status.data.current_model}
              </Text>
            )}
          </HStack>
        }
      />

      <Flex
        direction={{ base: 'column', xl: 'row' }}
        align="start"
        gap={{ base: 4, md: 6 }}
      >
        <Surface
          as="section"
          aria-labelledby="research-question-title"
          p={{ base: 4, md: 5 }}
          variant="raised"
          w={{ base: 'full', xl: '360px' }}
          flexShrink={0}
        >
          <HStack gap={2} mb={4}>
            <MessageSquareText size={18} />
            <Heading as="h2" id="research-question-title" size="sm">
              Your question
            </Heading>
          </HStack>
          <Box
            as="form"
            onSubmit={(event) => {
              event.preventDefault();
              ask(input);
            }}
          >
            <VStack align="stretch" gap={5}>
              <Field.Root invalid={symbolInput.trim() !== '' && !!symbolError}>
                <Field.Label>
                  Stock symbols{' '}
                  <Text as="span" color="fg.subtle" fontWeight="normal">
                    {input.symbols.length}/4
                  </Text>
                </Field.Label>
                <Input
                  placeholder="AAPL, MSFT, SHOP.TO"
                  value={symbolInput}
                  maxLength={120}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setSymbolInput(event.target.value)}
                  bg="bg.inset"
                />
                {symbolInput.trim() !== '' && symbolError ? (
                  <Field.ErrorText>{symbolError}</Field.ErrorText>
                ) : (
                  <Field.HelperText>
                    One to four symbols, separated by commas.
                  </Field.HelperText>
                )}
                {input.symbols.length > 0 && !symbolError && (
                  <HStack gap={1.5} wrap="wrap" mt={1}>
                    {input.symbols.map((symbol) => (
                      <SignalBadge key={symbol} tone="neutral" size="sm">
                        {symbol}
                      </SignalBadge>
                    ))}
                  </HStack>
                )}
              </Field.Root>
              <Field.Root>
                <Flex w="full" justify="space-between" align="center">
                  <Field.Label mb={0}>
                    What would you like to understand?
                  </Field.Label>
                </Flex>
                <Textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  maxLength={MAX_QUESTION_LENGTH}
                  rows={6}
                  placeholder="What do the current signals suggest, and where should I be cautious?"
                  resize="vertical"
                  bg="bg.inset"
                />
                <Text alignSelf="end" fontSize="xs" color="fg.subtle">
                  {question.length.toLocaleString()} / 1,000
                </Text>
              </Field.Root>
              <Box>
                <Text fontSize="xs" color="fg.muted" mb={2}>
                  Start with a prompt
                </Text>
                <VStack align="stretch" gap={2}>
                  {RESEARCH_PROMPTS.map((prompt) => (
                    <Button
                      key={prompt.label}
                      variant="outline"
                      size="sm"
                      h="auto"
                      minH="10"
                      whiteSpace="normal"
                      justifyContent="space-between"
                      textAlign="left"
                      onClick={() => setQuestion(prompt.question)}
                    >
                      {prompt.label}
                      <ArrowRight size={14} />
                    </Button>
                  ))}
                </VStack>
              </Box>
              {!status.isLoading && !available && (
                <Box
                  borderWidth="1px"
                  borderColor="border.subtle"
                  borderRadius="md"
                  p={3}
                  role="status"
                >
                  <Text fontSize="sm" color="fg.muted">
                    {status.isError
                      ? 'Could not check the model connection.'
                      : status.data?.enabled
                        ? 'AI research is unavailable. No model was found; check again when the model service is ready.'
                        : 'AI research is unavailable. The server needs an enabled model before questions can be submitted.'}
                  </Text>
                  <Button
                    size="xs"
                    variant="ghost"
                    mt={2}
                    onClick={() => status.refetch()}
                    loading={status.isFetching}
                  >
                    <RotateCcw size={13} />
                    Check again
                  </Button>
                </Box>
              )}
              <Box>
                <Button
                  type="submit"
                  w="full"
                  minH="11"
                  disabled={!!error || !available || research.isPending}
                >
                  {research.isPending ? (
                    <>
                      <Spinner size="sm" />
                      Researching…
                    </>
                  ) : (
                    <>
                      <MessageSquareText size={16} />
                      Ask AI
                    </>
                  )}
                </Button>
                <Text fontSize="xs" color="fg.muted" mt={2}>
                  Uses stored stock analysis. Questions are sent only when you
                  ask.
                </Text>
              </Box>
            </VStack>
          </Box>
        </Surface>

        <Box flex="1" w="full" minW={0}>
          {research.isPending && (
            <Surface p={{ base: 4, md: 6 }} role="status" aria-live="polite">
              <HStack gap={3} mb={4}>
                <Spinner size="sm" color="accent.fg" />
                <Heading as="h2" size="sm">
                  Researching {submitted?.symbols.join(', ')}
                </Heading>
              </HStack>
              <Text color="fg.muted" fontSize="sm" overflowWrap="anywhere">
                {submitted?.question}
              </Text>
              <Flex
                mt={5}
                align="center"
                justify="space-between"
                gap={3}
                wrap="wrap"
              >
                <Text color="fg.subtle" fontSize="xs">
                  This may take up to two minutes.
                </Text>
                <Button size="sm" variant="outline" onClick={cancel}>
                  <Square size={12} />
                  Cancel request
                </Button>
              </Flex>
              {edited && (
                <Text fontSize="xs" mt={3} color="accent.fg">
                  Your edits are ready for the next question. This request uses
                  the question shown above.
                </Text>
              )}
            </Surface>
          )}

          {research.isError && (
            <Surface p={{ base: 4, md: 6 }} role="alert">
              <Heading as="h2" size="md" mb={2}>
                Research could not be completed
              </Heading>
              <Text color="fg.muted" fontSize="sm" overflowWrap="anywhere">
                {research.error instanceof Error
                  ? research.error.message
                  : 'An unexpected error interrupted the request.'}
              </Text>
              {submitted && (
                <Box mt={4} p={3} bg="bg.inset" borderRadius="md">
                  <Text fontSize="xs" color="fg.subtle" mb={1}>
                    {submitted.symbols.join(' · ')}
                  </Text>
                  <Text fontSize="sm" overflowWrap="anywhere">
                    {submitted.question}
                  </Text>
                </Box>
              )}
              <Button
                mt={4}
                variant="outline"
                size="sm"
                disabled={!available || !submitted}
                onClick={() => submitted && ask(submitted)}
              >
                <RotateCcw size={14} />
                Retry this question
              </Button>
            </Surface>
          )}

          {answer && (
            <>
              <Surface
                p={{ base: 4, md: 6 }}
                as="article"
                aria-labelledby="research-answer-title"
              >
                <Flex
                  justify="space-between"
                  align="center"
                  gap={3}
                  wrap="wrap"
                  mb={4}
                >
                  <HStack gap={2}>
                    <Heading as="h2" id="research-answer-title" size="md">
                      Research note
                    </Heading>
                    <SignalBadge tone="accent" size="sm">
                      AI-generated
                    </SignalBadge>
                  </HStack>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      research.reset();
                      setCancelled(false);
                    }}
                  >
                    Clear answer
                  </Button>
                </Flex>
                <Box
                  borderBottomWidth="1px"
                  borderColor="border.subtle"
                  pb={4}
                  mb={5}
                >
                  <Text color="fg.subtle" fontSize="xs" mb={2}>
                    {submitted?.symbols.join(' · ')}
                  </Text>
                  <Text
                    fontSize="sm"
                    fontWeight="medium"
                    overflowWrap="anywhere"
                  >
                    {answer.question}
                  </Text>
                  <Text
                    color="fg.subtle"
                    fontSize="xs"
                    mt={2}
                    overflowWrap="anywhere"
                  >
                    {answer.model_used} ·{' '}
                    <time dateTime={answer.generated_at}>
                      {researchTimestamp(answer.generated_at)}
                    </time>
                  </Text>
                  {edited && (
                    <Text fontSize="xs" color="accent.fg" mt={3}>
                      This answer belongs to the question above. Your current
                      edits have not been submitted.
                    </Text>
                  )}
                </Box>
                <Box overflowWrap="anywhere" minW={0}>
                  <MarkdownContent
                    fontSize="sm"
                    color="fg.default"
                    allowImages={false}
                  >
                    {answer.answer}
                  </MarkdownContent>
                </Box>
                <HStack
                  gap={2}
                  align="start"
                  borderTopWidth="1px"
                  borderColor="border.subtle"
                  pt={4}
                  mt={5}
                  color="fg.muted"
                >
                  <Box flexShrink={0} mt="2px">
                    <Check size={14} />
                  </Box>
                  <Text fontSize="xs">
                    Verify AI-generated claims against the source snapshots
                    below. This answer reflects stored analysis, not a live
                    quote.
                  </Text>
                </HStack>
              </Surface>
              <ResearchSources
                sources={answer.sources}
                missingSymbols={answer.missing_symbols}
              />
            </>
          )}

          {!research.isPending && !research.isError && !answer && (
            <Surface
              p={{ base: 5, md: 8 }}
              minH={{ base: '240px', xl: '420px' }}
              display="flex"
              flexDirection="column"
              justifyContent="center"
            >
              <Box color="accent.fg" mb={4}>
                <BookOpen size={26} />
              </Box>
              <Heading as="h2" size="lg" mb={3}>
                {cancelled ? 'Request cancelled' : 'A question worth exploring'}
              </Heading>
              <Text
                color="fg.muted"
                maxW="480px"
                fontSize="sm"
                lineHeight="tall"
              >
                {cancelled
                  ? 'Your draft is still here. Edit it or ask again when you’re ready.'
                  : 'Explain an indicator, compare a few stocks, or test the assumptions behind an idea. Each answer includes the stock data the model received.'}
              </Text>
              <Box
                borderTopWidth="1px"
                borderColor="border.subtle"
                mt={6}
                pt={4}
              >
                <Text fontSize="xs" color="fg.subtle" mb={2}>
                  Need a starting point?
                </Text>
                <Button asChild size="sm" variant="outline">
                  <Link to="/stocks">
                    Explore analyzed stocks
                    <ArrowRight size={14} />
                  </Link>
                </Button>
              </Box>
            </Surface>
          )}
        </Box>
      </Flex>
    </Container>
  );
}
