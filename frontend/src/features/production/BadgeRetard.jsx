import { AlarmClock } from "lucide-react";
import { useTranslation } from "../../i18n/index.js";

/** Pastille « En retard » : commande ouverte dont la date de livraison prévue est dépassée. */
export default function BadgeRetard() {
  const { t } = useTranslation();
  return (
    <span
      data-testid="badge-retard"
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
    >
      <AlarmClock className="size-3" aria-hidden="true" />
      {t("prod.badgeRetard")}
    </span>
  );
}
