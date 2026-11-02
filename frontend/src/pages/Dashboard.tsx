import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
} from '@chakra-ui/react';
import { ArrowUpRight, LayoutDashboard, RefreshCw } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useMarketSummary } from '../queries';
import { Surface, PageHeader } from '../components/ui/primitives';
import { MarketSnapshot } from '../features/dashboard/MarketSnapshot';
import { DashboardWidget } from '../features/dashboard/DashboardWidgets';
import { useWorkspace } from '../features/workspace/useWorkspace';
import { WorkspaceControls } from '../features/workspace/WorkspaceControls';
import { widgetCatalog, type WidgetId } from '../features/workspace/model';

const destinations: Record<WidgetId, string> = {
  sectors: '/sectors',
  movers: '/stocks?sort_by=price_change_percent&sort_order=desc',
  oversold: '/opportunities',
  megacap: '/stocks?min_market_cap=200000000000',
  watchlists: '/alerts?tab=watchlists',
  news: '/news',
  ai: '/research',
  portfolio: '/portfolio',
  portfolio_related: '/portfolio#related',
};
export function Dashboard() {
  const { settings } = useSettings();
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all(
        ['market-summary', 'market-indexes', 'sectors', 'news', 'alerts', 'portfolio'].map(
          (key) => client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    } finally {
      setRefreshing(false);
    }
  };
  const summary = useMarketSummary(settings);
  const workspace = useWorkspace();
  const generated = summary.data?.generated_at
    ? new Date(summary.data.generated_at)
    : null;
  return (
    <Container maxW="page" py={{ base: 5, md: 7 }}>
      <PageHeader
        title="Your market, in focus"
        subtitle="A clear view of the market. A workspace that fits your research."
        actions={
          <Button
            asChild
            size="sm"
            variant="outline"
            borderColor="border.default"
          >
            <Link to="/stocks">
              Explore stocks <ArrowUpRight size={15} />
            </Link>
          </Button>
        }
      />
      <MarketSnapshot />
      <Flex align="center" justify="space-between" gap={3} mb={3} wrap="wrap">
        <HStack gap={2}>
          <LayoutDashboard size={17} />
          <Heading as="h2" size="md">
            Workspace
          </Heading>
        </HStack>
        <HStack gap={2}>
          <Text fontSize="xs" color="fg.subtle">
            {summary.data
              ? `${summary.data.total_stocks.toLocaleString()} stocks in your universe`
              : 'Waiting for market analysis'}
            {generated && Number.isFinite(generated.getTime())
              ? ` · ${generated.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${generated.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </Text>
          <Button
            variant="ghost"
            size="xs"
            aria-label="Refresh workspace"
            loading={refreshing || summary.isFetching}
            onClick={refresh}
          >
            <RefreshCw size={13} />
          </Button>
        </HStack>
      </Flex>
      <WorkspaceControls {...workspace} />
      <Grid
        templateColumns={{
          base: 'minmax(0, 1fr)',
          md: 'repeat(12, minmax(0, 1fr))',
        }}
        gap={4}
        alignItems="stretch"
      >
        {workspace.layout.widgets.map((widget) => (
          <Surface
            key={widget.id}
            minW={0}
            gridColumn={{
              base: 'auto',
              md: `span ${widget.width === 4 ? 6 : widget.width}`,
              xl: `span ${widget.width}`,
            }}
            p={{ base: 4, md: 5 }}
          >
            <Flex align="center" justify="space-between" gap={2} mb={4}>
              <Heading as="h3" size="sm" fontWeight="semibold">
                {widgetCatalog[widget.id].title}
              </Heading>
              <Link
                to={destinations[widget.id]}
                aria-label={`Open ${widgetCatalog[widget.id].title}`}
              >
                <Box color="fg.subtle" p={1} _hover={{ color: 'accent.fg' }}>
                  <ArrowUpRight size={16} />
                </Box>
              </Link>
            </Flex>
            <DashboardWidget id={widget.id} summary={summary} />
          </Surface>
        ))}
      </Grid>
      {!workspace.layout.widgets.length && (
        <Surface p={8}>
          <Text fontWeight="medium">A clean slate</Text>
          <Text color="fg.muted" fontSize="sm" mt={2}>
            Use Customize to add panels to this layout.
          </Text>
        </Surface>
      )}
      <Text fontSize="xs" color="fg.subtle" mt={5}>
        Leaderboards are shortlists, not market-wide breadth. Technical signals
        are research inputs.
      </Text>
    </Container>
  );
}
