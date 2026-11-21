import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
export async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * The editorial workspace is a long-lived SPA. After a Firebase App Hosting
 * rollout an HTML shell cached by the browser/CDN can keep invoking the old
 * (pre-Storage) staff-photo adapter even though main is already live.
 *
 * Never cache HTML entrypoints that mount an authenticated workspace. Static
 * fingerprinted JS/CSS/assets keep their normal caching policy. Do not alter
 * API/JSON responses or Set-Cookie headers.
 */
export function preventStaleWorkspaceHtml(request: Request, response: Response): Response {
  const pathname = new URL(request.url).pathname;
  if (!['/firebase-access','/auth','/reset-password','/jornal'].includes(pathname) ||
      (request.method !== 'GET' && request.method !== 'HEAD') ||
      !response.headers.get('content-type')?.toLowerCase().includes('text/html') ||
      response.status === 204 || response.status === 205 || response.status === 304) return response;
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return preventStaleWorkspaceHtml(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
