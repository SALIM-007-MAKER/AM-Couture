import { Receipt } from "lucide-react";
import { useCreateRecuForPaiementMutation } from "../hooks.js";
import { recuPdfUrl } from "../api.js";
import { ApiError } from "../../../lib/apiClient.js";
import Button from "../../../components/Button.jsx";
import { useTranslation } from "../../../i18n/index.js";

// `recu` = déjà trouvé dans la liste des reçus de la commande (chargée une
// seule fois par CommandeDetailPage) — pas de requête par ligne de paiement.
export default function RecuActionForPaiement({ commandeId, paiementId, recu }) {
  const { t } = useTranslation();
  const mutation = useCreateRecuForPaiementMutation(commandeId);

  if (recu) {
    return (
      <Button as="a" href={recuPdfUrl(recu.id)} target="_blank" rel="noreferrer" variant="ghost" size="sm" icon={Receipt} className="p-0!">
        {t("recu.numeroRecu", { numero: recu.numero })}
      </Button>
    );
  }

  const message = mutation.error instanceof ApiError ? mutation.error.message : null;

  return (
    <div className="text-right">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon={Receipt}
        loading={mutation.isPending}
        onClick={() => mutation.mutate(paiementId)}
        className="p-0!"
      >
        {t("recu.emettre")}
      </Button>
      {message && <p className="text-xs text-red-600 dark:text-red-400">{message}</p>}
    </div>
  );
}
