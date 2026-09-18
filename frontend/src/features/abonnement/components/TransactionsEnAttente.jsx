import { CheckCircle2, XCircle, Inbox } from "lucide-react";
import { useAbonnementsQuery, useConfirmerManuelMutation, useRejeterManuelMutation } from "../hooks.js";
import { moyenPaiementInfo } from "../constants.js";
import { LoadingState, ErrorState, EmptyState, GlobalFormError } from "../../../components/QueryState.jsx";
import Card from "../../../components/Card.jsx";
import Button from "../../../components/Button.jsx";
import { useTranslation } from "../../../i18n/index.js";

/**
 * Paiements NITA/AMANA en attente de confirmation MANUELLE — jamais WAVE
 * (qui passe exclusivement par le webhook signé, voir webhooks.routes.js).
 * Réutilise la liste des abonnements déjà chargée (pas de nouvel endpoint) :
 * filtre côté client sur transactions.statut === "EN_ATTENTE".
 */
export default function TransactionsEnAttente() {
  const { t: tr } = useTranslation();
  const query = useAbonnementsQuery({ page: 1, pageSize: 100 });
  const confirmerMutation = useConfirmerManuelMutation();
  const rejeterMutation = useRejeterManuelMutation();

  if (query.isPending) return <LoadingState label={tr("common.loading")} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const enAttente = (query.data.data ?? [])
    .flatMap((a) => a.transactions.map((trx) => ({ ...trx, abonnement: a })))
    .filter((trx) => trx.statut === "EN_ATTENTE" && trx.moyenPaiement !== "WAVE");

  if (enAttente.length === 0) {
    return <EmptyState icon={Inbox}>{tr("abo.noPendingManual")}</EmptyState>;
  }

  return (
    <div className="space-y-2">
      <GlobalFormError error={confirmerMutation.error || rejeterMutation.error} />
      {enAttente.map((t) => {
        const info = moyenPaiementInfo(t.moyenPaiement);
        return (
          <Card key={t.id} variant="outlined" className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {t.abonnement.formule?.nom ?? t.abonnement.numero} — {info?.label ?? t.moyenPaiement} — {t.montant} FCFA
              </p>
              <p className="text-xs text-neutral-500">{tr("abo.reference")} : {t.referenceExterne ?? "—"}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={CheckCircle2}
                loading={confirmerMutation.isPending && confirmerMutation.variables === t.id}
                onClick={() => confirmerMutation.mutate(t.id)}
              >
                {tr("notif.confirm")}
              </Button>
              <Button
                variant="danger-ghost"
                size="sm"
                icon={XCircle}
                loading={rejeterMutation.isPending && rejeterMutation.variables === t.id}
                onClick={() => rejeterMutation.mutate(t.id)}
              >
                {tr("abo.reject")}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
