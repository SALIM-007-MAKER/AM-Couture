import { useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, Building2, Banknote, AlertTriangle, RefreshCcw, Settings, Save } from "lucide-react";
import {
  useSyntheseCommerceQuery,
  useRevenusQuery,
  useRenouvellementsQuery,
  useParametresAbonnementQuery,
  useEnregistrerParametresMutation,
} from "../../features/commerce/hooks.js";
import { pourcentage, libelleTaux, maxEncaisse, estNegatif } from "../../features/commerce/format.js";
import { formatDateFr, formatPrix } from "../../features/abonnement/constants.js";
import EtatAbonnementBadge from "../../features/ateliers/components/EtatAbonnementBadge.jsx";
import { LoadingState, ErrorState, GlobalFormError } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import { useTranslation } from "../../i18n/index.js";

const fcfa = (montant) => `${formatPrix(montant)} FCFA`;

function Chiffre({ label, valeur, sous, negatif = false, testid }) {
  return (
    <div data-testid={testid}>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${negatif ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-neutral-100"}`}>{valeur}</p>
      {sous && <p className="text-xs text-neutral-500">{sous}</p>}
    </div>
  );
}

function Pastilles({ valeurs, rendre }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(valeurs).map(([cle, nombre]) => (
        <span key={cle} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 text-xs">
          {rendre(cle)}
          <strong className="tabular-nums">{nombre}</strong>
        </span>
      ))}
    </div>
  );
}

function Synthese() {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useSyntheseCommerceQuery();
  if (isPending) return <LoadingState label={t("saCom.loading")} />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;
  const { ateliers, revenus, paiementsAVerifier: aVerifier, anomaliesWave, conversion, renouvellement } = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card variant="outlined" className="space-y-3" data-testid="carte-ateliers">
          <SectionTitle icon={Building2}>{t("saCom.workshopsTitle")}</SectionTitle>
          <p className="text-sm">{t("saCom.workshopsTotal", { actifs: ateliers.actifs, total: ateliers.total, suspendus: ateliers.suspendus })}</p>
          <p className="text-xs text-neutral-500">{t("saCom.newWorkshops", { nombre: ateliers.nouveaux30Jours })}</p>
          <div className="space-y-1">
            <p className="text-xs text-neutral-500">{t("saCom.byState")}</p>
            <Pastilles valeurs={ateliers.parEtat} rendre={(etat) => <EtatAbonnementBadge statut={etat} />} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-neutral-500">{t("saCom.byAccess")}</p>
            <Pastilles valeurs={ateliers.parAcces} rendre={(mode) => t(`saCom.access.${mode}`)} />
          </div>
        </Card>

        <Card variant="outlined" className="space-y-3" data-testid="carte-revenus">
          <SectionTitle icon={TrendingUp}>{t("saCom.revenueTitle")}</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Chiffre label={`${t("saCom.thisMonth")} (${revenus.moisCourant.mois})`} valeur={fcfa(revenus.moisCourant.net)} negatif={estNegatif(revenus.moisCourant.net)} sous={`${t("saCom.collected")} ${fcfa(revenus.moisCourant.encaisse)} · ${t("saCom.refunded")} ${fcfa(revenus.moisCourant.rembourse)}`} testid="net-mois" />
            <Chiffre label={`${t("saCom.lastMonth")} (${revenus.moisPrecedent.mois})`} valeur={fcfa(revenus.moisPrecedent.net)} negatif={estNegatif(revenus.moisPrecedent.net)} sous={`${t("saCom.collected")} ${fcfa(revenus.moisPrecedent.encaisse)}`} />
            <Chiffre label={t("saCom.mrr")} valeur={fcfa(revenus.revenuMensuelRecurrent)} sous={t("saCom.mrrHelp")} testid="mrr" />
            <Chiffre label={t("saCom.cumulative")} valeur={fcfa(revenus.cumul.net)} sous={`${t("saCom.collected")} ${fcfa(revenus.cumul.encaisse)}`} />
          </div>
        </Card>

        <Card variant="outlined" className="space-y-2" data-testid="carte-a-verifier">
          <SectionTitle icon={Banknote}>{t("saCom.toVerifyTitle")}</SectionTitle>
          {aVerifier.nombre === 0 ? (
            <p className="text-sm text-neutral-500">{t("saCom.none")}</p>
          ) : (
            <>
              <p className="text-sm">{t("saCom.toVerifyBody", { nombre: aVerifier.nombre, montant: formatPrix(aVerifier.montant) })}</p>
              {aVerifier.plusAncienLe && <p className="text-xs text-neutral-500">{t("saCom.oldest", { date: formatDateFr(aVerifier.plusAncienLe) })}</p>}
              <Button as={Link} to="/paiements-abonnement" variant="primary" size="sm">
                {t("saCom.manage")}
              </Button>
            </>
          )}
        </Card>

        <Card variant="outlined" className="space-y-2">
          <SectionTitle icon={RefreshCcw}>{t("saCom.conversionTitle", { jours: conversion.periodeJours })}</SectionTitle>
          <p className="text-2xl font-semibold tabular-nums" data-testid="taux-conversion">{libelleTaux(conversion.taux)}</p>
          <p className="text-xs text-neutral-500">{conversion.essaisTermines === 0 ? t("saCom.noData") : t("saCom.conversionBody", { convertis: conversion.convertis, termines: conversion.essaisTermines })}</p>
          <SectionTitle>{t("saCom.renewalTitle", { jours: renouvellement.periodeJours })}</SectionTitle>
          <p className="text-2xl font-semibold tabular-nums" data-testid="taux-renouvellement">{libelleTaux(renouvellement.taux)}</p>
          <p className="text-xs text-neutral-500">{renouvellement.echus === 0 ? t("saCom.noData") : t("saCom.renewalBody", { renouveles: renouvellement.renouveles, echus: renouvellement.echus })}</p>
        </Card>
      </div>

      {anomaliesWave.length > 0 && (
        <Card variant="outlined" className="space-y-2 border-red-200 dark:border-red-900" data-testid="anomalies-wave">
          <SectionTitle icon={AlertTriangle}>{t("saCom.anomaliesTitle")}</SectionTitle>
          <p className="text-xs text-neutral-500">{t("saCom.anomaliesHelp")}</p>
          <ul className="text-sm space-y-1">
            {anomaliesWave.map((a) => (
              <li key={a.transaction}>
                <Link to={`/ateliers/${a.atelierId}`} className="font-mono text-xs hover:underline">{a.transaction}</Link> — {a.raison}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Revenus() {
  const { t } = useTranslation();
  const [mois, setMois] = useState(12);
  const { data, isPending, isError, error, refetch } = useRevenusQuery(mois);
  if (isPending) return <LoadingState label={t("saCom.loading")} />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;
  const max = maxEncaisse(data.serie);
  const ventilation = (lignes, titre, libelle) => (
    <Card variant="outlined" padded={false} className="overflow-x-auto">
      <p className="px-4 pt-3 text-xs font-medium text-neutral-500">{titre}</p>
      <table className="w-full text-sm">
        <tbody>
          {lignes.length === 0 && <tr><td className="px-4 py-3 text-neutral-500">{t("saCom.noData")}</td></tr>}
          {lignes.map((l) => (
            <tr key={l.cle} className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="px-4 py-2">{libelle(l.cle)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fcfa(l.encaisse)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SectionTitle icon={TrendingUp}>{t("saCom.seriesTitle")}</SectionTitle>
        <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
          {t("saCom.months")}
          <select value={mois} onChange={(e) => setMois(Number(e.target.value))} className={`${inputClass} w-auto`}>
            {[6, 12, 24].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <Card variant="outlined" padded={false} className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="table-revenus">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t("saCom.colMonth")}</th>
              <th className="px-4 py-3 font-medium w-1/3">{t("saCom.colCollected")}</th>
              <th className="px-4 py-3 font-medium text-right">{t("saCom.colRefunded")}</th>
              <th className="px-4 py-3 font-medium text-right">{t("saCom.colNet")}</th>
              <th className="px-4 py-3 font-medium text-right">{t("saCom.colCount")}</th>
            </tr>
          </thead>
          <tbody>
            {data.serie.map((m) => (
              <tr key={m.mois} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-2 font-mono text-xs">{m.mois}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-neutral-100 dark:bg-neutral-800" aria-hidden="true">
                      <div className="h-2 rounded-full bg-brand-500" style={{ width: `${pourcentage(m.encaisse, max)}%` }} />
                    </div>
                    <span className="tabular-nums w-28 text-right">{fcfa(m.encaisse)}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{fcfa(m.rembourse)}</td>
                <td className={`px-4 py-2 text-right tabular-nums font-medium ${estNegatif(m.net) ? "text-red-600 dark:text-red-400" : ""}`}>{fcfa(m.net)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{m.nombrePaiements}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 dark:border-neutral-700 font-medium">
              <td className="px-4 py-2" />
              <td className="px-4 py-2 tabular-nums">{fcfa(data.totaux.encaisse)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fcfa(data.totaux.rembourse)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fcfa(data.totaux.net)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ventilation(data.parPlan, t("saCom.byPlan"), (cle) => cle)}
        {ventilation(data.parMoyen, t("saCom.byMethod"), (cle) => t(`subPay.methods.${cle}`))}
      </div>
      {data.activationsSansPaiementEnregistre.nombre > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="activations-manuelles">
          <strong>{t("saCom.manualTitle")}.</strong>{" "}
          {t("saCom.manualBody", { nombre: data.activationsSansPaiementEnregistre.nombre, valeur: formatPrix(data.activationsSansPaiementEnregistre.valeur) })}
        </p>
      )}
      <p className="text-xs text-neutral-500">{t("saCom.definitions")}</p>
    </div>
  );
}

function ListeRenouvellements({ titre, lignes, colonneJours, testid }) {
  const { t } = useTranslation();
  return (
    <Card variant="outlined" padded={false} className="overflow-x-auto" data-testid={testid}>
      <p className="px-4 pt-3 text-sm font-medium">{titre} <span className="text-neutral-400">({lignes.length})</span></p>
      {lignes.length === 0 ? (
        <p className="px-4 py-3 text-sm text-neutral-500">{t("saCom.emptyList")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">{t("saCom.colWorkshop")}</th>
              <th className="px-4 py-2 font-medium">{t("saCom.colEnds")}</th>
              <th className="px-4 py-2 font-medium">{t("saCom.colDaysLeft")}</th>
              <th className="px-4 py-2 font-medium">{t("saCom.colContact")}</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.atelierId} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-2">
                  <Link to={`/ateliers/${l.atelierId}`} className="font-medium hover:underline">{l.nom}</Link>
                  {l.paiementEnAttente && <span className="ml-2 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 text-[10px]">{t("saCom.paymentDeclared")}</span>}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{formatDateFr(l.finLe)}</td>
                <td className="px-4 py-2 tabular-nums">{colonneJours(l)}</td>
                <td className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-400">{[l.telephone, l.email].filter(Boolean).join(" · ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Renouvellements() {
  const { t } = useTranslation();
  const [jours, setJours] = useState(30);
  const { data, isPending, isError, error, refetch } = useRenouvellementsQuery(jours);
  if (isPending) return <LoadingState label={t("saCom.loading")} />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SectionTitle icon={RefreshCcw}>{t("saCom.renewalsTitle")}</SectionTitle>
        <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
          {t("saCom.horizon")}
          <select value={jours} onChange={(e) => setJours(Number(e.target.value))} className={`${inputClass} w-auto`} data-testid="horizon">
            {[7, 30, 60].map((n) => <option key={n} value={n}>{t("saCom.horizonDays", { jours: n })}</option>)}
          </select>
        </label>
      </div>
      <ListeRenouvellements titre={t("saCom.toRenew")} lignes={data.aRenouveler} colonneJours={(l) => t("saCom.daysLeft", { jours: l.joursRestants })} testid="liste-a-renouveler" />
      <ListeRenouvellements titre={t("saCom.recentlyExpired")} lignes={data.recemmentExpires} colonneJours={(l) => t("saCom.daysSince", { jours: l.joursDepuis })} testid="liste-expires" />
      <ListeRenouvellements titre={t("saCom.trialsEnding")} lignes={data.essaisQuiFinissent} colonneJours={(l) => t("saCom.daysLeft", { jours: l.joursRestants })} testid="liste-essais" />
    </div>
  );
}

function Reglages() {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useParametresAbonnementQuery();
  const enregistrer = useEnregistrerParametresMutation();
  const [valeurs, setValeurs] = useState(null);
  const [enregistre, setEnregistre] = useState(false);
  if (isPending) return <LoadingState label={t("saCom.loading")} />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;
  const courant = valeurs ?? { joursGrace: String(data.joursGrace), instructionsPaiement: data.instructionsPaiement ?? "" };
  const maj = (champ, v) => {
    setEnregistre(false);
    setValeurs({ ...courant, [champ]: v });
  };

  function handleSubmit(e) {
    e.preventDefault();
    enregistrer.mutate(
      { joursGrace: Number(courant.joursGrace), instructionsPaiement: courant.instructionsPaiement.trim() },
      { onSuccess: () => { setEnregistre(true); setValeurs(null); } },
    );
  }

  return (
    <Card as="form" variant="outlined" onSubmit={handleSubmit} className="space-y-3" data-testid="reglages-abonnement">
      <SectionTitle icon={Settings}>{t("saCom.settingsTitle")}</SectionTitle>
      <GlobalFormError error={enregistrer.error} />
      <Field label={t("saCom.graceDays")} hint={t("saCom.graceHelp")}>
        <input type="number" min={0} max={90} value={courant.joursGrace} onChange={(e) => maj("joursGrace", e.target.value)} className={`${inputClass} w-28`} />
      </Field>
      <Field label={t("saCom.instructions")} hint={t("saCom.instructionsHelp")}>
        <textarea rows={4} maxLength={1000} value={courant.instructionsPaiement} onChange={(e) => maj("instructionsPaiement", e.target.value)} className={inputClass} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="sm" icon={Save} loading={enregistrer.isPending}>{t("common.save")}</Button>
        {enregistre && <span role="status" className="text-sm text-green-700 dark:text-green-400">{t("saCom.saved")}</span>}
      </div>
    </Card>
  );
}

export default function CommercePage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader icon={TrendingUp} title={t("saCom.title")} subtitle={t("saCom.subtitle")} />
      <Synthese />
      <Revenus />
      <Renouvellements />
      <Reglages />
    </div>
  );
}
