import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportOperariosModal } from './ImportOperariosModal';

const { importMock } = vi.hoisted(() => ({ importMock: vi.fn() }));
vi.mock('./operario-queries', () => ({
  useImportOperarios: () => ({ mutateAsync: importMock, isPending: false }),
}));

function renderModal() {
  return render(
    <MantineProvider>
      <ImportOperariosModal opened onClose={vi.fn()} />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('ImportOperariosModal', () => {
  it('explains the expected columns', () => {
    renderModal();
    expect(screen.getByText(/fullName,documento,supervisorEmail/)).toBeInTheDocument();
  });

  it('uploads the selected file and shows the import result', async () => {
    importMock.mockResolvedValue({
      imported: 2,
      failed: 1,
      errors: [{ row: 3, documento: '1030000009', reason: 'Duplicate documento' }],
    });
    const user = userEvent.setup();
    renderModal();

    // Mantine Modal renders in a portal, so query the document, not the container.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fullName,documento,supervisorEmail\n'], 'ops.csv', { type: 'text/csv' });
    await user.upload(fileInput, file);

    await user.click(screen.getByRole('button', { name: /^importar$/i }));

    expect(importMock).toHaveBeenCalledWith(file);
    expect(await screen.findByText(/2 importados, 1 fallidos/i)).toBeInTheDocument();
    expect(screen.getByText('Duplicate documento')).toBeInTheDocument();
  });
});
