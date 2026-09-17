import { useState } from "react";
import { Ruler } from "lucide-react";
import { useMesuresQuery } from "../hooks.js";
import { LoadingState, ErrorState, EmptyState } from "../../../components/QueryState.jsx";
import Pagination from "../../../components/Pagination.jsx";
import MesureCard from "./MesureCard.jsx";

const PAGE_SIZE = 5;

export default function MesuresHistory({ clienteId }) {
  const [page, setPage] = useState(1);
  const { data, isPending, isError, error, refetch } = useMesuresQuery(clienteId, { page, pageSize: PAGE_SIZE });

  // isPending, pas isLoading — voir le commentaire détaillé dans
  // ClienteDetailPage.jsx (`data.data.length` plus bas planterait sinon sur
  // un faux négatif de isLoading sous TanStack Query v5).
  if (isPending) return <LoadingState label="Chargement des mesures…" />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;
  if (data.data.length === 0)
    return <EmptyState icon={Ruler}>Aucune mesure enregistrée pour ce client.</EmptyState>;

  return (
    <div className="space-y-3">
      {data.data.map((mesure) => (
        <MesureCard key={mesure.id} mesure={mesure} />
      ))}
      <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
    </div>
  );
}
