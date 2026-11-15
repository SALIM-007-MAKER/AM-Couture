import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { UserCog, ArrowLeft, Save, ShieldAlert, KeyRound, Power, X } from "lucide-react";
import {
  useCatalogueQuery,
  useEmployeQuery,
  useCreerEmployeMutation,
  useModifierEmployeMutation,
  useDesactiverEmployeMutation,
  useReactiverEmployeMutation,
  useMotDePasseEmployeMutation,
} from "./hooks.js";
import { basculerPermission, imposeePar, completerPermissions, sensiblesAjoutees, POSTES_AFFICHES } from "./permissions.js";
import { nouvelleCleIdempotence } from "../abonnement/paiement.js";
import { formatDateFr } from "../abonnement/constants.js";
import { BadgeActif } from "./EmployesPage.jsx";
import { LoadingState, ErrorState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import { ApiError } from "../../lib/apiClient.js";
import { useTranslation } from "../../i18n/index.js";

const detailsDe = (erreur) => (erreur instanceof ApiError ? erreur.details : undefined);

/** Cases à cocher des permissions, regroupées par module ; les droits sensibles sont signalés. */
function GrillePermissions({ catalogue, valeur, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4" data-testid="grille-permissions">
      {Object.entries(catalogue.modules).map(([module, permissions]) => (
        <fieldset key={module} className="space-y-1.5">
          <legend className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{t(`emp.modules.${module}`)}</legend>
          {permissions.map(({ permission, sensible }) => {
            const cochee = valeur.includes(permission);
            const verrouillee = cochee && imposeePar(permission, valeur);
            return (
              <label key={permission} className={`flex items-start gap-2 text-sm ${verrouillee ? "opacity-70" : ""}`}>
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={cochee}
                  disabled={verrouillee}
                  onChange={(e) => onChange(basculerPermission(valeur, permission, e.target.checked))}
                  data-testid={`perm-${permission}`}
                />
                <span>
                  {t(`emp.perm.${permission}`)}
                  {sensible && (
                    <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-medium">
                      <ShieldAlert className="size-3" aria-hidden="true" />
                      {t("emp.sensitive")}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

/** Actions sur le compte (désactivation, réactivation, mot de passe) — seulement sur un employé existant. */
function ActionsCompte({ employe }) {
  const { t } = useTranslation();
  const desactiver = useDesactiverEmployeMutation();
  const reactiver = useReactiverEmployeMutation();
  const motDePasse = useMotDePasseEmployeMutation();
  const [confirme, setConfirme] = useState(false);
  const [reset, setReset] = useState(false);
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [fait, setFait] = useState(false);
  const detailsMdp = detailsDe(motDePasse.error);

  return (
    <Card variant="outlined" className="space-y-4">
      <SectionTitle icon={Power}>{t("emp.sectionAccount")}</SectionTitle>
      <div className="flex items-center gap-2 flex-wrap">
        <BadgeActif actif={employe.actif} />
        {!employe.actif && employe.desactiveLe && <span className="text-sm text-neutral-500">{t("emp.deactivatedOn", { date: formatDateFr(employe.desactiveLe) })}</span>}
      </div>

      <GlobalFormError error={desactiver.error ?? reactiver.error} />
      {employe.actif ? (
        confirme ? (
          <div className="space-y-2">
            <p className="text-sm text-red-600 dark:text-red-400">{t("emp.deactivateConfirm")}</p>
            <div className="flex gap-2">
              <Button variant="danger" size="sm" loading={desactiver.isPending} onClick={() => desactiver.mutate(employe.id, { onSuccess: () => setConfirme(false) })} data-testid="confirmer-desactivation">
                {t("emp.yes")}
              </Button>
              <Button variant="secondary" size="sm" icon={X} onClick={() => setConfirme(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger-ghost" size="sm" icon={Power} onClick={() => setConfirme(true)} data-testid="desactiver">
            {t("emp.deactivate")}
          </Button>
        )
      ) : (
        <Button variant="secondary" size="sm" icon={Power} loading={reactiver.isPending} onClick={() => reactiver.mutate(employe.id)}>
          {t("emp.reactivate")}
        </Button>
      )}

      <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3 space-y-2">
        {reset ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setFait(false);
              motDePasse.mutate(
                { id: employe.id, corps: { nouveauMotDePasse: nouveau, confirmationMotDePasse: confirmation } },
                {
                  onSuccess: () => {
                    setFait(true);
                    setReset(false);
                    setNouveau("");
                    setConfirmation("");
                  },
                },
              );
            }}
          >
            <GlobalFormError error={motDePasse.error} />
            <Field label={t("emp.newPassword")} required>
              <input type="password" autoComplete="new-password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} className={inputClass} required />
              <FieldError messages={detailsMdp?.nouveauMotDePasse} />
            </Field>
            <Field label={t("emp.confirmPassword")} required>
              <input type="password" autoComplete="current-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={inputClass} required />
              <FieldError messages={detailsMdp?.confirmationMotDePasse} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" size="sm" icon={KeyRound} loading={motDePasse.isPending}>
                {t("emp.resetConfirm")}
              </Button>
              <Button type="button" variant="secondary" size="sm" icon={X} onClick={() => setReset(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" size="sm" icon={KeyRound} onClick={() => setReset(true)}>
            {t("emp.resetPassword")}
          </Button>
        )}
        {fait && <p role="status" className="text-sm text-green-700 dark:text-green-400">{t("emp.resetDone")}</p>}
      </div>
    </Card>
  );
}

/** Charge le catalogue (et l'employé en modification), puis affiche le formulaire avec ses valeurs de départ. */
export default function EmployeFormPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const edition = Boolean(id);
  const catalogue = useCatalogueQuery();
  const employeQuery = useEmployeQuery(id);

  if (catalogue.isPending || (edition && employeQuery.isPending)) return <LoadingState label={t("emp.loadingOne")} />;
  if (catalogue.isError) return <ErrorState error={catalogue.error} onRetry={catalogue.refetch} />;
  if (edition && employeQuery.isError) return <ErrorState error={employeQuery.error} onRetry={employeQuery.refetch} />;
  return <EmployeForm key={id ?? "nouveau"} id={id} catalogue={catalogue.data} employe={edition ? employeQuery.data : null} />;
}

/** Formulaire commun création / modification d'un employé. */
function EmployeForm({ id, catalogue: catalogueData, employe }) {
  const { t } = useTranslation();
  const edition = Boolean(employe);
  const navigate = useNavigate();
  const catalogue = { data: catalogueData };
  const employeQuery = { data: employe };
  const creer = useCreerEmployeMutation();
  const modifier = useModifierEmployeMutation();

  const [champs, setChamps] = useState(() =>
    employe
      ? { identifiant: employe.identifiant, password: "", prenom: employe.prenom ?? "", nom: employe.nom ?? "", email: employe.email ?? "", telephone: employe.telephone ?? "" }
      : { identifiant: "", password: "", prenom: "", nom: "", email: "", telephone: "" },
  );
  const [poste, setPoste] = useState(employe?.poste ?? "AUTRE");
  const [permissions, setPermissions] = useState(() => (employe ? [...employe.permissions].sort() : completerPermissions(catalogueData.postes.AUTRE)));
  const [confirmation, setConfirmation] = useState("");
  const [cle, setCle] = useState(() => nouvelleCleIdempotence());
  const [enregistre, setEnregistre] = useState(false);

  const permissionsInitiales = useMemo(() => employe?.permissions ?? [], [employe]);
  const aConfirmer = useMemo(() => sensiblesAjoutees(permissionsInitiales, permissions, catalogueData.sensibles), [catalogueData, permissions, permissionsInitiales]);
  const mutation = edition ? modifier : creer;
  const details = detailsDe(mutation.error);

  const maj = (champ, valeur) => {
    setChamps((c) => ({ ...c, [champ]: valeur }));
    setEnregistre(false);
    setCle(nouvelleCleIdempotence());
  };

  function appliquerPoste(nom) {
    setPermissions(completerPermissions(catalogue.data.postes[nom]));
    setEnregistre(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    setEnregistre(false);
    const corpsCommun = {
      prenom: champs.prenom,
      nom: champs.nom,
      poste,
      permissions,
      ...(champs.email ? { email: champs.email } : {}),
      ...(champs.telephone ? { telephone: champs.telephone } : {}),
      ...(aConfirmer.length > 0 ? { confirmationMotDePasse: confirmation } : {}),
    };
    if (edition) {
      modifier.mutate({ id, corps: { ...corpsCommun, email: champs.email || undefined, telephone: champs.telephone || undefined } }, { onSuccess: () => { setEnregistre(true); setConfirmation(""); } });
    } else {
      creer.mutate({ corps: { ...corpsCommun, identifiant: champs.identifiant, password: champs.password }, cle }, { onSuccess: () => navigate("/employes") });
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={UserCog}
        title={edition ? t("emp.editTitle", { nom: `${employeQuery.data.prenom ?? ""} ${employeQuery.data.nom ?? ""}`.trim() }) : t("emp.createTitle")}
        actions={
          <Button as={Link} to="/employes" variant="secondary" icon={ArrowLeft}>
            {t("emp.back")}
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6" noValidate={false}>
        <Card variant="outlined" className="space-y-4">
          <SectionTitle>{t("emp.sectionIdentity")}</SectionTitle>
          <GlobalFormError error={mutation.error} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("emp.firstName")} required>
              <input value={champs.prenom} onChange={(e) => maj("prenom", e.target.value)} className={inputClass} required maxLength={100} />
              <FieldError messages={details?.prenom} />
            </Field>
            <Field label={t("emp.lastName")} required>
              <input value={champs.nom} onChange={(e) => maj("nom", e.target.value)} className={inputClass} required maxLength={100} />
              <FieldError messages={details?.nom} />
            </Field>
            <Field label={t("emp.identifiant")} required hint={t("emp.identifiantHelp")}>
              <input value={champs.identifiant} onChange={(e) => maj("identifiant", e.target.value)} className={inputClass} required minLength={3} maxLength={60} disabled={edition} autoComplete="off" />
              <FieldError messages={details?.identifiant} />
            </Field>
            {!edition && (
              <Field label={t("emp.password")} required hint={t("emp.passwordHelp")}>
                <input type="password" value={champs.password} onChange={(e) => maj("password", e.target.value)} className={inputClass} required minLength={8} autoComplete="new-password" />
                <FieldError messages={details?.password} />
              </Field>
            )}
            <Field label={t("emp.email")}>
              <input type="email" value={champs.email} onChange={(e) => maj("email", e.target.value)} className={inputClass} maxLength={190} />
              <FieldError messages={details?.email} />
            </Field>
            <Field label={t("emp.phone")}>
              <input value={champs.telephone} onChange={(e) => maj("telephone", e.target.value)} className={inputClass} maxLength={30} />
              <FieldError messages={details?.telephone} />
            </Field>
          </div>
        </Card>

        <Card variant="outlined" className="space-y-3">
          <SectionTitle>{t("emp.sectionPoste")}</SectionTitle>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={poste}
              onChange={(e) => {
                setPoste(e.target.value);
                // À la création, le poste choisi fournit les droits de départ ; en modification il ne les réécrit jamais.
                if (!edition) appliquerPoste(e.target.value);
              }}
              className={`${inputClass} w-auto`}
              aria-label={t("emp.sectionPoste")}
              data-testid="select-poste"
            >
              {POSTES_AFFICHES.map((p) => (
                <option key={p} value={p}>
                  {t(`emp.postes.${p}`)}
                </option>
              ))}
            </select>
            {edition && (
              <Button type="button" variant="secondary" size="sm" onClick={() => appliquerPoste(poste)} data-testid="appliquer-poste">
                {t("emp.applyPoste")}
              </Button>
            )}
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{t(`emp.posteHelp.${poste}`)}</p>
          {edition && <p className="text-xs text-neutral-500">{t("emp.posteChangeNote")}</p>}
          <FieldError messages={details?.poste} />
        </Card>

        <Card variant="outlined" className="space-y-3">
          <SectionTitle>{t("emp.sectionPermissions")}</SectionTitle>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{t("emp.permissionsHelp")}</p>
          <GrillePermissions catalogue={catalogue.data} valeur={permissions} onChange={(v) => { setPermissions(v); setEnregistre(false); }} />
          <FieldError messages={details?.permissions} />
          {aConfirmer.length > 0 && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/50 p-3 space-y-2" data-testid="confirmation-sensible">
              <p className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
                <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
                {t("emp.sensitiveWarning")}
              </p>
              <Field label={t("emp.confirmPassword")} required>
                <input type="password" autoComplete="current-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={inputClass} required />
                <FieldError messages={details?.confirmationMotDePasse} />
              </Field>
            </div>
          )}
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending} data-testid="enregistrer-employe">
            {edition ? t("emp.save") : t("emp.create")}
          </Button>
          {enregistre && (
            <span role="status" className="text-sm text-green-700 dark:text-green-400">
              {t("emp.saved")}
            </span>
          )}
        </div>
      </form>

      {edition && <ActionsCompte employe={employeQuery.data} />}
    </div>
  );
}
