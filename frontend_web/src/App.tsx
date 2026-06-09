import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppProviders } from './app/providers';
import { AppRoutes } from './app/router';

export default function App() {
  // BrowserRouter wraps the providers so AuthProvider (and any future
  // auth-driven navigation) can use router hooks.
  return (
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  );
}
