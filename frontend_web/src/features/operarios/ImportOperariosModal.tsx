import {
  Alert,
  Anchor,
  Button,
  FileInput,
  Group,
  Modal,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import type { ImportResultDto } from '@futuragest/contracts';
import React, { useState } from 'react';
import { ApiError } from '../../lib/api/client';
import { useImportOperarios } from './operario-queries';

const TEMPLATE_HEADER = 'fullName,documento,supervisorEmail';

function downloadTemplate() {
  const csv = `${TEMPLATE_HEADER}\nJuan Pérez,1030000099,supervisor@futuragest.co\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'operarios-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportOperariosModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const importOperarios = useImportOperarios();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setFile(null);
    setResult(null);
    setError(null);
    onClose();
  };

  const handleImport = async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      setResult(await importOperarios.mutateAsync(file));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo importar el archivo.');
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Importar operarios" centered size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Suba un archivo CSV o XLSX con las columnas <strong>{TEMPLATE_HEADER}</strong>. El
          supervisor se identifica por correo electrónico.
        </Text>
        <Anchor component="button" type="button" size="sm" onClick={downloadTemplate}>
          Descargar plantilla CSV
        </Anchor>

        <FileInput
          label="Archivo"
          placeholder="Seleccione un archivo .csv o .xlsx"
          accept=".csv,.xlsx"
          value={file}
          onChange={setFile}
          clearable
        />

        {error && (
          <Alert color="red" role="alert" variant="light">
            {error}
          </Alert>
        )}

        {result && (
          <Alert color={result.failed > 0 ? 'yellow' : 'teal'} variant="light">
            {result.imported} importados, {result.failed} fallidos.
          </Alert>
        )}

        {result && result.errors.length > 0 && (
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Fila</Table.Th>
                <Table.Th>Documento</Table.Th>
                <Table.Th>Motivo</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {result.errors.map((e) => (
                <Table.Tr key={`${e.row}-${e.documento ?? ''}`}>
                  <Table.Td>{e.row}</Table.Td>
                  <Table.Td>{e.documento ?? '—'}</Table.Td>
                  <Table.Td>{e.reason}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={handleClose}>
            Cerrar
          </Button>
          <Button onClick={handleImport} disabled={!file} loading={importOperarios.isPending}>
            Importar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
