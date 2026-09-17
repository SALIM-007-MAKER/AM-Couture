import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { useMesNotificationsQuery } from "./hooks.js";
import { NOTIFICATION_LABELS, NOTIFICATION_ICONS, NOTIFICATION_TONES, notificationMessage } from "../notifications/constants.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";

const TONE_CLASSES = {
  danger: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  success: "text-green-600 dark:text-green-400",
};

function formatDateHeure(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Lecture seule (pas de "marquer lu"/suppression — voir GET /api/moi/notifications,
// qui ne filtre qu'aux types pertinents pour un client final : PRET et
// LIVRAISON_PROCHE, jamais RETARD/IMPAYE, alertes de gestion interne à
// l'atelier — voir backend/src/routes/moi.routes.js).
export default function ClientNotificationsPage() {
  const query = useMesNotificationsQuery();
  const data = query.data?.data ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader icon={Bell} title="Notifications" subtitle="Vos commandes prêtes ou bientôt à livrer." />

      {query.isPending && <LoadingState label="Chargement des notifications…" />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && data.length === 0 && <EmptyState icon={Bell}>Aucune notification pour l'instant.</EmptyState>}

      {query.data && data.length > 0 && (
        <ul className="space-y-2">
          {data.map((notif) => {
            const Icon = NOTIFICATION_ICONS[notif.type];
            const tone = TONE_CLASSES[NOTIFICATION_TONES[notif.type]];
            return (
              <li key={notif.id}>
                <Card variant="outlined" className="flex items-start gap-3">
                  <span className={`shrink-0 mt-0.5 ${tone}`}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold ${tone}`}>{NOTIFICATION_LABELS[notif.type]}</span>
                      <span className="text-xs text-neutral-400">{formatDateHeure(notif.createdAt)}</span>
                    </div>
                    <Link to={`/client/commandes/${notif.commande.id}`} className="text-sm text-neutral-900 dark:text-neutral-100 hover:underline">
                      {notificationMessage(notif)}
                    </Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
