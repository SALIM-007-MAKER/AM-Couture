import { useState } from "react";
import { CreditCard, Plus, X, Save, ShieldCheck, ShieldOff, Pencil } from "lucide-react";
import { usePlansTousQuery, useCreerPlanMutation, useModifierPlanMutation } from "../../features/plansAdmin/hooks.js";
import { LoadingState, ErrorState, EmptyState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { ApiError } from "../../lib/apiClient.js";
import { useTranslation } from "../../i18n/index.js";

const lignes = (texte) =>
  texte
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

// Création (plan = undefined) ou édition d'un plan existant. Le prix est
// MENSUEL ; un changement ne s'applique qu'aux FUTURES activations — chaque
// abonnement déjà activé garde son nom et son prix figés (voir
// backend/src/routes/plans.routes.js).
function PlanForm({ plan, onCancel, onDone }) {
  const { t } = useTranslation();
  const creer = useCreerPlanMutation();
  const modifier = useModifierPlanMutation();
  const mutation = plan ? modifier : creer;
  const [form, setForm] = useState({
    nom: plan?.nom ?? "",
    description: plan?.description ?? "",
    prixMensuel: plan?.prixMensuel ?? "",
    fonctionnalites: (plan?.fonctionnalites ?? []).join("\n"),
    ordre: String(plan?.ordre ?? 0),
  });
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const data = {
      nom: form.nom,
      prixMensuel: form.prixMensuel,
      fonctionnalites: lignes(form.fonctionnalites),
      ordre: Number(form.ordre) || 0,
    };
    if (plan) modifier.mutate({ id: plan.id, data: { ...data, description: form.description || null } }, { onSuccess: onDone });
    else creer.mutate({ ...data, ...(form.description ? { description: form.description } : {}) }, { onSuccess: onDone });
  }

  return (
    <Card as="form" variant="outlined" onSubmit={handleSubmit} className="space-y-4">
      <GlobalFormError error={mutation.error} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label={t("saSub.plans.fieldName")} required>
          <input required value={form.nom} maxLength={50} onChange={(e) => update("nom", e.target.value)} className={inputClass} />
          <FieldError messages={details?.nom} />
        </Field>
        <Field label={t("saSub.plans.fieldPrice")} required>
          <input type="text" inputMode="decimal" required value={form.prixMensuel} onChange={(e) => update("prixMensuel", e.target.value)} className={inputClass} />
          <FieldError messages={details?.prixMensuel} />
        </Field>
        <Field label={t("saSub.plans.fieldOrder")} hint={t("saSub.plans.fieldOrderHint")}>
          <input type="number" min="0" max="999" value={form.ordre} onChange={(e) => update("ordre", e.target.value)} className={inputClass} />
          <FieldError messages={details?.ordre} />
        </Field>
      </div>
      <Field label={t("saSub.plans.fieldDescription")}>
        <input value={form.description} maxLength={300} onChange={(e) => update("description", e.target.value)} className={inputClass} />
        <FieldError messages={details?.description} />
      </Field>
      <Field label={t("saSub.plans.fieldFeatures")} hint={t("saSub.plans.fieldFeaturesHint")}>
        <textarea rows={5} value={form.fonctionnalites} onChange={(e) => update("fonctionnalites", e.target.value)} className={inputClass} />
        <FieldError messages={details?.fonctionnalites} />
      </Field>
      <div className="flex gap-2 flex-wrap">
        <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending}>
          {plan ? t("common.save") : t("saSub.plans.create")}
        </Button>
        <Button type="button" variant="secondary" icon={X} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </Card>
  );
}

function PlanCard({ plan }) {
  const { t } = useTranslation();
  const mutation = useModifierPlanMutation();
  const [editing, setEditing] = useState(false);

  if (editing) return <PlanForm plan={plan} onCancel={() => setEditing(false)} onDone={() => setEditing(false)} />;

  return (
    <Card variant="outlined" className={`space-y-3 ${!plan.actif ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-semibold text-neutral-900 dark:text-neutral-100">{plan.nom}</p>
          {plan.description && <p className="text-sm text-neutral-500">{plan.description}</p>}
        </div>
        <p className="text-right">
          <span className="text-lg font-bold tabular-nums text-neutral-900 dark:text-neutral-100">{plan.prixMensuel}</span>
          <span className="text-xs text-neutral-500"> {t("saSub.plans.perMonth")}</span>
        </p>
      </div>
      {plan.fonctionnalites.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-neutral-600 dark:text-neutral-400 space-y-0.5">
          {plan.fonctionnalites.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      <GlobalFormError error={mutation.error} />
      <div className="flex gap-2 flex-wrap">
        <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(true)}>
          {t("common.edit")}
        </Button>
        <Button
          variant={plan.actif ? "danger-ghost" : "ghost"}
          size="sm"
          icon={plan.actif ? ShieldOff : ShieldCheck}
          loading={mutation.isPending}
          onClick={() => mutation.mutate({ id: plan.id, data: { actif: !plan.actif } })}
        >
          {plan.actif ? t("saSub.plans.deactivate") : t("saSub.plans.activate")}
        </Button>
      </div>
    </Card>
  );
}

export default function GestionPlansPage() {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = usePlansTousQuery();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        icon={CreditCard}
        title={t("saSub.plans.title")}
        subtitle={t("saSub.plans.subtitle")}
        actions={
          !showForm && (
            <Button variant="primary" icon={Plus} onClick={() => setShowForm(true)}>
              {t("saSub.plans.newPlan")}
            </Button>
          )
        }
      />

      {showForm && <PlanForm onCancel={() => setShowForm(false)} onDone={() => setShowForm(false)} />}

      {isPending && <LoadingState label={t("saSub.plans.loading")} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && data.length === 0 && <EmptyState icon={CreditCard}>{t("saSub.plans.empty")}</EmptyState>}

      {data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}
