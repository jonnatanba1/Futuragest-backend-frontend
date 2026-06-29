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
    <Stack align="center" gap="sm" py="2xl">
      <Text fz={48} aria-hidden lh={1}>
        {icon}
      </Text>
      <Text fw={600} size="lg">{title}</Text>
      {message && (
        <Text size="sm" c="dimmed" ta="center" maw={380}>
          {message}
        </Text>
      )}
      {action}
    </Stack>
  );
}
