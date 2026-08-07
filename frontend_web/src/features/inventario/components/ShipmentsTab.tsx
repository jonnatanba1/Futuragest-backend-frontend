import { Badge, Button, Card, Group, Skeleton, Table, Text, Title } from '@mantine/core';
import { IconSend, IconTruckDelivery } from '@tabler/icons-react';
import React from 'react';
import { useDispatchShipmentMutation, useShipmentsQuery } from '../inventory-queries';
import type { ShipmentStatus } from '../inventory.types';

const SHIPMENT_STATUS_META: Record<ShipmentStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Borrador', color: 'gray' },
  DISPATCHED: { label: 'En Tránsito', color: 'blue' },
  PARTIALLY_RECEIVED: { label: 'Recepción Parcial', color: 'orange' },
  RECEIVED: { label: 'Recibido Total', color: 'green' },
  DISCREPANCY_REVIEW: { label: 'En Revisión', color: 'red' },
  CLOSED_WITH_DISCREPANCY: { label: 'Cerrado con Discrepancia', color: 'pink' },
  RETURNED: { label: 'Retornado', color: 'violet' },
  CANCELLED: { label: 'Cancelado', color: 'gray' },
};

export function ShipmentsTab() {
  const { data: shipments = [], isLoading } = useShipmentsQuery();
  const dispatchMutation = useDispatchShipmentMutation();

  if (isLoading) {
    return <Skeleton height={300} radius="md" />;
  }

  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" mb="md">
        <div>
          <Title order={4}>Envíos y Traslados de Material</Title>
          <Text size="sm" c="dimmed">
            Control de transferencias entre bodegas centrales, municipales y custodias.
          </Text>
        </div>
        <Button leftSection={<IconTruckDelivery size={16} />}>Nuevo Envío</Button>
      </Group>

      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Código Envío</Table.Th>
            <Table.Th>Origen</Table.Th>
            <Table.Th>Destino</Table.Th>
            <Table.Th>Estado</Table.Th>
            <Table.Th>Ítems</Table.Th>
            <Table.Th>Fecha Creación</Table.Th>
            <Table.Th>Acciones</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {shipments.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={7} style={{ textAlign: 'center' }}>
                <Text c="dimmed" py="lg">
                  No hay envíos registrados.
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            shipments.map((item) => {
              const meta = SHIPMENT_STATUS_META[item.status] ?? { label: item.status, color: 'gray' };
              return (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Text fw={700}>{item.code}</Text>
                  </Table.Td>
                  <Table.Td>{item.originLocationName ?? item.originLocationId}</Table.Td>
                  <Table.Td>{item.destinationLocationName ?? item.destinationLocationId}</Table.Td>
                  <Table.Td>
                    <Badge color={meta.color} variant="light">
                      {meta.label}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{item.items?.length ?? 0} producto(s)</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {item.status === 'DRAFT' && (
                      <Button
                        size="xs"
                        variant="light"
                        color="blue"
                        leftSection={<IconSend size={14} />}
                        loading={dispatchMutation.isPending}
                        onClick={() => dispatchMutation.mutate(item.id)}
                      >
                        Despachar
                      </Button>
                    )}
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
