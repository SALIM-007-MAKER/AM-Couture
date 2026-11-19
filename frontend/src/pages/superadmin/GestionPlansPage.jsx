import { useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Plus, X, Save, ShieldCheck, ShieldOff, Pencil, MessageCircle, CheckCircle2, Users } from "lucide-react";
import {
  useAbonnesPlanQuery,
  useDepassementsPlanQuery,
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
import { RESSOURCES, formaterLimite } from "../../features/abonnement/quotas.js";
import { economieAnnuelle, moisOfferts, prixEntier, raisonsNonProposee } from "../../features/abonnement/tarifs.js";
import { formatPrix } from "../../features/abonnement/constants.js";

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

// Création (plan = undefined) ou édition d'un plan existant. Les prix sont en FRANC CFA (XOF), ENTIERS, administrés ici (aucun prix
// n'est écrit dans le code) : un champ vide = période non proposée. Un changement de prix ou de quotas ne s'applique qu'aux FUTURES
// souscriptions — chaque abonnement déjà activé garde son prix, sa durée, sa formule et ses limites figés (voir
// backend/src/routes/plans.routes.js). L'économie annuelle affichée est INFORMATIVE : elle n'est jamais enregistrée.
function PlanForm({ plan, onCancel, onDone }) {
  const { t } = useTranslation();
  const creer = useCreerPlanMutation();
  const modifier = useModifierPlanMutation();
  const mutation = plan ? modifier : creer;
  const [form, setForm] = useState({
    nom: plan?.nom ?? "",
    description: plan?.description ?? "",
    prixMensuel: plan?.prixMensuel != null ? String(Number(plan.prixMensuel)) : "",
    prixAnnuel: plan?.prixAnnuel != null ? String(Number(plan.prixAnnuel)) : "",
    fonctionnalites: (plan?.fonctionnalites ?? []).join("\n"),
    ordre: String(plan?.ordre ?? 0),
  });
  // Quotas : par ressource, un nombre OU « Illimité » (décision explicite). Un champ vide = NON DÉFINI : la formule ne peut pas
  // être activée tant que les quatre ressources ne sont pas décidées (jamais d'illimité par défaut).
  const [limites, setLimites] = useState(
    Object.fromEntries(RESSOURCES.map((cle) => [cle, plan?.limites && cle in plan.limites && plan.limites[cle] != null ? String(plan.limites[cle]) : ""])),
  );
  const [illimites, setIllimites] = useState(
    Object.fromEntries(RESSOURCES.map((cle) => [cle, Boolean(plan?.limites && cle in plan.limites && plan.limites[cle] === null)])),
  );
  const [erreurLocale, setErreurLocale] = useState(null);
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const economie = economieAnnuelle(form.prixMensuel, form.prixAnnuel);
  const mois = moisOfferts(form.prixMensuel, form.prixAnnuel);

  // Un prix saisi doit être un entier valide ; vide = pas de prix pour cette période (null au PATCH, absent à la création).
  function lirePrix(texte) {
    if (texte.trim() === "") return { ok: true, valeur: null };
    const n = prixEntier(texte);
    return n == null ? { ok: false } : { ok: true, valeur: n };
  }

  function handleSubmit(e) {
    e.preventDefault();
    const mensuel = lirePrix(form.prixMensuel);
    const annuel = lirePrix(form.prixAnnuel);
    if (!mensuel.ok || !annuel.ok) {
      setErreurLocale(t("saSub.plans.priceInvalid"));
      return;
    }
    setErreurLocale(null);
    const limitesEnvoyees = {};
    for (const cle of RESSOURCES) {
      if (illimites[cle]) limitesEnvoyees[cle] = null;
      else if (limites[cle].trim() !== "") limitesEnvoyees[cle] = Number(limites[cle]);
    }
    const data = {
      nom: form.nom,
      fonctionnalites: lignes(form.fonctionnalites),
      ordre: Number(form.ordre) || 0,
      limites: limitesEnvoyees,
    };
    if (plan) {
      modifier.mutate(
        { id: plan.id, data: { ...data, description: form.description || null, prixMensuel: mensuel.valeur, prixAnnuel: annuel.valeur } },
        { onSuccess: onDone },
      );
    } else {
      creer.mutate(
        {
          ...data,
          ...(form.description ? { description: form.description } : {}),
          ...(mensuel.valeur != null ? { prixMensuel: mensuel.valeur } : {}),
          ...(annuel.valeur != null ? { prixAnnuel: annuel.valeur } : {}),
        },
        { onSuccess: onDone },
      );
    }
  }

  return (
    <Card as="form" variant="outlined" onSubmit={handleSubmit} className="space-y-4" data-testid="formulaire-formule">
      <GlobalFormError error={mutation.error} />
      {erreurLocale && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{erreurLocale}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t("saSub.plans.fieldName")} required>
          <input required value={form.nom} maxLength={50} onChange={(e) => update("nom", e.target.value)} className={inputClass} data-testid="champ-nom" />
          <FieldError messages={details?.nom} />
        </Field>
        <Field label={t("saSub.plans.fieldOrder")} hint={t("saSub.plans.fieldOrderHint")}>
          <input type="number" min="0" max="999" value={form.ordre} onChange={(e) => update("ordre", e.target.value)} className={inputClass} />
          <FieldError messages={details?.ordre} />
        </Field>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t("saSub.plans.pricesTitle")}</p>
        <p className="text-xs text-neutral-500">{t("saSub.plans.pricesHint")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("saSub.plans.fieldPriceMonthly")}>
            <input type="text" inputMode="numeric" value={form.prixMensuel} onChange={(e) => update("prixMensuel", e.target.value)} className={inputClass} data-testid="champ-prix-mensuel" />
            <FieldError messages={details?.prixMensuel} />
          </Field>
          <Field label={t("saSub.plans.fieldPriceYearly")}>
            <input type="text" inputMode="numeric" value={form.prixAnnuel} onChange={(e) => update("prixAnnuel", e.target.value)} className={inputClass} data-testid="champ-prix-annuel" />
            <FieldError messages={details?.prixAnnuel} />
          </Field>
        </div>
        {economie != null && (
          <p className="text-sm text-green-700 dark:text-green-400" data-testid="economie-formulaire">
            {t("saSub.plans.savingInfo", { montant: formatPrix(economie), mois: formatPrix(mois) })}
          </p>
        )}
      </div>
      <Field label={t("saSub.plans.fieldDescription")}>
        <input value={form.description} maxLength={300} onChange={(e) => update("description", e.target.value)} className={inputClass} data-testid="champ-description" />
        <FieldError messages={details?.description} />
      </Field>
      <Field label={t("saSub.plans.fieldFeatures")} hint={t("saSub.plans.fieldFeaturesHint")}>
        <textarea rows={5} value={form.fonctionnalites} onChange={(e) => update("fonctionnalites", e.target.value)} className={inputClass} />
        <FieldError messages={details?.fonctionnalites} />
      </Field>
      <div className="space-y-2" data-testid="champs-quotas">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t("quotas.admin.limitsTitle")}</p>
        <p className="text-xs text-neutral-500">{t("quotas.admin.limitsHint")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {RESSOURCES.map((cle) => (
            <Field key={cle} label={t(`quotas.ressources.${cle}`)}>
              <input
                type="number"
                min="1"
                max="1000000"
                step="1"
                inputMode="numeric"
                placeholder={t("quotas.admin.limitsPlaceholder")}
                value={illimites[cle] ? "" : limites[cle]}
                disabled={illimites[cle]}
                onChange={(e) => setLimites((l) => ({ ...l, [cle]: e.target.value }))}
                className={inputClass}
                data-testid={`quota-${cle}`}
              />
              <label className="mt-1 flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={illimites[cle]}
                  onChange={(e) => setIllimites((l) => ({ ...l, [cle]: e.target.checked }))}
                  data-testid={`illimite-${cle}`}
                />
                {t("quotas.illimite")}
              </label>
            </Field>
          ))}
        </div>
        <FieldError messages={details?.limites} />
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending} data-testid="enregistrer-formule">
          {plan ? t("common.save") : t("saSub.plans.create")}
        </Button>
        <Button type="button" variant="secondary" icon={X} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </Card>
  );
}

/** Aide à la décision : ateliers dont l'usage actuel dépasse déjà les limites de cette formule. Lecture seule. */
function DepassementsFormule({ plan }) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = useState(false);
  const { data, isPending, isError, error, refetch } = useDepassementsPlanQuery(plan.id, ouvert);
  if (RESSOURCES.every((cle) => plan.limites?.[cle] == null)) return null;
  return (
    <div className="space-y-2" data-testid={`depassements-${plan.id}`}>
      <Button variant="ghost" size="sm" onClick={() => setOuvert((o) => !o)} data-testid="voir-depassements">
        {ouvert ? t("quotas.admin.masquerDepassements") : t("quotas.admin.voirDepassements")}
      </Button>
      {ouvert && isPending && <LoadingState label={t("common.loading")} />}
      {ouvert && isError && <ErrorState error={error} onRetry={refetch} />}
      {ouvert && data && (
        data.ateliers.length === 0 ? (
          <p className="text-sm text-neutral-500" data-testid="aucun-depassement">{t("quotas.admin.aucunDepassement")}</p>
        ) : (
          <div className="space-y-1">
            <p className="text-xs text-neutral-500">{t("quotas.admin.depassementsNote")}</p>
            <ul className="text-sm space-y-1">
              {data.ateliers.map((a) => (
                <li key={a.atelierId} className="flex flex-wrap gap-x-2">
                  <Link to={`/ateliers/${a.atelierId}`} className="underline font-medium">{a.nom}</Link>
                  <span className="text-neutral-600 dark:text-neutral-400">
                    {a.depassements.map((d) => `${t(`quotas.ressources.${d.ressource}`)} ${d.usage}/${d.limite}`).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}

/** Abonnés de la formule : ateliers actuellement abonnés (abonnement en cours), prix figé et revenu mensuel récurrent. Lecture seule. */
function AbonnesFormule({ plan }) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = useState(false);
  const { data, isPending, isError, error, refetch } = useAbonnesPlanQuery(plan.id, ouvert);
  return (
    <div className="space-y-2" data-testid={`abonnes-${plan.id}`}>
      <Button variant="ghost" size="sm" icon={Users} onClick={() => setOuvert((o) => !o)} data-testid="voir-abonnes">
        {ouvert ? t("saSub.plans.hideSubscribers") : t("saSub.plans.showSubscribers")}
      </Button>
      {ouvert && isPending && <LoadingState label={t("common.loading")} />}
      {ouvert && isError && <ErrorState error={error} onRetry={refetch} />}
      {ouvert &&
        data &&
        (data.nombre === 0 ? (
          <p className="text-sm text-neutral-500" data-testid="aucun-abonne">{t("saSub.plans.noSubscribers")}</p>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-neutral-700 dark:text-neutral-300" data-testid="resume-abonnes">
              {t("saSub.plans.subscribersSummary", { nombre: data.nombre, revenu: formatPrix(data.revenuMensuel) })}
            </p>
            <ul className="text-sm space-y-1">
              {data.ateliers.map((l) => (
                <li key={l.abonnement.id} className="flex flex-wrap gap-x-2">
                  <Link to={`/ateliers/${l.atelier.id}`} className="underline font-medium">{l.atelier.nom}</Link>
                  <span className="text-neutral-600 dark:text-neutral-400">
                    {formatPrix(l.abonnement.prix)} FCFA · {t("sub.months", { mois: l.abonnement.dureeMois })}
                    {l.abonnement.tarifExceptionnel ? ` · ${t("saSub.plans.exceptional")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}

function PlanCard({ plan }) {
  const { t } = useTranslation();
  const mutation = useModifierPlanMutation();
  const [editing, setEditing] = useState(false);

  if (editing) return <PlanForm plan={plan} onCancel={() => setEditing(false)} onDone={() => setEditing(false)} />;

  const raisons = raisonsNonProposee(plan);
  const raisonsActivation = plan.activationPossible?.raisons ?? [];
  const offreMensuelle = plan.offres.find((o) => o.periodicite === "MENSUEL");
  const offreAnnuelle = plan.offres.find((o) => o.periodicite === "ANNUEL");

  return (
    <Card variant="outlined" className={`space-y-3 ${!plan.actif ? "opacity-80" : ""}`} data-testid={`formule-admin-${plan.nom}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-semibold text-neutral-900 dark:text-neutral-100">{plan.nom}</p>
          {plan.description && <p className="text-sm text-neutral-500">{plan.description}</p>}
        </div>
        <div className="text-right space-y-0.5" data-testid="prix-formule">
          {plan.offres.length === 0 ? (
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{t("saSub.plans.noTariff")}</p>
          ) : (
            <>
              {offreMensuelle && (
                <p>
                  <span className="text-lg font-bold tabular-nums text-neutral-900 dark:text-neutral-100">{formatPrix(offreMensuelle.prix)}</span>
                  <span className="text-xs text-neutral-500"> {t("saSub.plans.perMonth")}</span>
                </p>
              )}
              {offreAnnuelle && (
                <p>
                  <span className="text-lg font-bold tabular-nums text-neutral-900 dark:text-neutral-100">{formatPrix(offreAnnuelle.prix)}</span>
                  <span className="text-xs text-neutral-500"> {t("saSub.plans.perYear")}</span>
                </p>
              )}
              {plan.economieAnnuelle != null && (
                <p className="text-xs text-green-700 dark:text-green-400">
                  {t("saSub.plans.savingInfo", { montant: formatPrix(plan.economieAnnuelle), mois: formatPrix(plan.moisOffertsAnnuel) })}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="etat-commercial">
        {plan.proposee ? (
          <span className="rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 px-2 py-0.5 font-medium">
            {t("saSub.plans.offered")}
          </span>
        ) : (
          <>
            <span className="rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-2 py-0.5 font-medium">
              {t("saSub.plans.notOffered")}
            </span>
            {raisons.map((r) => (
              <span key={r} className="rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 px-2 py-0.5">
                {t(`saSub.plans.reason.${r}`)}
              </span>
            ))}
          </>
        )}
      </div>

      {plan.tarifsDuree?.length > 0 && <p className="text-xs text-neutral-500">{t("saSub.plans.legacyDurations")}</p>}

      <ul className="flex flex-wrap gap-1.5 text-xs" data-testid="quotas-formule">
        {RESSOURCES.map((cle) => {
          const definie = plan.limites && cle in plan.limites;
          return (
            <li key={cle} className="rounded-full bg-brand-50 dark:bg-brand-950 text-brand-800 dark:text-brand-300 px-2 py-0.5">
              {t(`quotas.ressources.${cle}`)} : {definie ? formaterLimite(plan.limites[cle]) ?? t("quotas.illimite") : t("quotas.nonDefini")}
            </li>
          );
        })}
      </ul>
      {plan.fonctionnalites.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-neutral-600 dark:text-neutral-400 space-y-0.5">
          {plan.fonctionnalites.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      <AbonnesFormule plan={plan} />
      <DepassementsFormule plan={plan} />
      <GlobalFormError error={mutation.error} />
      {!plan.actif && raisonsActivation.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="activation-bloquee">
          {t("saSub.plans.activationBlocked", { raisons: raisonsActivation.map((r) => t(`saSub.plans.reason.${r}`)).join(", ") })}
        </p>
      )}
      <div className="flex gap-2 flex-wrap">
        <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(true)} data-testid="modifier-formule">
          {t("common.edit")}
        </Button>
        <Button
          variant={plan.actif ? "danger-ghost" : "ghost"}
          size="sm"
          icon={plan.actif ? ShieldOff : ShieldCheck}
          loading={mutation.isPending}
          disabled={!plan.actif && raisonsActivation.length > 0}
          onClick={() => mutation.mutate({ id: plan.id, data: { actif: !plan.actif } })}
          data-testid="basculer-activation"
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
