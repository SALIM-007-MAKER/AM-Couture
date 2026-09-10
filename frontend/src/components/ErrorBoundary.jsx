import { Component } from "react";
import { AlertTriangle, Home } from "lucide-react";

/**
 * Filet de sécurité applicatif : sans lui, toute exception de rendu React
 * non prévue (ex: le bug isLoading/isPending trouvé en testant une fiche
 * cliente inexistante — voir ClienteDetailPage.jsx) fait disparaître TOUTE
 * l'interface en un écran noir silencieux, sans aucun indice ni moyen de
 * revenir en arrière sans taper une URL à la main. Les Error Boundaries
 * React exigent un composant classe — aucun équivalent à base de hooks.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Erreur applicative non gérée :", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-svh flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 px-4">
          <div className="max-w-sm text-center space-y-3">
            <AlertTriangle className="mx-auto size-10 text-amber-500" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Une erreur inattendue est survenue
            </h1>
            <p className="text-sm text-neutral-500">
              L'équipe technique a été notifiée. Vous pouvez essayer de revenir à l'accueil.
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium px-4 py-2 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
            >
              <Home className="size-4" aria-hidden="true" />
              Retour à l'accueil
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
