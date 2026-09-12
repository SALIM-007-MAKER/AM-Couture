import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, Clock3, History } from "lucide-react";
import { useAbonnementActuelQuery, useAbonnementsQuery, isNotFound } from "./hooks.js";
import { STATUT_ABONNEMENT_LABELS, STATUT_TRANSACTION_LABELS, moyenPaiementInfo, formatDateFr } from "./constants.js";
import SouscrireCard from "./components/SouscrireCard.jsx";
import TransactionsEnAttente from "./components/TransactionsEnAttente.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";

const STATUT_TONES = {
  ACTIF: "text-green-600 dark:text-green-400",
  EXPIRE: "text-red-600 dark:text-red-400",
  EN_ATTENTE: "text-amber-600 dark:text-amber-400",
  ANNULE: "text-neutral-500",
};

export default function AbonnementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // "succes"/"echec" : purement indicatif (redirection Wave, voir
  // success_url/error_url dans abonnements.routes.js) — jamais la source de
  // vérité. Le statut affiché ci-dessous vient toujours de /abonnements/actuel,
  // mis à jour uniquement après la vérification serveur (webhook + relecture).
  const paiement = searchParams.get("paiement");
  const actuelQuery = useAbonnementActuelQuery();
  const historiqueQuery = useAbonnementsQuery({ page: 1, pageSize: 10 });

  useEffect(() => {
    if (!paiement) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      next.delete("paiement");
      setSearchParams(next, { replace: true });
    }, 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [paiement]);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader icon={CreditCard} title="Abonnement" subtitle="Accès de l'atelier à AM Couture." />

      {paiement === "succes" && (
        <Card className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 text-sm">
          Paiement Wave en cours de vérification — le statut ci-dessous se mettra à jour automatiquement dès
          confirmation (jamais avant une vérification serveur fiable).
        </Card>
      )}
      {paiement === "echec" && (
        <Card className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-sm">
          Paiement Wave annulé ou échoué — vous pouvez réessayer ci-dessous.
        </Card>
      )}

      <div className="space-y-2">
        <SectionTitle icon={Clock3}>Statut actuel</SectionTitle>
        {actuelQuery.isPending && <LoadingState label="Chargement…" />}
        {actuelQuery.isError && !isNotFound(actuelQuery.error) && (
          <ErrorState error={actuelQuery.error} onRetry={actuelQuery.refetch} />
        )}
        {actuelQuery.data && (
          <Card variant="outlined" className="space-y-1">
            <p className={`text-sm font-semibold ${STATUT_TONES[actuelQuery.data.statutEffectif]}`}>
              {STATUT_ABONNEMENT_LABELS[actuelQuery.data.statutEffectif]}
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Formule {actuelQuery.data.formule.nom} — {actuelQuery.data.prix} FCFA
            </p>
            {actuelQuery.data.dateExpiration && (
              <p className="text-xs text-neutral-500">
                {actuelQuery.data.statutEffectif === "ACTIF" ? "Expire le " : "Expiré le "}
                {formatDateFr(actuelQuery.data.dateExpiration)}
              </p>
            )}
          </Card>
        )}
        {isNotFound(actuelQuery.error) && (
          <Card variant="outlined">
            <p className="text-sm text-neutral-500">Aucun abonnement souscrit pour l'instant.</p>
          </Card>
        )}
      </div>

      <div className="space-y-2">
        <SectionTitle icon={CreditCard}>Souscrire / renouveler</SectionTitle>
        <SouscrireCard />
      </div>

      <div className="space-y-2">
        <SectionTitle icon={Clock3}>Paiements en attente de confirmation manuelle</SectionTitle>
        <TransactionsEnAttente />
      </div>

      <div className="space-y-2">
        <SectionTitle icon={History}>Historique</SectionTitle>
        {historiqueQuery.isPending && <LoadingState label="Chargement…" />}
        {historiqueQuery.isError && <ErrorState error={historiqueQuery.error} onRetry={historiqueQuery.refetch} />}
        {historiqueQuery.data && historiqueQuery.data.data.length === 0 && (
          <EmptyState icon={History}>Aucun abonnement pour l'instant.</EmptyState>
        )}
        {historiqueQuery.data && historiqueQuery.data.data.length > 0 && (
          <ul className="space-y-2">
            {historiqueQuery.data.data.map((a) => (
              <li key={a.id}>
                <Card variant="outlined" className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">
                      {a.numero} — {a.formule.nom}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                      {a.transactions
                        .map(
                          (t) =>
                            `${moyenPaiementInfo(t.moyenPaiement)?.label ?? t.moyenPaiement} : ${STATUT_TRANSACTION_LABELS[t.statut]}`,
                        )
                        .join(" · ")}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium ${STATUT_TONES[a.statutEffectif]}`}>
                    {STATUT_ABONNEMENT_LABELS[a.statutEffectif]}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
