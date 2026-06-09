import React, { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { AppShellLayout } from '../features/shell/AppShellLayout';
import { ADMIN_ROLES, OFFICE_ROLES, OPERARIO_READ_ROLES } from '../lib/auth/roles';
import { RequireAuth, RequireAuthAllowChange, RequireGuest } from '../routes/guards';

// Feature pages are code-split per route (web.dev: keep the initial bundle small).
// Each becomes its own chunk, loaded on first navigation under the Suspense
// boundary in AppShellLayout.
const OperariosPage = lazy(() =>
  import('../features/operarios/OperariosPage').then((m) => ({ default: m.OperariosPage })),
);
const AsistenciaPage = lazy(() =>
  import('../features/asistencia/AsistenciaPage').then((m) => ({ default: m.AsistenciaPage })),
);
const NovedadesPage = lazy(() =>
  import('../features/novedades/NovedadesPage').then((m) => ({ default: m.NovedadesPage })),
);
const AdminPage = lazy(() =>
  import('../features/admin/AdminPage').then((m) => ({ default: m.AdminPage })),
);

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RequireGuest>
            <LoginPage />
          </RequireGuest>
        }
      />
      <Route
        path="/change-password"
        element={
          <RequireAuthAllowChange>
            <ChangePasswordPage />
          </RequireAuthAllowChange>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShellLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route
          path="operarios"
          element={
            <RequireAuth roles={OPERARIO_READ_ROLES}>
              <OperariosPage />
            </RequireAuth>
          }
        />
        <Route
          path="asistencia"
          element={
            <RequireAuth roles={OFFICE_ROLES}>
              <AsistenciaPage />
            </RequireAuth>
          }
        />
        <Route
          path="novedades"
          element={
            <RequireAuth roles={OFFICE_ROLES}>
              <NovedadesPage />
            </RequireAuth>
          }
        />
        <Route
          path="admin"
          element={
            <RequireAuth roles={ADMIN_ROLES}>
              <AdminPage />
            </RequireAuth>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
