import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  beforeEach(() => localStorage.clear());

  it('redirects an unauthenticated visitor to the sign-in page', async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument(),
    );
  });
});
