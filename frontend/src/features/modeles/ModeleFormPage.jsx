import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Shirt, Save, X } from "lucide-react";
import { useModeleQuery, useCreateModeleMutation, useUpdateModeleMutation } from "./hooks.js";
import { CATEGORIES_VETEMENT } from "./constants.js";
import { LoadingState, ErrorState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import ImageUploadField from "../../components/ImageUploadField.jsx";
import { ApiError } from "../../lib/apiClient.js";

function formStateFrom(modele) {
  return {
    nom: modele?.nom ?? "",
    categorie: modele?.categorie ?? "",
    description: modele?.description ?? "",
    prixIndicatif: modele?.prixIndicatif ?? "",
    photoUrl: modele?.photoUrl ?? "",
  };
}

export default function ModeleFormPage({ mode }) {
  const { id } = useParams();
  const isEdit = mode === "edit";
  const modeleQuery = useModeleQuery(isEdit ? id : undefined);

  if (isEdit && modeleQuery.isPending) return <LoadingState label="Chargement du modèle…" />;
  if (isEdit && modeleQuery.isError) return <ErrorState error={modeleQuery.error} onRetry={modeleQuery.refetch} />;
  // Un modèle archivé ne peut pas être modifié (règle backend, voir
  // modeles.routes.js PATCH) — affiché clairement plutôt que de laisser
  // l'utilisateur remplir un formulaire pour se heurter à un 409.
  if (isEdit && modeleQuery.data?.archivedAt) {
    return <ErrorState error={new ApiError(409, "Ce modèle est archivé : restaurez-le avant de le modifier.")} />;
  }

  // `key` force un nouveau montage (donc un nouvel état initial dérivé
  // directement des données) une fois le modèle chargé en mode édition —
  // évite un useEffect+setState pour préremplir un formulaire à partir
  // d'une donnée arrivée de façon asynchrone.
  return <ModeleForm key={isEdit ? id : "create"} mode={mode} initial={isEdit ? modeleQuery.data : undefined} />;
}

function ModeleForm({ mode, initial }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === "edit";
  const createMutation = useCreateModeleMutation();
  const updateMutation = useUpdateModeleMutation(id);
  const mutation = isEdit ? updateMutation : createMutation;

  const [form, setForm] = useState(() => formStateFrom(initial));

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      nom: form.nom,
      categorie: form.categorie,
      description: form.description || undefined,
      prixIndicatif: form.prixIndicatif || undefined,
      photoUrl: form.photoUrl || undefined,
    };
    mutation.mutate(payload, {
      onSuccess: (modele) => navigate(`/modeles/${modele.id}`),
    });
  }

  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  return (
    <div className="max-w-xl space-y-5">
      <PageHeader icon={Shirt} title={isEdit ? "Modifier le modèle" : "Nouveau modèle"} />

      <Card as="form" onSubmit={handleSubmit} className="space-y-4">
        <GlobalFormError error={mutation.error} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nom" required>
            <input required value={form.nom} onChange={(e) => update("nom", e.target.value)} className={inputClass} />
            <FieldError messages={details?.nom} />
          </Field>
          <Field label="Catégorie" required>
            <select
              required
              value={form.categorie}
              onChange={(e) => update("categorie", e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                Choisir…
              </option>
              {CATEGORIES_VETEMENT.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <FieldError messages={details?.categorie} />
          </Field>
          <Field label="Prix indicatif">
            <input
              type="text"
              inputMode="decimal"
              value={form.prixIndicatif}
              onChange={(e) => update("prixIndicatif", e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.prixIndicatif} />
          </Field>
          <Field label="Photo">
            <ImageUploadField value={form.photoUrl} onChange={(v) => update("photoUrl", v)} previewClassName="h-24 w-20 object-cover" />
            <FieldError messages={details?.photoUrl} />
          </Field>
        </div>

        <Field label="Description">
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            className={inputClass}
          />
          <FieldError messages={details?.description} />
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
