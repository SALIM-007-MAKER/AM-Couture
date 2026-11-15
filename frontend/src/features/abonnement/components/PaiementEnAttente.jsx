import { Hourglass, RefreshCw, Undo2 } from "lucide-react";
import { useAnnulerDeclarationMutation, useVerifierPaiementMutation } from "../hooks.js";
import { formatDateFr, formatPrix } from "../constants.js";
import Card from "../../../components/Card.jsx";
import Button from "../../../components/Button.jsx";
import { GlobalFormError } from "../../../components/QueryState.jsx";
import { useTranslation } from "../../../i18n/index.js";

/**
 * Déclaration en attente de vérification. Un paiement manuel peut être retiré par l'atelier tant qu'il n'est pas
 * traité ; un paiement Wave se clôt tout seul (confirmation ou expiration) et peut être relu à la demande, ce qui
 * demande au SERVEUR de lire l'état chez Wave : aucune affirmation du navigateur n'est envoyée.
 */
export default function PaiementEnAttente({ paiement }) {
  const { t } = useTranslation();
  const annuler = useAnnulerDeclarationMutation();
  const verifier = useVerifierPaiementMutation();
  const wave = paiement.moyenPaiement === "WAVE";
  const date = paiement.declareLe ?? paiement.createdAt;

  return (
    <Card variant="outlined" className="space-y-3 border-amber-200 dark:border-amber-900" data-testid="paiement-en-attente">
      <p className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
        <Hourglass className="size-4 shrink-0" aria-hidden="true" />
        {t("subPay.pendingTitle")}
      </p>
      <p className="text-sm text-neutral-700 dark:text-neutral-300">
        {wave
          ? t("subPay.pendingWave", { numero: paiement.numero })
          : t("subPay.pendingBody", { numero: paiement.numero, montant: formatPrix(paiement.montant), date: formatDateFr(date) })}
      </p>
      <GlobalFormError error={annuler.error ?? verifier.error} />
      <div className="flex gap-2 flex-wrap">
        {wave ? (
          <Button variant="secondary" size="sm" icon={RefreshCw} loading={verifier.isPending} onClick={() => verifier.mutate(paiement.id)}>
            {t("subPay.verify")}
          </Button>
        ) : (
          <Button variant="danger-ghost" size="sm" icon={Undo2} loading={annuler.isPending} onClick={() => annuler.mutate(paiement.id)}>
            {t("subPay.withdraw")}
          </Button>
        )}
      </div>
    </Card>
  );
}
