import { Ruler } from "lucide-react";
import { useMesMesuresQuery } from "./hooks.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import MesureCard from "../clientes/components/MesureCard.jsx";
import { useTranslation } from "../../i18n/index.js";

export default function ClientMesuresPage() {
  const { t } = useTranslation();
  const query = useMesMesuresQuery();
  const data = query.data?.data ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader icon={Ruler} title={t("client.mesuresTitle")} subtitle={t("client.mesuresSubtitle")} />

      {query.isPending && <LoadingState label={t("client.mesuresLoading")} />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && data.length === 0 && <EmptyState icon={Ruler}>{t("client.mesuresEmpty")}</EmptyState>}

      {query.data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((mesure) => (
            <MesureCard key={mesure.id} mesure={mesure} />
          ))}
        </div>
      )}
    </div>
  );
}
