import {
  ActionIcon,
  AppShell,
  Avatar,
  Box,
  Burger,
  Center,
  Group,
  Image,
  Loader,
  Menu,
  NavLink,
  Stack,
  Text,
  Title,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconLogout, IconMoon, IconSun } from '@tabler/icons-react';
import React, { Suspense, useRef } from 'react';
import { NavLink as RouterNavLink, Outlet, useNavigate } from 'react-router-dom';
import isotipo from '../../assets/isotipo.png';
import { useAuth } from '../../lib/auth/auth-context';
import { navItemsForRole } from './nav-config';

function ColorSchemeToggle() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggle = () => {
    if (!buttonRef.current || !('startViewTransition' in document)) {
      toggleColorScheme();
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const transition = document.startViewTransition(() => {
      toggleColorScheme();
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0 at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 500,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    });
  };

  return (
    <ActionIcon
      ref={buttonRef}
      variant="default"
      size="lg"
      aria-label="Cambiar tema"
      onClick={handleToggle}
    >
      {colorScheme === 'dark' ? (
        <IconSun size={18} stroke={1.7} />
      ) : (
        <IconMoon size={18} stroke={1.7} />
      )}
    </ActionIcon>
  );
}

export function AppShellLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const items = user ? navItemsForRole(user.role) : [];
  const userInitial = user?.email?.[0]?.toUpperCase() ?? '?';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Image src={isotipo} alt="" h={32} w="auto" />
            <Title
              order={1}
              size="h4"
              fw={700}
              style={{ letterSpacing: '-0.3px' }}
            >
              FuturaGest
            </Title>
          </Group>
          <Group gap="sm">
            <ColorSchemeToggle />
            <Menu position="bottom-end" withArrow>
              <Menu.Target>
                <Avatar
                  radius="xl"
                  color="brand"
                  size={34}
                  aria-label="Menú de cuenta"
                  style={{ cursor: 'pointer' }}
                >
                  {userInitial}
                </Avatar>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{user?.email}</Menu.Label>
                <Menu.Item
                  leftSection={<IconLogout size={16} stroke={1.7} />}
                  onClick={handleLogout}
                >
                  Cerrar sesión
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <nav aria-label="Navegación principal">
          <Text
            size="xs"
            c="dimmed"
            fw={600}
            tt="uppercase"
            mb="xs"
            style={{ letterSpacing: '0.5px' }}
          >
            Menú
          </Text>
          <Stack gap={4}>
            {items.map((item) => (
              <NavLink
                key={item.path}
                component={RouterNavLink}
                to={item.path}
                end={item.path === '/'}
                label={item.label}
                leftSection={<item.icon size={18} stroke={1.7} />}
                variant="light"
                fw={500}
                style={{ borderRadius: 'var(--mantine-radius-md)' }}
                onClick={close}
              />
            ))}
          </Stack>
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
