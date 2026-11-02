/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // A relative base lets the built app run from any folder or static host.
  base: './',
  test: { environment: 'node' },
});
