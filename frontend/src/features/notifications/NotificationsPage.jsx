import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, Trash2, Check, X, Inbox, ArrowRight } from "lucide-react";
import {
  useNotificationsQuery,
  useNombreNonLuesQuery,
  useMarquerLuMutation,
  useMarquerLuMasseMutation,
  useSupprimerMasseMutation,
} from "./hooks.js";
import { NOTIFICATION_LABELS, NOTIFICATION_ICONS, NOTIFICATION_TONES, notificationMessage } from "./constants.js";
import { LoadingState, ErrorState, EmptyState, GlobalFormError } from "../../components/QueryState.jsx";
import Pagination from "../../components/Pagination.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import PageHeader from "../../components/PageHeader.jsx";

const PAGE_SIZE = 20;

const TONE_CLASSES = {
  danger: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  success: "text-green-600 dark:text-green-400",
};

function formatDateHeure(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const FILTRES = [
  { value: "", label: "Toutes" },
  { value: "false", label: "Non lues" },
  { value: "true", label: "Lues" },
];

export default function NotificationsPage() {
  const [filtreLu, setFiltreLu] = useState("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const query = useNotificationsQuery({ lu: filtreLu || undefined, page, pageSize: PAGE_SIZE });
  const nombreQuery = useNombreNonLuesQuery();
  const marquerLuMutation = useMarquerLuMutation();
  const marquerLuMasseMutation = useMarquerLuMasseMutation();
  const supprimerMasseMutation = useSupprimerMasseMutation();

  const data = query.data?.data ?? [];

  function changerFiltre(next) {
    setFiltreLu(next);
    setPage(1);
    setSelection(new Set());
  }

  function toggleSelection(id) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelection((prev) => (prev.size === data.length ? new Set() : new Set(data.map((n) => n.id))));
  }

  function handleMarquerLuMasse() {
    marquerLuMasseMutation.mutate([...selection], { onSuccess: () => setSelection(new Set()) });
  }

  function handleSupprimerMasse() {
    supprimerMasseMutation.mutate([...selection], {
      onSuccess: () => {
        setSelection(new Set());
        setConfirmingDelete(false);
      },
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={Bell}
        title="Notifications"
        subtitle="Alertes automatiques : retards, commandes prêtes, livraisons proches, impayés."
      />

      {/* Les demandes de commande des clients comptent dans la pastille de la
          cloche (voir GET /notifications/nombre-non-lues) mais ne sont PAS
          des Notification au sens du schéma (pas liées à une Commande) —
          jamais listées ci-dessous, seulement rappelées ici pour que le
          total affiché par la cloche reste explicable, avec un lien direct
          vers leur propre page de gestion. */}
      {nombreQuery.data?.demandes > 0 && (
        <Link to="/demandes">
          <Card
            variant="outlined"
            className="flex items-center justify-between gap-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
          >
            <span className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Inbox className="size-4 shrink-0" aria-hidden="true" />
              {nombreQuery.data.demandes} demande{nombreQuery.data.demandes > 1 ? "s" : ""} de commande en attente de
              traitement.
            </span>
            <ArrowRight className="size-4 shrink-0 text-neutral-400" aria-hidden="true" />
          </Card>
        </Link>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          {FILTRES.map((f) => (
            <Button
              key={f.value}
              variant={filtreLu === f.value ? "primary" : "secondary"}
              size="sm"
              onClick={() => changerFiltre(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        {selection.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-neutral-500">{selection.size} sélectionnée(s)</span>
            <Button
              variant="secondary"
              size="sm"
              icon={CheckCheck}
              loading={marquerLuMasseMutation.isPending}
              onClick={handleMarquerLuMasse}
            >
              Marquer comme lues
            </Button>
            {confirmingDelete ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  icon={Check}
                  loading={supprimerMasseMutation.isPending}
                  onClick={handleSupprimerMasse}
                >
                  Confirmer
                </Button>
                <Button variant="secondary" size="sm" icon={X} onClick={() => setConfirmingDelete(false)}>
                  Annuler
                </Button>
              </>
            ) : (
              <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={() => setConfirmingDelete(true)}>
                Supprimer
              </Button>
            )}
          </div>
        )}
      </div>

      <GlobalFormError error={marquerLuMasseMutation.error || supprimerMasseMutation.error} />

      {query.isPending && <LoadingState label="Chargement des notifications…" />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && data.length === 0 && <EmptyState icon={Bell}>Aucune notification pour l'instant.</EmptyState>}

      {query.data && data.length > 0 && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-neutral-500 px-1">
            <input type="checkbox" checked={selection.size === data.length} onChange={toggleSelectAll} />
            Tout sélectionner sur cette page
          </label>
          <ul className="space-y-2">
            {data.map((notif) => {
              const Icon = NOTIFICATION_ICONS[notif.type];
              const tone = TONE_CLASSES[NOTIFICATION_TONES[notif.type]];
              return (
                <li key={notif.id}>
                  <Card variant="outlined" className={`flex items-start gap-3 ${notif.lu ? "opacity-60" : ""}`}>
                    <input
                      type="checkbox"
                      className="mt-1 shrink-0"
                      checked={selection.has(notif.id)}
                      onChange={() => toggleSelection(notif.id)}
                      aria-label="Sélectionner cette notification"
                    />
                    <span className={`shrink-0 mt-0.5 ${tone}`}>
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold ${tone}`}>{NOTIFICATION_LABELS[notif.type]}</span>
                        <span className="text-xs text-neutral-400">{formatDateHeure(notif.createdAt)}</span>
                      </div>
                      <Link
                        to={`/commandes/${notif.commande.id}`}
                        className="text-sm text-neutral-900 dark:text-neutral-100 hover:underline"
                      >
                        {notif.commande.cliente.nom} {notif.commande.cliente.prenom} — {notificationMessage(notif)}
                      </Link>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      loading={marquerLuMutation.isPending && marquerLuMutation.variables?.id === notif.id}
                      onClick={() => marquerLuMutation.mutate({ id: notif.id, lu: !notif.lu })}
                    >
                      {notif.lu ? "Marquer non lue" : "Marquer lue"}
                    </Button>
                  </Card>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            total={query.data.meta.total}
            onChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
