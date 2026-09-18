import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Receipt, Save, X } from "lucide-react";
import { useCreateDepenseMutation } from "./hooks.js";
import { FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { ApiError } from "../../lib/apiClient.js";
import { useTranslation } from "../../i18n/index.js";

// Aucune édition/suppression : le backend n'expose ni PATCH ni DELETE pour
// les dépenses (événement financier historique — seule une annulation
// logique est possible depuis la fiche, voir DepenseDetailPage.jsx) — ce
// formulaire est donc le seul point d'entrée, création uniquement.
export default function DepenseFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mutation = useCreateDepenseMutation();
  const [categorie, setCategorie] = useState("");
  const [montant, setMontant] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [justificatifUrl, setJustificatifUrl] = useState("");

  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate(
      {
        categorie,
        montant,
        date: date || undefined,
        description: description || undefined,
        justificatifUrl: justificatifUrl || undefined,
      },
      { onSuccess: (depense) => navigate(`/depenses/${depense.id}`) },
    );
  }

  return (
    <div className="max-w-xl space-y-5">
      <PageHeader icon={Receipt} title={t("dep.formTitle")} />

      <Card as="form" onSubmit={handleSubmit} className="space-y-4">
        <GlobalFormError error={mutation.error} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("dep.formCategorie")} required>
            <input required value={categorie} onChange={(e) => setCategorie(e.target.value)} className={inputClass} />
            <FieldError messages={details?.categorie} />
          </Field>
          <Field label={t("dep.formMontant")} required>
            <input
              type="text"
              inputMode="decimal"
              required
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.montant} />
          </Field>
          <Field label={t("dep.formDate")} hint={t("dep.formDateHint")}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            <FieldError messages={details?.date} />
          </Field>
          <Field label={t("dep.formJustificatif")}>
            <input
              type="text"
              placeholder="https://…"
              value={justificatifUrl}
              onChange={(e) => setJustificatifUrl(e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.justificatifUrl} />
          </Field>
        </div>

        <Field label={t("dep.formDescription")}>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
          <FieldError messages={details?.description} />
        </Field>

        <div className="flex gap-2 pt-1">
          <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending}>
            {t("common.save")}
          </Button>
          <Button type="button" variant="secondary" icon={X} onClick={() => navigate(-1)}>
            {t("common.cancel")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
