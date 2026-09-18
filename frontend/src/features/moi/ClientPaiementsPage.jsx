import { Link } from "react-router-dom";
import { Wallet } from "lucide-react";
import { useMesPaiementsQuery } from "./hooks.js";
import { modeLabel } from "../commandes/constants.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import { useTranslation } from "../../i18n/index.js";
import { useLocaleStore } from "../../stores/localeStore.js";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

export default function ClientPaiementsPage() {
  const { t } = useTranslation();
  const query = useMesPaiementsQuery();
  const data = query.data?.data ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader icon={Wallet} title={t("client.paiementsTitle")} subtitle={t("client.paiementsSubtitle")} />

      {query.isPending && <LoadingState label={t("client.paiementsLoading")} />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && data.length === 0 && <EmptyState icon={Wallet}>{t("client.paiementsEmpty")}</EmptyState>}

      {query.data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((p) => (
            <Card key={p.id} variant="outlined" className="flex items-center justify-between gap-3 text-sm">
              <div>
                <Link to={`/client/commandes/${p.commande.id}`} className="font-medium text-neutral-900 dark:text-neutral-100 hover:underline">
                  {p.commande.numero}
                </Link>
                <p className="text-neutral-500 text-xs mt-0.5">
                  {formatDate(p.date)} — {modeLabel(p.mode)}
                </p>
              </div>
              <span className="font-semibold tabular-nums text-green-600 dark:text-green-400">{p.montant}</span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
