import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Package, Save, X } from "lucide-react";
import { useArticleStockQuery, useCreateArticleStockMutation, useUpdateArticleStockMutation } from "./hooks.js";
import { UNITES_STOCK } from "./constants.js";
import { useTranslation } from "../../i18n/index.js";
import { LoadingState, ErrorState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { ApiError } from "../../lib/apiClient.js";

function formStateFrom(article) {
  return {
    nom: article?.nom ?? "",
    categorie: article?.categorie ?? "",
    unite: article?.unite ?? "PIECE",
    seuilAlerte: article?.seuilAlerte ?? "",
    prixUnitaire: article?.prixUnitaire ?? "",
    notes: article?.notes ?? "",
    quantiteInitiale: "",
  };
}

export default function StockFormPage({ mode }) {
  const { id } = useParams();
  const isEdit = mode === "edit";
  const articleQuery = useArticleStockQuery(isEdit ? id : undefined);

  if (isEdit && articleQuery.isPending) return <LoadingState label="Chargement de l'article…" />;
  if (isEdit && articleQuery.isError) return <ErrorState error={articleQuery.error} onRetry={articleQuery.refetch} />;
  // Un article archivé ne peut pas être modifié (règle backend, voir
  // stock.routes.js PATCH) — affiché clairement plutôt que de laisser
  // l'utilisateur remplir un formulaire pour se heurter à un 409.
  if (isEdit && articleQuery.data?.archivedAt) {
    return <ErrorState error={new ApiError(409, "Cet article est archivé : restaurez-le avant de le modifier.")} />;
  }

  return <StockForm key={isEdit ? id : "create"} mode={mode} initial={isEdit ? articleQuery.data : undefined} />;
}

function StockForm({ mode, initial }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === "edit";
  const createMutation = useCreateArticleStockMutation();
  const updateMutation = useUpdateArticleStockMutation(id);
  const mutation = isEdit ? updateMutation : createMutation;

  const [form, setForm] = useState(() => formStateFrom(initial));

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      nom: form.nom,
      categorie: form.categorie || undefined,
      unite: form.unite,
      seuilAlerte: form.seuilAlerte || undefined,
      prixUnitaire: form.prixUnitaire || undefined,
      notes: form.notes || undefined,
      ...(isEdit ? {} : { quantiteInitiale: form.quantiteInitiale || undefined }),
    };
    mutation.mutate(payload, {
      onSuccess: (article) => navigate(`/stock/${article.id}`),
    });
  }

  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  return (
    <div className="max-w-xl space-y-5">
      <PageHeader icon={Package} title={isEdit ? t("stock.editArticle") : t("stock.newArticle")} />

      <Card as="form" onSubmit={handleSubmit} className="space-y-4">
        <GlobalFormError error={mutation.error} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nom" required>
            <input required value={form.nom} onChange={(e) => update("nom", e.target.value)} className={inputClass} />
            <FieldError messages={details?.nom} />
          </Field>
          <Field label="Catégorie">
            <input
              value={form.categorie}
              onChange={(e) => update("categorie", e.target.value)}
              placeholder="Tissu, fourniture..."
              className={inputClass}
            />
            <FieldError messages={details?.categorie} />
          </Field>
          <Field label="Unité">
            <select value={form.unite} onChange={(e) => update("unite", e.target.value)} className={inputClass}>
              {UNITES_STOCK.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
            <FieldError messages={details?.unite} />
          </Field>
          <Field label="Seuil d'alerte" hint="Notification quand la quantité descend à ce niveau ou en dessous.">
            <input
              type="text"
              inputMode="decimal"
              value={form.seuilAlerte}
              onChange={(e) => update("seuilAlerte", e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.seuilAlerte} />
          </Field>
          <Field label="Prix unitaire">
            <input
              type="text"
              inputMode="decimal"
              value={form.prixUnitaire}
              onChange={(e) => update("prixUnitaire", e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.prixUnitaire} />
          </Field>
          {!isEdit && (
            <Field label="Quantité initiale" hint="Enregistrée comme premier mouvement (entrée).">
              <input
                type="text"
                inputMode="decimal"
                value={form.quantiteInitiale}
                onChange={(e) => update("quantiteInitiale", e.target.value)}
                className={inputClass}
              />
              <FieldError messages={details?.quantiteInitiale} />
            </Field>
          )}
        </div>

        <Field label="Notes">
          <textarea rows={3} value={form.notes} onChange={(e) => update("notes", e.target.value)} className={inputClass} />
          <FieldError messages={details?.notes} />
        </Field>

        <div className="flex gap-2 pt-1">
          <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending}>
            Enregistrer
          </Button>
          <Button type="button" variant="secondary" icon={X} onClick={() => navigate(-1)}>
            Annuler
          </Button>
        </div>
      </Card>
    </div>
  );
}
