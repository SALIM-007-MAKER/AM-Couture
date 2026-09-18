import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { User, Save, X } from "lucide-react";
import { useClienteQuery, useCreateClienteMutation, useUpdateClienteMutation } from "./hooks.js";
import { SEXE_OPTIONS } from "./constants.js";
import { LoadingState, ErrorState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { ApiError } from "../../lib/apiClient.js";

function formStateFrom(cliente) {
  return {
    nom: cliente?.nom ?? "",
    prenom: cliente?.prenom ?? "",
    telephone: cliente?.telephone ?? "",
    telephone2: cliente?.telephone2 ?? "",
    email: cliente?.email ?? "",
    adresse: cliente?.adresse ?? "",
    sexe: cliente?.sexe ?? "",
    notes: cliente?.notes ?? "",
  };
}

export default function ClienteFormPage({ mode }) {
  const { id } = useParams();
  const isEdit = mode === "edit";
  const clienteQuery = useClienteQuery(isEdit ? id : undefined);

  // isPending, pas isLoading — voir le commentaire détaillé dans
  // ClienteDetailPage.jsx (bug réel de "flash de formulaire vide" trouvé
  // avec isLoading sous TanStack Query v5).
  if (isEdit && clienteQuery.isPending) return <LoadingState label="Chargement de la fiche…" />;
  if (isEdit && clienteQuery.isError) return <ErrorState error={clienteQuery.error} onRetry={clienteQuery.refetch} />;
  // Une fiche archivée ne peut pas être modifiée (règle backend, voir
  // clientes.routes.js PATCH) — on l'affiche clairement plutôt que de
  // laisser l'utilisateur remplir un formulaire pour se heurter à un 409.
  if (isEdit && clienteQuery.data?.archivedAt) {
    return <ErrorState error={new ApiError(409, "Ce client est archivé : restaurez-le avant de le modifier.")} />;
  }

  // `key` force un nouveau montage (donc un nouvel état initial) une fois la
  // fiche chargée en mode édition — évite un useEffect+setState pour
  // préremplir un formulaire à partir d'une donnée arrivée de façon
  // asynchrone : l'état initial est dérivé directement au montage.
  return <ClienteForm key={isEdit ? id : "create"} mode={mode} initial={isEdit ? clienteQuery.data : undefined} />;
}

function ClienteForm({ mode, initial }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === "edit";
  const createMutation = useCreateClienteMutation();
  const updateMutation = useUpdateClienteMutation(id);
  const mutation = isEdit ? updateMutation : createMutation;

  const [form, setForm] = useState(() => formStateFrom(initial));

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    // Champs vides envoyés en `undefined` plutôt qu'en chaîne vide : le
    // backend traite déjà "" comme "non fourni" pour les champs optionnels,
    // mais autant rester explicite côté client.
    const payload = {
      nom: form.nom,
      prenom: form.prenom,
      telephone: form.telephone,
      telephone2: form.telephone2 || undefined,
      email: form.email || undefined,
      adresse: form.adresse || undefined,
      sexe: form.sexe || undefined,
      notes: form.notes || undefined,
    };
    mutation.mutate(payload, {
      onSuccess: (cliente) => navigate(`/clientes/${cliente.id}`),
    });
  }

  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  return (
    <div className="max-w-xl space-y-5">
      <PageHeader icon={User} title={isEdit ? "Modifier le client" : "Nouveau client"} />

      <Card as="form" onSubmit={handleSubmit} className="space-y-4">
        <GlobalFormError error={mutation.error} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nom" required>
            <input
              required
              value={form.nom}
              onChange={(e) => update("nom", e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.nom} />
          </Field>
          <Field label="Prénom" required>
            <input
              required
              value={form.prenom}
              onChange={(e) => update("prenom", e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.prenom} />
          </Field>
          <Field label="Téléphone" required>
            <input
              required
              value={form.telephone}
              onChange={(e) => update("telephone", e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.telephone} />
          </Field>
          <Field label="Téléphone 2">
            <input
              value={form.telephone2}
              onChange={(e) => update("telephone2", e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.telephone2} />
          </Field>
          <Field label="Email" hint="Optionnel — permet d'envoyer automatiquement le lien d'invitation.">
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.email} />
          </Field>
          <Field label="Sexe">
            <select value={form.sexe} onChange={(e) => update("sexe", e.target.value)} className={inputClass}>
              <option value="">Non précisé</option>
              {SEXE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <FieldError messages={details?.sexe} />
          </Field>
          <Field label="Adresse">
            <input
              value={form.adresse}
              onChange={(e) => update("adresse", e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.adresse} />
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            className={inputClass}
          />
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
