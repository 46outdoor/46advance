import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './index.css';

import { App } from '@/App';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt';
import { AuthProvider } from '@/contexts/AuthProvider';
import { ThemeProvider } from '@/contexts/ThemeProvider';
import { initSentry } from '@/lib/sentry';

initSentry();

const queryClient = new QueryClient();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AuthProvider>
        </QueryClientProvider>
        <PwaUpdatePrompt />
      </ThemeProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
