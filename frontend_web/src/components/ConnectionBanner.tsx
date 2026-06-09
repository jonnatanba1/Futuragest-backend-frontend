import { Alert, Box, Button, Group, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { healthApi } from '../lib/api/client';

/**
 * Polls the public /health endpoint and shows a fixed banner when the backend
 * is unreachable, with a retry button. Renders nothing while healthy.
 */
export function ConnectionBanner() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: healthApi.check,
    refetchInterval: 30_000,
    retry: false,
    staleTime: 0,
  });

  if (!health.isError) return null;

  return (
    <Box pos="fixed" top={0} left={0} right={0} style={{ zIndex: 1000 }} p="xs">
      <Alert color="red" variant="filled" radius={0} role="alert">
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">No se puede conectar con el servidor. Algunas acciones pueden no funcionar.</Text>
          <Button
            size="xs"
            variant="white"
            color="red"
            loading={health.isFetching}
            onClick={() => health.refetch()}
          >
            Reintentar
          </Button>
        </Group>
      </Alert>
    </Box>
  );
}
