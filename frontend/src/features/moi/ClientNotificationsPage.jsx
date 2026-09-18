import { Link } from "react-router-dom";
import { Bell, Check } from "lucide-react";
import { useMesNotificationsQuery, useMarquerNotificationLuMutation } from "./hooks.js";
import { NOTIFICATION_CLIENT_LABEL_KEYS, NOTIFICATION_CLIENT_ICONS, NOTIFICATION_CLIENT_TONES } from "./constants.js";
import {
  NOTIFICATION_LABELS,
  NOTIFICATION_ICONS,
  NOTIFICATION_TONES,
  notificationMessage,
} from "../notifications/constants.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { useTranslation } from "../../i18n/index.js";

const TONE_CLASSES = {
  danger: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  success: "text-green-600 dark:text-green-400",
};

function formatDateHeure(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Fusionne DEUX sources (voir GET /api/moi/notifications, moi.routes.js) :
// "etat" (commande prête/bientôt à livrer, recalculé — jamais marquable lu
// depuis ici, Notification.lu est partagé avec l'ADMIN) et "evenement" (fil
// d'activité — commande créée, paiement, demande acceptée/refusée...,
// marquable lu, propre au client).
export default function ClientNotificationsPage() {
  const { t } = useTranslation();
  const query = useMesNotificationsQuery();
  const marquerLuMutation = useMarquerNotificationLuMutation();
  const data = query.data?.data ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader icon={Bell} title={t("nav.notifications")} subtitle={t("client.notificationsSubtitle")} />

      {query.isPending && <LoadingState label={t("client.notificationsLoading")} />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && data.length === 0 && <EmptyState icon={Bell}>{t("client.notificationsEmpty")}</EmptyState>}

      {query.data && data.length > 0 && (
        <ul className="space-y-2">
          {data.map((notif) => {
            const estEvenement = notif.source === "evenement";
            const Icon = estEvenement ? NOTIFICATION_CLIENT_ICONS[notif.type] : NOTIFICATION_ICONS[notif.type];
            const tone = TONE_CLASSES[estEvenement ? NOTIFICATION_CLIENT_TONES[notif.type] : NOTIFICATION_TONES[notif.type]];
            const label = estEvenement ? t(NOTIFICATION_CLIENT_LABEL_KEYS[notif.type]) : NOTIFICATION_LABELS[notif.type];
            const message = estEvenement ? notif.message : notificationMessage(notif);
            return (
              <li key={notif.id}>
                <Card variant="outlined" className={`flex items-start gap-3 ${notif.lu ? "opacity-60" : ""}`}>
                  <span className={`shrink-0 mt-0.5 ${tone}`}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold ${tone}`}>{label}</span>
                      <span className="text-xs text-neutral-400">{formatDateHeure(notif.createdAt)}</span>
                    </div>
                    {notif.commande ? (
                      <Link to={`/client/commandes/${notif.commande.id}`} className="text-sm text-neutral-900 dark:text-neutral-100 hover:underline">
                        {message}
                      </Link>
                    ) : (
                      <p className="text-sm text-neutral-900 dark:text-neutral-100">{message}</p>
                    )}
                  </div>
                  {estEvenement && !notif.lu && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Check}
                      className="shrink-0"
                      loading={marquerLuMutation.isPending && marquerLuMutation.variables?.id === notif.id}
                      onClick={() => marquerLuMutation.mutate({ id: notif.id, lu: true })}
                    >
                      {t("client.marquerLu")}
                    </Button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
