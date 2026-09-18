import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Building2,
  ArrowLeft,
  Save,
  CheckCircle2,
  ShieldCheck,
  ShieldOff,
  UserCircle,
  Clock,
  Receipt,
  ClipboardList,
  Wallet,
  KeyRound,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  UserPlus,
  UserCog,
  History,
  CreditCard,
  X,
} from "lucide-react";
import {
  useAtelierQuery,
  useAtelierActiviteQuery,
  useUpdateAtelierMutation,
  useUpdateStatutAtelierMutation,
  useReinitialiserMotDePasseMutation,
  useDeleteAtelierMutation,
  useAjouterCompteMutation,
  useSupprimerCompteMutation,
  useImpersonerMutation,
  useImpersonationsQuery,
} from "../../features/ateliers/hooks.js";
import AbonnementAtelierSection from "../../features/ateliers/components/AbonnementAtelierSection.jsx";
import { LoadingState, ErrorState, EmptyState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import { ApiError } from "../../lib/apiClient.js";
import { generatePassword } from "../../lib/generatePassword.js";
import { useTranslation } from "../../i18n/index.js";
import { useLocaleStore } from "../../stores/localeStore.js";

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formStateFrom(atelier) {
  return {
    nom: atelier?.nom ?? "",
    devise: atelier?.devise ?? "FCFA",
    telephone: atelier?.telephone ?? "",
    adresse: atelier?.adresse ?? "",
    ville: atelier?.ville ?? "",
    pays: atelier?.pays ?? "",
  };
}

function StatutBadge({ actif }) {
  const { t } = useTranslation();
  return actif ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 px-2.5 py-1 text-xs font-medium">
      <ShieldCheck className="size-3.5" aria-hidden="true" />
      {t("sa.detail.statusActive")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 px-2.5 py-1 text-xs font-medium">
      <ShieldOff className="size-3.5" aria-hidden="true" />
      {t("sa.detail.statusSuspended")}
    </span>
  );
}

function EditForm({ atelier }) {
  const { t } = useTranslation();
  const mutation = useUpdateAtelierMutation(atelier.id);
  const [form, setForm] = useState(() => formStateFrom(atelier));
  const [saved, setSaved] = useState(false);
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setSaved(false);
    mutation.mutate(
      {
        nom: form.nom,
        devise: form.devise,
        telephone: form.telephone || undefined,
        adresse: form.adresse || undefined,
        ville: form.ville || undefined,
        pays: form.pays || undefined,
      },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <Card as="form" variant="outlined" onSubmit={handleSubmit} className="space-y-4">
      <GlobalFormError error={mutation.error} />
      {saved && !mutation.isPending && (
        <p className="flex items-center gap-2 rounded-xl bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-400 text-sm px-3 py-2 animate-fade-in">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {t("sa.detail.saved")}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t("sa.detail.fieldName")} required>
          <input required value={form.nom} onChange={(e) => update("nom", e.target.value)} className={inputClass} />
          <FieldError messages={details?.nom} />
        </Field>
        <Field label={t("sa.detail.fieldCurrency")}>
          <input value={form.devise} onChange={(e) => update("devise", e.target.value)} className={inputClass} />
          <FieldError messages={details?.devise} />
        </Field>
        <Field label={t("sa.detail.fieldPhone")}>
          <input value={form.telephone} onChange={(e) => update("telephone", e.target.value)} className={inputClass} />
          <FieldError messages={details?.telephone} />
        </Field>
        <Field label={t("sa.detail.fieldAddress")}>
          <input value={form.adresse} onChange={(e) => update("adresse", e.target.value)} className={inputClass} />
          <FieldError messages={details?.adresse} />
        </Field>
        <Field label={t("sa.detail.fieldCity")}>
          <input value={form.ville} onChange={(e) => update("ville", e.target.value)} className={inputClass} />
          <FieldError messages={details?.ville} />
        </Field>
        <Field label={t("sa.detail.fieldCountry")}>
          <input value={form.pays} onChange={(e) => update("pays", e.target.value)} className={inputClass} />
          <FieldError messages={details?.pays} />
        </Field>
      </div>
      <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending}>
        {t("common.save")}
      </Button>
    </Card>
  );
}

// Dernier recours en l'absence de tout mécanisme de récupération en
// libre-service (pas d'email vérifié/envoyé dans cette phase) — voir
// backend/src/lib/atelierProvisioning.js. Le mot de passe généré/choisi
// n'est affiché qu'une seule fois : au SUPERADMIN de le communiquer au
// propriétaire de l'atelier par un canal de son choix (téléphone, WhatsApp…).
function ReinitialiserMotDePasseForm({ atelierId, compte, onClose }) {
  const { t } = useTranslation();
  const mutation = useReinitialiserMotDePasseMutation(atelierId);
  const [password, setPassword] = useState(() => generatePassword());
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  function handleCopy() {
    navigator.clipboard
      ?.writeText(password)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Presse-papiers indisponible (contexte non sécurisé, permission
        // refusée...) — le mot de passe reste visible et sélectionnable à la
        // main (voir `select-all` ci-dessous), rien de bloquant.
      });
  }

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate({ userId: compte.id, nouveauMotDePasse: password }, { onSuccess: () => setDone(true) });
  }

  if (done) {
    return (
      <div className="mt-3 rounded-xl bg-green-50 dark:bg-green-950/60 border border-green-200 dark:border-green-900 p-3 space-y-2">
        <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          {t("sa.detail.passwordResetDone", { identifiant: compte.identifiant })}
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-sm font-mono select-all">
            {password}
          </code>
          <Button type="button" variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={handleCopy}>
            {copied ? t("sa.detail.copied") : t("sa.detail.copy")}
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {t("sa.detail.close")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 space-y-3">
      <GlobalFormError error={mutation.error} />
      <Field label={t("sa.detail.newPassword")} hint={t("sa.detail.newPasswordHint")}>
        <div className="flex gap-2">
          <input value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} font-mono`} />
          <Button type="button" variant="secondary" size="sm" icon={RefreshCw} onClick={() => setPassword(generatePassword())}>
            {t("sa.detail.generate")}
          </Button>
        </div>
        <FieldError messages={details?.nouveauMotDePasse} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm" loading={mutation.isPending}>
          {t("sa.detail.confirmReset")}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

// Ajout d'un compte ("employé") à un atelier existant — mêmes permissions
// que l'ADMIN (voir ajouterCompteSchema, atelierAdmin.schema.js) : aucun
// système de rôle restreint construit à ce stade.
function AjouterCompteForm({ atelierId, onClose }) {
  const { t } = useTranslation();
  const mutation = useAjouterCompteMutation(atelierId);
  const [form, setForm] = useState({ identifiant: "", password: generatePassword(), prenom: "", nom: "", email: "" });
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate(
      {
        identifiant: form.identifiant,
        password: form.password,
        prenom: form.prenom || undefined,
        nom: form.nom || undefined,
        email: form.email || undefined,
      },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <Card as="form" variant="outlined" onSubmit={handleSubmit} className="space-y-4">
      <GlobalFormError error={mutation.error} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t("sa.detail.fieldIdentifier")} required hint={t("sa.detail.fieldIdentifierHint")}>
          <input required value={form.identifiant} onChange={(e) => update("identifiant", e.target.value)} className={inputClass} />
          <FieldError messages={details?.identifiant} />
        </Field>
        <Field label={t("sa.detail.fieldPassword")} required hint={t("sa.detail.newPasswordHint")}>
          <div className="flex gap-2">
            <input value={form.password} onChange={(e) => update("password", e.target.value)} className={`${inputClass} font-mono`} />
            <Button type="button" variant="secondary" size="sm" icon={RefreshCw} onClick={() => update("password", generatePassword())} />
          </div>
          <FieldError messages={details?.password} />
        </Field>
        <Field label={t("sa.detail.fieldFirstName")}>
          <input value={form.prenom} onChange={(e) => update("prenom", e.target.value)} className={inputClass} />
        </Field>
        <Field label={t("sa.detail.fieldLastName")}>
          <input value={form.nom} onChange={(e) => update("nom", e.target.value)} className={inputClass} />
        </Field>
        <Field label={t("sa.detail.fieldEmail")}>
          <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} className={inputClass} />
          <FieldError messages={details?.email} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending}>
          {t("sa.detail.addAccountSubmit")}
        </Button>
        <Button type="button" variant="secondary" icon={X} onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </Card>
  );
}

function SupprimerCompteBouton({ atelierId, compte }) {
  const { t } = useTranslation();
  const mutation = useSupprimerCompteMutation(atelierId);
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-red-600 dark:text-red-400">{t("sa.detail.removeConfirm", { identifiant: compte.identifiant })}</span>
        <Button variant="danger" size="sm" loading={mutation.isPending} onClick={() => mutation.mutate(compte.id)}>
          {t("sa.detail.yes")}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>
          {t("sa.detail.no")}
        </Button>
      </div>
    );
  }
  return (
    <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={() => setConfirm(true)}>
      {t("sa.detail.remove")}
    </Button>
  );
}

// "Se connecter en tant que" (§ impersonation) — remplace le cookie de
// session du SUPERADMIN par celui de ce compte ADMIN (voir
// useImpersonerMutation, features/ateliers/hooks.js). Confirmation requise :
// action sensible et immédiate (pas de "annuler" possible une fois lancée,
// à part POST /auth/quitter-impersonation depuis la bannière qui apparaît
// alors sur toutes les pages — voir components/ImpersonationBanner.jsx).
function ImpersonerBouton({ atelierId, compte }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mutation = useImpersonerMutation(atelierId);
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-neutral-500">{t("sa.detail.impersonateConfirm", { identifiant: compte.identifiant })}</span>
        <Button
          variant="primary"
          size="sm"
          loading={mutation.isPending}
          onClick={() => mutation.mutate(compte.id, { onSuccess: () => navigate("/") })}
        >
          {t("sa.detail.yes")}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>
          {t("sa.detail.no")}
        </Button>
      </div>
    );
  }
  return (
    <Button variant="ghost" size="sm" icon={UserCog} onClick={() => setConfirm(true)}>
      {t("sa.detail.impersonate")}
    </Button>
  );
}

function ComptesSection({ atelierId, comptes }) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState(null);
  const [showAjouter, setShowAjouter] = useState(false);

  return (
    <div className="space-y-2">
      {comptes.length === 0 && <EmptyState icon={UserCircle}>{t("sa.detail.noAccounts")}</EmptyState>}

      <ul className="space-y-2">
        {comptes.map((compte) => (
          <li key={compte.id}>
            <Card variant="outlined">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {compte.prenom || compte.nom ? `${compte.prenom ?? ""} ${compte.nom ?? ""}`.trim() : compte.identifiant}
                  </p>
                  <p className="text-xs text-neutral-500">{compte.identifiant}{compte.email ? ` — ${compte.email}` : ""}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0 flex-wrap">
                  <p className="text-xs text-neutral-500 flex items-center gap-1.5">
                    <Clock className="size-3.5" aria-hidden="true" />
                    {t("sa.detail.lastLogin", { date: formatDate(compte.derniereConnexionAt) })}
                  </p>
                  {openId !== compte.id && (
                    <>
                      <ImpersonerBouton atelierId={atelierId} compte={compte} />
                      <Button variant="ghost" size="sm" icon={KeyRound} onClick={() => setOpenId(compte.id)}>
                        {t("sa.detail.resetPassword")}
                      </Button>
                    </>
                  )}
                  {/* Retrait masqué si c'est le seul compte — le backend le
                      refuserait de toute façon (409, voir supprimerCompteAtelier)
                      mais autant ne pas proposer une action vouée à échouer. */}
                  {comptes.length > 1 && <SupprimerCompteBouton atelierId={atelierId} compte={compte} />}
                </div>
              </div>
              {openId === compte.id && (
                <ReinitialiserMotDePasseForm atelierId={atelierId} compte={compte} onClose={() => setOpenId(null)} />
              )}
            </Card>
          </li>
        ))}
      </ul>

      {showAjouter ? (
        <AjouterCompteForm atelierId={atelierId} onClose={() => setShowAjouter(false)} />
      ) : (
        <Button variant="secondary" size="sm" icon={UserPlus} onClick={() => setShowAjouter(true)}>
          {t("sa.detail.addAccount")}
        </Button>
      )}
    </div>
  );
}

const EVENT_ICONS = { commande: ClipboardList, paiement: Wallet };

function ActiviteSection({ id }) {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useAtelierActiviteQuery(id);
  if (isPending) return <LoadingState label={t("sa.detail.loadingActivity")} />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;
  if (data.length === 0) return <EmptyState icon={Receipt}>{t("sa.detail.noActivity")}</EmptyState>;
  return (
    <ul className="space-y-2">
      {data.map((evenement, i) => {
        const Icon = EVENT_ICONS[evenement.type] ?? Receipt;
        return (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 mt-0.5">
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-neutral-900 dark:text-neutral-100">{evenement.description}</p>
              <p className="text-xs text-neutral-500">{formatDate(evenement.date)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Historique de sécurité : QUI (côté plateforme) a accédé aux données de cet
// atelier via impersonation, et QUAND — distinct de ActiviteSection
// (activité MÉTIER du client) ci-dessus. Voir GET
// /ateliers/:id/impersonations et JournalImpersonation (schema.prisma).
function ImpersonationsSection({ id }) {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useImpersonationsQuery(id);
  if (isPending) return <LoadingState label={t("sa.detail.loadingHistory")} />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;
  if (data.data.length === 0) return <EmptyState icon={UserCog}>{t("sa.detail.noImpersonations")}</EmptyState>;
  return (
    <ul className="space-y-2">
      {data.data.map((j) => (
        <li key={j.id} className="flex items-start gap-3 text-sm">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 mt-0.5">
            <UserCog className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-neutral-900 dark:text-neutral-100">
              {t("sa.detail.impersonationEntry", { superadmin: j.superadminIdentifiant, admin: j.adminIdentifiant })}
            </p>
            <p className="text-xs text-neutral-500">{formatDate(j.demarreLe)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// Suppression DÉFINITIVE — réservée aux ateliers VIDES par le backend (voir
// DELETE /api/ateliers/:id, ateliers.routes.js) : un atelier avec de vraies
// données (clientes, commandes...) est refusé avec un message clair (409),
// affiché tel quel ici plutôt que ré-interprété. Toujours proposée (pas de
// vérification dupliquée côté frontend sur "l'atelier est-il vide ?") —
// une seule source de vérité sur ce qui est supprimable.
function DangerZone({ atelier }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mutation = useDeleteAtelierMutation();
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="space-y-3">
      <SectionTitle icon={AlertTriangle}>{t("sa.detail.dangerZone")}</SectionTitle>
      <Card variant="outlined" className="border-red-200 dark:border-red-900 space-y-3">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {t("sa.detail.dangerText")}
        </p>
        <GlobalFormError error={mutation.error} />
        {confirm ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-red-600 dark:text-red-400">
              {t("sa.detail.deleteConfirm", { nom: atelier.nom })}
            </span>
            <Button
              variant="danger"
              size="sm"
              icon={Trash2}
              loading={mutation.isPending}
              onClick={() => mutation.mutate(atelier.id, { onSuccess: () => navigate("/ateliers") })}
            >
              {t("sa.detail.yesDelete")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={() => setConfirm(true)}>
            {t("sa.detail.deleteWorkshop")}
          </Button>
        )}
      </Card>
    </div>
  );
}

// `key={id}` ci-dessous force un remount complet en cas de navigation d'une
// fiche atelier à une autre (React Router ne remonte PAS automatiquement un
// élément de route dont seul le paramètre :id change) — sans ça,
// `confirmSuspend` resterait à `true` en passant à l'atelier suivant.
export default function AtelierDetailPage() {
  const { id } = useParams();
  return <AtelierDetailPageInner key={id} id={id} />;
}

function AtelierDetailPageInner({ id }) {
  const { t } = useTranslation();
  const { data: atelier, isPending, isError, error, refetch } = useAtelierQuery(id);
  const statutMutation = useUpdateStatutAtelierMutation(id);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  if (isPending) return <LoadingState label={t("sa.detail.loading")} />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div className="max-w-3xl space-y-6">
      <Link to="/ateliers" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        {t("sa.detail.backToWorkshops")}
      </Link>

      <PageHeader
        icon={Building2}
        title={atelier.nom}
        subtitle={t("sa.detail.subtitle", { comptes: atelier.nombreComptes, clientes: atelier.nombreClientes, commandes: atelier.nombreCommandes })}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <StatutBadge actif={atelier.actif} />
            {confirmSuspend ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-neutral-500">{t("sa.detail.confirmQuestion")}</span>
                <Button
                  variant="danger"
                  size="sm"
                  loading={statutMutation.isPending}
                  onClick={() => statutMutation.mutate(false, { onSuccess: () => setConfirmSuspend(false) })}
                >
                  {t("sa.detail.yesSuspend")}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmSuspend(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            ) : atelier.actif ? (
              <Button variant="danger-ghost" size="sm" icon={ShieldOff} onClick={() => setConfirmSuspend(true)}>
                {t("sa.detail.suspend")}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                icon={ShieldCheck}
                loading={statutMutation.isPending}
                onClick={() => statutMutation.mutate(true)}
              >
                {t("sa.detail.reactivate")}
              </Button>
            )}
          </div>
        }
      />

      {!atelier.actif && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-sm px-3 py-2">
          <ShieldOff className="size-4 shrink-0" aria-hidden="true" />
          {t("sa.detail.suspendedNotice", { date: formatDate(atelier.suspenduLe) })}
        </p>
      )}

      <div className="space-y-3">
        <SectionTitle icon={Building2}>{t("sa.detail.sectionInfo")}</SectionTitle>
        <EditForm atelier={atelier} />
      </div>

      <div className="space-y-3">
        <SectionTitle icon={UserCircle}>{t("sa.detail.sectionAccounts")}</SectionTitle>
        <ComptesSection atelierId={atelier.id} comptes={atelier.comptes} />
      </div>

      <div className="space-y-3">
        <SectionTitle icon={CreditCard}>{t("saSub.section.title")}</SectionTitle>
        <AbonnementAtelierSection atelierId={atelier.id} />
      </div>

      <div className="space-y-3">
        <SectionTitle icon={Clock}>{t("sa.detail.sectionActivity")}</SectionTitle>
        <Card variant="outlined">
          <ActiviteSection id={id} />
        </Card>
      </div>

      <div className="space-y-3">
        <SectionTitle icon={History}>{t("sa.detail.sectionImpersonation")}</SectionTitle>
        <Card variant="outlined">
          <ImpersonationsSection id={id} />
        </Card>
      </div>

      <DangerZone atelier={atelier} />
    </div>
  );
}
