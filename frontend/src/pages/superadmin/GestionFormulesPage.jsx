import { useState } from "react";
import { CreditCard, Plus, X, Save, CheckCircle2, ShieldCheck, ShieldOff } from "lucide-react";
import {
  useFormulesToutesQuery,
  useCreerFormuleMutation,
  useModifierFormuleMutation,
} from "../../features/formulesAbonnementAdmin/hooks.js";
import { LoadingState, ErrorState, EmptyState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { ApiError } from "../../lib/apiClient.js";
import { useTranslation } from "../../i18n/index.js";

// Formulaire de création — dureeMois n'est PAS modifiable après coup (voir
// patchFormuleSchema, backend) : une durée différente est une NOUVELLE
// formule, pas une édition de l'existante.
function CreerFormuleForm({ onCancel, onCreated }) {
  const { t } = useTranslation();
  const mutation = useCreerFormuleMutation();
  const [form, setForm] = useState({ dureeMois: "", nom: "", prix: "" });
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate(
      { dureeMois: Number(form.dureeMois), nom: form.nom, prix: form.prix },
      { onSuccess: () => onCreated() },
    );
  }

  return (
    <Card as="form" variant="outlined" onSubmit={handleSubmit} className="space-y-4">
      <GlobalFormError error={mutation.error} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label={t("sa.formules.fieldDuration")} required>
          <input type="number" min="1" required value={form.dureeMois} onChange={(e) => update("dureeMois", e.target.value)} className={inputClass} />
          <FieldError messages={details?.dureeMois} />
        </Field>
        <Field label={t("sa.formules.fieldName")} required hint={t("sa.formules.fieldNameHint")}>
          <input required value={form.nom} onChange={(e) => update("nom", e.target.value)} className={inputClass} />
          <FieldError messages={details?.nom} />
        </Field>
        <Field label={t("sa.formules.fieldPrice")} required>
          <input type="text" inputMode="decimal" required value={form.prix} onChange={(e) => update("prix", e.target.value)} className={inputClass} />
          <FieldError messages={details?.prix} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending}>
          {t("sa.formules.createPlan")}
        </Button>
        <Button type="button" variant="secondary" icon={X} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </Card>
  );
}

function FormuleRow({ formule }) {
  const { t } = useTranslation();
  const mutation = useModifierFormuleMutation();
  const [prix, setPrix] = useState(formule.prix);
  const [saved, setSaved] = useState(false);
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;
  const dirty = prix !== formule.prix;

  function handleSavePrix() {
    setSaved(false);
    mutation.mutate({ id: formule.id, data: { prix } }, { onSuccess: () => setSaved(true) });
  }

  function toggleActif() {
    mutation.mutate({ id: formule.id, data: { actif: !formule.actif } });
  }

  return (
    <tr className={`border-t border-neutral-100 dark:border-neutral-800 ${!formule.actif ? "opacity-60" : ""}`}>
      <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{formule.nom}</td>
      <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{t("sa.formules.months", { nombre: formule.dureeMois })}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={prix}
            onChange={(e) => {
              setPrix(e.target.value);
              setSaved(false);
            }}
            className={`${inputClass} w-28`}
          />
          {dirty && (
            <Button variant="ghost" size="sm" icon={Save} loading={mutation.isPending} onClick={handleSavePrix}>
              {t("common.save")}
            </Button>
          )}
          {saved && !dirty && <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" aria-hidden="true" />}
        </div>
        <FieldError messages={details?.prix} />
      </td>
      <td className="px-4 py-3">
        <Button
          variant={formule.actif ? "danger-ghost" : "ghost"}
          size="sm"
          icon={formule.actif ? ShieldOff : ShieldCheck}
          loading={mutation.isPending}
          onClick={toggleActif}
        >
          {formule.actif ? t("sa.formules.deactivate") : t("sa.formules.activate")}
        </Button>
      </td>
    </tr>
  );
}

// Le prix modifié ici ne s'applique qu'aux FUTURS abonnements — chaque
// abonnement déjà souscrit garde son propre prix figé (voir commentaire
// backend, formulesAbonnement.routes.js) : aucune mise à jour rétroactive.
export default function GestionFormulesPage() {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useFormulesToutesQuery();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={CreditCard}
        title={t("sa.formules.title")}
        subtitle={t("sa.formules.subtitle")}
        actions={
          !showForm && (
            <Button variant="primary" icon={Plus} onClick={() => setShowForm(true)}>
              {t("sa.formules.newPlan")}
            </Button>
          )
        }
      />

      {showForm && <CreerFormuleForm onCancel={() => setShowForm(false)} onCreated={() => setShowForm(false)} />}

      {isPending && <LoadingState label={t("sa.formules.loading")} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}

      {data && data.length === 0 && <EmptyState icon={CreditCard}>{t("sa.formules.empty")}</EmptyState>}

      {data && data.length > 0 && (
        <Card variant="outlined" padded={false} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t("sa.formules.colPlan")}</th>
                <th className="px-4 py-3 font-medium">{t("sa.formules.colDuration")}</th>
                <th className="px-4 py-3 font-medium">{t("sa.formules.colPrice")}</th>
                <th className="px-4 py-3 font-medium">{t("sa.formules.colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((formule) => (
                <FormuleRow key={formule.id} formule={formule} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
