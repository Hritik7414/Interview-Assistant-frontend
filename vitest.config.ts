import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/shared/**/*.test.ts',
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/components/**/*.test.tsx',
    ],
    css: false,
    restoreMocks: true,
  },
});
