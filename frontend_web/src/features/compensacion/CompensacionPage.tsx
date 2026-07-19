import { Stack, Tabs, Title } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import React from 'react';
import { BalancePanel } from './BalancePanel';
import { JornadaPolicyPanel } from './JornadaPolicyPanel';
import { CompensatoriosPanel } from './CompensatoriosPanel';

export function CompensacionPage() {
  useDocumentTitle('FuturaGest · Compensación');

  return (
    <Stack>
      <Title order={2}>Compensación de horas</Title>

      <Tabs defaultValue="balance">
        <Tabs.List>
          <Tabs.Tab value="balance">Balance y cierre</Tabs.Tab>
          <Tabs.Tab value="compensatorios">Descansos compensatorios</Tabs.Tab>
          <Tabs.Tab value="policy">Política de jornada</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="balance" pt="md">
          <BalancePanel />
        </Tabs.Panel>

        <Tabs.Panel value="compensatorios" pt="md">
          <CompensatoriosPanel />
        </Tabs.Panel>

        <Tabs.Panel value="policy" pt="md">
          <JornadaPolicyPanel />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
