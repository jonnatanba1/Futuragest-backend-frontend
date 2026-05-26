import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@futuragest/contracts': '../packages/contracts/src/index.ts',
    },
  },
  build: {
    outDir: 'dist',
  },
});
