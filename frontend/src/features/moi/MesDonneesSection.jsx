import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSupprimerMonCompteMutation } from "./hooks.js";
import { moiExportUrl } from "./api.js";
import { GlobalFormError, FieldError } from "../../components/QueryState.jsx";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import { inputClass } from "../../components/FormField.jsx";
import { useTranslation } from "../../i18n/index.js";

/**
 * Droits de la cliente sur ses données : les télécharger, ou fermer son compte et demander leur effacement.
 * La suppression redemande le mot de passe et passe par une confirmation explicite ; une fois faite, la session est fermée.
 */
export default function MesDonneesSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mutation = useSupprimerMonCompteMutation();
  const [etape, setEtape] = useState("repos"); // repos | confirmation
  const [motDePasse, setMotDePasse] = useState("");

  function supprimer(e) {
    e.preventDefault();
    mutation.mutate({ motDePasse }, { onSuccess: () => navigate("/login", { replace: true }) });
  }

  return (
    <div className="space-y-3" data-testid="mes-donnees">
      <SectionTitle>{t("mesdonnees.titre")}</SectionTitle>
      <Card className="space-y-3 text-sm">
        <p className="text-neutral-600 dark:text-neutral-400">{t("mesdonnees.exportTexte")}</p>
        <Button as="a" href={moiExportUrl()} variant="secondary" icon={Download} data-testid="export-donnees">
          {t("mesdonnees.exporter")}
        </Button>
      </Card>

      <Card variant="outlined" className="space-y-3 text-sm border-red-200 dark:border-red-900">
        <p className="font-medium text-neutral-900 dark:text-neutral-100">{t("mesdonnees.supprimerTitre")}</p>
        <p className="text-neutral-600 dark:text-neutral-400">{t("mesdonnees.supprimerTexte")}</p>
        {etape === "repos" ? (
          <Button variant="secondary" icon={Trash2} onClick={() => setEtape("confirmation")} data-testid="supprimer-compte">
            {t("mesdonnees.supprimer")}
          </Button>
        ) : (
          <form onSubmit={supprimer} className="space-y-2" data-testid="supprimer-form">
            <GlobalFormError error={mutation.error} />
            <label className="block space-y-1">
              <span>{t("mesdonnees.motDePasse")}</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                className={inputClass}
                data-testid="supprimer-mdp"
              />
              <FieldError messages={mutation.error?.details?.motDePasse} />
            </label>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" icon={Trash2} loading={mutation.isPending} data-testid="supprimer-confirmer">
                {t("mesdonnees.confirmer")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => { setEtape("repos"); setMotDePasse(""); mutation.reset(); }}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
