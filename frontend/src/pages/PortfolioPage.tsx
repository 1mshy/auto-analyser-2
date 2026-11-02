import { Link } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Flex,
  Grid,
  Heading,
  HStack,
  Text,
  VStack,
} from '@chakra-ui/react';
import { ArrowUpRight, Briefcase, Trash2 } from 'lucide-react';
import {
  Callout,
  ErrorState,
  PageHeader,
  SectionLabel,
  SkeletonText,
  StatBlock,
  Surface,
} from '../components/ui/primitives';
import { toaster } from '../components/ui/toaster';
import { usePortfolio, usePortfolioMutations, usePortfolioRelated } from '../queries';
import { AddHoldingForm } from '../features/portfolio/AddHoldingForm';
import { HoldingsTable } from '../features/portfolio/HoldingsTable';
import { PortfolioImport } from '../features/portfolio/PortfolioImport';
import { PositionsList, RelatedList } from '../features/portfolio/PortfolioLists';
import { fmtCurrency } from '../features/portfolio/model';
import { shortDate } from '../format';

export function PortfolioPage() {
  const portfolio = usePortfolio();
  const related = usePortfolioRelated(12);
  const { remove, clear } = usePortfolioMutations();
  const summary = portfolio.data?.summary;
  const holdings = portfolio.data?.holdings ?? [];
  const positions = portfolio.data?.positions ?? [];
  const hasHoldings = holdings.length > 0;

  const onDelete = async (id: string, label: string) => {
    if (!window.confirm(`Remove ${label} from your portfolio?`)) return;
    try {
      await remove.mutateAsync(id);
      toaster.create({ title: `Removed ${label}`, type: 'success' });
    } catch (error) {
      toaster.create({
        title: 'Could not remove holding',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      });
    }
  };

  const onClear = async () => {
    if (!window.confirm('Remove every holding from your portfolio? This cannot be undone.'))
      return;
    try {
      const deleted = await clear.mutateAsync();
      toaster.create({ title: `Removed ${deleted} holdings`, type: 'success' });
    } catch (error) {
      toaster.create({
        title: 'Could not clear portfolio',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      });
    }
  };

  return (
    <Container maxW="page" py={{ base: 5, md: 7 }}>
      <PageHeader
        icon={<Briefcase size={20} />}
        title="Your portfolio"
        subtitle="Upload a brokerage export in any readable format. The overview then tracks what you hold and what moves around it."
        actions={
          hasHoldings ? (
            <Button
              size="sm"
              variant="ghost"
              colorPalette="red"
              loading={clear.isPending}
              onClick={onClear}
            >
              <Trash2 size={14} /> Clear portfolio
            </Button>
          ) : undefined
        }
      />

      {portfolio.isError && !portfolio.data ? (
        <ErrorState
          title="Portfolio unavailable"
          description={portfolio.error.message}
          onRetry={() => portfolio.refetch()}
        />
      ) : null}

      {summary && hasHoldings && (
        <Grid
          templateColumns={{ base: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }}
          gap={3}
          mb={5}
        >
          <StatBlock
            label="Holdings"
            value={summary.holdings}
            hint={`${summary.symbols} symbols · ${summary.accounts.length || 1} account${summary.accounts.length === 1 ? '' : 's'}`}
            size="sm"
          />
          {summary.totals.slice(0, 3).map((total) => (
            <StatBlock
              key={total.currency}
              label={`Value · ${total.currency}`}
              value={fmtCurrency(total.market_value, total.currency, 0)}
              delta={total.cost_basis > 0 ? (total.unrealized_pnl / total.cost_basis) * 100 : null}
              deltaSuffix="% vs cost"
              hint={`Day ${fmtCurrency(total.day_change, total.currency, 0)}`}
              size="sm"
            />
          ))}
        </Grid>
      )}

      {summary?.unanalyzed_symbols.length ? (
        <Callout tone="info" mb={5} fontSize="sm">
          Not in the analysis universe yet: {summary.unanalyzed_symbols.join(', ')}. They show
          file values only until the engine picks them up (add Canadian listings via
          CANADIAN_SYMBOLS).
        </Callout>
      ) : null}

      <Grid
        templateColumns={{ base: 'minmax(0, 1fr)', lg: 'minmax(0, 7fr) minmax(0, 5fr)' }}
        gap={4}
        alignItems="start"
        mb={5}
      >
        <Surface p={{ base: 4, md: 5 }}>
          <SectionLabel mb={3}>Import holdings</SectionLabel>
          <PortfolioImport
            hasHoldings={hasHoldings}
            onImported={() => {
              portfolio.refetch();
              related.refetch();
            }}
          />
        </Surface>
        <VStack align="stretch" gap={4}>
          <Surface p={{ base: 4, md: 5 }}>
            <SectionLabel mb={3}>Add a holding by hand</SectionLabel>
            <AddHoldingForm />
          </Surface>
          {summary && summary.sectors.length > 0 && (
            <Surface p={{ base: 4, md: 5 }}>
              <SectionLabel mb={3}>Sector mix</SectionLabel>
              <VStack align="stretch" gap={2}>
                {summary.sectors.slice(0, 8).map((sector) => (
                  <Box key={sector.sector}>
                    <Flex justify="space-between" fontSize="xs" mb={1}>
                      <Text truncate title={sector.symbols.join(', ')}>
                        {sector.sector}{' '}
                        <Text as="span" color="fg.subtle">
                          · {sector.symbols.join(', ')}
                        </Text>
                      </Text>
                      <Text className="num">{sector.weight_pct.toFixed(1)}%</Text>
                    </Flex>
                    <Box h="4px" bg="bg.emphasized" borderRadius="full" overflow="hidden">
                      <Box
                        h="full"
                        w={`${Math.max(0, Math.min(100, sector.weight_pct))}%`}
                        bg="accent.solid"
                      />
                    </Box>
                  </Box>
                ))}
                <Text fontSize="2xs" color="fg.subtle">
                  Weights take currencies at par; use them for shape, not for money.
                </Text>
              </VStack>
            </Surface>
          )}
        </VStack>
      </Grid>

      <Surface p={{ base: 4, md: 5 }} mb={5}>
        <Flex justify="space-between" align="center" gap={2} mb={3} wrap="wrap">
          <Heading as="h2" size="sm" fontWeight="semibold">
            Holdings
          </Heading>
          {summary?.last_imported_at && (
            <Text fontSize="xs" color="fg.subtle">
              Last import {shortDate(summary.last_imported_at)}
              {summary.source_file ? ` · ${summary.source_file}` : ''}
            </Text>
          )}
        </Flex>
        {portfolio.isLoading ? (
          <SkeletonText lines={6} />
        ) : hasHoldings ? (
          <HoldingsTable holdings={holdings} onDelete={onDelete} deleting={remove.isPending} />
        ) : (
          <Text fontSize="sm" color="fg.muted" py={4}>
            No holdings yet. Import a file above or add one by hand.
          </Text>
        )}
      </Surface>

      {hasHoldings && (
        <Grid
          templateColumns={{ base: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }}
          gap={4}
        >
          <Surface p={{ base: 4, md: 5 }}>
            <Flex justify="space-between" align="center" mb={3}>
              <Heading as="h2" size="sm" fontWeight="semibold">
                Positions
              </Heading>
              <Link to="/" aria-label="Open overview">
                <HStack gap={1} color="fg.subtle" fontSize="xs" _hover={{ color: 'accent.fg' }}>
                  <Text>Overview</Text>
                  <ArrowUpRight size={14} />
                </HStack>
              </Link>
            </Flex>
            <PositionsList positions={positions} limit={30} />
          </Surface>
          <Surface p={{ base: 4, md: 5 }} id="related">
            <Heading as="h2" size="sm" fontWeight="semibold" mb={3}>
              Related to your portfolio
            </Heading>
            {related.isLoading ? (
              <SkeletonText lines={6} />
            ) : related.isError && !related.data ? (
              <Text fontSize="sm" color="fg.muted">
                Related stocks are unavailable right now.
              </Text>
            ) : related.data?.related.length ? (
              <RelatedList related={related.data.related} limit={12} />
            ) : (
              <Text fontSize="sm" color="fg.muted">
                Nothing related yet. Related names appear once your holdings have been analyzed
                and classified by sector.
              </Text>
            )}
          </Surface>
        </Grid>
      )}
    </Container>
  );
}
