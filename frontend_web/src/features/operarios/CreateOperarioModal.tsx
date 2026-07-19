import { Alert, Button, Modal, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import React, { useState } from 'react';
import { ApiError } from '../../lib/api/client';
import { useCreateOperario } from './operario-queries';

export interface SupervisorOption {
  value: string;
  label: string;
}

export interface AreaOption {
  value: string;
  label: string;
}

export function CreateOperarioModal({
  opened,
  onClose,
  supervisorOptions,
  areaOptions,
}: {
  opened: boolean;
  onClose: () => void;
  supervisorOptions: SupervisorOption[];
  areaOptions?: AreaOption[];
}) {
  const createOperario = useCreateOperario();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    mode: 'uncontrolled',
    validateInputOnBlur: true,
    validateInputOnChange: true,
    initialValues: { fullName: '', documento: '', supervisorId: '', cargo: '', areaId: '' },
    validate: {
      fullName: (v) => (v.trim().length > 0 ? null : 'Ingrese el nombre completo'),
      documento: (v) => (/^\d{5,}$/.test(v.trim()) ? null : 'Ingrese un número de documento válido'),
      supervisorId: (v) => (v ? null : 'Seleccione un supervisor'),
    },
  });

  const handleClose = () => {
    form.reset();
    setSubmitError(null);
    onClose();
  };

  const handleSubmit = form.onSubmit(async (values) => {
    setSubmitError(null);
    try {
      await createOperario.mutateAsync({
        fullName: values.fullName.trim(),
        documento: values.documento.trim(),
        supervisorId: values.supervisorId,
        cargo: values.cargo.trim(),
        areaId: values.areaId || undefined,
      });
      notifications.show({ color: 'teal', message: 'Operario creado' });
      handleClose();
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : 'Algo salió mal. Inténtelo de nuevo.',
      );
    }
  });

  return (
    <Modal opened={opened} onClose={handleClose} title="Nuevo operario" centered>
      <form onSubmit={handleSubmit} noValidate>
        <Stack>
          {submitError && (
            <Alert color="red" role="alert" variant="light">
              {submitError}
            </Alert>
          )}
          <TextInput
            label="Nombre completo"
            required
            autoFocus
            key={form.key('fullName')}
            {...form.getInputProps('fullName')}
          />
          <TextInput
            label="Número de documento"
            inputMode="numeric"
            required
            key={form.key('documento')}
            {...form.getInputProps('documento')}
          />
          <Select
            label="Supervisor"
            placeholder="Seleccione un supervisor"
            data={supervisorOptions}
            searchable
            required
            key={form.key('supervisorId')}
            {...form.getInputProps('supervisorId')}
          />
          {areaOptions && areaOptions.length > 0 && (
            <Select
              label="Área"
              placeholder="Seleccione un área (opcional)"
              data={areaOptions}
              searchable
              clearable
              key={form.key('areaId')}
              {...form.getInputProps('areaId')}
            />
          )}
          <TextInput
            label="Cargo"
            placeholder="Ej: Barrido, Recolección"
            key={form.key('cargo')}
            {...form.getInputProps('cargo')}
          />
          <Button type="submit" loading={createOperario.isPending}>
            Crear operario
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
