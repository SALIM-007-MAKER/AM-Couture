import { useState } from "react";
import { Ruler } from "lucide-react";
import { useMesuresQuery } from "../hooks.js";
import { MESURE_FIELDS } from "../constants.js";
import { LoadingState, ErrorState, EmptyState } from "../../../components/QueryState.jsx";
import Pagination from "../../../components/Pagination.jsx";
import Card from "../../../components/Card.jsx";

const PAGE_SIZE = 5;

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

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
      {data.data.map((mesure) => {
        const populated = MESURE_FIELDS.filter((f) => mesure[f.name] != null);
        return (
          <Card key={mesure.id} variant="outlined">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {formatDate(mesure.createdAt)}
            </p>
            {populated.length > 0 ? (
              <dl className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                {populated.map((f) => (
                  <div key={f.name} className="flex justify-between gap-2">
                    <dt className="text-neutral-500">{f.label}</dt>
                    <dd className="text-neutral-900 dark:text-neutral-100">{mesure[f.name]} cm</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-neutral-500 mt-1">Aucune mesure structurée renseignée.</p>
            )}
            {mesure.autres && Object.keys(mesure.autres).length > 0 && (
              <dl className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                {Object.entries(mesure.autres).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-neutral-500">{label}</dt>
                    <dd className="text-neutral-900 dark:text-neutral-100">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {mesure.notes && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{mesure.notes}</p>}
          </Card>
        );
      })}
      <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
    </div>
  );
}
