import { Badge, Button, Card, Group, Skeleton, Table, Text, Title } from '@mantine/core';
import { IconClipboardCheck } from '@tabler/icons-react';
import React from 'react';
import { useInventoryCountsQuery } from '../inventory-queries';
import type { InventoryCountStatus } from '../inventory.types';

const COUNT_STATUS_META: Record<InventoryCountStatus, { label: string; color: string }> = {
  OPEN: { label: 'Abierto', color: 'blue' },
  SUBMITTED: { label: 'Enviado', color: 'orange' },
  APPROVED: { label: 'Aprobado & Ajustado', color: 'green' },
  CLOSED: { label: 'Cerrado Inmutable', color: 'gray' },
};

export function CountsTab() {
  const { data: counts = [], isLoading } = useInventoryCountsQuery();

  if (isLoading) {
    return <Skeleton height={300} radius="md" />;
  }

  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" mb="md">
        <div>
          <Title order={4}>Conteos Físicos y Conciliaciones</Title>
          <Text size="sm" c="dimmed">
            Sesiones de conteo de existencias y aprobación de diferencias contables.
          </Text>
        </div>
        <Button leftSection={<IconClipboardCheck size={16} />} color="teal">
          Iniciar Conteo
        </Button>
      </Group>

      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID Conteo</Table.Th>
            <Table.Th>Ubicación</Table.Th>
            <Table.Th>Fecha Corte</Table.Th>
            <Table.Th>Estado</Table.Th>
            <Table.Th>Líneas</Table.Th>
            <Table.Th>Fecha Apertura</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {counts.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={6} style={{ textAlign: 'center' }}>
                <Text c="dimmed" py="lg">
                  No hay conteos físicos registrados.
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            counts.map((item) => {
              const meta = COUNT_STATUS_META[item.status] ?? { label: item.status, color: 'gray' };
              return (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Text fw={700}>{item.id.substring(0, 8)}</Text>
                  </Table.Td>
                  <Table.Td>{item.locationName ?? item.locationId}</Table.Td>
                  <Table.Td>{item.cutoffDate}</Table.Td>
                  <Table.Td>
                    <Badge color={meta.color} variant="light">
                      {meta.label}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{item.lines?.length ?? 0} producto(s)</Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>
    </Card>
  );
}
