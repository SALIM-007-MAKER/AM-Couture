import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox, Send } from "lucide-react";
import { useCreerDemandeMutation } from "./hooks.js";
import { GlobalFormError, FieldError } from "../../components/QueryState.jsx";
import { ApiError } from "../../lib/apiClient.js";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { useTranslation } from "../../i18n/index.js";

// Propose une PROPOSITION de nouvelle commande à l'atelier — jamais de prix,
// de dates ni de choix de modèle du catalogue acceptés ici (voir
// creerDemandeSchema, backend/src/schemas/demandeCommande.schema.js) :
// l'atelier revient vers vous pour discuter des détails avant de créer la
// commande réelle.
export default function ClientDemandeFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mutation = useCreerDemandeMutation();
  const [description, setDescription] = useState("");
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate(
      { description: description.trim() || undefined },
      { onSuccess: () => navigate("/client/demandes", { replace: true }) },
    );
  }

  return (
    <div className="max-w-lg space-y-6">
      <PageHeader icon={Inbox} title={t("client.nouvelleDemandeTitle")} subtitle={t("client.nouvelleDemandeSubtitle")} />

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <GlobalFormError error={mutation.error} />
          <Field label={t("client.fieldDescription")} hint={t("client.descriptionHint")}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={2000}
              className={inputClass}
              placeholder={t("client.descriptionPlaceholder")}
            />
            <FieldError messages={details?.description} />
          </Field>
          <Button type="submit" variant="primary" icon={Send} loading={mutation.isPending}>
            {t("client.envoyerDemande")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
