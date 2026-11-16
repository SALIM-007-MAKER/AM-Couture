import { useState } from "react";
import { Globe, Save, Copy, ExternalLink } from "lucide-react";
import { useReglagesVitrineQuery, useModifierVitrineMutation } from "./hooks.js";
import { LoadingState, ErrorState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { ApiError } from "../../lib/apiClient.js";
import { useTranslation } from "../../i18n/index.js";

export default function VitrineReglagesPage() {
  const { t } = useTranslation();
  const query = useReglagesVitrineQuery();
  // La mutation vit ICI : le formulaire est remonté (key) après chaque enregistrement et perdrait son message de succès.
  const mutation = useModifierVitrineMutation();
  if (query.isPending) return <LoadingState label={t("vitadm.loading")} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  // key : état initial dérivé des données une fois enregistrées (pas de useEffect + setState).
  return <Formulaire key={JSON.stringify(query.data)} reglages={query.data} mutation={mutation} />;
}

function Formulaire({ reglages, mutation }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    slug: reglages.slug ?? "",
    vitrineActive: reglages.vitrineActive,
    vitrineDescription: reglages.vitrineDescription ?? "",
    couleurPrincipale: reglages.couleurPrincipale ?? "",
    vitrineContact: reglages.vitrineContact,
  });
  const [copie, setCopie] = useState(false);
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;
  const maj = (champ, valeur) => setForm((f) => ({ ...f, [champ]: valeur }));
  const lien = reglages.slug ? `${window.location.origin}/a/${reglages.slug}` : null;

  function enregistrer(e) {
    e.preventDefault();
    mutation.mutate({
      ...(form.slug ? { slug: form.slug } : {}),
      vitrineActive: form.vitrineActive,
      vitrineDescription: form.vitrineDescription,
      couleurPrincipale: form.couleurPrincipale,
      vitrineContact: form.vitrineContact,
    });
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // Presse-papiers indisponible : le lien reste affiché, copiable à la main.
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <PageHeader icon={Globe} title={t("vitadm.title")} subtitle={t("vitadm.subtitle")} />
      <Card as="form" onSubmit={enregistrer} className="space-y-4">
        <GlobalFormError error={mutation.error} />

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={form.vitrineActive} onChange={(e) => maj("vitrineActive", e.target.checked)} data-testid="vitrine-active" />
          <span>
            <span className="font-medium">{t("vitadm.active")}</span>
            <span className="block text-neutral-500">{t("vitadm.activeHelp")}</span>
          </span>
        </label>

        <Field label={t("vitadm.slug")} hint={t("vitadm.slugHelp")}>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-neutral-500">/a/</span>
            <input value={form.slug} onChange={(e) => maj("slug", e.target.value.toLowerCase())} className={inputClass} maxLength={40} autoComplete="off" data-testid="vitrine-slug" />
          </div>
          <FieldError messages={details?.slug} />
        </Field>

        <Field label={t("vitadm.description")}>
          <textarea rows={4} maxLength={1500} value={form.vitrineDescription} onChange={(e) => maj("vitrineDescription", e.target.value)} className={inputClass} data-testid="vitrine-description-champ" />
          <FieldError messages={details?.vitrineDescription} />
        </Field>

        <Field label={t("vitadm.color")} hint={t("vitadm.colorHelp")}>
          <div className="flex items-center gap-2">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(form.couleurPrincipale) ? form.couleurPrincipale : "#276386"} onChange={(e) => maj("couleurPrincipale", e.target.value)} aria-label={t("vitadm.color")} className="h-9 w-12 rounded border" />
            <input value={form.couleurPrincipale} onChange={(e) => maj("couleurPrincipale", e.target.value)} placeholder="#276386" className={`${inputClass} w-32`} maxLength={7} data-testid="vitrine-couleur" />
            {form.couleurPrincipale && (
              <Button type="button" variant="ghost" size="sm" onClick={() => maj("couleurPrincipale", "")}>{t("vitadm.colorReset")}</Button>
            )}
          </div>
          <FieldError messages={details?.couleurPrincipale} />
        </Field>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={form.vitrineContact} onChange={(e) => maj("vitrineContact", e.target.checked)} data-testid="vitrine-contact-champ" />
          <span>
            <span className="font-medium">{t("vitadm.contact")}</span>
            <span className="block text-neutral-500">{t("vitadm.contactHelp")}</span>
          </span>
        </label>

        <p className="text-sm text-neutral-600 dark:text-neutral-400" data-testid="vitrine-publies">
          {t("vitadm.published", { nombre: reglages.modelesPublies })}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending} data-testid="enregistrer-vitrine">
            {t("common.save")}
          </Button>
          {mutation.isSuccess && <span role="status" className="text-sm text-green-700 dark:text-green-400">{t("vitadm.saved")}</span>}
        </div>
      </Card>

      {lien && (
        <Card variant="outlined" className="space-y-2 text-sm">
          <p className="font-medium">{reglages.vitrineActive ? t("vitadm.linkLive") : t("vitadm.linkOff")}</p>
          <p className="font-mono break-all" data-testid="vitrine-lien">{lien}</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" icon={Copy} onClick={copier}>{copie ? t("vitadm.copied") : t("vitadm.copy")}</Button>
            {reglages.vitrineActive && (
              <Button as="a" href={lien} target="_blank" rel="noreferrer" variant="secondary" size="sm" icon={ExternalLink}>{t("vitadm.open")}</Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
