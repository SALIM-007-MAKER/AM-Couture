import { useState } from "react";
import { Wallet, Plus } from "lucide-react";
import { usePaiementsQuery, useCreatePaiementMutation, useAnnulerPaiementMutation } from "../hooks.js";
import { MODES_PAIEMENT, modeLabel, dateLocale } from "../constants.js";
import { useTranslation } from "../../../i18n/index.js";
import { LoadingState, ErrorState, EmptyState, FieldError, GlobalFormError } from "../../../components/QueryState.jsx";
import { inputClass } from "../../../components/FormField.jsx";
import Card from "../../../components/Card.jsx";
import Button from "../../../components/Button.jsx";
import { ApiError } from "../../../lib/apiClient.js";
import AnnulerControl from "../../../components/AnnulerControl.jsx";
import AnnuleBadge from "../../../components/AnnuleBadge.jsx";
import RecuActionForPaiement from "../../recus/components/RecuActionForPaiement.jsx";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(dateLocale(), { year: "numeric", month: "long", day: "numeric" });
}

function PaiementForm({ commandeId }) {
  const { t } = useTranslation();
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("ESPECES");
  const [reference, setReference] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const mutation = useCreatePaiementMutation(commandeId);
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate(
      { montant, mode, reference: reference || undefined, commentaire: commentaire || undefined },
      {
        onSuccess: () => {
          setMontant("");
          setReference("");
          setCommentaire("");
        },
      },
    );
  }

  return (
    <Card as="form" onSubmit={handleSubmit} variant="outlined" className="space-y-3">
      <GlobalFormError error={mutation.error} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t("cmd.paieMontant")}</span>
          <input
            type="text"
            inputMode="decimal"
            required
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            className={inputClass}
          />
          <FieldError messages={details?.montant} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t("cmd.paieMode")}</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
            {MODES_PAIEMENT.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t("cmd.paieReference")}</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} />
        </label>
      </div>
      <Button type="submit" variant="primary" icon={Plus} loading={mutation.isPending}>
        {t("cmd.paieAjouter")}
      </Button>
    </Card>
  );
}

// Sans en-tête propre : englobé par une SectionTitle "Paiements" fournie par
// CommandeDetailPage.jsx, pour un langage visuel identique entre toutes les
// sections de la fiche (Cliente, Modèle, Mesures, Finances, Livraison...).
export default function PaiementsSection({ commandeId, statutActuel, recus }) {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = usePaiementsQuery(commandeId, { page: 1, pageSize: 50 });
  const annulerMutation = useAnnulerPaiementMutation(commandeId);

  return (
    <div className="space-y-3">
      {/* Interdiction reflétée depuis le backend (paiements.routes.js) : une
          commande ANNULEE ne peut plus recevoir de paiement. */}
      {statutActuel === "ANNULEE" ? (
        <p className="text-sm text-neutral-500">{t("cmd.paieCommandeAnnulee")}</p>
      ) : (
        <PaiementForm commandeId={commandeId} />
      )}

      {isPending && <LoadingState label={t("cmd.paieLoading")} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && data.data.length === 0 && <EmptyState icon={Wallet}>{t("cmd.paieAucun")}</EmptyState>}
      {data && data.data.length > 0 && (
        <ul className="space-y-2">
          {data.data.map((p) => (
            <li key={p.id}>
              <Card
                variant="outlined"
                className={`flex items-center justify-between gap-3 ${p.annuleAt ? "opacity-60" : ""}`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-neutral-900 dark:text-neutral-100">{formatDate(p.date)}</p>
                    {p.annuleAt && <AnnuleBadge />}
                  </div>
                  <p className="text-neutral-500 text-sm">
                    {modeLabel(p.mode)}
                    {p.reference ? ` — ${p.reference}` : ""}
                  </p>
                  {p.annuleAt && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{t("cmd.paieMotif", { motif: p.annuleMotif })}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <p className="font-medium tabular-nums text-neutral-900 dark:text-neutral-100">{p.montant}</p>
                  {p.annuleAt ? null : (
                    <>
                      <RecuActionForPaiement
                        commandeId={commandeId}
                        paiementId={p.id}
                        recu={recus?.find((r) => r.paiementId === p.id)}
                      />
                      {/* Annulation impossible si un reçu existe déjà pour ce
                          paiement — reflété par le backend (409), pas
                          pré-validé ici : le bouton reste visible, l'erreur
                          du backend s'affiche telle quelle si l'utilisateur essaie. */}
                      <AnnulerControl
                        onAnnuler={(motif) => annulerMutation.mutate({ paiementId: p.id, motif })}
                        isPending={annulerMutation.isPending}
                        error={annulerMutation.error}
                      />
                    </>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
