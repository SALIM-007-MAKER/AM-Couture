import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Store, Save, X } from "lucide-react";
import { useFournisseurQuery, useCreateFournisseurMutation, useUpdateFournisseurMutation } from "./hooks.js";
import { LoadingState, ErrorState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { ApiError } from "../../lib/apiClient.js";
import { useTranslation } from "../../i18n/index.js";

const formStateFrom = (f) => ({
  nom: f?.nom ?? "",
  contact: f?.contact ?? "",
  telephone: f?.telephone ?? "",
  email: f?.email ?? "",
  adresse: f?.adresse ?? "",
  notes: f?.notes ?? "",
});

export default function FournisseurFormPage({ mode }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const isEdit = mode === "edit";
  const query = useFournisseurQuery(isEdit ? id : undefined);

  if (isEdit && query.isPending) return <LoadingState label={t("fou.loadingOne")} />;
  if (isEdit && query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (isEdit && query.data?.archivedAt) return <ErrorState error={new ApiError(409, t("fou.archivedError"))} />;
  // `key` : état initial dérivé des données une fois chargées (pas de useEffect + setState).
  return <FournisseurForm key={isEdit ? id : "create"} mode={mode} initial={isEdit ? query.data : undefined} />;
}

function FournisseurForm({ mode, initial }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === "edit";
  const createMutation = useCreateFournisseurMutation();
  const updateMutation = useUpdateFournisseurMutation(id);
  const mutation = isEdit ? updateMutation : createMutation;
  const [form, setForm] = useState(() => formStateFrom(initial));
  const update = (champ, valeur) => setForm((f) => ({ ...f, [champ]: valeur }));
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  function handleSubmit(e) {
    e.preventDefault();
    const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === "" ? undefined : v]));
    mutation.mutate(payload, { onSuccess: (f) => navigate(`/fournisseurs/${f.id}`) });
  }

  return (
    <div className="max-w-xl space-y-5">
      <PageHeader icon={Store} title={isEdit ? t("fou.editTitle") : t("fou.new")} />
      <Card as="form" onSubmit={handleSubmit} className="space-y-4">
        <GlobalFormError error={mutation.error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("fou.colName")} required>
            <input required maxLength={150} value={form.nom} onChange={(e) => update("nom", e.target.value)} className={inputClass} />
            <FieldError messages={details?.nom} />
          </Field>
          <Field label={t("fou.contact")}>
            <input maxLength={150} value={form.contact} onChange={(e) => update("contact", e.target.value)} className={inputClass} />
            <FieldError messages={details?.contact} />
          </Field>
          <Field label={t("fou.phone")}>
            <input type="tel" maxLength={30} value={form.telephone} onChange={(e) => update("telephone", e.target.value)} className={inputClass} />
            <FieldError messages={details?.telephone} />
          </Field>
          <Field label={t("fou.email")}>
            <input type="email" maxLength={190} value={form.email} onChange={(e) => update("email", e.target.value)} className={inputClass} />
            <FieldError messages={details?.email} />
          </Field>
        </div>
        <Field label={t("fou.address")}>
          <input maxLength={300} value={form.adresse} onChange={(e) => update("adresse", e.target.value)} className={inputClass} />
          <FieldError messages={details?.adresse} />
        </Field>
        <Field label={t("fou.notes")}>
          <textarea rows={3} maxLength={2000} value={form.notes} onChange={(e) => update("notes", e.target.value)} className={inputClass} />
          <FieldError messages={details?.notes} />
        </Field>
        <div className="flex gap-2 pt-1">
          <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending} data-testid="enregistrer-fournisseur">
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
