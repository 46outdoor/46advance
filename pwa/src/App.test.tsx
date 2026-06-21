import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect } from 'vitest';
import { App } from '@/App';

describe('App', () => {
  it('renders the brand mark and home copy', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { name: '46 Advance' })).toBeInTheDocument();
    expect(screen.getByAltText('46 Entertainment')).toBeInTheDocument();
  });
});
