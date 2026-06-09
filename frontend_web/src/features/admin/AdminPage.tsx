import { List, Stack, Tabs, Text, Title } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import React from 'react';
import { MunicipiosAdmin } from './MunicipiosAdmin';
import { SupervisoresAdmin } from './SupervisoresAdmin';
import { UsersAdmin } from './UsersAdmin';
import { ZonesAdmin } from './ZonesAdmin';

// SupervisorArea is a fixed backend enum, shown as reference (not editable).
const AREAS = ['BARRIDO', 'RECOLECCION', 'SUPERNUMERARIO'];

export function AdminPage() {
  useDocumentTitle('FuturaGest · Administración');

  return (
    <Stack>
      <Title order={2}>Administración</Title>

      <Tabs defaultValue="zones">
        <Tabs.List>
          <Tabs.Tab value="zones">Zonas</Tabs.Tab>
          <Tabs.Tab value="municipios">Municipios</Tabs.Tab>
          <Tabs.Tab value="supervisores">Supervisores</Tabs.Tab>
          <Tabs.Tab value="users">Usuarios</Tabs.Tab>
          <Tabs.Tab value="areas">Áreas</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="zones" pt="md">
          <ZonesAdmin />
        </Tabs.Panel>

        <Tabs.Panel value="municipios" pt="md">
          <MunicipiosAdmin />
        </Tabs.Panel>

        <Tabs.Panel value="supervisores" pt="md">
          <SupervisoresAdmin />
        </Tabs.Panel>

        <Tabs.Panel value="users" pt="md">
          <UsersAdmin />
        </Tabs.Panel>

        <Tabs.Panel value="areas" pt="md">
          <Text size="sm" c="dimmed" mb="xs">
            Las áreas son un catálogo fijo del sistema (no editable). Cada supervisor se asigna a una de estas.
          </Text>
          <List>
            {AREAS.map((a) => (
              <List.Item key={a}>{a}</List.Item>
            ))}
          </List>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
