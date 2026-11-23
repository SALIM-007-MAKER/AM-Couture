import { Check, MessageCircle, ShoppingCart } from "lucide-react";
import { formatPrix, lienWhatsapp } from "../constants.js";
import { RESSOURCES, formaterLimite } from "../quotas.js";
import { offreDe } from "../tarifs.js";
import Card from "../../../components/Card.jsx";
import Button from "../../../components/Button.jsx";
import { useTranslation } from "../../../i18n/index.js";

// Une formule (style « page de tarifs »). `courant` = la formule de l'abonnement ACTIF du PDG : carte mise en avant, variante
// sombre (mêmes tokens brand que le reste de l'app). Les prix viennent du serveur (plan.offres[].prix, catalogue administré par le
// SUPERADMIN) : rien n'est calculé ni écrit en dur ici, hormis « soit X / mois » et l'économie annuelle, affichés à titre
// INFORMATIF. Une période sans prix n'est pas proposée : pas de bouton. Aucune action d'achat autre que la DÉCLARATION d'un
// paiement (onSouscrire) ; au plus un lien de contact WhatsApp, si le SUPERADMIN a réglé un numéro.
export default function PlanCard({ plan, periodicite, courant, whatsapp, onSouscrire }) {
  const { t } = useTranslation();
  const offre = offreDe(plan, periodicite);
  const annuel = offreDe(plan, "ANNUEL");

  const sombre = courant;
  const muted = sombre ? "text-brand-200" : "text-neutral-500";
  const titre = sombre ? "text-white" : "text-neutral-900 dark:text-neutral-100";
  const message = offre
    ? t("sub.contactPlanPrefill", { plan: plan.nom, duree: t(offre.periodicite === "ANNUEL" ? "sub.periodYearly" : "sub.periodMonthly") })
    : t("sub.contactPrefill");

  return (
    <Card
      variant="outlined"
      className={`flex flex-col gap-4 p-6 ${
        sombre ? "bg-brand-800 dark:bg-brand-900 border-brand-700 text-white shadow-glow-brand" : ""
      }`}
      data-testid={`formule-${plan.nom}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={`text-lg font-semibold ${titre}`}>{plan.nom}</h3>
        {courant && (
          <span className="shrink-0 rounded-full bg-amber-500 text-neutral-950 px-2.5 py-0.5 text-xs font-semibold">
            {t("sub.currentPlan")}
          </span>
        )}
      </div>

      {plan.description && <p className={`text-sm ${muted}`}>{plan.description}</p>}

      <div className={`border-b pb-4 ${sombre ? "border-brand-700" : "border-neutral-200 dark:border-neutral-800"}`}>
        {offre ? (
          <>
            <p className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-3xl font-bold tabular-nums ${titre}`} data-testid="prix-offre">
                {formatPrix(offre.prix)}
              </span>
              <span className={`text-sm ${muted}`}>
                FCFA {t(offre.periodicite === "ANNUEL" ? "sub.perYear" : "sub.perMonth")}
              </span>
            </p>
            {offre.periodicite === "ANNUEL" ? (
              <>
                <p className={`text-xs mt-1 ${muted}`}>{t("sub.perMonthEquiv", { prix: formatPrix(offre.prix / 12) })}</p>
                {plan.economieAnnuelle != null && (
                  <p className="mt-2" data-testid="economie-annuelle">
                    <span className="rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 px-2 py-0.5 text-xs font-medium">
                      {t("sub.savingYear", { montant: formatPrix(plan.economieAnnuelle), mois: formatPrix(plan.moisOffertsAnnuel) })}
                    </span>
                  </p>
                )}
              </>
            ) : (
              annuel && <p className={`text-xs mt-1 ${muted}`}>{t("sub.orYearly", { prix: formatPrix(annuel.prix) })}</p>
            )}
          </>
        ) : (
          <p className={`text-sm ${muted}`} data-testid="periode-non-proposee">
            {t(periodicite === "ANNUEL" ? "sub.notOfferedYearly" : "sub.notOfferedMonthly")}
          </p>
        )}
      </div>

      <ul className={`space-y-1 text-sm ${sombre ? "text-brand-100" : "text-neutral-700 dark:text-neutral-300"}`} data-testid="quotas-formule">
        {RESSOURCES.map((cle) => (
          <li key={cle} className="flex items-center justify-between gap-3">
            <span>{t(`quotas.ressources.${cle}`)}</span>
            <span className="font-medium tabular-nums">{formaterLimite(plan.limites?.[cle]) ?? t("quotas.illimite")}</span>
          </li>
        ))}
      </ul>
      {plan.fonctionnalites.length > 0 ? (
        <ul className={`flex-1 space-y-2 text-sm ${sombre ? "text-brand-100" : "text-neutral-600 dark:text-neutral-400"}`}>
          {plan.fonctionnalites.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check
                className={`size-4 shrink-0 mt-0.5 ${sombre ? "text-amber-400" : "text-green-600 dark:text-green-400"}`}
                aria-hidden="true"
              />
              {f}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex-1" />
      )}

      {onSouscrire && offre && (
        <Button variant={sombre ? "accent" : "primary"} icon={ShoppingCart} onClick={() => onSouscrire(plan, offre)} data-testid={`souscrire-${plan.nom}`}>
          {t("subPay.subscribe")}
        </Button>
      )}

      {whatsapp && (
        <a
          href={lienWhatsapp(whatsapp, message)}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
            sombre
              ? "bg-white text-brand-900 hover:bg-brand-50"
              : "border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          {t("sub.contactButton")}
        </a>
      )}
    </Card>
  );
}
