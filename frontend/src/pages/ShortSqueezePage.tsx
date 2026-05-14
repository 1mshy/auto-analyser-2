import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Container,
  Text,
  HStack,
  VStack,
  SimpleGrid,
  Spinner,
  Flex,
  Button,
  Input,
} from '@chakra-ui/react';
import { Flame, RefreshCw } from 'lucide-react';
import { api } from '../api';
import type { SqueezeCandidate } from '../types';
import {
  Surface,
  Num,
  SignalBadge,
  PageHeader,
  EmptyState,
} from '../components/ui/primitives';

/**
 * Pick a `SignalBadge` tone for the squeeze score:
 *  - score >= 70 -> "down" (red, hot — high squeeze risk)
 *  - score >= 40 -> "warn" (orange)
 *  - otherwise   -> "info"
 *
 * Tone mapping is independent of the score sign because `squeeze_score` is
 * always non-negative.
 */
function scoreTone(score: number): 'down' | 'warn' | 'info' {
  if (score >= 70) return 'down';
  if (score >= 40) return 'warn';
  return 'info';
}

const SqueezeCard: React.FC<{ candidate: SqueezeCandidate }> = ({ candidate }) => {
  const tone = scoreTone(candidate.squeeze_score);
  const rsiIntent =
    candidate.rsi == null
      ? 'neutral'
      : candidate.rsi < 30
      ? 'up'
      : candidate.rsi > 70
      ? 'down'
      : 'neutral';
  const changeIntent =
    candidate.price_change_pct == null
      ? 'neutral'
      : candidate.price_change_pct >= 0
      ? 'up'
      : 'down';

  return (
    <Surface accent={tone === 'down' ? 'down' : 'warn'} p={5} variant="raised">
      <VStack align="stretch" gap={3}>
        <Flex justify="space-between" align="center">
          <Link to={`/stocks/${candidate.symbol}`}>
            <HStack gap={2}>
              <Text fontSize="lg" fontWeight="semibold" color="fg.default" letterSpacing="tight">
                {candidate.symbol}
              </Text>
              {candidate.company_name && (
                <Text fontSize="xs" color="fg.muted">
                  {candidate.company_name}
                </Text>
              )}
            </HStack>
          </Link>
          <SignalBadge tone={tone} variant="solid" size="sm">
            <HStack gap={1}>
              <Flame size={12} />
              <Num
                value={candidate.squeeze_score}
                intent="neutral"
                decimals={1}
                fontSize="sm"
                fontWeight="semibold"
              />
            </HStack>
          </SignalBadge>
        </Flex>

        <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
          <Box>
            <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider" mb={1}>
              Short % of Float
            </Text>
            <Num
              value={candidate.short_pct_of_float}
              intent="auto"
              decimals={2}
              suffix="%"
              fontSize="md"
              fontWeight="semibold"
            />
          </Box>
          <Box>
            <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider" mb={1}>
              Days to Cover
            </Text>
            <Num
              value={candidate.days_to_cover}
              intent="neutral"
              decimals={2}
              fontSize="md"
              fontWeight="semibold"
            />
          </Box>
          <Box>
            <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider" mb={1}>
              RSI
            </Text>
            {candidate.rsi == null ? (
              <Text fontSize="md" color="fg.muted">—</Text>
            ) : (
              <Num
                value={candidate.rsi}
                intent={rsiIntent}
                decimals={1}
                fontSize="md"
                fontWeight="semibold"
              />
            )}
          </Box>
          <Box>
            <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wider" mb={1}>
              Price Change
            </Text>
            {candidate.price_change_pct == null ? (
              <Text fontSize="md" color="fg.muted">—</Text>
            ) : (
              <Num
                value={candidate.price_change_pct}
                intent={changeIntent}
                sign="always"
                decimals={2}
                suffix="%"
                fontSize="md"
                fontWeight="semibold"
              />
            )}
          </Box>
        </SimpleGrid>
      </VStack>
    </Surface>
  );
};

export const ShortSqueezePage: React.FC = () => {
  const [candidates, setCandidates] = useState<SqueezeCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minScore, setMinScore] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSqueezeCandidates(50);
      setCandidates(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => candidates.filter((c) => c.squeeze_score >= minScore),
    [candidates, minScore],
  );

  return (
    <Container maxW="7xl" py={6}>
      <PageHeader
        eyebrow="Special situations"
        title="Short Squeeze Candidates"
        subtitle="Top 50 names ranked by squeeze score (short % of float × 1.5 + days to cover × 5, +10 if RSI < 40)."
        icon={<Flame size={20} />}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={load}
            disabled={loading}
            colorPalette="orange"
          >
            <HStack gap={1.5}>
              <RefreshCw size={14} />
              <Text>Refresh</Text>
            </HStack>
          </Button>
        }
      />

      <HStack gap={3} mb={5} wrap="wrap">
        <Text fontSize="sm" color="fg.muted">Min squeeze score:</Text>
        <Input
          type="number"
          size="sm"
          maxW="120px"
          value={minScore}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setMinScore(Number.isFinite(v) ? v : 0);
          }}
          min={0}
          max={110}
          step={5}
        />
        <SignalBadge tone="neutral" size="sm">
          {visible.length} / {candidates.length} candidates
        </SignalBadge>
      </HStack>

      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner size="lg" />
        </Flex>
      ) : error ? (
        <EmptyState
          title="Failed to load squeeze candidates"
          description={error}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No candidates match"
          description={
            candidates.length === 0
              ? 'Short-interest data has not been collected yet. Once symbols are fetched, candidates will appear here.'
              : `No candidates with squeeze score >= ${minScore}. Lower the threshold to see more.`
          }
        />
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
          {visible.map((c) => (
            <SqueezeCard key={c.symbol} candidate={c} />
          ))}
        </SimpleGrid>
      )}
    </Container>
  );
};

export default ShortSqueezePage;
