/**
 * Standalone SSR build for Firebase Hosting + Cloud Run.
 * Deliberately bypasses the Lovable build wrapper and MCP dev plugin.
 * Keep vite.config.ts unchanged until this build passes integration tests.
 */
import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { nitro } from 'nitro/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tanstackStart({ server: { entry: './server.ts' } }),
    nitro(),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-router', '@tanstack/react-start'],
  },
});
