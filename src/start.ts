import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { shouldBlockLegacyRequest, ARCHIVE_UNAVAILABLE_MESSAGE } from "@/lib/archive-only";

/**
 * Archive-only request boundary. Keep this ahead of all request and serverFn
 * middleware to avoid executing old Supabase, OAuth, Drive, or write handlers.
 * Static /cormyr/ files are not intercepted.
 */
const archiveOnlyMiddleware = createMiddleware().server(({ request, handlerType, next }) => {
  const pathname = new URL(request.url).pathname;
  if (!shouldBlockLegacyRequest(pathname, handlerType)) return next();
  return Response.json(
    { error: 'legacy_backend_paused', message: ARCHIVE_UNAVAILABLE_MESSAGE },
    { status: 503, headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Retry-After': '3600',
    } },
  );
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  // No legacy Supabase token fetch in archive-only mode. Firebase pilot
  // authenticates directly against its separate, server-verified Cloud API.
  // Old serverFns remain blocked by archiveOnlyMiddleware (before handlers).
  functionMiddleware: [],
  requestMiddleware: [archiveOnlyMiddleware, errorMiddleware, csrfMiddleware],
}));
