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

// Propose une PROPOSITION de nouvelle commande à l'atelier — jamais de prix,
// de dates ni de choix de modèle du catalogue acceptés ici (voir
// creerDemandeSchema, backend/src/schemas/demandeCommande.schema.js) :
// l'atelier revient vers vous pour discuter des détails avant de créer la
// commande réelle.
export default function ClientDemandeFormPage() {
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
      <PageHeader icon={Inbox} title="Nouvelle demande" subtitle="Décrivez ce que vous souhaitez commander — l'atelier vous recontactera." />

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <GlobalFormError error={mutation.error} />
          <Field label="Description" hint="Type de vêtement, tissu, occasion, délai souhaité…">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={2000}
              className={inputClass}
              placeholder="Ex : Un boubou pour un mariage, en bazin bleu, avant fin du mois."
            />
            <FieldError messages={details?.description} />
          </Field>
          <Button type="submit" variant="primary" icon={Send} loading={mutation.isPending}>
            Envoyer la demande
          </Button>
        </form>
      </Card>
    </div>
  );
}
