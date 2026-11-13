// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Keep the existing Lovable/Cloudflare build unchanged. Only the separate
// Firebase preview build switches Nitro to a standalone Node.js server.
const isFirebaseAppHostingBuild = process.env.CORMYR_BUILD_TARGET === "firebase";

export default defineConfig({
  ...(isFirebaseAppHostingBuild
    ? { nitro: {
        preset: "node_server",
        output: {
          dir: ".output",
          serverDir: ".output/server",
          publicDir: ".output/public",
        },
      } }
    : {}),
  vite: {
    plugins: [mcpPlugin()],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
