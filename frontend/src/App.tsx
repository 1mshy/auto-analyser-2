import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { SettingsProvider } from './contexts/SettingsContext';
import { ProgressProvider } from './contexts/ProgressContext';
import { queryClient } from './queryClient';
import { AppShell } from './app/AppShell';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <ProgressProvider>
          <BrowserRouter>
            <AppShell />
          </BrowserRouter>
        </ProgressProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}
