import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Box, Container } from '@chakra-ui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Navigation } from './components/Navigation';
import { SettingsProvider } from './contexts/SettingsContext';
import { ProgressProvider, useProgress } from './contexts/ProgressContext';
import { queryClient } from './queryClient';
import { Skeleton, SkeletonText } from './components/ui/primitives';

// Route-level code splitting: each page becomes its own chunk, loaded on demand.
// Pages are named exports, so map them to `default` for React.lazy.
const Dashboard = React.lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const StocksPage = React.lazy(() =>
  import('./pages/StocksPage').then((m) => ({ default: m.StocksPage })),
);
const StockDetailPage = React.lazy(() =>
  import('./pages/StockDetailPage').then((m) => ({ default: m.StockDetailPage })),
);
const OpportunitiesPage = React.lazy(() =>
  import('./pages/OpportunitiesPage').then((m) => ({ default: m.OpportunitiesPage })),
);
const FundsPage = React.lazy(() =>
  import('./pages/FundsPage').then((m) => ({ default: m.FundsPage })),
);
const NewsPage = React.lazy(() =>
  import('./pages/NewsPage').then((m) => ({ default: m.NewsPage })),
);
const SectorPage = React.lazy(() =>
  import('./pages/SectorPage').then((m) => ({ default: m.SectorPage })),
);
const ScreenerPage = React.lazy(() =>
  import('./pages/ScreenerPage').then((m) => ({ default: m.ScreenerPage })),
);
const AlertsPage = React.lazy(() =>
  import('./pages/AlertsPage').then((m) => ({ default: m.AlertsPage })),
);
const Backtest = React.lazy(() =>
  import('./pages/Backtest').then((m) => ({ default: m.Backtest })),
);

const RouteFallback = () => (
  <Container maxW="page" py={8}>
    <Skeleton h="8" w="56" mb={4} />
    <SkeletonText lines={6} />
  </Container>
);

function AppShell() {
  const { progress } = useProgress();
  return (
    <Box bg="bg.canvas" minH="100vh" color="fg.default">
      <Navigation
        totalStocks={progress?.total_stocks}
        analyzedCount={progress?.analyzed}
      />
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
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/backtest" element={<Backtest />} />
        </Routes>
      </Suspense>
    </Box>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <ProgressProvider>
          <Router>
            <AppShell />
          </Router>
        </ProgressProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}

export default App;
