import { Stack, Tabs, Text, Title } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import React from 'react';
import { BalancePanel } from './BalancePanel';

/** Placeholder panel shown while JornadaPolicyAdmin (PR-4) is not yet implemented. */
function PolicyPanelStub() {
  return (
    <Text c="dimmed" size="sm" data-testid="policy-tab-panel">
      Próximamente: política de jornada laboral.
    </Text>
  );
}

export function CompensacionPage() {
  useDocumentTitle('FuturaGest · Compensación');

  return (
    <Stack>
      <Title order={2}>Compensación de horas</Title>

      <Tabs defaultValue="balance">
        <Tabs.List>
          <Tabs.Tab value="balance">Balance y cierre</Tabs.Tab>
          <Tabs.Tab value="policy">Política de jornada</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="balance" pt="md">
          <BalancePanel />
        </Tabs.Panel>

        <Tabs.Panel value="policy" pt="md">
          <PolicyPanelStub />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
