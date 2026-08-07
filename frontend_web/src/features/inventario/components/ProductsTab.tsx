import { Badge, Card, Group, Skeleton, Table, Text, Title } from '@mantine/core';
import React from 'react';
import { useInventoryProductsQuery } from '../inventory-queries';

export function ProductsTab() {
  const { data: products = [], isLoading } = useInventoryProductsQuery();

  if (isLoading) {
    return <Skeleton height={300} radius="md" />;
  }

  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" mb="md">
        <div>
          <Title order={4}>Catálogo de Productos y Unidades</Title>
          <Text size="sm" c="dimmed">
            Materiales, herramientas e insumos autorizados para control de inventario.
          </Text>
        </div>
      </Group>

      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>SKU / Código</Table.Th>
            <Table.Th>Nombre del Producto</Table.Th>
            <Table.Th>Unidad Base</Table.Th>
            <Table.Th>Unidades Alternas</Table.Th>
            <Table.Th>Estado</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {products.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={5} style={{ textAlign: 'center' }}>
                <Text c="dimmed" py="lg">
                  No hay productos registrados en el catálogo.
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            products.map((item) => (
              <Table.Tr key={item.id}>
                <Table.Td>
                  <Text fw={700}>{item.sku}</Text>
                </Table.Td>
                <Table.Td>
                  <Text fw={500}>{item.name}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge color="blue" variant="light">
                    {item.baseUnitCode}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {item.unitVersions && item.unitVersions.length > 0
                    ? item.unitVersions
                        .map((u) => `${u.unitCode} (×${u.factorToBase})`)
                        .join(', ')
                    : 'Sin unidad alterna'}
                </Table.Td>
                <Table.Td>
                  {item.active ? (
                    <Badge color="green" variant="light">
                      Activo
                    </Badge>
                  ) : (
                    <Badge color="red" variant="light">
                      Inactivo
                    </Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </Card>
  );
}
