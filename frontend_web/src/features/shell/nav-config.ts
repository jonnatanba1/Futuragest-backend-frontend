import type { RoleName } from '@futuragest/contracts';
import { ADMIN_ROLES, OFFICE_ROLES, OPERARIO_READ_ROLES } from '../../lib/auth/roles';

export interface NavItem {
  label: string;
  path: string;
  /** When set, only these roles see the item. Undefined = visible to all. */
  roles?: RoleName[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Tablero', path: '/' },
  { label: 'Operarios', path: '/operarios', roles: OPERARIO_READ_ROLES },
  { label: 'Asistencia', path: '/asistencia', roles: OFFICE_ROLES },
  { label: 'Novedades', path: '/novedades', roles: OFFICE_ROLES },
  { label: 'Compensación', path: '/compensacion', roles: OFFICE_ROLES },
  { label: 'Administración', path: '/admin', roles: ADMIN_ROLES },
];

export function navItemsForRole(role: RoleName): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
