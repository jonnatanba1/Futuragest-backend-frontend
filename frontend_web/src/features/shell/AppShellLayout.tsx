import {
  ActionIcon,
  AppShell,
  Box,
  Burger,
  Center,
  Group,
  Image,
  Loader,
  Menu,
  NavLink,
  Title,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import React, { Suspense } from 'react';
import { NavLink as RouterNavLink, Outlet, useNavigate } from 'react-router-dom';
import isotipo from '../../assets/isotipo.png';
import { useAuth } from '../../lib/auth/auth-context';
import { navItemsForRole } from './nav-config';

function ColorSchemeToggle() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  return (
    <ActionIcon
      variant="default"
      size="lg"
      aria-label="Cambiar tema"
      onClick={toggleColorScheme}
    >
      {colorScheme === 'dark' ? '☀' : '☾'}
    </ActionIcon>
  );
}

export function AppShellLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const items = user ? navItemsForRole(user.role) : [];

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Image src={isotipo} alt="" h={32} w="auto" />
            <Title order={1} size="h4">
              FuturaGest
            </Title>
          </Group>
          <Group gap="sm">
            <ColorSchemeToggle />
            <Menu position="bottom-end" withArrow>
              <Menu.Target>
                <ActionIcon variant="default" size="lg" aria-label="Menú de cuenta">
                  {user?.email?.[0]?.toUpperCase() ?? '?'}
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{user?.email}</Menu.Label>
                <Menu.Item onClick={handleLogout}>Cerrar sesión</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <nav aria-label="Navegación principal">
          {items.map((item) => (
            <NavLink
              key={item.path}
              component={RouterNavLink}
              to={item.path}
              end={item.path === '/'}
              label={item.label}
              onClick={close}
            />
          ))}
        </nav>
      </AppShell.Navbar>

      <AppShell.Main>
        <Box>
          <Suspense
            fallback={
              <Center p="xl">
                <Loader aria-label="Cargando página" />
              </Center>
            }
          >
            <Outlet />
          </Suspense>
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
