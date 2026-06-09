import { Button, Collapse, Table } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { DayBreakdownDto } from '@futuragest/contracts';
import React from 'react';

interface DayBreakdownProps {
  breakdown: DayBreakdownDto[];
}

/**
 * Collapsible per-day hours breakdown table.
 * Hidden by default; expanded via a toggle button.
 */
export function DayBreakdown({ breakdown }: DayBreakdownProps) {
  const [opened, { toggle }] = useDisclosure(false);

  return (
    <>
      <Button
        variant="subtle"
        size="xs"
        onClick={toggle}
        aria-expanded={opened}
        aria-label="Ver desglose por día"
      >
        {opened ? 'Ocultar desglose' : 'Ver desglose por día'}
      </Button>

      <Collapse in={opened}>
        <Table striped highlightOnHover mt="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Fecha</Table.Th>
              <Table.Th>Horas reales</Table.Th>
              <Table.Th>Jornada</Table.Th>
              <Table.Th>Diferencia</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {breakdown.map((row) => (
              <Table.Tr key={row.date}>
                <Table.Td>{row.date}</Table.Td>
                <Table.Td>{row.horasReales}</Table.Td>
                <Table.Td>{row.jornadaHoras}</Table.Td>
                <Table.Td>{row.delta}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Collapse>
    </>
  );
}
