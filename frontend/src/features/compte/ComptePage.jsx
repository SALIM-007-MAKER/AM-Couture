import { useState } from "react";
import { UserCircle, Languages, KeyRound, Save, CheckCircle2 } from "lucide-react";
import { useMeQuery } from "../../hooks/useAuth.js";
import { useUpdatePreferencesMutation, useChangerMotDePasseMutation } from "./hooks.js";
import { LANGUES_DISPONIBLES } from "./constants.js";
import { useTranslation } from "../../i18n/index.js";
import { LoadingState, ErrorState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import { ApiError } from "../../lib/apiClient.js";

export default function ComptePage() {
  const { t } = useTranslation();
  const meQuery = useMeQuery();

  if (meQuery.isPending) return <LoadingState label={t("account.loading")} />;
  if (meQuery.isError) return <ErrorState error={meQuery.error} onRetry={meQuery.refetch} />;

  return <ComptePageContent user={meQuery.data} />;
}

function ComptePageContent({ user }) {
  const { t } = useTranslation();
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader icon={UserCircle} title={t("nav.myAccount")} subtitle={t("account.connectedAs", { identifiant: user.identifiant })} />
      <LangueSection user={user} />
      <MotDePasseSection />
    </div>
  );
}

// "Langue" — application immédiate au changement (comme ThemeSwitcher,
// ParametresPage.jsx), pas un formulaire à valider séparément : un seul champ.
function LangueSection({ user }) {
  const { t } = useTranslation();
  const mutation = useUpdatePreferencesMutation();

  return (
    <div className="space-y-3">
      <SectionTitle icon={Languages}>{t("account.language")}</SectionTitle>
      <Card className="space-y-3">
        <p className="text-xs text-neutral-500">{t("compte.langueNote")}</p>
        <div className="flex items-center gap-3">
          <select
            value={user.langue}
            onChange={(e) => mutation.mutate({ langue: e.target.value })}
            className={inputClass}
          >
            {LANGUES_DISPONIBLES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          {mutation.isPending && <span className="text-xs text-neutral-400">{t("account.saving")}</span>}
          {mutation.isSuccess && !mutation.isPending && (
            <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" aria-hidden="true" />
          )}
        </div>
        <GlobalFormError error={mutation.error} />
      </Card>
    </div>
  );
}

function MotDePasseSection() {
  const { t } = useTranslation();
  const mutation = useChangerMotDePasseMutation();
  const [form, setForm] = useState({ motDePasseActuel: "", nouveauMotDePasse: "", confirmation: "" });
  const [savedMessage, setSavedMessage] = useState(false);
  const [confirmationError, setConfirmationError] = useState("");

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setSavedMessage(false);
    setConfirmationError("");
    if (form.nouveauMotDePasse !== form.confirmation) {
      setConfirmationError(t("account.confirmMismatch"));
      return;
    }
    mutation.mutate(
      { motDePasseActuel: form.motDePasseActuel, nouveauMotDePasse: form.nouveauMotDePasse },
      {
        onSuccess: () => {
          setSavedMessage(true);
          setForm({ motDePasseActuel: "", nouveauMotDePasse: "", confirmation: "" });
        },
      },
    );
  }

  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  return (
    <div className="space-y-3">
      <SectionTitle icon={KeyRound}>{t("activation.password")}</SectionTitle>
      <Card as="form" onSubmit={handleSubmit} className="space-y-4">
        <GlobalFormError error={mutation.error} />
        {savedMessage && !mutation.isPending && (
          <p className="flex items-center gap-2 rounded-xl bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-400 text-sm px-3 py-2">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {t("account.passwordChanged")}
          </p>
        )}
        <Field label={t("account.currentPassword")} required>
          <input
            type="password"
            required
            value={form.motDePasseActuel}
            onChange={(e) => update("motDePasseActuel", e.target.value)}
            className={inputClass}
            autoComplete="current-password"
          />
          <FieldError messages={details?.motDePasseActuel} />
        </Field>
        <Field label={t("auth.reset.newPassword")} required>
          <input
            type="password"
            required
            minLength={8}
            value={form.nouveauMotDePasse}
            onChange={(e) => update("nouveauMotDePasse", e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
          <FieldError messages={details?.nouveauMotDePasse} />
        </Field>
        <Field label={t("account.confirmNewPassword")} required>
          <input
            type="password"
            required
            minLength={8}
            value={form.confirmation}
            onChange={(e) => update("confirmation", e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
          {confirmationError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{confirmationError}</p>}
        </Field>
        <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending}>
          {t("common.save")}
        </Button>
      </Card>
    </div>
  );
}
