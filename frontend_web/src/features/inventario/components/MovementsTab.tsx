import { Badge, Card, Group, Select, Skeleton, Table, Text, Title } from '@mantine/core';
import React, { useState } from 'react';
import { useInventoryMovementsQuery } from '../inventory-queries';
import type { InventoryMovementType } from '../inventory.types';

const MOVEMENT_LABELS: Record<InventoryMovementType, { label: string; color: string }> = {
  OPENING_BALANCE: { label: 'Balance Inicial', color: 'blue' },
  FIELD_ISSUE: { label: 'Salida de Campo', color: 'orange' },
  FIELD_RETURN: { label: 'Devolución', color: 'teal' },
  TRANSFER_OUT: { label: 'Salida Traslado', color: 'indigo' },
  TRANSFER_IN: { label: 'Entrada Traslado', color: 'cyan' },
  COUNT_ADJUSTMENT_IN: { label: 'Ajuste Conteo (+)', color: 'green' },
  COUNT_ADJUSTMENT_OUT: { label: 'Ajuste Conteo (-)', color: 'red' },
  DAMAGE_OR_LOSS: { label: 'Baja / Pérdida', color: 'pink' },
  IN_TRANSIT_LOSS: { label: 'Pérdida en Tránsito', color: 'red' },
  IN_TRANSIT_DAMAGE: { label: 'Daño en Tránsito', color: 'orange' },
  REVERSAL: { label: 'Reverso', color: 'violet' },
};

export function MovementsTab() {
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const { data: movements = [], isLoading } = useInventoryMovementsQuery(
    typeFilter ? { type: typeFilter } : undefined,
  );

  if (isLoading) {
    return <Skeleton height={300} radius="md" />;
  }

  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" mb="md">
        <div>
          <Title order={4}>Historial de Movimientos (Ledger Append-Only)</Title>
          <Text size="sm" c="dimmed">
            Registro inmutable de todas las operaciones contables de inventario.
          </Text>
        </div>
        <Select
          placeholder="Filtrar por tipo de movimiento"
          clearable
          data={Object.entries(MOVEMENT_LABELS).map(([key, val]) => ({
            value: key,
            label: val.label,
          }))}
          value={typeFilter}
          onChange={setTypeFilter}
        />
      </Group>

      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Fecha Operativa</Table.Th>
            <Table.Th>Ubicación</Table.Th>
            <Table.Th>Producto</Table.Th>
            <Table.Th>Tipo Movimiento</Table.Th>
            <Table.Th>Cantidad Base</Table.Th>
            <Table.Th>Unidad</Table.Th>
            <Table.Th>Registrado</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {movements.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={7} style={{ textAlign: 'center' }}>
                <Text c="dimmed" py="lg">
                  No hay movimientos registrados para los criterios seleccionados.
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            movements.map((item) => {
              const meta = MOVEMENT_LABELS[item.type] ?? { label: item.type, color: 'gray' };
              return (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Text fw={500}>{item.businessDate}</Text>
                  </Table.Td>
                  <Table.Td>{item.locationName ?? item.locationId}</Table.Td>
                  <Table.Td>
                    <Text fw={500}>{item.productName ?? item.productId}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={meta.color} variant="light">
                      {meta.label}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text fw={700}>{item.quantityBase}</Text>
                  </Table.Td>
                  <Table.Td>{item.unitCode}</Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {new Date(item.createdAt).toLocaleString()}
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
