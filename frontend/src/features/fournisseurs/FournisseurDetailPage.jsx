import { Link, useParams } from "react-router-dom";
import { Store, Pencil } from "lucide-react";
import { useFournisseurQuery, useArchiveFournisseurMutation, useRestoreFournisseurMutation } from "./hooks.js";
import { useCan } from "../../hooks/usePermissions.js";
import { LoadingState, ErrorState } from "../../components/QueryState.jsx";
import StatutBadge from "../../components/StatutBadge.jsx";
import ArchiveRestoreControl from "../../components/ArchiveRestoreControl.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { useTranslation } from "../../i18n/index.js";

function InfoRow({ label, value, wide }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <p className="text-neutral-500 text-xs mb-0.5">{label}</p>
      <p className="text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">{value || "—"}</p>
    </div>
  );
}

export default function FournisseurDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const can = useCan();
  const query = useFournisseurQuery(id);
  const archive = useArchiveFournisseurMutation(id);
  const restore = useRestoreFournisseurMutation(id);

  if (query.isPending) return <LoadingState label={t("fou.loadingOne")} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const f = query.data;
  const ecriture = can("fournisseurs.ecrire");

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={Store}
        title={f.nom}
        subtitle={<StatutBadge archivedAt={f.archivedAt} activeLabel={t("common.active")} archivedLabel={t("common.archived")} />}
        actions={
          ecriture && (
            <>
              {!f.archivedAt && (
                <Button as={Link} to={`/fournisseurs/${id}/modifier`} variant="secondary" icon={Pencil}>
                  {t("common.edit")}
                </Button>
              )}
              <ArchiveRestoreControl
                archived={Boolean(f.archivedAt)}
                onArchive={(onSuccess) => archive.mutate(undefined, { onSuccess })}
                onRestore={(onSuccess) => restore.mutate(undefined, { onSuccess })}
                isPending={archive.isPending || restore.isPending}
                error={archive.error || restore.error}
                confirmQuestion={f.archivedAt ? t("fou.confirmRestore") : t("fou.confirmArchive")}
              />
            </>
          )
        }
      />
      <Card className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <InfoRow label={t("fou.contact")} value={f.contact} />
        <InfoRow label={t("fou.phone")} value={f.telephone} />
        <InfoRow label={t("fou.email")} value={f.email} />
        <InfoRow label={t("fou.address")} value={f.adresse} />
        <InfoRow label={t("fou.notes")} value={f.notes} wide />
      </Card>
    </div>
  );
}
