import { Skeleton, Stack } from '@mantine/core';
import React from 'react';

/** Row-shaped loading placeholder for data tables (nicer than a lone spinner). */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Stack gap="xs" aria-label="Cargando" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={36} radius="sm" />
      ))}
    </Stack>
  );
}
