import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Dados recém-buscados valem 30 s: trocar de aba ou voltar à janela não
  // dispara de novo todas as consultas da tela. Polling (refetchInterval),
  // invalidação após salvar e consultas com staleTime próprio (como a checagem
  // de acesso, sempre fresca) continuam funcionando como antes.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
