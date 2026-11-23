import { useState } from "react";
import { CreditCard, CheckCircle2, CalendarClock, Hourglass, Ban, Pencil, History, Save, X, PauseCircle, PlayCircle } from "lucide-react";
import {
  useAtelierAbonnementQuery,
  useActiverAbonnementMutation,
  useModifierAbonnementMutation,
  useExpirerAbonnementMutation,
  useDesactiverAbonnementMutation,
  useSuspendreAbonnementMutation,
  useReactiverAbonnementMutation,
} from "../hooks.js";
import { usePlansTousQuery } from "../../plansAdmin/hooks.js";
import EtatAbonnementBadge from "./EtatAbonnementBadge.jsx";
import { formatDateAbonnement } from "../dates.js";
import { LoadingState, ErrorState, EmptyState, FieldError, GlobalFormError } from "../../../components/QueryState.jsx";
import { Field, inputClass } from "../../../components/FormField.jsx";
import Card from "../../../components/Card.jsx";
import Button from "../../../components/Button.jsx";
import { ApiError } from "../../../lib/apiClient.js";
import { useTranslation } from "../../../i18n/index.js";
import { PERIODICITES, offreDe, prixEntier } from "../../abonnement/tarifs.js";
import { useLocaleStore } from "../../../stores/localeStore.js";

const DUREES_RAPIDES = [1, 3, 6, 12];

function formatDateHeure(iso) {
  return new Date(iso).toLocaleString(useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const jour = (iso) => (iso ? String(iso).slice(0, 10) : "");

function InfoLigne({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium text-neutral-900 dark:text-neutral-100 text-right">{children}</span>
    </div>
  );
}

function EtatCourant({ data }) {
  const { t } = useTranslation();
  const courant = data.abonnementCourant;
  return (
    <Card className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <EtatAbonnementBadge statut={data.statut} />
        {courant && <span className="text-xs text-neutral-400">{courant.numero}</span>}
      </div>
      <InfoLigne label={t("saSub.section.plan")}>{courant?.planNom ?? t("saSub.section.noPlan")}</InfoLigne>
      {courant && (
        <>
          <InfoLigne label={t("saSub.section.duration")}>
            {courant.dureeMois ? t("saSub.section.months", { nombre: courant.dureeMois }) : "—"}
          </InfoLigne>
          <InfoLigne label={t("saSub.section.start")}>{formatDateAbonnement(courant.dateDebut)}</InfoLigne>
          <InfoLigne label={t("saSub.section.expiry")}>{formatDateAbonnement(courant.dateExpiration)}</InfoLigne>
        </>
      )}
      {data.essai && (
        <InfoLigne label={t("saSub.section.trial")}>
          {data.essai.actif
            ? t("saSub.section.trialDaysLeft", { nombre: data.essai.joursRestants, date: formatDateAbonnement(data.essai.trialEndsAt) })
            : t("saSub.section.trialEnded", { date: formatDateAbonnement(data.essai.trialEndsAt) })}
        </InfoLigne>
      )}
    </Card>
  );
}

// Actions sur l'abonnement courant — modifier les dates, faire expirer,
// désactiver. Expirer/désactiver demandent une confirmation en deux clics,
// comme les autres actions sensibles de la fiche atelier.
function ActionsCourant({ atelierId, abonnement }) {
  const { t } = useTranslation();
  const modifier = useModifierAbonnementMutation(atelierId);
  const expirer = useExpirerAbonnementMutation(atelierId);
  const desactiver = useDesactiverAbonnementMutation(atelierId);
  const suspendre = useSuspendreAbonnementMutation(atelierId);
  const reactiver = useReactiverAbonnementMutation(atelierId);
  const [mode, setMode] = useState(null); // "dates" | "expirer" | "desactiver" | "suspendre" | "reactiver"
  const [motif, setMotif] = useState("");
  const [form, setForm] = useState({ dateDebut: jour(abonnement.dateDebut), dateExpiration: jour(abonnement.dateExpiration), note: "" });
  const details = modifier.error instanceof ApiError ? modifier.error.details : undefined;
  const erreur = modifier.error || expirer.error || desactiver.error || suspendre.error || reactiver.error;
  const peutExpirer = abonnement.statut === "CONFIRME" && abonnement.statutEffectif !== "EXPIRE";

  function fermer() {
    setMode(null);
    modifier.reset();
    expirer.reset();
    desactiver.reset();
    suspendre.reset();
    reactiver.reset();
    setMotif("");
  }

  function handleModifier(e) {
    e.preventDefault();
    const data = {};
    if (form.dateDebut && form.dateDebut !== jour(abonnement.dateDebut)) data.dateDebut = form.dateDebut;
    if (form.dateExpiration && form.dateExpiration !== jour(abonnement.dateExpiration)) data.dateExpiration = form.dateExpiration;
    if (form.note) data.note = form.note;
    modifier.mutate({ abonnementId: abonnement.id, data }, { onSuccess: fermer });
  }

  if (mode === "dates") {
    return (
      <Card as="form" variant="outlined" onSubmit={handleModifier} className="space-y-3">
        <GlobalFormError error={modifier.error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t("saSub.section.start")}>
            <input type="date" value={form.dateDebut} onChange={(e) => setForm((f) => ({ ...f, dateDebut: e.target.value }))} className={inputClass} />
            <FieldError messages={details?.dateDebut} />
          </Field>
          <Field label={t("saSub.section.expiry")}>
            <input type="date" value={form.dateExpiration} onChange={(e) => setForm((f) => ({ ...f, dateExpiration: e.target.value }))} className={inputClass} />
            <FieldError messages={details?.dateExpiration} />
          </Field>
        </div>
        <Field label={t("saSub.form.note")}>
          <input value={form.note} maxLength={300} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className={inputClass} />
        </Field>
        <div className="flex gap-2 flex-wrap">
          <Button type="submit" variant="primary" size="sm" icon={Save} loading={modifier.isPending}>
            {t("common.save")}
          </Button>
          <Button type="button" variant="secondary" size="sm" icon={X} onClick={fermer}>
            {t("common.cancel")}
          </Button>
        </div>
      </Card>
    );
  }

  if (mode === "suspendre" || mode === "reactiver") {
    const mutation = mode === "suspendre" ? suspendre : reactiver;
    return (
      <Card variant="outlined" className="space-y-3" data-testid="formulaire-suspension">
        <GlobalFormError error={erreur} />
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {mode === "suspendre" ? t("saSub.actions.suspendHelp") : t("saSub.actions.reactivateHelp")}
        </p>
        <input value={motif} maxLength={300} onChange={(e) => setMotif(e.target.value)} className={inputClass} aria-label={t("saSub.form.note")} />
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={mode === "suspendre" ? "danger" : "primary"}
            size="sm"
            loading={mutation.isPending}
            disabled={motif.trim().length < 3}
            onClick={() => mutation.mutate({ abonnementId: abonnement.id, note: motif.trim() }, { onSuccess: fermer })}
          >
            {mode === "suspendre" ? t("saSub.actions.confirmSuspend") : t("saSub.actions.confirmReactivate")}
          </Button>
          <Button variant="secondary" size="sm" onClick={fermer}>
            {t("common.cancel")}
          </Button>
        </div>
      </Card>
    );
  }

  if (mode === "expirer" || mode === "desactiver") {
    const mutation = mode === "expirer" ? expirer : desactiver;
    return (
      <Card variant="outlined" className="space-y-3">
        <GlobalFormError error={erreur} />
        <p className="text-sm text-red-600 dark:text-red-400">
          {mode === "expirer" ? t("saSub.actions.expireConfirm") : t("saSub.actions.deactivateConfirm")}
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="danger"
            size="sm"
            loading={mutation.isPending}
            onClick={() => mutation.mutate({ abonnementId: abonnement.id }, { onSuccess: fermer })}
          >
            {t("saSub.actions.yes")}
          </Button>
          <Button variant="secondary" size="sm" onClick={fermer}>
            {t("common.cancel")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <GlobalFormError error={erreur} />
      <div className="flex gap-2 flex-wrap">
        {abonnement.statut === "CONFIRME" && (
          <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setMode("dates")}>
            {t("saSub.actions.editDates")}
          </Button>
        )}
        {peutExpirer && (
          <Button variant="danger-ghost" size="sm" icon={Hourglass} onClick={() => setMode("expirer")}>
            {t("saSub.actions.expire")}
          </Button>
        )}
        {abonnement.statut === "CONFIRME" && abonnement.statutEffectif === "ACTIF" && (
          <Button variant="danger-ghost" size="sm" icon={PauseCircle} onClick={() => setMode("suspendre")}>
            {t("saSub.actions.suspend")}
          </Button>
        )}
        {abonnement.statut === "SUSPENDU" && (
          <Button variant="secondary" size="sm" icon={PlayCircle} onClick={() => setMode("reactiver")}>
            {t("saSub.actions.reactivate")}
          </Button>
        )}
        {abonnement.statut !== "ANNULE" && (
          <Button variant="danger-ghost" size="sm" icon={Ban} onClick={() => setMode("desactiver")}>
            {t("saSub.actions.deactivate")}
          </Button>
        )}
      </div>
    </div>
  );
}

function ActiverForm({ atelierId }) {
  const { t } = useTranslation();
  const plansQuery = usePlansTousQuery();
  const mutation = useActiverAbonnementMutation(atelierId);
  // Deux modes : CATALOGUE (période mensuelle ou annuelle, prix du catalogue) ; EXCEPTIONNEL (durée et montant saisis, motif
  // obligatoire). Le serveur fige prix et durée dans le contrat ; ici rien n'est déduit ni calculé hors catalogue.
  const [mode, setMode] = useState("CATALOGUE");
  const [planId, setPlanId] = useState("");
  const [periodicite, setPeriodicite] = useState("MENSUEL");
  const [modeFin, setModeFin] = useState("duree"); // "duree" | "date" (mode exceptionnel)
  const [dureeMois, setDureeMois] = useState("1");
  const [dateExpiration, setDateExpiration] = useState("");
  const [prix, setPrix] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;
  const plans = (plansQuery.data ?? []).filter((p) => p.actif);
  const plansProposables = mode === "CATALOGUE" ? plans.filter((p) => p.offres.length > 0) : plans;

  const planChoisi = plansProposables.find((p) => p.id === planId);
  const offre = planChoisi ? offreDe(planChoisi, periodicite) : undefined;
  const prixSaisi = prixEntier(prix);
  const locale = useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR";
  const fcfa = (n) => `${Number(n).toLocaleString(locale)} FCFA`;

  function handleSubmit(e) {
    e.preventDefault();
    setDone(false);
    let data;
    if (mode === "CATALOGUE") {
      data = { mode, planId, periodicite };
    } else {
      data = { mode, planId, prix: prixSaisi, note };
      if (modeFin === "duree") data.dureeMois = Number(dureeMois);
      else data.dateExpiration = dateExpiration;
    }
    if (dateDebut) data.dateDebut = dateDebut;
    if (mode === "CATALOGUE" && note) data.note = note;
    mutation.mutate(data, {
      onSuccess: () => {
        setDone(true);
        setNote("");
        setPrix("");
        setDateDebut("");
        setDateExpiration("");
      },
    });
  }

  if (plansQuery.isPending) return <LoadingState label={t("saSub.plans.loading")} />;
  if (plansQuery.isError) return <ErrorState error={plansQuery.error} onRetry={plansQuery.refetch} />;
  if (plans.length === 0) return <EmptyState icon={CreditCard}>{t("saSub.form.noActivePlan")}</EmptyState>;

  return (
    <Card as="form" variant="outlined" onSubmit={handleSubmit} className="space-y-4">
      <GlobalFormError error={mutation.error} />
      <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label={t("saSub.form.modeAria")}>
        <Button type="button" size="sm" variant={mode === "CATALOGUE" ? "primary" : "secondary"} onClick={() => { setMode("CATALOGUE"); setPlanId(""); }} data-testid="mode-catalogue">
          {t("saSub.form.modeCatalogue")}
        </Button>
        <Button type="button" size="sm" variant={mode === "EXCEPTIONNEL" ? "primary" : "secondary"} onClick={() => { setMode("EXCEPTIONNEL"); setPlanId(""); }} data-testid="mode-exceptionnel">
          {t("saSub.form.modeExceptional")}
        </Button>
      </div>
      <p className="text-xs text-neutral-500">{t(mode === "CATALOGUE" ? "saSub.form.modeCatalogueHint" : "saSub.form.modeExceptionalHint")}</p>

      <Field label={t("saSub.form.plan")} required>
        <select required value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputClass} data-testid="activation-formule">
          <option value="">{t("saSub.form.choosePlan")}</option>
          {plansProposables.map((p) => (
            <option key={p.id} value={p.id}>
              {p.offres.length > 0
                ? `${p.nom} — ${p.offres.map((o) => `${fcfa(o.prix)} / ${t(o.periodicite === "ANNUEL" ? "saSub.form.perYear" : "saSub.form.perMonth")}`).join(" · ")}`
                : `${p.nom} — ${t("saSub.form.noTariff")}`}
            </option>
          ))}
        </select>
        <FieldError messages={details?.planId} />
      </Field>

      {mode === "CATALOGUE" && planChoisi && (
        <Field label={t("saSub.form.period")} required>
          <div className="flex gap-2 flex-wrap items-center">
            {PERIODICITES.map((per) => {
              const o = offreDe(planChoisi, per);
              return (
                <Button key={per} type="button" size="sm" variant={periodicite === per ? "primary" : "secondary"} disabled={!o} onClick={() => setPeriodicite(per)} data-testid={`activation-${per}`}>
                  {t(per === "ANNUEL" ? "sub.periodYearly" : "sub.periodMonthly")}
                </Button>
              );
            })}
          </div>
          <FieldError messages={details?.periodicite} />
          {offre ? (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400" data-testid="prix-catalogue">
              {t("saSub.estimate.label")} :{" "}
              <span className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{fcfa(offre.prix)}</span>
              <span className="text-xs text-neutral-500"> ({t("saSub.estimate.fromCatalogue", { mois: offre.dureeMois })})</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{t("saSub.form.periodNotOffered")}</p>
          )}
        </Field>
      )}

      {mode === "EXCEPTIONNEL" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              <Button type="button" size="sm" variant={modeFin === "duree" ? "primary" : "secondary"} onClick={() => setModeFin("duree")}>
                {t("saSub.form.byDuration")}
              </Button>
              <Button type="button" size="sm" variant={modeFin === "date" ? "primary" : "secondary"} onClick={() => setModeFin("date")}>
                {t("saSub.form.byDate")}
              </Button>
            </div>
            {modeFin === "duree" ? (
              <Field label={t("saSub.form.durationMonths")} required>
                <div className="flex gap-2 flex-wrap items-center">
                  {DUREES_RAPIDES.map((d) => (
                    <Button key={d} type="button" size="sm" variant={String(d) === dureeMois ? "primary" : "secondary"} onClick={() => setDureeMois(String(d))}>
                      {t("saSub.section.months", { nombre: d })}
                    </Button>
                  ))}
                  <input type="number" min="1" max="60" required value={dureeMois} onChange={(e) => setDureeMois(e.target.value)} className={`${inputClass} w-24`} />
                </div>
                <FieldError messages={details?.dureeMois} />
              </Field>
            ) : (
              <Field label={t("saSub.section.expiry")} required>
                <input type="date" required value={dateExpiration} onChange={(e) => setDateExpiration(e.target.value)} className={inputClass} />
                <FieldError messages={details?.dateExpiration} />
              </Field>
            )}
          </div>
          <Field label={t("saSub.form.amount")} required hint={t("saSub.form.amountHint")}>
            <input
              type="text"
              inputMode="numeric"
              required
              value={prix}
              onChange={(e) => setPrix(e.target.value)}
              className={inputClass}
              data-testid="montant-exceptionnel"
            />
            <FieldError messages={details?.prix} />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t("saSub.form.startDate")} hint={t("saSub.form.startDateHint")}>
          <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className={inputClass} />
          <FieldError messages={details?.dateDebut} />
        </Field>
        <Field label={mode === "EXCEPTIONNEL" ? t("saSub.form.reason") : t("saSub.form.note")} required={mode === "EXCEPTIONNEL"}>
          <input
            value={note}
            required={mode === "EXCEPTIONNEL"}
            minLength={mode === "EXCEPTIONNEL" ? 3 : undefined}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            data-testid="activation-motif"
          />
          <FieldError messages={details?.note} />
        </Field>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          type="submit"
          variant="accent"
          icon={CheckCircle2}
          loading={mutation.isPending}
          disabled={!planId || (mode === "CATALOGUE" && !offre) || (mode === "EXCEPTIONNEL" && prixSaisi == null)}
        >
          {t("saSub.form.submit")}
        </Button>
        {done && !mutation.isPending && (
          <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {t("saSub.form.done")}
          </span>
        )}
      </div>
    </Card>
  );
}

function Historique({ historique }) {
  const { t } = useTranslation();
  if (historique.length === 0) return <EmptyState icon={History}>{t("saSub.history.empty")}</EmptyState>;
  return (
    <ul className="space-y-2">
      {historique.map((h) => (
        <li key={h.id}>
          <Card variant="outlined" className="space-y-1 text-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="font-medium text-neutral-900 dark:text-neutral-100">{t(`saSub.history.action.${h.action}`)}</span>
              <span className="text-xs text-neutral-400">{formatDateHeure(h.createdAt)}</span>
            </div>
            <p className="text-neutral-600 dark:text-neutral-400">
              {[
                h.planNom,
                h.dureeMois ? t("saSub.section.months", { nombre: h.dureeMois }) : null,
                h.dateDebut || h.dateExpiration
                  ? `${formatDateAbonnement(h.dateDebut)} → ${formatDateAbonnement(h.dateExpiration)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="text-xs text-neutral-500">
              {t("saSub.history.by", { par: h.par ?? "—" })}
              {h.note ? ` — ${h.note}` : ""}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export default function AbonnementAtelierSection({ atelierId }) {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useAtelierAbonnementQuery(atelierId);

  if (isPending) return <LoadingState label={t("saSub.section.loading")} />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div className="space-y-4">
      <EtatCourant data={data} />
      {data.abonnementCourant && (
        <ActionsCourant key={data.abonnementCourant.id + data.abonnementCourant.dateExpiration} atelierId={atelierId} abonnement={data.abonnementCourant} />
      )}

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <CalendarClock className="size-4" aria-hidden="true" />
          {t("saSub.form.title")}
        </p>
        <ActiverForm atelierId={atelierId} />
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <History className="size-4" aria-hidden="true" />
          {t("saSub.history.title")}
        </p>
        <Historique historique={data.historique} />
      </div>
    </div>
  );
}
