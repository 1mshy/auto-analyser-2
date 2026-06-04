import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Box } from '@chakra-ui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Navigation } from './components/Navigation';
import { Dashboard } from './pages/Dashboard';
import { StocksPage } from './pages/StocksPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';
import { FundsPage } from './pages/FundsPage';
import { NewsPage } from './pages/NewsPage';
import { SectorPage } from './pages/SectorPage';
import { ScreenerPage } from './pages/ScreenerPage';
import { StockDetailPage } from './pages/StockDetailPage';
import { AlertsPage } from './pages/AlertsPage';
import { Backtest } from './pages/Backtest';
import { SettingsProvider } from './contexts/SettingsContext';
import { ProgressProvider, useProgress } from './contexts/ProgressContext';
import { queryClient } from './queryClient';

function AppShell() {
  const { progress } = useProgress();
  return (
    <Box bg="bg.canvas" minH="100vh" color="fg.default">
      <Navigation
        totalStocks={progress?.total_stocks}
        analyzedCount={progress?.analyzed}
      />
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
