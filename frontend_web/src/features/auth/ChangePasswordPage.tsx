import {
  Alert,
  Button,
  Center,
  List,
  Paper,
  PasswordInput,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, authApi } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';

/**
 * Change-password flow. After a successful change we force a re-login: the
 * backend's mustChangePassword claim lives in the JWT and only clears on a
 * fresh login (documented Flutter gotcha — same backend behaviour here).
 *
 * Follows web.dev guidance: rules listed above the field, autocomplete="new-password".
 */
export function ChangePasswordPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    mode: 'uncontrolled',
    validateInputOnBlur: true,
    initialValues: { oldPassword: '', newPassword: '', confirmPassword: '' },
    validate: {
      oldPassword: (v) => (v.length > 0 ? null : 'Ingrese su contraseña actual'),
      newPassword: (v) => (v.length >= 8 ? null : 'Use al menos 8 caracteres'),
      confirmPassword: (v, values) =>
        v === values.newPassword ? null : 'Las contraseñas no coinciden',
    },
  });

  const handleSubmit = form.onSubmit(async (values) => {
    setSubmitError(null);
    try {
      await authApi.changePassword({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      notifications.show({
        color: 'teal',
        title: 'Contraseña cambiada',
        message: 'Vuelva a iniciar sesión con su contraseña nueva.',
      });
      logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : 'Algo salió mal. Inténtelo de nuevo.',
      );
    }
  });

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={440} maw="100%">
        <Title order={1} size="h2" mb="xs">
          Cambiar contraseña
        </Title>
        <Text c="dimmed" size="sm" mb="lg">
          Debe establecer una contraseña nueva antes de continuar.
        </Text>
        <form onSubmit={handleSubmit} noValidate>
          <Stack>
            {submitError && (
              <Alert color="red" role="alert" variant="light">
                {submitError}
              </Alert>
            )}
            <PasswordInput
              label="Contraseña actual"
              name="current-password"
              autoComplete="current-password"
              required
              key={form.key('oldPassword')}
              {...form.getInputProps('oldPassword')}
            />
            <div>
              <Text size="sm" fw={500} mb={4}>
                Requisitos de la contraseña nueva
              </Text>
              <List size="xs" c="dimmed" mb="xs">
                <List.Item>Al menos 8 caracteres</List.Item>
                <List.Item>Distinta de la actual</List.Item>
              </List>
              <PasswordInput
                label="Contraseña nueva"
                name="new-password"
                autoComplete="new-password"
                required
                key={form.key('newPassword')}
                {...form.getInputProps('newPassword')}
              />
            </div>
            <PasswordInput
              label="Confirmar contraseña nueva"
              name="confirm-new-password"
              autoComplete="new-password"
              required
              key={form.key('confirmPassword')}
              {...form.getInputProps('confirmPassword')}
            />
            <Button type="submit" fullWidth mt="sm" loading={form.submitting}>
              Cambiar contraseña
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
