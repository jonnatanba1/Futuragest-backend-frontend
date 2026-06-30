import type { RoleName } from '@futuragest/contracts';
import {
  IconBellExclamation,
  IconCalendarDue,
  IconCalendarTime,
  IconClockDollar,
  IconCoin,
  IconLayoutDashboard,
  IconSettings,
  IconSun,
  IconUsers,
} from '@tabler/icons-react';
import React from 'react';
import { ADMIN_ROLES, OFFICE_ROLES, OPERARIO_READ_ROLES } from '../../lib/auth/roles';

export interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ size?: number | string; stroke?: number | string }>;
  /** When set, only these roles see the item. Undefined = visible to all. */
  roles?: RoleName[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Tablero', path: '/', icon: IconLayoutDashboard },
  { label: 'Operarios', path: '/operarios', icon: IconUsers, roles: OPERARIO_READ_ROLES },
  { label: 'Asistencia', path: '/asistencia', icon: IconCalendarTime, roles: OFFICE_ROLES },
  { label: 'Novedades', path: '/novedades', icon: IconBellExclamation, roles: OFFICE_ROLES },
  { label: 'Compensación', path: '/compensacion', icon: IconClockDollar, roles: OFFICE_ROLES },
  { label: 'Compensatorios', path: '/compensacion/compensatorios', icon: IconCalendarDue, roles: OFFICE_ROLES },
  { label: 'Configuración', path: '/config/jornada', icon: IconSettings, roles: ADMIN_ROLES },
];

export function navItemsForRole(role: RoleName): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
