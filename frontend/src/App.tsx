import React, { useEffect, useState, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Box } from '@chakra-ui/react';
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
import { useWebSocket, useMarketOpenRefresh } from './hooks';
import { AnalysisProgress } from './types';
import { api } from './api';
import { SettingsProvider } from './contexts/SettingsContext';

function App() {
  const { progress: wsProgress } = useWebSocket();
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Handler for US market-open refresh.
  const handleMarketOpenRefresh = useCallback(() => {
    console.log('Refreshing all stock data for market open...');
    // Increment key to force re-fetch in child components
    setRefreshKey(prev => prev + 1);
    // Also reload the page to ensure fresh data everywhere
    window.location.reload();
  }, []);

  // Set up automatic refresh shortly after 9:30am ET on weekdays.
  useMarketOpenRefresh(handleMarketOpenRefresh);

  useEffect(() => {
    if (wsProgress) {
      setProgress(wsProgress);
    }
  }, [wsProgress]);

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const data = await api.getProgress();
        setProgress(data);
      } catch (err) {
        console.error('Failed to fetch progress:', err);
      }
    };

    fetchProgress();
    const interval = setInterval(fetchProgress, 5000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  return (
    <SettingsProvider>
      <Router>
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
          </Routes>
        </Box>
      </Router>
    </SettingsProvider>
  );
}

export default App;
