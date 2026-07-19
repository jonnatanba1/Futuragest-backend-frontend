import { Stack, Tabs, Title } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import React from 'react';
import { AreasAdmin } from './AreasAdmin';
import { MunicipiosAdmin } from './MunicipiosAdmin';
import { UsersAdmin } from './UsersAdmin';
import { ZonesAdmin } from './ZonesAdmin';

export function AdminPage() {
  useDocumentTitle('FuturaGest · Administración');

  return (
    <Stack>
      <Title order={2}>Administración</Title>

      <Tabs defaultValue="zones">
        <Tabs.List>
          <Tabs.Tab value="zones">Zonas</Tabs.Tab>
          <Tabs.Tab value="municipios">Municipios</Tabs.Tab>
          <Tabs.Tab value="users">Usuarios</Tabs.Tab>
          <Tabs.Tab value="areas">Áreas</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="zones" pt="md">
          <ZonesAdmin />
        </Tabs.Panel>

        <Tabs.Panel value="municipios" pt="md">
          <MunicipiosAdmin />
        </Tabs.Panel>

        <Tabs.Panel value="users" pt="md">
          <UsersAdmin />
        </Tabs.Panel>

        <Tabs.Panel value="areas" pt="md">
          <AreasAdmin />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
