import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { I18nProvider, useTranslation } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the query hook directly to bypass Tanstack Query fetching issues in test env
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: vi.fn().mockReturnValue({ data: { 'house:123:name': 'Haus Ein' } }),
  };
});

function TestComponent() {
  const { t, td, locale } = useTranslation();
  return (
    <div>
      <span data-testid="t-test">{t('common.save')}</span>
      <span data-testid="t-fallback">{t('non.existent.key')}</span>
      <span data-testid="td-test">{td('house', '123', 'name', 'Casa Um')}</span>
      <span data-testid="td-fallback">{td('house', '999', 'name', 'Casa Dois')}</span>
      <span data-testid="locale-val">{locale}</span>
    </div>
  );
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>{ui}</I18nProvider>
    </QueryClientProvider>
  );
}

describe('i18n Implementation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders default text correctly (pt)', () => {
    renderWithProviders(<TestComponent />);
    expect(screen.getByTestId('t-test').textContent).toBe('Salvar');
    expect(screen.getByTestId('t-fallback').textContent).toBe('non.existent.key');
    expect(screen.getByTestId('td-test').textContent).toBe('Casa Um');
    expect(screen.getByTestId('td-fallback').textContent).toBe('Casa Dois');
    expect(screen.getByTestId('locale-val').textContent).toBe('pt');
  });

  it('changes locale correctly when LanguageSwitcher is used', () => {
    renderWithProviders(
      <>
        <TestComponent />
        <LanguageSwitcher />
      </>
    );

    // Initial state is pt
    expect(screen.getByTestId('t-test').textContent).toBe('Salvar');

    // Click English flag
    const enButton = screen.getByTitle('English (EN)');
    fireEvent.click(enButton);

    // Now it should be en
    expect(screen.getByTestId('t-test').textContent).toBe('Save');
    expect(screen.getByTestId('locale-val').textContent).toBe('en');

    // Due to our mock returning 'Haus Ein' for 'house:123:name', when locale is not pt, td should return it
    expect(screen.getByTestId('td-test').textContent).toBe('Haus Ein');
    // But since 999 doesn't exist in the mock dictionary, it falls back to pt original
    expect(screen.getByTestId('td-fallback').textContent).toBe('Casa Dois');

    // Check localStorage
    expect(localStorage.getItem('cormyr-locale')).toBe('en');
  });

  it('falls back to pt dictionary for missing translation keys', () => {
    renderWithProviders(
      <>
        <TestComponent />
        <LanguageSwitcher />
      </>
    );

    // Switch to DE
    fireEvent.click(screen.getByTitle('Deutsch (DE)'));
    expect(screen.getByTestId('locale-val').textContent).toBe('de');
    expect(screen.getByTestId('t-test').textContent).toBe('Speichern');
  });
});
