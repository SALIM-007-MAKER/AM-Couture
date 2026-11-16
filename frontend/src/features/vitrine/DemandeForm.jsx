import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { vitrineApi } from "./api.js";
import { ApiError } from "../../lib/apiClient.js";
import { useTranslation } from "../../i18n/index.js";

const champ = "w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm";

/**
 * Formulaire PUBLIC de demande de commande (visiteur sans compte). Le consentement est une case à cocher explicite,
 * jamais pré-cochée ; le champ « siteWeb » est un piège à robots (hors écran, jamais rempli par une personne).
 */
export default function DemandeForm({ slug, modele, couleur, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ prenom: "", nom: "", telephone: "", description: "", consentement: false, siteWeb: "" });
  const [etat, setEtat] = useState("saisie"); // saisie | envoi | envoye
  const [erreur, setErreur] = useState("");
  const [details, setDetails] = useState({});
  const maj = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function envoyer(e) {
    e.preventDefault();
    setEtat("envoi");
    setErreur("");
    setDetails({});
    try {
      await vitrineApi.envoyerDemande(slug, {
        prenom: form.prenom,
        nom: form.nom,
        telephone: form.telephone,
        description: form.description || undefined,
        modeleId: modele?.id,
        consentement: form.consentement,
        siteWeb: form.siteWeb,
      });
      setEtat("envoye");
    } catch (err) {
      setEtat("saisie");
      if (err instanceof ApiError && err.status === 400) setDetails(err.details ?? {});
      setErreur(err instanceof ApiError && err.status === 429 ? t("dvit.errorTooMany") : err instanceof ApiError && err.status === 400 ? err.message : t("dvit.errorGeneric"));
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={t("dvit.title")} onClick={onClose}>
      <div className="bg-white dark:bg-neutral-900 w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()} data-testid="demande-form">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold">{etat === "envoye" ? t("dvit.sentTitle") : t("dvit.title")}</h3>
          <button type="button" onClick={onClose} aria-label={t("dvit.close")} className="p-1"><X className="size-5" /></button>
        </div>

        {etat === "envoye" ? (
          <div className="space-y-4 text-center py-4" data-testid="demande-envoyee">
            <CheckCircle2 className="size-10 mx-auto text-green-600" aria-hidden="true" />
            <p className="text-sm">{t("dvit.sentText")}</p>
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: couleur }}>{t("dvit.close")}</button>
          </div>
        ) : (
          <form onSubmit={envoyer} className="space-y-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">{t("dvit.intro")}</p>
            {modele && <p className="text-sm font-medium">{t("dvit.model", { nom: modele.nom })}</p>}
            {erreur && <p role="alert" className="text-sm text-red-600 dark:text-red-400" data-testid="demande-erreur">{erreur}</p>}

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span>{t("dvit.firstName")}</span>
                <input required maxLength={60} value={form.prenom} onChange={(e) => maj("prenom", e.target.value)} className={champ} autoComplete="given-name" data-testid="demande-prenom" />
                {details.prenom && <span className="text-xs text-red-600">{details.prenom[0]}</span>}
              </label>
              <label className="space-y-1 text-sm">
                <span>{t("dvit.lastName")}</span>
                <input required maxLength={60} value={form.nom} onChange={(e) => maj("nom", e.target.value)} className={champ} autoComplete="family-name" data-testid="demande-nom" />
                {details.nom && <span className="text-xs text-red-600">{details.nom[0]}</span>}
              </label>
            </div>
            <label className="block space-y-1 text-sm">
              <span>{t("dvit.phone")}</span>
              <input required type="tel" inputMode="tel" maxLength={25} value={form.telephone} onChange={(e) => maj("telephone", e.target.value)} className={champ} autoComplete="tel" data-testid="demande-telephone" />
              {details.telephone && <span className="text-xs text-red-600">{details.telephone[0]}</span>}
            </label>
            <label className="block space-y-1 text-sm">
              <span>{t("dvit.message")}</span>
              <textarea rows={3} maxLength={1000} value={form.description} onChange={(e) => maj("description", e.target.value)} placeholder={t("dvit.messagePlaceholder")} className={champ} data-testid="demande-message" />
            </label>

            {/* Piège à robots : hors écran, ignoré des lecteurs d'écran et du clavier ; une personne ne le remplit jamais. */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
              <label>
                Site web
                <input tabIndex={-1} autoComplete="off" name="siteWeb" value={form.siteWeb} onChange={(e) => maj("siteWeb", e.target.value)} />
              </label>
            </div>

            <label className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400">
              <input type="checkbox" className="mt-0.5" checked={form.consentement} onChange={(e) => maj("consentement", e.target.checked)} data-testid="demande-consentement" />
              <span>{t("dvit.consent")}</span>
            </label>
            {details.consentement && <p className="text-xs text-red-600">{details.consentement[0]}</p>}

            <div className="flex gap-2">
              <button type="submit" disabled={!form.consentement || etat === "envoi"} className="rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: couleur }} data-testid="demande-envoyer">
                {etat === "envoi" ? t("dvit.sending") : t("dvit.send")}
              </button>
              <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm">{t("dvit.cancel")}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
