import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlayerAccountForm } from '@/components/player-account-form';
import React from 'react';

vi.mock('@tanstack/react-start', () => ({
  useServerFn: (fn: any) => fn
}));

vi.mock('@/lib/player-admin.functions', () => ({
  managePlayerAccount: vi.fn()
}));

import { managePlayerAccount } from '@/lib/player-admin.functions';

describe('PlayerAccountForm', () => {
  it('displays error message when managePlayerAccount rejects', async () => {
    const errorMsg = 'Mocked error message';
    vi.mocked(managePlayerAccount).mockRejectedValueOnce(new Error(errorMsg));

    render(<PlayerAccountForm houses={[{ id: 'h1', name: 'House 1' }]} onSave={vi.fn()} />);

    // Fill required fields
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Test Player' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha inicial'), { target: { value: 'password123' } });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: 'Salvar conta e jogador' }));

    // Assert error message is displayed
    await waitFor(() => {
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });
  });
});
