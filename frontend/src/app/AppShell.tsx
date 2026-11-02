import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Box } from '@chakra-ui/react';
import { Navigation } from '../components/Navigation';
import { useProgress } from '../contexts/ProgressContext';
import { AppRoutes } from './AppRoutes';
import { navigation, isNavigationActive } from './navigation';

export function AppShell() {
  const { progress } = useProgress();
  const { pathname } = useLocation();
  useEffect(() => {
    const page = navigation
      .flatMap((group) => group.items)
      .find((item) => isNavigationActive(pathname, item.to));
    document.title = `${pathname.startsWith('/stocks/') ? (pathname.split('/').pop() ?? '') : (page?.label ?? 'Research')} · Auto Analyser`;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return (
    <Box bg="bg.canvas" minH="100dvh" color="fg.default">
      <Navigation
        totalStocks={progress?.total_stocks}
        analyzedCount={progress?.analyzed}
      />
      <Box
        as="main"
        id="main-content"
        tabIndex={-1}
        className="workspace-main"
        minW={0}
      >
        <AppRoutes />
      </Box>
    </Box>
  );
}
