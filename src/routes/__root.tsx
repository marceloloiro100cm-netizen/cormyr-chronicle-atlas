import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
  redirect,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportClientError } from "../lib/error-reporting";
import { oauthReturnPath } from '@/lib/oauth-return-path';
import { I18nProvider } from '@/lib/i18n/context';
import {decideSessionBoundary,clearSessionQueryCache} from '@/lib/auth/session-boundary';

import { CORMYR_ARCHIVE_ONLY, isFirebasePilotPage, isPublicReaderPage, shouldRedirectToFirebasePilot } from '@/lib/archive-only';


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço que você procurou não existe ou mudou de lugar.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportClientError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado do nosso lado. Tente de novo ou volte ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar de novo
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Guard at the router boundary, before private route loaders can call
  // the legacy backend. The public archive is served as static files.
  beforeLoad: ({ location }) => {
    // Existing login and player bookmarks now enter the Cloud-only pilot,
    // never the disabled legacy Supabase components.
    if (CORMYR_ARCHIVE_ONLY && shouldRedirectToFirebasePilot(location.pathname)) {
      throw redirect({ to: '/firebase-access' });
    }
    // The new Firebase-only pilot is independently guarded by Firebase
    // Admin access and a disabled-by-default server flag. Legacy game routes
    // remain in archive-only mode with no Supabase fallback.
    const firebasePilotPath = isFirebasePilotPage(location.pathname) || isPublicReaderPage(location.pathname);
    if (CORMYR_ARCHIVE_ONLY && location.pathname !== '/' && !firebasePilotPath) {
      throw redirect({ to: '/' });
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Atlas de Cormyr" },
      { name: "description", content: "Atlas de Cormyr: Crônicas do Reino" },
      { name: "author", content: "Atlas de Cormyr" },
      { property: "og:title", content: "Atlas de Cormyr" },
      { property: "og:description", content: "Atlas de Cormyr: Crônicas do Reino" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/cormyr/brand/cormyr-icone-favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/cormyr/brand/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/cormyr/brand/apple-touch-icon-180x180.png", sizes: "180x180" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const knownUserId=useRef<string|null|undefined>(undefined);
  const [sessionEpoch,setSessionEpoch]=useState(0);
  useEffect(() => {
    if (CORMYR_ARCHIVE_ONLY) return;
    // Keep the discontinued provider entirely out of the active Firebase
    // archive bundle. This import is reached only after a separately audited
    // legacy-mode reversal, never during the Firebase pilot.
    let active = true;
    let unsubscribe: (() => void) | null = null;
    void import('@/integrations/supabase/client').then(({ supabase }) => {
      if (!active) return;
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event,session) => {
      const decision=decideSessionBoundary(knownUserId.current,event,session?.user?.id);
      if(decision.reason==='ignored')return;
      knownUserId.current=decision.userId;
      if(decision.clearPrivateCache){
        // Invalidation retains old letters/house sheets on screen; clear also
        // cancels old requests before a different identity can render them.
        clearSessionQueryCache(queryClient);
        setSessionEpoch(epoch=>epoch+1);
      }
      if(decision.clearSelectedHouse){
        sessionStorage.removeItem('campaign-selected-house');
        sessionStorage.removeItem('campaign-oauth-next');
      }
      if(decision.recheckRoute)void router.invalidate();
      if(event==='SIGNED_IN'){
        const next=sessionStorage.getItem('campaign-oauth-next');
        if(next){sessionStorage.removeItem('campaign-oauth-next');void router.navigate({to:oauthReturnPath(next)});}
      }
      });
      unsubscribe = () => subscription.unsubscribe();
    }).catch(() => {
      // No alternate Auth provider is automatically selected on failure.
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet key={sessionEpoch} />
      </I18nProvider>
    </QueryClientProvider>
  );
}
