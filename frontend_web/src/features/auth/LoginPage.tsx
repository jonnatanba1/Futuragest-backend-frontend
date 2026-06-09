import {
  Alert,
  Box,
  Button,
  Center,
  Image,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDocumentTitle } from '@mantine/hooks';
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import logo from '../../assets/logo.png';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/auth-context';

interface LocationState {
  from?: string;
}

/**
 * Sign-in form following Google web.dev sign-in guidance:
 *  - a real <form> with a submit <button>
 *  - type="email" + autocomplete="username" and autocomplete="current-password"
 *    so password managers recognise the fields
 *  - validation deferred until blur/submit (not premature)
 *  - PasswordInput provides the built-in show-password toggle
 */
export function LoginPage() {
  useDocumentTitle('FuturaGest · Iniciar sesión');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    mode: 'uncontrolled',
    validateInputOnBlur: true,
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : 'Ingrese un correo válido'),
      password: (v) => (v.length > 0 ? null : 'Ingrese su contraseña'),
    },
  });

  const handleSubmit = form.onSubmit(async (values) => {
    setSubmitError(null);
    try {
      const { passwordChangeRequired } = await login(values.email, values.password);
      const from = (location.state as LocationState | null)?.from;
      navigate(passwordChangeRequired ? '/change-password' : (from ?? '/'), { replace: true });
    } catch (err) {
      setSubmitError(
        err instanceof ApiError && err.status === 401
          ? 'Correo o contraseña incorrectos'
          : 'Algo salió mal. Inténtelo de nuevo.',
      );
    }
  });

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={400} maw="100%">
        <Box bg="white" p="sm" mb="lg" style={{ borderRadius: 'var(--mantine-radius-md)' }}>
          <Image src={logo} alt="Futuraseo" />
        </Box>
        <Title order={1} size="h3" ta="center" mb="lg">
          Iniciar sesión
        </Title>
        <form onSubmit={handleSubmit} noValidate>
          <Stack>
            {submitError && (
              <Alert color="red" role="alert" variant="light">
                {submitError}
              </Alert>
            )}
            <TextInput
              label="Correo electrónico"
              type="email"
              name="email"
              id="email"
              autoComplete="username"
              inputMode="email"
              enterKeyHint="next"
              required
              autoFocus
              key={form.key('email')}
              {...form.getInputProps('email')}
            />
            <PasswordInput
              label="Contraseña"
              name="current-password"
              id="current-password"
              autoComplete="current-password"
              enterKeyHint="done"
              required
              visibilityToggleButtonProps={{
                'aria-label': 'Mostrar contraseña',
                'aria-hidden': false,
                tabIndex: 0,
              }}
              key={form.key('password')}
              {...form.getInputProps('password')}
            />
            <Button type="submit" fullWidth mt="sm" loading={form.submitting}>
              Iniciar sesión
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
