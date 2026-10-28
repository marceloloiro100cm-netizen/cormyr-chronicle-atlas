import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HouseReconciliation } from '@/components/house/reconciliation';
import * as houseImport from '@/lib/house/import';

describe('HouseReconciliation', () => {
  it('exibe erro quando a leitura da planilha falha', async () => {
    vi.spyOn(houseImport, 'readWorkbook').mockRejectedValue(new Error('Formato de arquivo inválido'));

    render(<HouseReconciliation houses={[{ id: 'h1', name: 'Stark' }]} records={[]} />);

    const fileInput = screen.getByLabelText(/Planilhas/);
    const file = new File([''], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Formato de arquivo inválido');
    });
  });
});
