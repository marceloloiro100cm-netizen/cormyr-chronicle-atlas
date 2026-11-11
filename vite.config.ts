// Lovable production keeps its existing configuration. Vercel preview gets a
// vendor-independent TanStack Start / Nitro pipeline, selected only in Vercel.
import { defineConfig as defineLovableConfig } from "@lovable.dev/vite-tanstack-config";
import { defineConfig as defineViteConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

const vercelPreview = process.env['VERCEL'] === "1" || process.env['CORMYR_VERCEL_PREVIEW'] === "1";

export default vercelPreview
  ? defineViteConfig({
      plugins: [
        tanstackStart({ server: { entry: "server" } }),
        nitro(),
        viteReact(),
        tailwindcss(),
        tsConfigPaths(),
        mcpPlugin(),
      ],
    })
  : defineLovableConfig({
      vite: {
        plugins: [mcpPlugin()],
      },
      tanstackStart: {
        server: { entry: "server" },
      },
    });
