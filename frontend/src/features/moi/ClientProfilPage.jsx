import { User } from "lucide-react";
import { useMonProfilQuery } from "./hooks.js";
import { SEXE_OPTIONS } from "../clientes/constants.js";
import { LoadingState, ErrorState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import { useTranslation } from "../../i18n/index.js";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-neutral-500 text-xs mb-0.5">{label}</p>
      <p className="text-neutral-900 dark:text-neutral-100">{value || "—"}</p>
    </div>
  );
}

export default function ClientProfilPage() {
  const { t } = useTranslation();
  const query = useMonProfilQuery();

  if (query.isPending) return <LoadingState label={t("client.profilLoading")} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const cliente = query.data;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader icon={User} title={`${cliente.nom} ${cliente.prenom}`} subtitle={t("client.profilSubtitle")} />
      <Card className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <InfoRow label={t("client.fieldTelephone")} value={cliente.telephone} />
        <InfoRow label={t("client.fieldTelephone2")} value={cliente.telephone2} />
        <InfoRow label={t("client.fieldEmail")} value={cliente.email} />
        <InfoRow label={t("client.fieldSexe")} value={SEXE_OPTIONS.find((o) => o.value === cliente.sexe)?.label} />
        <InfoRow label={t("client.fieldAdresse")} value={cliente.adresse} />
        <InfoRow label={t("client.fieldClientDepuis")} value={formatDate(cliente.createdAt)} />
      </Card>
      <p className="text-xs text-neutral-500">{t("client.profilEditNote")}</p>
    </div>
  );
}
