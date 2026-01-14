import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Box } from '@chakra-ui/react';
import { Navigation } from './components/Navigation';
import { Dashboard } from './pages/Dashboard';
import { StocksPage } from './pages/StocksPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';
import { FundsPage } from './pages/FundsPage';
import { StockDetailPage } from './pages/StockDetailPage';
import { useWebSocket } from './hooks';
import { AnalysisProgress } from './types';
import { api } from './api';
import { SettingsProvider } from './contexts/SettingsContext';

function App() {
  const { } = useWebSocket(); // WebSocket for real-time updates
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);

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
  }, []);

  return (
    <SettingsProvider>
      <Router>
        <Box bg="gray.900" minH="100vh">
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
          </Routes>
        </Box>
      </Router>
    </SettingsProvider>
  );
}

export default App;
