import { Ruler } from "lucide-react";
import { useMesMesuresQuery } from "./hooks.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import MesureCard from "../clientes/components/MesureCard.jsx";

export default function ClientMesuresPage() {
  const query = useMesMesuresQuery();
  const data = query.data?.data ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader icon={Ruler} title="Mes mesures" subtitle="Historique des prises de mesure de votre atelier." />

      {query.isPending && <LoadingState label="Chargement de vos mesures…" />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && data.length === 0 && <EmptyState icon={Ruler}>Aucune mesure enregistrée pour l'instant.</EmptyState>}

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
