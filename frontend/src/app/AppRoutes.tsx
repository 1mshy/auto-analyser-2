import React, { Suspense } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { Container, Button, Text, Heading } from '@chakra-ui/react';
import { Skeleton, SkeletonText } from '../components/ui/primitives';

// Route-level code splitting: each page becomes its own chunk, loaded on demand.
// Pages are named exports, so map them to `default` for React.lazy.
const Dashboard = React.lazy(() =>
  import('../pages/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const StocksPage = React.lazy(() =>
  import('../pages/StocksPage').then((m) => ({ default: m.StocksPage })),
);
const StockDetailPage = React.lazy(() =>
  import('../pages/StockDetailPage').then((m) => ({
    default: m.StockDetailPage,
  })),
);
const OpportunitiesPage = React.lazy(() =>
  import('../pages/OpportunitiesPage').then((m) => ({
    default: m.OpportunitiesPage,
  })),
);
const FundsPage = React.lazy(() =>
  import('../pages/FundsPage').then((m) => ({ default: m.FundsPage })),
);
const NewsPage = React.lazy(() =>
  import('../pages/NewsPage').then((m) => ({ default: m.NewsPage })),
);
const SectorPage = React.lazy(() =>
  import('../pages/SectorPage').then((m) => ({ default: m.SectorPage })),
);
const ScreenerPage = React.lazy(() =>
  import('../pages/ScreenerPage').then((m) => ({ default: m.ScreenerPage })),
);
const ResearchPage = React.lazy(() =>
  import('../pages/ResearchPage').then((m) => ({ default: m.ResearchPage })),
);
const AlertsPage = React.lazy(() =>
  import('../pages/AlertsPage').then((m) => ({ default: m.AlertsPage })),
);
const Backtest = React.lazy(() =>
  import('../pages/Backtest').then((m) => ({ default: m.Backtest })),
);

const RouteFallback = () => (
  <Container maxW="page" py={8}>
    <Skeleton h="8" w="56" mb={4} />
    <SkeletonText lines={6} />
  </Container>
);

function NotFound() {
  return (
    <Container py={12}>
      <Heading as="h1" mb={3}>
        Page not found
      </Heading>
      <Text color="fg.muted" mb={5}>
        This page may have moved. Return to your research workspace.
      </Text>
      <Button asChild variant="outline">
        <Link to="/">Open overview</Link>
      </Button>
    </Container>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/stocks" element={<StocksPage />} />
        <Route path="/stocks/:symbol" element={<StockDetailPage />} />
        <Route path="/opportunities" element={<OpportunitiesPage />} />
        <Route path="/funds" element={<FundsPage />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/sectors" element={<SectorPage />} />
        <Route path="/screener" element={<ScreenerPage />} />
        <Route path="/research" element={<ResearchPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/backtest" element={<Backtest />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
