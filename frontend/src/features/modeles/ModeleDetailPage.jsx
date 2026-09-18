import { Link, useParams } from "react-router-dom";
import { Shirt, Pencil } from "lucide-react";
import { useModeleQuery, useArchiveModeleMutation, useRestoreModeleMutation } from "./hooks.js";
import { categorieLabel } from "./constants.js";
import { LoadingState, ErrorState } from "../../components/QueryState.jsx";
import StatutBadge from "../../components/StatutBadge.jsx";
import ArchiveRestoreControl from "../../components/ArchiveRestoreControl.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { useTranslation } from "../../i18n/index.js";

export default function ModeleDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const modeleQuery = useModeleQuery(id);
  const archiveMutation = useArchiveModeleMutation(id);
  const restoreMutation = useRestoreModeleMutation(id);

  if (modeleQuery.isPending) return <LoadingState label={t("modele.detail.loading")} />;
  if (modeleQuery.isError) return <ErrorState error={modeleQuery.error} onRetry={modeleQuery.refetch} />;

  const modele = modeleQuery.data;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={Shirt}
        title={modele.nom}
        subtitle={
          <span className="flex items-center gap-2">
            <StatutBadge archivedAt={modele.archivedAt} activeLabel={t("common.active")} archivedLabel={t("common.archived")} />
            {categorieLabel(modele.categorie)}
          </span>
        }
        actions={
          <>
            {!modele.archivedAt && (
              <Button as={Link} to={`/modeles/${id}/modifier`} variant="secondary" icon={Pencil}>
                {t("common.edit")}
              </Button>
            )}
            <ArchiveRestoreControl
              archived={Boolean(modele.archivedAt)}
              onArchive={(onSuccess) => archiveMutation.mutate(undefined, { onSuccess })}
              onRestore={(onSuccess) => restoreMutation.mutate(undefined, { onSuccess })}
              isPending={archiveMutation.isPending || restoreMutation.isPending}
              error={archiveMutation.error || restoreMutation.error}
              confirmQuestion={modele.archivedAt ? t("modele.detail.confirmRestore") : t("modele.detail.confirmArchive")}
            />
          </>
        }
      />

      {modele.photoUrl && (
        // photoUrl est soit un data URL base64 (upload via ImageUploadField),
        // soit une URL http(s) déjà enregistrée avant l'introduction de
        // l'upload — simple affichage dans les deux cas, <img> gère les deux.
        <img
          src={modele.photoUrl}
          alt={modele.nom}
          className="max-w-xs rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm"
        />
      )}

      <Card className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <InfoRow label={t("modele.list.colCategory")} value={categorieLabel(modele.categorie)} />
        <InfoRow label={t("modele.list.colPrice")} value={modele.prixIndicatif} />
        {modele.description && (
          <div className="sm:col-span-2">
            <p className="text-neutral-500 text-xs mb-0.5">{t("client.fieldDescription")}</p>
            <p className="text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">{modele.description}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-neutral-500 text-xs mb-0.5">{label}</p>
      <p className="text-neutral-900 dark:text-neutral-100">{value || "—"}</p>
    </div>
  );
}
