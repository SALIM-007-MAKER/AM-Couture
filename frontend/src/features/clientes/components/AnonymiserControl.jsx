import { useState } from "react";
import { ShieldOff } from "lucide-react";
import { useAnonymiserClienteMutation } from "../hooks.js";
import { GlobalFormError } from "../../../components/QueryState.jsx";
import Button from "../../../components/Button.jsx";
import Card from "../../../components/Card.jsx";
import { useTranslation } from "../../../i18n/index.js";

/**
 * Droit à l'effacement (PDG seulement) : anonymise une fiche cliente. Irréversible, donc précédée d'une confirmation qui
 * dit exactement ce qui disparaît et ce qui reste. Si la cliente a déjà demandé l'effacement de son compte, on le rappelle.
 */
export default function AnonymiserControl({ cliente }) {
  const { t } = useTranslation();
  const mutation = useAnonymiserClienteMutation(cliente.id);
  const [confirmation, setConfirmation] = useState(false);

  if (cliente.anonymiseeLe) {
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-400" data-testid="cliente-anonymisee">
        {t("anon.faite")}
      </p>
    );
  }

  return (
    <Card variant="outlined" className="space-y-2 text-sm" data-testid="anonymiser">
      {cliente.suppressionDemandeeLe && (
        <p className="font-medium text-amber-700 dark:text-amber-400" data-testid="effacement-demande">
          {t("anon.demandee")}
        </p>
      )}
      <GlobalFormError error={mutation.error} />
      {confirmation ? (
        <div className="space-y-2">
          <p className="text-neutral-700 dark:text-neutral-300">{t("anon.confirmation")}</p>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" icon={ShieldOff} loading={mutation.isPending} onClick={() => mutation.mutate(undefined, { onSuccess: () => setConfirmation(false) })} data-testid="anonymiser-confirmer">
              {t("anon.confirmer")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmation(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" icon={ShieldOff} onClick={() => setConfirmation(true)} data-testid="anonymiser-bouton">
          {t("anon.bouton")}
        </Button>
      )}
    </Card>
  );
}
