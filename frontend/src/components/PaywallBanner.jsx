import { useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { useAbonnementStore } from "../stores/abonnementStore.js";
import Button from "./Button.jsx";

/**
 * Visible sur toute page ADMIN quand l'atelier est bloqué (essai gratuit
 * terminé, aucun abonnement actif — voir requireAbonnementActif,
 * auth.middleware.js). Redirige automatiquement vers /abonnement dès que
 * `bloque` passe à `true` (n'importe quelle requête API échouée avec 402
 * peut déclencher ce state, voir apiClient.js) — la page /abonnement
 * elle-même reste toujours accessible (jamais protégée par
 * requireAbonnementActif), donc jamais de boucle de redirection.
 */
export default function PaywallBanner() {
  const bloque = useAbonnementStore((s) => s.bloque);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (bloque && location.pathname !== "/abonnement") {
      navigate("/abonnement", { replace: true });
    }
  }, [bloque, location.pathname, navigate]);

  if (!bloque) return null;

  return (
    <div className="flex items-center justify-center gap-3 bg-red-600 text-white text-sm px-4 py-2 flex-wrap">
      <span className="flex items-center gap-1.5 font-medium">
        <Lock className="size-4 shrink-0" aria-hidden="true" />
        Votre période d'essai est terminée — souscrivez à un abonnement pour continuer à utiliser l'application.
      </span>
      <Button as={Link} to="/abonnement" variant="secondary" size="sm">
        Voir les formules
      </Button>
    </div>
  );
}
