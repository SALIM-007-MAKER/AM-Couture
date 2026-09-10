import { useState } from "react";
import { Truck, PackageCheck } from "lucide-react";
import { useCreateLivraisonMutation, useAnnulerLivraisonMutation } from "../hooks.js";
import { MODES_PAIEMENT } from "../constants.js";
import { FieldError, GlobalFormError } from "../../../components/QueryState.jsx";
import { inputClass } from "../../../components/FormField.jsx";
import Card from "../../../components/Card.jsx";
import Button from "../../../components/Button.jsx";
import AnnulerControl from "../../../components/AnnulerControl.jsx";
import AnnuleBadge from "../../../components/AnnuleBadge.jsx";
import { ApiError } from "../../../lib/apiClient.js";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

function LivraisonForm({ commandeId, solde }) {
  const [commentaire, setCommentaire] = useState("");
  const [avecPaiementFinal, setAvecPaiementFinal] = useState(false);
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("ESPECES");
  const mutation = useCreateLivraisonMutation(commandeId);
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate({
      commentaire: commentaire || undefined,
      paiementFinal: avecPaiementFinal ? { montant, mode } : undefined,
    });
  }

  return (
    <Card as="form" onSubmit={handleSubmit} variant="outlined" className="space-y-3">
      <GlobalFormError error={mutation.error} />
      <p className="text-sm text-neutral-500">Solde restant avant livraison : {solde}</p>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Commentaire</span>
        <input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} className={inputClass} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        <input type="checkbox" checked={avecPaiementFinal} onChange={(e) => setAvecPaiementFinal(e.target.checked)} />
        Encaisser un paiement final au retrait
      </label>
      {avecPaiementFinal && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Montant *</span>
            <input
              type="text"
              inputMode="decimal"
              required
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.paiementFinal?.montant} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Mode</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
              {MODES_PAIEMENT.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <Button type="submit" variant="primary" icon={Truck} loading={mutation.isPending}>
        Enregistrer la livraison
      </Button>
    </Card>
  );
}

// Sans en-tête propre : englobé par une SectionTitle "Livraison" fournie par
// CommandeDetailPage.jsx (langage visuel identique entre les sections).
//
// `livraisons` est un TABLEAU (et non plus un objet unique) depuis l'ajout
// de l'annulation : une commande peut avoir plusieurs lignes dans le temps
// (une annulée + une nouvelle correcte), au plus une ACTIVE (annuleAt null)
// à la fois — voir livraisons.routes.js. L'historique complet est affiché,
// annulées comprises, mais seule l'active compte pour le statut/formulaire.
export default function LivraisonSection({ commandeId, statutActuel, livraisons, solde }) {
  const annulerMutation = useAnnulerLivraisonMutation(commandeId);
  const active = livraisons?.find((l) => !l.annuleAt);
  const historique = livraisons ?? [];

  return (
    <div className="space-y-3">
      {historique.length > 0 && (
        <ul className="space-y-2">
          {historique.map((l) => (
            <li key={l.id}>
              <Card variant="outlined" className={`space-y-1 ${l.annuleAt ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-neutral-900 dark:text-neutral-100">
                    {!l.annuleAt && <PackageCheck className="size-4 text-green-600 dark:text-green-400" aria-hidden="true" />}
                    Livrée le {formatDate(l.dateLivraison)}
                  </p>
                  {l.annuleAt && <AnnuleBadge />}
                </div>
                <p className="text-neutral-500 text-sm">Solde restant au moment de la livraison : {l.montantRestant}</p>
                {l.commentaire && <p className="text-neutral-500 text-sm">{l.commentaire}</p>}
                {l.annuleAt ? (
                  <p className="text-red-600 dark:text-red-400 text-xs">Motif : {l.annuleMotif}</p>
                ) : (
                  <div className="pt-1">
                    <AnnulerControl
                      onAnnuler={(motif) => annulerMutation.mutate({ livraisonId: l.id, motif })}
                      isPending={annulerMutation.isPending}
                      error={annulerMutation.error}
                    />
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {!active &&
        (statutActuel === "TERMINEE" ? (
          <LivraisonForm commandeId={commandeId} solde={solde} />
        ) : historique.length === 0 ? (
          <p className="text-sm text-neutral-500">
            La livraison sera possible une fois la commande au statut « Terminée ».
          </p>
        ) : null)}
    </div>
  );
}
