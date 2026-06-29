import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { VerificationBadge } from './VerificationBadge';

function wrap(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('VerificationBadge', () => {
  it('renders a green badge for BIOMETRIC', () => {
    wrap(<VerificationBadge method="BIOMETRIC" />);
    expect(screen.getByText('Huella')).toBeInTheDocument();
  });

  it('renders a yellow badge for DEVICE_CREDENTIAL', () => {
    wrap(<VerificationBadge method="DEVICE_CREDENTIAL" />);
    expect(screen.getByText('PIN dispositivo')).toBeInTheDocument();
  });

  it('renders a gray badge for NONE', () => {
    wrap(<VerificationBadge method="NONE" />);
    expect(screen.getByText('Sin verificación')).toBeInTheDocument();
  });

  it('renders a muted dash for null', () => {
    wrap(<VerificationBadge method={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders a muted dash for undefined', () => {
    wrap(<VerificationBadge method={undefined} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
