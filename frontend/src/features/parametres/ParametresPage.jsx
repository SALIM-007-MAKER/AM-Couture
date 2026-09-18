import { useState } from "react";
import { Settings, Plus, Trash2, Save, CheckCircle2, Store, FileText, SunMoon } from "lucide-react";
import { useParametresQuery, usePutParametresMutation, usePatchParametresMutation } from "./hooks.js";
import { LoadingState, ErrorState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import ImageUploadField from "../../components/ImageUploadField.jsx";
import ThemeSwitcher from "../../components/ThemeSwitcher.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import { ApiError } from "../../lib/apiClient.js";
import { useTranslation } from "../../i18n/index.js";

function formStateFrom(atelier) {
  return {
    nom: atelier?.nom ?? "",
    devise: atelier?.devise ?? "FCFA",
    telephone: atelier?.telephone ?? "",
    adresse: atelier?.adresse ?? "",
    slogan: atelier?.slogan ?? "",
    logoUrl: atelier?.logoUrl ?? "",
  };
}

function recuConfigRowsFrom(atelier) {
  const config = atelier?.recuConfig;
  if (!config || typeof config !== "object") return [];
  return Object.entries(config).map(([key, value]) => ({ key, value: String(value) }));
}

export default function ParametresPage() {
  const { t } = useTranslation();
  const query = useParametresQuery();

  if (query.isPending) return <LoadingState label={t("param.loading")} />;
  // Un 404 signifie "pas encore configuré" — état normal (première
  // utilisation), pas une erreur à afficher comme telle : le formulaire
  // s'affiche directement en mode création (voir putParametresSchema,
  // backend). Toute autre erreur reste un vrai ErrorState.
  const notConfigured = query.isError && query.error instanceof ApiError && query.error.status === 404;
  if (query.isError && !notConfigured) {
    return <ErrorState error={query.error} onRetry={query.refetch} />;
  }

  const configured = !notConfigured;
  return <ParametresForm key={configured ? "edit" : "create"} configured={configured} initial={configured ? query.data : undefined} />;
}

function ParametresForm({ configured, initial }) {
  const { t } = useTranslation();
  const putMutation = usePutParametresMutation();
  const patchMutation = usePatchParametresMutation();
  const mutation = configured ? patchMutation : putMutation;

  const [form, setForm] = useState(() => formStateFrom(initial));
  const [recuConfigRows, setRecuConfigRows] = useState(() => recuConfigRowsFrom(initial));
  const [savedMessage, setSavedMessage] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function addRow() {
    setRecuConfigRows((rows) => [...rows, { key: "", value: "" }]);
  }
  function updateRow(index, patch) {
    setRecuConfigRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function removeRow(index) {
    setRecuConfigRows((rows) => rows.filter((_, i) => i !== index));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setSavedMessage(false);
    const recuConfig = Object.fromEntries(
      recuConfigRows.filter((r) => r.key.trim() !== "").map((r) => [r.key.trim(), r.value.trim()]),
    );
    const payload = {
      nom: form.nom,
      devise: form.devise,
      telephone: form.telephone || undefined,
      adresse: form.adresse || undefined,
      slogan: form.slogan || undefined,
      logoUrl: form.logoUrl || undefined,
      ...(Object.keys(recuConfig).length > 0 ? { recuConfig } : {}),
    };
    mutation.mutate(payload, { onSuccess: () => setSavedMessage(true) });
  }

  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        icon={Settings}
        title={t("param.title")}
        subtitle={
          !configured
            ? t("param.notConfigured")
            : undefined
        }
      />

      {/* Hors du <form> : préférence purement locale (voir stores/themeStore.js),
          appliquée immédiatement au clic — sans rapport avec la configuration
          de l'atelier ci-dessous, donc pas soumise avec "Enregistrer". */}
      <div className="space-y-3">
        <SectionTitle icon={SunMoon}>{t("param.appearance")}</SectionTitle>
        <Card className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{t("param.theme")}</p>
            <p className="text-xs text-neutral-500">
              {t("param.themeHint")}
            </p>
          </div>
          <ThemeSwitcher />
        </Card>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <GlobalFormError error={mutation.error} />
        {savedMessage && !mutation.isPending && (
          <p className="flex items-center gap-2 rounded-xl bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-400 text-sm px-3 py-2 animate-fade-in">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {t("param.saved")}
          </p>
        )}

        <div className="space-y-3">
          <SectionTitle icon={Store}>{t("param.workshop")}</SectionTitle>
          <Card className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("param.workshopName")} required>
              <input required value={form.nom} onChange={(e) => update("nom", e.target.value)} className={inputClass} />
              <FieldError messages={details?.nom} />
            </Field>
            <Field label={t("param.currency")} required>
              <input required value={form.devise} onChange={(e) => update("devise", e.target.value)} className={inputClass} />
              <FieldError messages={details?.devise} />
            </Field>
            <Field label={t("client.fieldTelephone")}>
              <input value={form.telephone} onChange={(e) => update("telephone", e.target.value)} className={inputClass} />
              <FieldError messages={details?.telephone} />
            </Field>
            <Field label={t("client.fieldAdresse")}>
              <input value={form.adresse} onChange={(e) => update("adresse", e.target.value)} className={inputClass} />
              <FieldError messages={details?.adresse} />
            </Field>
            <Field label={t("param.slogan")}>
              <input value={form.slogan} onChange={(e) => update("slogan", e.target.value)} className={inputClass} />
              <FieldError messages={details?.slogan} />
            </Field>
            <Field label={t("param.logo")}>
              <ImageUploadField
                value={form.logoUrl}
                onChange={(v) => update("logoUrl", v)}
                alt={t("nav.workshopLogoAlt")}
                previewClassName="h-16 w-16 object-contain bg-white dark:bg-neutral-800"
              />
              <FieldError messages={details?.logoUrl} />
            </Field>
          </Card>
        </div>

        <div className="space-y-3">
          <SectionTitle
            icon={FileText}
            actions={
              <Button type="button" variant="ghost" size="sm" icon={Plus} onClick={addRow}>
                {t("mesure.form.add")}
              </Button>
            }
          >
            {t("param.receiptsTitle")}
          </SectionTitle>
          <Card className="space-y-3">
            <p className="text-xs text-neutral-500">
              {t("param.receiptsHint")}
            </p>
            {recuConfigRows.length === 0 && (
              <p className="text-sm text-neutral-400 italic">{t("param.receiptsEmpty")}</p>
            )}
            {recuConfigRows.map((row, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input
                  type="text"
                  placeholder={t("param.keyPlaceholder")}
                  value={row.key}
                  onChange={(e) => updateRow(i, { key: e.target.value })}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder={t("mesure.form.valuePlaceholder")}
                  value={row.value}
                  onChange={(e) => updateRow(i, { value: e.target.value })}
                  className={inputClass}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={Trash2}
                  onClick={() => removeRow(i)}
                  aria-label={t("mesure.form.removeRow")}
                  className="shrink-0"
                />
              </div>
            ))}
            <FieldError messages={details?.recuConfig} />
          </Card>
        </div>

        <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending}>
          {t("common.save")}
        </Button>
      </form>
    </div>
  );
}
