import { Alert, Badge, Card, Group, Skeleton, Table, Text, TextInput, Title } from '@mantine/core';
import { IconAlertTriangle, IconSearch } from '@tabler/icons-react';
import React, { useState } from 'react';
import { useInventoryBalancesQuery } from '../inventory-queries';

export function BalancesTab() {
  const { data: balances = [], isLoading, error } = useInventoryBalancesQuery();
  const [search, setSearch] = useState('');

  const filtered = balances.filter((item) => {
    const term = search.toLowerCase();
    return (
      (item.locationName ?? item.locationId).toLowerCase().includes(term) ||
      (item.productName ?? item.productSku ?? item.productId).toLowerCase().includes(term)
    );
  });

  const belowMinimumCount = balances.filter((item) => item.isBelowMinimum).length;

  if (isLoading) {
    return <Skeleton height={300} radius="md" />;
  }

  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" mb="md">
        <div>
          <Title order={4}>Saldos y Existencias</Title>
          <Text size="sm" c="dimmed">
            Consulte la disponibilidad en cada ubicación física o bodega municipal.
          </Text>
        </div>
        <TextInput
          placeholder="Buscar por ubicación o producto..."
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      </Group>

      {belowMinimumCount > 0 && (
        <Alert
          icon={<IconAlertTriangle size={16} />}
          title="Stock Mínimo Comprometido"
          color="amber"
          mb="md"
        >
          {belowMinimumCount} producto(s) se encuentran por debajo del nivel de existencia mínimo.
        </Alert>
      )}

      {error && (
        <Alert color="red" title="Error al cargar saldos" mb="md">
          Ocurrió un inconveniente al consultar las existencias de inventario.
        </Alert>
      )}

      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Ubicación / Bodega</Table.Th>
            <Table.Th>Producto</Table.Th>
            <Table.Th>Existencia Base</Table.Th>
            <Table.Th>Mínimo</Table.Th>
            <Table.Th>Estado</Table.Th>
            <Table.Th>Última Actualización</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filtered.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={6} style={{ textAlign: 'center' }}>
                <Text c="dimmed" py="lg">
                  No se encontraron saldos registrados.
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            filtered.map((item) => (
              <Table.Tr key={`${item.locationId}-${item.productId}`}>
                <Table.Td>
                  <Text fw={500}>{item.locationName ?? item.locationCode ?? item.locationId}</Text>
                </Table.Td>
                <Table.Td>
                  <Text fw={500}>{item.productName ?? item.productId}</Text>
                  {item.productSku && (
                    <Text size="xs" c="dimmed">
                      SKU: {item.productSku}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text fw={700}>{item.quantityBase}</Text>
                </Table.Td>
                <Table.Td>{item.minimumQuantity ?? 'N/A'}</Table.Td>
                <Table.Td>
                  {item.isBelowMinimum ? (
                    <Badge color="red" variant="light">
                      Bajo Mínimo
                    </Badge>
                  ) : (
                    <Badge color="green" variant="light">
                      Disponible
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {new Date(item.updatedAt).toLocaleString()}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </Card>
  );
}
