/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  define: {
    'process.env.TURN_URL': JSON.stringify(process.env.TURN_URL ?? ''),
    'process.env.TURN_USER': JSON.stringify(process.env.TURN_USER ?? ''),
    'process.env.TURN_PASS': JSON.stringify(process.env.TURN_PASS ?? ''),
    'process.env.SIGNALING_URL': JSON.stringify(process.env.SIGNALING_URL ?? 'http://localhost:3003'),
  },
  resolve: {
    alias: {
      '@domain': resolve(__dirname, 'src/domain'),
      '@data': resolve(__dirname, 'src/data'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@presentation': resolve(__dirname, 'src/presentation'),
    },
  },
  server: {
    port: 5175,
    host: '0.0.0.0',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/**/index.ts'],
      reporter: ['text', 'html'],
    },
  },
});
