// Rota mantida manualmente (antes gerada pelo plugin Vite do mcp-js).
// route: /.well-known/oauth-protected-resource
// emitted to: src/routes/[.well-known]/oauth-protected-resource.ts

import { createFileRoute } from "@tanstack/react-router";

import { createTanStackOAuthProtectedResourceMetadataHandler } from "@lovable.dev/mcp-js/stacks/tanstack";

import mcp from "../../lib/mcp/index";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      ANY: createTanStackOAuthProtectedResourceMetadataHandler(mcp, {
        resourcePath: "/mcp",
        metadataPath: "/.well-known/oauth-protected-resource",
        // Confia em X-Forwarded-Host/-Proto: seguro apenas atrás do proxy do Google
        // (Firebase App Hosting/Cloud Run), que sobrescreve ambos os cabeçalhos.
        trustForwardedHost: true,
        forwardedHostTrustedByPlatform: true,
        trustForwardedProto: true,
      }),
    },
  },
});
