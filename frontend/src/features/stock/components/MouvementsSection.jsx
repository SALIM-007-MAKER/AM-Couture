import { useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, History } from "lucide-react";
import { useMouvementsQuery, useCreateMouvementMutation } from "../hooks.js";
import { uniteLabel } from "../constants.js";
import { useTranslation } from "../../../i18n/index.js";
import { useLocaleStore } from "../../../stores/localeStore.js";
import { LoadingState, ErrorState, EmptyState, FieldError, GlobalFormError } from "../../../components/QueryState.jsx";
import { inputClass } from "../../../components/FormField.jsx";
import Pagination from "../../../components/Pagination.jsx";
import Card from "../../../components/Card.jsx";
import Button from "../../../components/Button.jsx";
import { ApiError } from "../../../lib/apiClient.js";
import { useCleOperation } from "../../../lib/cleOperation.js";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

function MouvementForm({ articleId, unite }) {
  const { t } = useTranslation();
  const [type, setType] = useState("ENTREE");
  const [quantite, setQuantite] = useState("");
  const [motif, setMotif] = useState("");
  const mutation = useCreateMouvementMutation(articleId);
  // Même saisie = même clé : un double clic n'enregistre pas deux mouvements.
  const cle = useCleOperation(JSON.stringify([articleId, type, quantite, motif]));
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate(
      { data: { type, quantite, motif: motif || undefined }, cle },
      { onSuccess: () => { setQuantite(""); setMotif(""); } },
    );
  }

  return (
    <Card as="form" onSubmit={handleSubmit} variant="outlined" className="space-y-3">
      <GlobalFormError error={mutation.error} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t("stockMore.movement")}</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
            <option value="ENTREE">{t("stockMore.entry")}</option>
            <option value="SORTIE">{t("stockMore.exit")}</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("stockMore.quantity", { unite: uniteLabel(unite) })}
          </span>
          <input
            type="text"
            inputMode="decimal"
            required
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            className={inputClass}
          />
          <FieldError messages={details?.quantite} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("stockMore.reason")}{type === "SORTIE" ? " *" : ""}
          </span>
          <input value={motif} onChange={(e) => setMotif(e.target.value)} required={type === "SORTIE"} maxLength={300} className={inputClass} />
          {type === "SORTIE" && <span className="block text-xs text-neutral-500">{t("stockMore.reasonExitHint")}</span>}
          <FieldError messages={details?.motif} />
        </label>
      </div>
      <Button
        type="submit"
        variant="primary"
        icon={type === "ENTREE" ? ArrowUpCircle : ArrowDownCircle}
        loading={mutation.isPending}
      >
        {type === "ENTREE" ? t("stockMore.recordEntry") : t("stockMore.recordExit")}
      </Button>
    </Card>
  );
}

// Sans en-tête propre : englobé par une SectionTitle "Mouvements" fournie par
// ArticleStockDetailPage.jsx — même convention que PaiementsSection.jsx.
export default function MouvementsSection({ articleId, unite, archived }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const query = useMouvementsQuery(articleId, { page, pageSize: 10 });

  return (
    <div className="space-y-3">
      {archived ? (
        <p className="text-sm text-neutral-500">{t("stock.archivedNotice")}</p>
      ) : (
        <MouvementForm articleId={articleId} unite={unite} />
      )}

      {query.isPending && <LoadingState label={t("stockMore.loadingMovements")} />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && query.data.data.length === 0 && (
        <EmptyState icon={History}>{t("stockMore.emptyMovements")}</EmptyState>
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <Card variant="outlined" padded={false}>
            <ul>
              {query.data.data.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 text-sm px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    {m.type === "ENTREE" ? (
                      <ArrowUpCircle className="size-4 text-green-600 dark:text-green-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <ArrowDownCircle className="size-4 text-red-600 dark:text-red-400 shrink-0" aria-hidden="true" />
                    )}
                    <div>
                      <p className="text-neutral-900 dark:text-neutral-100">{formatDate(m.createdAt)}</p>
                      {m.motif && <p className="text-neutral-500 text-xs">{m.motif}</p>}
                      <p className="text-neutral-400 text-xs">
                        {t(`stockMore.source.${m.source}`)}
                        {m.creePar?.identifiant ? ` · ${t("stockMore.by", { auteur: m.creePar.identifiant })}` : ""}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`tabular-nums font-medium ${
                      m.type === "ENTREE" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {m.type === "ENTREE" ? "+" : "-"}
                    {m.quantite} {uniteLabel(unite)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Pagination
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            total={query.data.meta.total}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
