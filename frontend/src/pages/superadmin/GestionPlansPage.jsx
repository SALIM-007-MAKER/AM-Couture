import { useState } from "react";
import { CreditCard, Plus, X, Save, ShieldCheck, ShieldOff, Pencil, Trash2, MessageCircle, CheckCircle2 } from "lucide-react";
import {
  usePlansTousQuery,
  useCreerPlanMutation,
  useModifierPlanMutation,
  useContactQuery,
  useEnregistrerContactMutation,
} from "../../features/plansAdmin/hooks.js";
import { LoadingState, ErrorState, EmptyState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { ApiError } from "../../lib/apiClient.js";
import { useTranslation } from "../../i18n/index.js";

const MAX_DUREES = 8;

// Contact WhatsApp affiché aux PDG (voir GET /api/abonnements/etat) : réglage
// global, modifiable uniquement ici. Vide = aucun bouton chez les PDG.
function ContactWhatsappCard() {
  const { t } = useTranslation();
  const query = useContactQuery();
  const mutation = useEnregistrerContactMutation();
  const [valeur, setValeur] = useState(null);
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  if (query.isPending) return <LoadingState label={t("saSub.contact.loading")} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const affiche = valeur ?? query.data.whatsapp ?? "";

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate(affiche.trim() || null, { onSuccess: () => setValeur(null) });
  }

  return (
    <Card as="form" variant="outlined" onSubmit={handleSubmit} className="space-y-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        <MessageCircle className="size-4" aria-hidden="true" />
        {t("saSub.contact.title")}
      </p>
      <p className="text-xs text-neutral-500">{t("saSub.contact.hint")}</p>
      <GlobalFormError error={mutation.error && !details?.whatsapp ? mutation.error : null} />
      <Field label={t("saSub.contact.field")}>
        <input
          type="tel"
          inputMode="tel"
          value={affiche}
          maxLength={30}
          placeholder={t("saSub.contact.placeholder")}
          onChange={(e) => {
            mutation.reset();
            setValeur(e.target.value);
          }}
          className={inputClass}
        />
        <FieldError messages={details?.whatsapp} />
      </Field>
      <div className="flex items-center gap-3 flex-wrap">
        <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending}>
          {t("saSub.contact.save")}
        </Button>
        {mutation.isSuccess && valeur === null && (
          <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {t("saSub.contact.saved")}
          </span>
        )}
      </div>
    </Card>
  );
}

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
  // Durées proposées : lignes { dureeMois, remisePourcent } saisies en texte.
  const [durees, setDurees] = useState(
    (plan?.tarifsDuree ?? []).map((d) => ({ dureeMois: String(d.dureeMois), remisePourcent: String(d.remisePourcent) })),
  );
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function updateDuree(index, field, value) {
    setDurees((l) => l.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const data = {
      nom: form.nom,
      prixMensuel: form.prixMensuel,
      fonctionnalites: lignes(form.fonctionnalites),
      ordre: Number(form.ordre) || 0,
      tarifsDuree: durees.map((d) => ({ dureeMois: Number(d.dureeMois), remisePourcent: Number(d.remisePourcent) || 0 })),
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
      <div className="space-y-2">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t("saSub.plans.durationsTitle")}</p>
        <p className="text-xs text-neutral-500">{t("saSub.plans.durationsHint")}</p>
        {durees.map((d, i) => (
          <div key={i} className="flex items-end gap-2">
            <Field label={t("saSub.plans.durationMonths")}>
              <input type="number" min="1" max="60" required value={d.dureeMois} onChange={(e) => updateDuree(i, "dureeMois", e.target.value)} className={inputClass} />
            </Field>
            <Field label={t("saSub.plans.durationDiscount")}>
              <input type="number" min="0" max="90" step="0.01" required value={d.remisePourcent} onChange={(e) => updateDuree(i, "remisePourcent", e.target.value)} className={inputClass} />
            </Field>
            <Button
              type="button"
              variant="danger-ghost"
              size="sm"
              icon={Trash2}
              aria-label={t("saSub.plans.removeDuration")}
              title={t("saSub.plans.removeDuration")}
              onClick={() => setDurees((l) => l.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        <FieldError messages={details?.tarifsDuree} />
        {durees.length < MAX_DUREES && (
          <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={() => setDurees((l) => [...l, { dureeMois: "", remisePourcent: "0" }])}>
            {t("saSub.plans.addDuration")}
          </Button>
        )}
      </div>
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
      <div className="flex flex-wrap gap-1.5 text-xs">
        {plan.tarifs.map((tarif) => (
          <span key={tarif.dureeMois} className="rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 px-2 py-0.5">
            {t("sub.months", { mois: tarif.dureeMois })}
            {tarif.remisePourcent > 0 && (
              <span className="ml-1 text-green-700 dark:text-green-400">
                {t("saSub.plans.discountShort", { pourcent: tarif.remisePourcent })}
              </span>
            )}
          </span>
        ))}
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

      <ContactWhatsappCard />

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
