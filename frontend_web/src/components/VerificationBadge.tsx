import { Badge, Text, Tooltip } from '@mantine/core';
import type { VerificationMethod } from '@futuragest/contracts';
import React from 'react';

interface Config {
  color: string;
  label: string;
  tooltip: string;
}

const METHOD_CONFIG: Record<VerificationMethod, Config> = {
  BIOMETRIC: {
    color: 'teal',
    label: 'Huella',
    tooltip: 'Identidad confirmada con huella digital en el dispositivo del supervisor.',
  },
  DEVICE_CREDENTIAL: {
    color: 'yellow',
    label: 'PIN dispositivo',
    tooltip: 'Identidad confirmada con PIN, patrón o contraseña del dispositivo del supervisor.',
  },
  NONE: {
    color: 'gray',
    label: 'Sin verificación',
    tooltip: 'El dispositivo no pudo verificar la identidad (hardware no compatible o verificación omitida).',
  },
};

/**
 * Displays an identity-verification method as a colored badge with a tooltip.
 * Null/undefined renders a muted dash (no data — legacy record or web-originated action).
 */
export function VerificationBadge({
  method,
}: {
  method: VerificationMethod | null | undefined;
}) {
  if (method == null) {
    return (
      <Text size="sm" c="dimmed" component="span">
        —
      </Text>
    );
  }

  const { color, label, tooltip } = METHOD_CONFIG[method];

  return (
    <Tooltip label={tooltip} withArrow>
      <Badge color={color} variant="light" style={{ cursor: 'default' }}>
        {label}
      </Badge>
    </Tooltip>
  );
}
