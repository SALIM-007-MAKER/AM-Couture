import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Ruler, Plus, Trash2, Save, X } from "lucide-react";
import { useClienteQuery, useCreateMesureMutation } from "./hooks.js";
import { MESURE_FIELDS, MESURE_GROUPS } from "./constants.js";
import { LoadingState, ErrorState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import Disclosure from "../../components/Disclosure.jsx";
import { ApiError } from "../../lib/apiClient.js";
import { useTranslation } from "../../i18n/index.js";

const EMPTY_VALUES = Object.fromEntries(MESURE_FIELDS.map((f) => [f.name, ""]));
const FIELD_BY_NAME = Object.fromEntries(MESURE_FIELDS.map((f) => [f.name, f]));

export default function MesureFormPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const clienteQuery = useClienteQuery(id);
  const createMesure = useCreateMesureMutation(id);

  const [values, setValues] = useState(EMPTY_VALUES);
  const [notes, setNotes] = useState("");
  // Mesures libres non prévues par le formulaire structuré (champ Json
  // `autres` du backend) : simple liste répétable {libellé, valeur}.
  const [autresRows, setAutresRows] = useState([]);

  // isPending, pas isLoading — voir le commentaire détaillé dans
  // ClienteDetailPage.jsx (`cliente.nom` plus bas planterait sinon toute la
  // page sur un faux négatif de isLoading sous TanStack Query v5).
  if (clienteQuery.isPending) return <LoadingState label={t("mesure.form.loadingClient")} />;
  if (clienteQuery.isError) return <ErrorState error={clienteQuery.error} onRetry={clienteQuery.refetch} />;
  if (clienteQuery.data?.archivedAt) {
    return (
      <ErrorState
        error={new ApiError(409, t("mesure.form.archivedError"))}
      />
    );
  }

  function updateValue(field, v) {
    setValues((prev) => ({ ...prev, [field]: v }));
  }

  function addAutreRow() {
    setAutresRows((rows) => [...rows, { key: "", value: "" }]);
  }
  function updateAutreRow(index, patch) {
    setAutresRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function removeAutreRow(index) {
    setAutresRows((rows) => rows.filter((_, i) => i !== index));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {};
    for (const field of MESURE_FIELDS) {
      const v = values[field.name].trim();
      if (v !== "") payload[field.name] = v;
    }
    if (notes.trim()) payload.notes = notes.trim();
    const autres = Object.fromEntries(
      autresRows.filter((r) => r.key.trim() !== "").map((r) => [r.key.trim(), r.value.trim()]),
    );
    if (Object.keys(autres).length > 0) payload.autres = autres;

    createMesure.mutate(payload, {
      onSuccess: () => navigate(`/clientes/${id}`),
    });
  }

  const details = createMesure.error instanceof ApiError ? createMesure.error.details : undefined;
  const cliente = clienteQuery.data;

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader
        icon={Ruler}
        title={t("mesure.form.title")}
        subtitle={t("mesure.form.subtitle", { nom: `${cliente.nom} ${cliente.prenom}` })}
      />

      <Card as="form" onSubmit={handleSubmit} className="space-y-4">
        <GlobalFormError error={createMesure.error} />

        <div className="space-y-3">
          {MESURE_GROUPS.map((group) => (
            <Disclosure key={group.key} label={group.label} defaultOpen>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {group.fields.map((name) => {
                  const field = FIELD_BY_NAME[name];
                  return (
                    <label key={name} className="block space-y-1">
                      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{field.label}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder={t("mesure.form.unit")}
                        value={values[name]}
                        onChange={(e) => updateValue(name, e.target.value)}
                        className={inputClass}
                      />
                      <FieldError messages={details?.[name]} />
                    </label>
                  );
                })}
              </div>
            </Disclosure>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t("mesure.form.extra")}
            </span>
            <Button type="button" variant="ghost" size="sm" icon={Plus} onClick={addAutreRow}>
              {t("mesure.form.add")}
            </Button>
          </div>
          {autresRows.map((row, i) => (
            <div key={i} className="flex gap-2 items-start">
              <input
                type="text"
                placeholder={t("mesure.form.labelPlaceholder")}
                value={row.key}
                onChange={(e) => updateAutreRow(i, { key: e.target.value })}
                className={inputClass}
              />
              <input
                type="text"
                placeholder={t("mesure.form.valuePlaceholder")}
                value={row.value}
                onChange={(e) => updateAutreRow(i, { value: e.target.value })}
                className={inputClass}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={Trash2}
                onClick={() => removeAutreRow(i)}
                aria-label={t("mesure.form.removeRow")}
                className="shrink-0"
              />
            </div>
          ))}
          <FieldError messages={details?.autres} />
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t("cli.detail.notes")}</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          <FieldError messages={details?.notes} />
        </label>

        <div className="flex gap-2 pt-1">
          <Button type="submit" variant="primary" icon={Save} loading={createMesure.isPending}>
            {t("common.save")}
          </Button>
          <Button type="button" variant="secondary" icon={X} onClick={() => navigate(-1)}>
            {t("common.cancel")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
