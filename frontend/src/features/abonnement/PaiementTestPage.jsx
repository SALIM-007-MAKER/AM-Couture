import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FlaskConical, CheckCircle2, XCircle, Ban, Hourglass } from "lucide-react";
import { useTransactionQuery, useSimulerMockMutation } from "./hooks.js";
import { moyenPaiementInfo } from "./constants.js";
import { LoadingState, ErrorState, GlobalFormError } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";

const RESULTATS = [
  { value: "REUSSIE", label: "Simuler un paiement réussi", icon: CheckCircle2, variant: "primary" },
  { value: "ECHOUEE", label: "Simuler un paiement échoué", icon: XCircle, variant: "danger" },
  { value: "ANNULEE", label: "Simuler une annulation", icon: Ban, variant: "secondary" },
  { value: "EXPIREE", label: "Simuler une expiration", icon: Hourglass, variant: "secondary" },
];

// Tient lieu de checkout Wave UNIQUEMENT en mode test (PAYMENTS_MODE=mock,
// voir backend/src/lib/payments/WavePaymentProvider.js) — la redirection ici
// vient du backend lui-même (checkoutUrl retourné par POST /api/abonnements),
// jamais construite ou devinée côté frontend. Chaque bouton appelle POST
// /api/transactions/:id/simuler-mock, qui suit EXACTEMENT le même chemin
// d'activation qu'un vrai webhook (voir activerAbonnement,
// backend/src/lib/abonnement.js) — le comportement observé ici est donc
// fidèle à ce qui se passera une fois les vraies clés API branchées.
export default function PaiementTestPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const query = useTransactionQuery(id);
  const mutation = useSimulerMockMutation();
  const [resultatEnvoye, setResultatEnvoye] = useState(null);

  if (query.isPending) return <LoadingState label="Chargement de la transaction…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const transaction = query.data;
  const info = moyenPaiementInfo(transaction.moyenPaiement);
  const resolue = transaction.statut !== "EN_ATTENTE" || resultatEnvoye;

  function handleSimuler(resultat) {
    setResultatEnvoye(resultat);
    mutation.mutate(
      { id, resultat },
      {
        onSuccess: () => {
          const t = setTimeout(
            () => navigate(`/abonnement?paiement=${resultat === "REUSSIE" ? "succes" : "echec"}`, { replace: true }),
            1500,
          );
          return () => clearTimeout(t);
        },
        onError: () => setResultatEnvoye(null),
      },
    );
  }

  return (
    <div className="max-w-lg space-y-6">
      <PageHeader
        icon={FlaskConical}
        title="Paiement test"
        subtitle={`Simulation ${info?.label ?? transaction.moyenPaiement} — aucun argent réel n'est déplacé.`}
      />

      <Card className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Formule</span>
          <span className="font-medium text-neutral-900 dark:text-neutral-100">{transaction.abonnement.formule.nom}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Montant</span>
          <span className="font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
            {transaction.montant} FCFA
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Référence</span>
          <span className="font-mono text-xs text-neutral-500">{transaction.referenceInterne}</span>
        </div>
      </Card>

      {!resolue ? (
        <Card variant="outlined" className="space-y-3">
          <GlobalFormError error={mutation.error} />
          <p className="text-xs text-neutral-500">
            Choisissez le résultat à simuler pour cette tentative de paiement.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {RESULTATS.map((r) => (
              <Button
                key={r.value}
                variant={r.variant}
                icon={r.icon}
                loading={mutation.isPending && mutation.variables?.resultat === r.value}
                disabled={mutation.isPending}
                onClick={() => handleSimuler(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </Card>
      ) : (
        <Card variant="outlined" className="text-sm text-neutral-600 dark:text-neutral-400">
          Résultat simulé — redirection vers votre abonnement…
        </Card>
      )}
    </div>
  );
}
