import { MessageCircle } from "lucide-react";
import { lienWhatsapp } from "../constants.js";
import { useTranslation } from "../../../i18n/index.js";

// Bandeau final : invite à contacter l'administrateur (aucune souscription en
// ligne). Bouton WhatsApp uniquement si un numéro est configuré.
export default function ContactBanner({ whatsapp }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl bg-brand-800 dark:bg-brand-900 border border-brand-700 text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
      <div>
        <h2 className="text-xl font-semibold">{t("sub.contactTitle")}</h2>
        <p className="text-sm text-brand-200 mt-1">{t("sub.contactMessage")}</p>
      </div>
      {whatsapp && (
        <a
          href={lienWhatsapp(whatsapp, t("sub.contactPrefill"))}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-white text-brand-900 hover:bg-brand-50 px-4 py-2 text-sm font-medium shrink-0 transition duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          {t("sub.contactButton")}
        </a>
      )}
    </div>
  );
}
