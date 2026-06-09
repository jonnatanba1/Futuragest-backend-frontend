import { Stack, Text } from '@mantine/core';
import React from 'react';

/** Friendly empty state for lists: an icon, a title, a hint and an optional action. */
export function EmptyState({
  title,
  message,
  action,
  icon = '📭',
}: {
  title: string;
  message?: string;
  action?: React.ReactNode;
  icon?: string;
}) {
  return (
    <Stack align="center" gap="xs" py="xl">
      <Text fz={44} aria-hidden>
        {icon}
      </Text>
      <Text fw={600}>{title}</Text>
      {message && (
        <Text size="sm" c="dimmed" ta="center" maw={360}>
          {message}
        </Text>
      )}
      {action}
    </Stack>
  );
}
