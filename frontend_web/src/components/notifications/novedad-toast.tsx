import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import React from 'react';

interface NovedadToastProps {
  horasExtra: string;
  onShow: (id: string) => void;
  onDismiss: (id: string) => void;
  notificationId: string;
}

export function NovedadToast({ horasExtra, onShow, onDismiss, notificationId }: NovedadToastProps) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Text size="sm" style={{ flex: 1 }}>
        Se registraron {horasExtra} horas extra pendientes.
      </Text>
      <Button
        size="xs"
        variant="light"
        onClick={() => onShow(notificationId)}
      >
        Ver
      </Button>
      <Button
        size="xs"
        variant="subtle"
        color="gray"
        onClick={() => onDismiss(notificationId)}
      >
        ×
      </Button>
    </Group>
  );
}

export function showNovedadToast(horasExtra: string) {
  const id = `novedad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  notifications.show({
    id,
    color: 'blue',
    title: 'Nueva novedad pendiente',
    message: (
      <NovedadToast
        horasExtra={horasExtra}
        notificationId={id}
        onShow={(nid) => {
          notifications.hide(nid);
          window.location.href = '/novedades?tab=pendientes';
        }}
        onDismiss={(nid) => {
          notifications.hide(nid);
        }}
      />
    ),
    autoClose: false,
  });
}
