import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./apiError.js";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Une erreur 4xx (400-499 : 404 "introuvable", 400 "invalide", 401,
      // 403...) est DÉFINITIVE — la retenter ne peut jamais réussir et ne
      // fait que prolonger artificiellement l'état "chargement" avant que
      // l'erreur ne s'affiche enfin (trouvé en testant une fiche cliente
      // inexistante : la page restait bloquée sur "Chargement..." plusieurs
      // secondes après un 404 déjà reçu). Seules les erreurs réseau/5xx,
      // potentiellement transitoires, sont retentées, une fois.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 1;
      },
    },
  },
});
