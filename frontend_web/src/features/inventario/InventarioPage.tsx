import { Container, Group, Tabs, Title } from '@mantine/core';
import {
  IconBuildingWarehouse,
  IconClipboardCheck,
  IconHistory,
  IconPackage,
  IconTruckDelivery,
} from '@tabler/icons-react';
import React, { useState } from 'react';
import { BalancesTab } from './components/BalancesTab';
import { CountsTab } from './components/CountsTab';
import { MovementsTab } from './components/MovementsTab';
import { ProductsTab } from './components/ProductsTab';
import { ShipmentsTab } from './components/ShipmentsTab';

export function InventarioPage() {
  const [activeTab, setActiveTab] = useState<string | null>('balances');

  return (
    <Container size="xl" py="lg">
      <Group justify="space-between" mb="lg">
        <Group>
          <IconPackage size={32} color="var(--mantine-color-blue-6)" />
          <div>
            <Title order={2}>Gestión de Inventario y Bodegas</Title>
          </div>
        </Group>
      </Group>

      <Tabs value={activeTab} onChange={setActiveTab} variant="outline" radius="md">
        <Tabs.List mb="md">
          <Tabs.Tab value="balances" leftSection={<IconBuildingWarehouse size={16} />}>
            Saldos y Existencias
          </Tabs.Tab>
          <Tabs.Tab value="movements" leftSection={<IconHistory size={16} />}>
            Movimientos (Ledger)
          </Tabs.Tab>
          <Tabs.Tab value="shipments" leftSection={<IconTruckDelivery size={16} />}>
            Envíos y Traslados
          </Tabs.Tab>
          <Tabs.Tab value="counts" leftSection={<IconClipboardCheck size={16} />}>
            Conteos y Conciliación
          </Tabs.Tab>
          <Tabs.Tab value="products" leftSection={<IconPackage size={16} />}>
            Catálogo de Productos
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="balances">
          <BalancesTab />
        </Tabs.Panel>

        <Tabs.Panel value="movements">
          <MovementsTab />
        </Tabs.Panel>

        <Tabs.Panel value="shipments">
          <ShipmentsTab />
        </Tabs.Panel>

        <Tabs.Panel value="counts">
          <CountsTab />
        </Tabs.Panel>

        <Tabs.Panel value="products">
          <ProductsTab />
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}
