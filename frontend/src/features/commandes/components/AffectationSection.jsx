import { useState } from "react";
import { Hammer, UserMinus, UserPlus } from "lucide-react";
import { useAffecterMutation, useProductionQuery } from "../hooks.js";
import { STATUTS_OUVERTS } from "../../production/production.js";
import { dateLocale } from "../constants.js";
import { useCan } from "../../../hooks/usePermissions.js";
import { useTranslation } from "../../../i18n/index.js";
import { GlobalFormError } from "../../../components/QueryState.jsx";
import Card from "../../../components/Card.jsx";
import Button from "../../../components/Button.jsx";
import SectionTitle from "../../../components/SectionTitle.jsx";
import { inputClass } from "../../../components/FormField.jsx";

const nomComplet = (p) => (p ? `${p.prenom ?? ""} ${p.nom ?? ""}`.trim() || p.identifiant : "");
const formatDate = (iso) => new Date(iso).toLocaleDateString(dateLocale(), { year: "numeric", month: "short", day: "numeric" });

/** Qui travaille sur la commande, et (pour qui a le droit d'affecter) le moyen de la confier à quelqu'un d'autre. */
export default function AffectationSection({ commande }) {
  const { t } = useTranslation();
  const can = useCan();
  const peutAffecter = can("commandes.affecter");
  const ouverte = STATUTS_OUVERTS.includes(commande.statut);
  const production = useProductionQuery({ enabled: peutAffecter && ouverte });
  const affecter = useAffecterMutation(commande.id);
  const [choix, setChoix] = useState("");
  const historique = commande.affectations ?? [];

  // Rien à montrer : commande jamais affectée et personne ici pour l'affecter.
  if (!peutAffecter && !commande.assigneA && historique.length === 0) return null;

  return (
    <section className="space-y-2" data-testid="section-affectation">
      <SectionTitle icon={Hammer}>{t("prod.sectionTitle")}</SectionTitle>
      <Card className="space-y-3 text-sm">
        <p className="text-neutral-800 dark:text-neutral-200">
          {commande.assigneA ? (
            <>
              {t("prod.assigneA", { nom: nomComplet(commande.assigneA) })}
              {commande.assigneLe && <span className="text-neutral-500"> — {t("prod.assigneDepuis", { date: formatDate(commande.assigneLe) })}</span>}
            </>
          ) : (
            <span className="text-neutral-500">{t("prod.nonAffectee")}</span>
          )}
        </p>

        {peutAffecter && !ouverte && <p className="text-neutral-500">{t("prod.termineeNote")}</p>}

        {peutAffecter && ouverte && (
          <div className="space-y-2">
            <GlobalFormError error={affecter.error} />
            <div className="flex items-center gap-2 flex-wrap">
              <select value={choix} onChange={(e) => setChoix(e.target.value)} className={`${inputClass} w-auto`} aria-label={t("prod.sectionTitle")} data-testid="select-affectation">
                <option value="">{t("prod.choisir")}</option>
                {(production.data?.employes ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {nomComplet(p)}
                  </option>
                ))}
              </select>
              <Button
                variant="primary"
                size="sm"
                icon={UserPlus}
                disabled={!choix || choix === commande.assigneAId}
                loading={affecter.isPending}
                onClick={() => affecter.mutate(choix, { onSuccess: () => setChoix("") })}
                data-testid="affecter"
              >
                {t("prod.affecter")}
              </Button>
              {commande.assigneA && (
                <Button variant="secondary" size="sm" icon={UserMinus} loading={affecter.isPending} onClick={() => affecter.mutate(null)} data-testid="retirer-affectation">
                  {t("prod.retirer")}
                </Button>
              )}
            </div>
          </div>
        )}

        {historique.length > 0 && (
          <details>
            <summary className="cursor-pointer text-neutral-600 dark:text-neutral-400">{t("prod.historique")}</summary>
            <ul className="mt-2 space-y-1 text-neutral-600 dark:text-neutral-400">
              {historique.map((h) => (
                <li key={h.id}>
                  {formatDate(h.createdAt)} —{" "}
                  {h.employe
                    ? t("prod.histoAffecte", { employe: nomComplet(h.employe), par: h.par ? nomComplet(h.par) : t("prod.systeme") })
                    : t("prod.histoRetire", { par: h.par ? nomComplet(h.par) : t("prod.systeme") })}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    </section>
  );
}
