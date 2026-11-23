import { QueryClient, MutationCache } from "@tanstack/react-query";
import { ApiError } from "./apiError.js";

export const queryClient = new QueryClient({
  // Après toute écriture réussie (création, archivage, restauration, désactivation…), la consommation des quotas affichée
  // (page Abonnement, avertissement des formulaires) est redemandée au serveur : elle n'est jamais devinée côté navigateur.
  mutationCache: new MutationCache({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["abonnements", "utilisation"] });
    },
  }),
  defaultOptions: {
    // Une écriture faite sans réseau doit ÉCHOUER tout de suite, avec un message. Par défaut TanStack la mettrait en
    // attente et la rejouerait au retour du réseau : un paiement ou un changement de statut partirait alors à l'insu de
    // l'utilisateur. Les écritures hors ligne sûres, avec leurs règles de conflit, sont une étape à part (7.6).
    mutations: { networkMode: "always" },
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
