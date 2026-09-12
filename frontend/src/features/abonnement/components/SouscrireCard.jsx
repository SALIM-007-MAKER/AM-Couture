import { useState } from "react";
import { CreditCard } from "lucide-react";
import { useFormulesQuery, useCreerAbonnementMutation } from "../hooks.js";
import { MOYENS_PAIEMENT } from "../constants.js";
import { LoadingState, ErrorState, GlobalFormError, FieldError } from "../../../components/QueryState.jsx";
import { Field, inputClass } from "../../../components/FormField.jsx";
import Card from "../../../components/Card.jsx";
import Button from "../../../components/Button.jsx";
import { ApiError } from "../../../lib/apiClient.js";

/**
 * Choix de formule + moyen de paiement + souscription. WAVE redirige vers
 * la page de paiement Wave (vérification automatique côté serveur ensuite,
 * voir webhooks.routes.js) ; NITA/AMANA demandent la référence d'un
 * transfert déjà effectué par l'atelier, en attente de confirmation
 * manuelle (voir TransactionsEnAttente.jsx) — jamais activé tout seul.
 */
export default function SouscrireCard() {
  const formulesQuery = useFormulesQuery();
  const mutation = useCreerAbonnementMutation();
  const [formuleId, setFormuleId] = useState(null);
  const [moyenPaiement, setMoyenPaiement] = useState(null);
  const [referenceExterne, setReferenceExterne] = useState("");
  const [envoye, setEnvoye] = useState(false);

  if (formulesQuery.isPending) return <LoadingState label="Chargement des formules…" />;
  if (formulesQuery.isError) return <ErrorState error={formulesQuery.error} onRetry={formulesQuery.refetch} />;

  const formules = formulesQuery.data;
  const formuleChoisie = formules.find((f) => f.id === formuleId);
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  function handleChoisirFormule(id) {
    setFormuleId(id);
    setMoyenPaiement(null);
    setReferenceExterne("");
    setEnvoye(false);
    mutation.reset();
  }

  function handleSouscrire(e) {
    e.preventDefault();
    mutation.mutate(
      { formuleId, moyenPaiement, referenceExterne: moyenPaiement === "WAVE" ? undefined : referenceExterne },
      {
        onSuccess: (data) => {
          if (data.waveCheckoutUrl) {
            window.location.href = data.waveCheckoutUrl;
          } else {
            setEnvoye(true);
          }
        },
      },
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {formules.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => handleChoisirFormule(f.id)}
            className={`text-left rounded-2xl border p-3 transition-colors ${
              formuleId === f.id
                ? "border-brand-600 bg-brand-50 dark:bg-brand-950"
                : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
            }`}
          >
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{f.nom}</p>
            <p className="text-lg font-bold tabular-nums text-neutral-900 dark:text-neutral-100 mt-1">{f.prix}</p>
            <p className="text-xs text-neutral-500">FCFA</p>
          </button>
        ))}
      </div>

      {formuleChoisie && !envoye && (
        <Card as="form" onSubmit={handleSouscrire} variant="outlined" className="space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Formule <strong>{formuleChoisie.nom}</strong> — {formuleChoisie.prix} FCFA
          </p>
          <GlobalFormError error={mutation.error} />

          <div>
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Moyen de paiement</p>
            <div className="flex gap-2 flex-wrap">
              {MOYENS_PAIEMENT.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMoyenPaiement(m.value)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    moyenPaiement === m.value
                      ? "border-brand-600 bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300"
                      : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400"
                  }`}
                >
                  <m.icon className="size-4" aria-hidden="true" />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {moyenPaiement && moyenPaiement !== "WAVE" && (
            <>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-xs px-3 py-2">
                Confirmation manuelle : effectuez le transfert vers le compte {moyenPaiement} de l'atelier, puis
                indiquez la référence ci-dessous. L'abonnement ne sera activé qu'après vérification manuelle — ce
                n'est pas une vérification automatique.
              </div>
              <Field label="Référence du transfert" required>
                <input
                  required
                  value={referenceExterne}
                  onChange={(e) => setReferenceExterne(e.target.value)}
                  placeholder={`Référence ${moyenPaiement}`}
                  className={inputClass}
                />
                <FieldError messages={details?.referenceExterne} />
              </Field>
            </>
          )}

          {moyenPaiement && (
            <Button
              type="submit"
              variant={moyenPaiement === "WAVE" ? "accent" : "primary"}
              icon={CreditCard}
              loading={mutation.isPending}
            >
              {moyenPaiement === "WAVE" ? "Payer avec Wave" : "Envoyer pour confirmation"}
            </Button>
          )}
        </Card>
      )}

      {envoye && (
        <Card variant="outlined" className="text-sm text-neutral-600 dark:text-neutral-400">
          Demande envoyée — en attente de confirmation manuelle une fois le paiement vérifié.
        </Card>
      )}
    </div>
  );
}
