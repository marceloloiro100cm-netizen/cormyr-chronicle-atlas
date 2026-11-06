import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from '@/integrations/supabase/client';
import { oauthReturnPath } from '@/lib/oauth-return-path';
import { I18nProvider } from '@/lib/i18n/context';
import {decideSessionBoundary,clearSessionQueryCache} from '@/lib/auth/session-boundary';

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
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
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Cormyr Web" },
      { name: "description", content: "Cormyr Web — Crônicas do Reino" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Cormyr Web" },
      { property: "og:description", content: "Cormyr Web — Crônicas do Reino" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});


/**
 * Identificação de segurança exclusiva das prévias de homologação.
 * Não depende de variáveis VITE genéricas: a prévia de produção jamais deve mostrar o aviso.
 */
function StagingBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const ids = [
      '6fbb6b20-e2ad-4d5b-8cb5-ee6bc5af29c6',
      '41028f68-4fe7-4ed0-b123-c820522a0a3b',
    ];
    const domains = ['lovable.app', 'lovableproject.com', 'lovableproject-dev.com'];
    const hostname = window.location.hostname.toLowerCase();
    const isStaging = ids.some((id) =>
      domains.some((domain) => hostname === `id-preview--${id}.${domain}`),
    );
    if (!isStaging) return;
    const before = document.body.style.paddingTop;
    document.body.style.paddingTop = '36px';
    setVisible(true);
    return () => { document.body.style.paddingTop = before; };
  }, []);
  return visible ? (
    <div role="status" aria-label="Ambiente de teste" style={{
      position:'fixed', top:0, left:0, right:0, height:36, zIndex:2147483646,
      background:'#b91c1c', color:'#ffffff', display:'flex',
      alignItems:'center', justifyContent:'center', textAlign:'center',
      fontSize:13, fontWeight:800, letterSpacing:'0.12em', lineHeight:1.15,
      boxShadow:'0 2px 8px rgba(0,0,0,0.35)', pointerEvents:'none',
    }}>
      AMBIENTE DE TESTE
    </div>
  ) : null;
}

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        <StagingBanner />
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
    return () => subscription.unsubscribe();
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
