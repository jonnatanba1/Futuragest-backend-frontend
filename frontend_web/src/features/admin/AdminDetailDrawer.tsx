import { Drawer, Stack } from '@mantine/core';
import React from 'react';

export interface AdminDetailDrawerProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function AdminDetailDrawer({ opened, onClose, title, children }: AdminDetailDrawerProps) {
  return (
    <Drawer opened={opened} onClose={onClose} title={title} position="right" size="md">
      <Stack>{children}</Stack>
    </Drawer>
  );
}
