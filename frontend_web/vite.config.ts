import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@futuragest/contracts': './src/contracts/index.ts',
    },
  },
  build: {
    outDir: 'dist',
  },
});
