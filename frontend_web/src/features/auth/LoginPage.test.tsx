import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { LoginPage } from './LoginPage';

const { loginMock } = vi.hoisted(() => ({ loginMock: vi.fn() }));
vi.mock('../../lib/auth/auth-context', () => ({ useAuth: () => ({ login: loginMock }) }));

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('LoginPage', () => {
  it('uses password-manager-friendly autocomplete attributes (web.dev sign-in form)', () => {
    renderPage();
    const email = screen.getByLabelText(/^correo electrónico/i);
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'username');

    const password = screen.getByLabelText(/^contraseña/i);
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('id', 'current-password');
  });

  it('offers an accessible show-password toggle', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /mostrar contraseña/i })).toBeInTheDocument();
  });

  it('submits credentials to login', async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue({ passwordChangeRequired: false });
    renderPage();

    await user.type(screen.getByLabelText(/^correo electrónico/i), 'u@futuragest.co');
    await user.type(screen.getByLabelText(/^contraseña/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(loginMock).toHaveBeenCalledWith('u@futuragest.co', 'secret123');
  });

  it('shows an error message when credentials are rejected', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue(new ApiError(401, 'Correo o contraseña incorrectos'));
    renderPage();

    await user.type(screen.getByLabelText(/^correo electrónico/i), 'u@futuragest.co');
    await user.type(screen.getByLabelText(/^contraseña/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
  });

  it('does not show validation errors before interaction', () => {
    renderPage();
    expect(screen.queryByText(/correo válido/i)).not.toBeInTheDocument();
  });
});
