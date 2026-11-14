// Configuração Vite própria (antes: @lovable.dev/vite-tanstack-config).
// Ordem dos plugins: TanStack Start, React, Tailwind, aliases do tsconfig e Nitro.
// O alvo do Nitro é Node (node-server), usado pelo Firebase App Hosting / Cloud Run.
// Se necessário, force com NITRO_PRESET=node-server no ambiente de build.
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    // Redireciona a entrada de servidor do TanStack Start para src/server.ts
    // (nosso wrapper de erros de SSR); o Nitro empacota a partir dela.
    tanstackStart({ server: { entry: "server" } }),
    viteReact(),
    tailwindcss(),
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    nitro(),
  ],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "@tanstack/react-router",
      "@tanstack/react-start",
      "@tanstack/react-query",
    ],
  },
});
