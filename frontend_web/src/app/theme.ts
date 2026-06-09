import { createTheme } from '@mantine/core';

/** FuturaGest web theme. Kept minimal; extend with brand tokens as the UI grows. */
export const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'md',
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
});
