import { useState } from "react";
import { useTranslation } from "../../i18n/index.js";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { ClipboardList, Wallet, Save, X, Ruler } from "lucide-react";
import { useCommandeQuery, useCreateCommandeMutation, useUpdateCommandeMutation } from "./hooks.js";
import { useDerniereMesureQuery } from "../clientes/hooks.js";
import { PRIORITES, MODES_PAIEMENT, TISSUS_SUGGERES } from "./constants.js";
import { CATEGORIES_VETEMENT } from "../modeles/constants.js";
import ClientePicker from "./components/ClientePicker.jsx";
import ModelePicker from "./components/ModelePicker.jsx";
import { LoadingState, ErrorState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import ImageUploadField from "../../components/ImageUploadField.jsx";
import { ApiError } from "../../lib/apiClient.js";

function toDateInputValue(iso) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function createFormStateFrom(clienteId = "", dateLivraisonPrevue = "") {
  return {
    clienteId,
    modeleId: "",
    typeVetement: "",
    description: "",
    couleur: "",
    tissu: "",
    quantite: "1",
    prixTotal: "",
    priorite: "NORMALE",
    dateLivraisonPrevue,
    observations: "",
    photoTissuUrl: "",
    photoModeleUrl: "",
    avecPaiementInitial: false,
    paiementMontant: "",
    paiementMode: "ESPECES",
    paiementReference: "",
  };
}

function editFormStateFrom(commande) {
  return {
    modeleId: commande?.modeleId ?? "",
    typeVetement: commande?.typeVetement ?? "",
    description: commande?.description ?? "",
    couleur: commande?.couleur ?? "",
    tissu: commande?.tissu ?? "",
    quantite: String(commande?.quantite ?? 1),
    priorite: commande?.priorite ?? "NORMALE",
    dateLivraisonPrevue: toDateInputValue(commande?.dateLivraisonPrevue),
    observations: commande?.observations ?? "",
    photoTissuUrl: commande?.photoTissuUrl ?? "",
    photoModeleUrl: commande?.photoModeleUrl ?? "",
  };
}

export default function CommandeFormPage({ mode }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const isEdit = mode === "edit";
  const commandeQuery = useCommandeQuery(isEdit ? id : undefined);

  if (isEdit && commandeQuery.isPending) return <LoadingState label={t("cmd.loadingCommande")} />;
  if (isEdit && commandeQuery.isError) return <ErrorState error={commandeQuery.error} onRetry={commandeQuery.refetch} />;

  return <CommandeForm key={isEdit ? id : "create"} mode={mode} initial={isEdit ? commandeQuery.data : undefined} />;
}

function CommandeForm({ mode, initial }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = mode === "edit";
  const createMutation = useCreateCommandeMutation();
  const updateMutation = useUpdateCommandeMutation(id);
  const mutation = isEdit ? updateMutation : createMutation;

  // Préremplissage depuis la fiche client (?clienteId=..., voir
  // ClienteDetailPage.jsx) ou depuis le calendrier (?dateLivraisonPrevue=...,
  // voir CalendrierPage.jsx, bouton "Nouvelle commande ce jour"). Simple
  // confort — les deux champs restent modifiables, aucune validation
  // supplémentaire ici (le backend revalide tout de toute façon).
  const [form, setForm] = useState(() =>
    isEdit
      ? editFormStateFrom(initial)
      : createFormStateFrom(searchParams.get("clienteId") ?? "", searchParams.get("dateLivraisonPrevue") ?? ""),
  );
  // "Tissu" reste un texte libre côté backend (voir constants.js,
  // TISSUS_SUGGERES) — cet état local ne pilote que l'affichage du champ
  // texte de secours quand la valeur ne correspond à aucune suggestion.
  const [tissuLibre, setTissuLibre] = useState(() => {
    const t = isEdit ? (initial?.tissu ?? "") : "";
    return Boolean(t) && !TISSUS_SUGGERES.includes(t);
  });

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Une commande exige au moins une mesure déjà enregistrée pour ce client
  // (voir POST /api/commandes, backend — un client sans AUCUNE mesure en
  // historique ne peut pas encore commander). `enabled` seulement en
  // création : en modification, le client est déjà fixé et déjà passé par
  // ce contrôle à la création de la commande. Un 404 signifie "aucune
  // mesure" (même convention que CommandeDetailPage.jsx), pas une erreur.
  const mesureQuery = useDerniereMesureQuery(!isEdit ? form.clienteId : undefined);
  const clienteSansMesure =
    !isEdit && Boolean(form.clienteId) && mesureQuery.isError && mesureQuery.error instanceof ApiError && mesureQuery.error.status === 404;

  function handleSubmit(e) {
    e.preventDefault();
    if (isEdit) {
      const payload = {
        modeleId: form.modeleId || null,
        typeVetement: form.typeVetement,
        description: form.description || undefined,
        couleur: form.couleur || undefined,
        tissu: form.tissu || undefined,
        quantite: Number(form.quantite),
        priorite: form.priorite,
        dateLivraisonPrevue: form.dateLivraisonPrevue,
        observations: form.observations || undefined,
        photoTissuUrl: form.photoTissuUrl || undefined,
        photoModeleUrl: form.photoModeleUrl || undefined,
      };
      mutation.mutate(payload, { onSuccess: (commande) => navigate(`/commandes/${commande.id}`) });
      return;
    }

    const payload = {
      clienteId: form.clienteId,
      modeleId: form.modeleId || undefined,
      typeVetement: form.typeVetement,
      description: form.description || undefined,
      couleur: form.couleur || undefined,
      tissu: form.tissu || undefined,
      quantite: Number(form.quantite),
      prixTotal: form.prixTotal,
      priorite: form.priorite,
      dateLivraisonPrevue: form.dateLivraisonPrevue,
      observations: form.observations || undefined,
      photoTissuUrl: form.photoTissuUrl || undefined,
      photoModeleUrl: form.photoModeleUrl || undefined,
      paiementInitial: form.avecPaiementInitial
        ? {
            montant: form.paiementMontant,
            mode: form.paiementMode,
            reference: form.paiementReference || undefined,
          }
        : undefined,
    };
    createMutation.mutate(payload, { onSuccess: (commande) => navigate(`/commandes/${commande.id}`) });
  }

  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader icon={ClipboardList} title={isEdit ? t("cmd.formEditTitle") : t("cmd.formNewTitle")} />

      <Card as="form" onSubmit={handleSubmit} className="space-y-4">
        <GlobalFormError error={mutation.error} />

        {!isEdit && (
          <Field label={t("cmd.formClient")} required>
            <ClientePicker value={form.clienteId} onChange={(v) => update("clienteId", v)} required />
            <FieldError messages={details?.clienteId} />
          </Field>
        )}

        {clienteSansMesure && (
          <Card variant="outlined" className="flex items-center justify-between gap-3 flex-wrap border-amber-200 dark:border-amber-900">
            <span className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
              <Ruler className="size-4 shrink-0" aria-hidden="true" />
              {t("cmd.formClienteSansMesure")}
            </span>
            <Button as={Link} to={`/clientes/${form.clienteId}/mesures/nouvelle`} variant="secondary" size="sm" icon={Ruler}>
              {t("cmd.formPrendreMesures")}
            </Button>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("cmd.formModele")}>
            <ModelePicker value={form.modeleId} onChange={(v) => update("modeleId", v)} />
            <FieldError messages={details?.modeleId} />
          </Field>
          <Field label={t("cmd.formTypeVetement")} required>
            <select
              required
              value={form.typeVetement}
              onChange={(e) => update("typeVetement", e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                {t("cmd.formChoisir")}
              </option>
              {CATEGORIES_VETEMENT.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <FieldError messages={details?.typeVetement} />
          </Field>
          <Field label={t("cmd.formCouleur")}>
            <input value={form.couleur} onChange={(e) => update("couleur", e.target.value)} className={inputClass} />
            <FieldError messages={details?.couleur} />
          </Field>
          <Field label={t("cmd.formTissu")}>
            <select
              value={tissuLibre ? "AUTRE" : form.tissu}
              onChange={(e) => {
                if (e.target.value === "AUTRE") {
                  setTissuLibre(true);
                  update("tissu", "");
                } else {
                  setTissuLibre(false);
                  update("tissu", e.target.value);
                }
              }}
              className={inputClass}
            >
              <option value="">{t("cmd.formTissuNonPrecise")}</option>
              {TISSUS_SUGGERES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="AUTRE">{t("cmd.formTissuAutre")}</option>
            </select>
            {tissuLibre && (
              <input
                type="text"
                placeholder={t("cmd.formTissuPrecisez")}
                value={form.tissu}
                onChange={(e) => update("tissu", e.target.value)}
                className={`${inputClass} mt-2`}
              />
            )}
            <FieldError messages={details?.tissu} />
          </Field>
          <Field label={t("cmd.formQuantite")}>
            <input
              type="number"
              min="1"
              max="50"
              value={form.quantite}
              onChange={(e) => update("quantite", e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.quantite} />
          </Field>
          {!isEdit && (
            <Field label={t("cmd.formPrixTotal")} required>
              <input
                type="text"
                inputMode="decimal"
                required
                value={form.prixTotal}
                onChange={(e) => update("prixTotal", e.target.value)}
                className={inputClass}
              />
              <FieldError messages={details?.prixTotal} />
            </Field>
          )}
          <Field label={t("cmd.formPriorite")}>
            <select value={form.priorite} onChange={(e) => update("priorite", e.target.value)} className={inputClass}>
              {PRIORITES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <FieldError messages={details?.priorite} />
          </Field>
          <Field label={t("cmd.formDateLivraison")} required>
            <input
              type="date"
              required
              value={form.dateLivraisonPrevue}
              onChange={(e) => update("dateLivraisonPrevue", e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.dateLivraisonPrevue} />
          </Field>
        </div>

        <Field label={t("cmd.formDescription")}>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            className={inputClass}
          />
          <FieldError messages={details?.description} />
        </Field>

        <Field label={t("cmd.formObservations")}>
          <textarea
            rows={2}
            value={form.observations}
            onChange={(e) => update("observations", e.target.value)}
            className={inputClass}
          />
          <FieldError messages={details?.observations} />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("cmd.formPhotoTissu")}>
            <ImageUploadField
              value={form.photoTissuUrl}
              onChange={(v) => update("photoTissuUrl", v)}
              previewClassName="h-24 w-20 object-cover"
            />
            <FieldError messages={details?.photoTissuUrl} />
          </Field>
          <Field label={t("cmd.formPhotoModele")}>
            <ImageUploadField
              value={form.photoModeleUrl}
              onChange={(v) => update("photoModeleUrl", v)}
              previewClassName="h-24 w-20 object-cover"
            />
            <FieldError messages={details?.photoModeleUrl} />
          </Field>
        </div>

        {!isEdit && (
          <Card variant="outlined" className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={form.avecPaiementInitial}
                onChange={(e) => update("avecPaiementInitial", e.target.checked)}
              />
              <Wallet className="size-4" aria-hidden="true" />
              {t("cmd.formPaiementInitial")}
            </label>
            {form.avecPaiementInitial && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={t("cmd.formMontant")} required>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={form.paiementMontant}
                    onChange={(e) => update("paiementMontant", e.target.value)}
                    className={inputClass}
                  />
                  <FieldError messages={details?.paiementInitial?.montant} />
                </Field>
                <Field label={t("cmd.formModePaiement")}>
                  <select
                    value={form.paiementMode}
                    onChange={(e) => update("paiementMode", e.target.value)}
                    className={inputClass}
                  >
                    {MODES_PAIEMENT.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("cmd.formReference")}>
                  <input
                    value={form.paiementReference}
                    onChange={(e) => update("paiementReference", e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            )}
          </Card>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending} disabled={clienteSansMesure}>
            {t("cmd.formEnregistrer")}
          </Button>
          <Button type="button" variant="secondary" icon={X} onClick={() => navigate(-1)}>
            {t("cmd.formAnnuler")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
