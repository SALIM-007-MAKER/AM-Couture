import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CreditCard, Clock3, Gift, Layers, CheckCircle2 } from "lucide-react";
import { useEtatAbonnementQuery, usePlansQuery, useVerifierPaiementMutation } from "./hooks.js";
import { abonnementsApi } from "./api.js";
import { peutDeclarer, retourPaiement } from "./paiement.js";
import DeclarationPaiement from "./components/DeclarationPaiement.jsx";
import PaiementEnAttente from "./components/PaiementEnAttente.jsx";
import HistoriquePaiements from "./components/HistoriquePaiements.jsx";
import { formatDateFr, formatPrix } from "./constants.js";
import StatutAbonnementBadge from "./components/StatutAbonnementBadge.jsx";
import PlanCard from "./components/PlanCard.jsx";
import UtilisationCard from "./components/UtilisationCard.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import PeriodeSelector from "./components/PeriodeSelector.jsx";
import { periodesProposees, moisOffertsMax } from "./tarifs.js";
import PlansIncluded from "./components/PlansIncluded.jsx";
import PlansFaq from "./components/PlansFaq.jsx";
import ContactBanner from "./components/ContactBanner.jsx";
import { useTranslation } from "../../i18n/index.js";

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-neutral-500 text-xs mb-0.5">{label}</p>
      <p className="text-neutral-900 dark:text-neutral-100">{value}</p>
    </div>
  );
}

// Page « Abonnement et tarifs » du PDG : état, quotas, formules (mensuel / annuel), souscription et historique des paiements.
// Souscrire = DÉCLARER un paiement fait hors de l'application (ou, si Wave est activé, l'ouvrir en ligne). Aucun clic
// n'est jamais une confirmation : l'abonnement n'est activé qu'après vérification du paiement par le serveur, et
// l'état affiché vient uniquement du serveur (GET /api/abonnements/etat, rafraîchi automatiquement).
export default function AbonnementPage() {
  const { t } = useTranslation();
  const etatQuery = useEtatAbonnementQuery();
  const plansQuery = usePlansQuery();
  const etat = etatQuery.data;
  const abonnement = etat?.abonnement;
  const essai = etat?.essai;
  const whatsapp = etat?.contact?.whatsapp;
  const plans = plansQuery.data ?? [];
  const [choix, setChoix] = useState(null); // { plan, offre } : formule et période choisies pour souscrire
  const [message, setMessage] = useState(null); // { type: "ok" | "info" | "erreur", cle }
  const location = useLocation();
  const navigate = useNavigate();
  const verifier = useVerifierPaiementMutation();
  const retourTraite = useRef(false);

  // Retour de Wave (?paiement=retour|echec&transaction=<numéro>) : le navigateur ne prouve rien. On demande au serveur de
  // relire le paiement chez Wave, et on n'affiche « confirmé » que si c'est ce que Wave a répondu.
  useEffect(() => {
    const retour = retourPaiement(location.search);
    if (!retour || retourTraite.current) return;
    retourTraite.current = true;
    (async () => {
      setMessage({ type: "info", cle: "subPay.returnChecking" });
      try {
        const { data } = await abonnementsApi.transactions();
        const tx = data.find((x) => x.numero === retour.transaction);
        if (!tx) {
          setMessage({ type: "erreur", cle: "subPay.returnFailed" });
        } else {
          const apres = await verifier.mutateAsync(tx.id);
          setMessage(
            apres.statut === "REUSSIE"
              ? { type: "ok", cle: "subPay.returnOk" }
              : apres.statut === "EN_ATTENTE" && retour.resultat === "retour"
                ? { type: "info", cle: "subPay.returnPending" }
                : { type: "erreur", cle: "subPay.returnFailed" },
          );
        }
      } catch {
        setMessage({ type: "erreur", cle: "subPay.returnUnavailable" });
      } finally {
        navigate("/abonnement", { replace: true });
      }
    })();
  }, [location.search, navigate, verifier]);

  // Périodes proposées = celles qui ont un prix dans au moins une formule (offres du catalogue, données serveur) : mensuel et/ou
  // annuel. Par défaut : la période de l'abonnement actif si elle existe (12 mois = annuel), sinon la première proposée.
  const periodes = periodesProposees(plans);
  const [periodeChoisie, setPeriodeChoisie] = useState(null);
  const periodeParDefaut = etat?.statut === "ACTIF" && abonnement?.dureeMois === 12 && periodes.includes("ANNUEL") ? "ANNUEL" : periodes[0];
  const periode = periodes.includes(periodeChoisie) ? periodeChoisie : periodeParDefaut;

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader icon={CreditCard} title={t("nav.subscription")} subtitle={t("sub.subtitle")} />

      {message && (
        <p
          role="status"
          data-testid="message-paiement"
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
            message.type === "ok"
              ? "bg-green-50 text-green-800 dark:bg-green-950/60 dark:text-green-300"
              : message.type === "erreur"
                ? "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                : "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
          }`}
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          {t(message.cle)}
        </p>
      )}

      <div className="space-y-2">
        <SectionTitle icon={Clock3}>{t("sub.currentStatus")}</SectionTitle>
        {etatQuery.isPending && <LoadingState label={t("common.loading")} />}
        {etatQuery.isError && <ErrorState error={etatQuery.error} onRetry={etatQuery.refetch} />}
        {etat && (
          <Card variant="outlined" className="space-y-4">
            <StatutAbonnementBadge statut={etat.statut} />

            {abonnement && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <InfoRow label={t("sub.plan")} value={abonnement.planNom ?? "—"} />
                <InfoRow
                  label={t("sub.price")}
                  value={abonnement.prix != null ? `${formatPrix(abonnement.prix)} FCFA` : "—"}
                />
                <InfoRow
                  label={t("sub.startDate")}
                  value={abonnement.dateDebut ? formatDateFr(abonnement.dateDebut) : "—"}
                />
                <InfoRow
                  label={t("sub.expiryDate")}
                  value={abonnement.dateExpiration ? formatDateFr(abonnement.dateExpiration) : "—"}
                />
                {etat.statut === "ACTIF" && abonnement.joursRestants != null && (
                  <InfoRow label={t("sub.daysLeftLabel")} value={t("sub.daysLeft", { jours: abonnement.joursRestants })} />
                )}
                {abonnement.dureeMois && (
                  <InfoRow label={t("sub.duration")} value={t("sub.months", { mois: abonnement.dureeMois })} />
                )}
              </div>
            )}

            {etat.statut === "EN_ATTENTE" && abonnement?.dateDebut && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {t("sub.pendingNote", { date: formatDateFr(abonnement.dateDebut) })}
              </p>
            )}
            {etat.statut === "EXPIRE" && <p className="text-sm text-red-700 dark:text-red-400">{t("sub.expiredNote")}</p>}
            {etat.statut === "AUCUN" && <p className="text-sm text-neutral-500">{t("sub.noSubscription")}</p>}
          </Card>
        )}
      </div>

      <UtilisationCard />

      {essai && (
        <div className="space-y-2">
          <SectionTitle icon={Gift}>{t("sub.trialTitle")}</SectionTitle>
          <Card
            variant="outlined"
            className={`flex items-center gap-2 text-sm ${
              essai.actif
                ? "border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400"
                : "border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400"
            }`}
          >
            <Gift className="size-4 shrink-0" aria-hidden="true" />
            {essai.actif
              ? t("sub.trialLeft", { jours: essai.joursRestants, date: formatDateFr(essai.trialEndsAt) })
              : t("sub.trialEnded", { date: formatDateFr(essai.trialEndsAt) })}
          </Card>
        </div>
      )}

      {etat?.paiementEnAttente && <PaiementEnAttente paiement={etat.paiementEnAttente} />}

      {choix && peutDeclarer(etat) && (
        <DeclarationPaiement
          key={`${choix.plan.id}-${choix.offre.dureeMois}`}
          plan={choix.plan}
          offre={choix.offre}
          instructions={etat?.instructionsPaiement}
          waveDisponible={Boolean(etat?.paiementsEnLigne?.wave)}
          onClose={() => setChoix(null)}
          onDeclare={() => {
            setChoix(null);
            setMessage({ type: "ok", cle: "subPay.declared" });
          }}
        />
      )}

      <div className="space-y-4">
        <SectionTitle icon={Layers}>{t("sub.plansTitle")}</SectionTitle>
        {etat?.paiementEnAttente && <p className="text-sm text-neutral-500">{t("subPay.onlyOne")}</p>}
        {plansQuery.isPending && <LoadingState label={t("common.loading")} />}
        {plansQuery.isError && <ErrorState error={plansQuery.error} onRetry={plansQuery.refetch} />}
        {plansQuery.data && plans.length === 0 && <EmptyState icon={Layers}>{t("sub.plansEmpty")}</EmptyState>}
        {plans.length > 0 && (
          <>
            <PeriodeSelector periodes={periodes} value={periode} onChange={setPeriodeChoisie} moisOffertsMax={moisOffertsMax(plans)} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  periodicite={periode}
                  courant={etat?.statut === "ACTIF" && abonnement?.planNom === plan.nom}
                  whatsapp={whatsapp}
                  onSouscrire={peutDeclarer(etat) ? (p, offre) => setChoix({ plan: p, offre }) : undefined}
                />
              ))}
            </div>
            <PlansIncluded plans={plans} />
          </>
        )}
      </div>

      <HistoriquePaiements />

      <PlansFaq />

      <ContactBanner whatsapp={whatsapp} />
    </div>
  );
}
