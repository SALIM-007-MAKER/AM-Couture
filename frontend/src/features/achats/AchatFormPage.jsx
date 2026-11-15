import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, Save, X, Plus, Trash2 } from "lucide-react";
import { useAchatOptionsQuery, useCreateAchatMutation } from "./hooks.js";
import { totalLignes } from "./calculs.js";
import { nouvelleCleIdempotence } from "../abonnement/paiement.js";
import { uniteLabel } from "../stock/constants.js";
import { LoadingState, ErrorState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { ApiError } from "../../lib/apiClient.js";
import { useTranslation } from "../../i18n/index.js";

const ligneVide = () => ({ cle: Math.random().toString(36).slice(2), articleId: "", quantite: "", prixUnitaire: "" });

export default function AchatFormPage() {
  const { t } = useTranslation();
  const options = useAchatOptionsQuery();
  if (options.isPending) return <LoadingState label={t("ach.loadingForm")} />;
  if (options.isError) return <ErrorState error={options.error} onRetry={options.refetch} />;
  return <AchatForm options={options.data} />;
}

function AchatForm({ options }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mutation = useCreateAchatMutation();
  const [fournisseurId, setFournisseurId] = useState("");
  const [dateAttendue, setDateAttendue] = useState("");
  const [notes, setNotes] = useState("");
  const [lignes, setLignes] = useState(() => [ligneVide()]);
  const [cle] = useState(() => nouvelleCleIdempotence());
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  const maj = (i, champ, valeur) => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, [champ]: valeur } : l)));
  const articlesPris = new Set(lignes.map((l) => l.articleId));
  const total = totalLignes(lignes);

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate(
      {
        data: {
          fournisseurId,
          dateAttendue: dateAttendue || undefined,
          notes: notes || undefined,
          lignes: lignes.map(({ articleId, quantite, prixUnitaire }) => ({ articleId, quantite, prixUnitaire })),
        },
        cle,
      },
      { onSuccess: (achat) => navigate(`/achats/${achat.id}`) },
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader icon={ShoppingCart} title={t("ach.new")} />
      <Card as="form" onSubmit={handleSubmit} className="space-y-4">
        <GlobalFormError error={mutation.error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("ach.colFournisseur")} required>
            <select required value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)} className={inputClass} data-testid="select-fournisseur">
              <option value="" disabled>
                {t("ach.choisirFournisseur")}
              </option>
              {options.fournisseurs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
            <FieldError messages={details?.fournisseurId} />
          </Field>
          <Field label={t("ach.dateAttendue")}>
            <input type="date" value={dateAttendue} onChange={(e) => setDateAttendue(e.target.value)} className={inputClass} />
            <FieldError messages={details?.dateAttendue} />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-1">{t("ach.lignes")}</legend>
          {lignes.map((l, i) => {
            const unite = options.articles.find((a) => a.id === l.articleId)?.unite;
            return (
              <div key={l.cle} className="grid grid-cols-12 gap-2 items-end" data-testid={`ligne-${i}`}>
                <div className="col-span-12 sm:col-span-5">
                  <select required aria-label={t("ach.article")} value={l.articleId} onChange={(e) => maj(i, "articleId", e.target.value)} className={inputClass} data-testid={`article-${i}`}>
                    <option value="" disabled>
                      {t("ach.choisirArticle")}
                    </option>
                    {options.articles.map((a) => (
                      <option key={a.id} value={a.id} disabled={articlesPris.has(a.id) && a.id !== l.articleId}>
                        {a.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-5 sm:col-span-2">
                  <input required inputMode="decimal" aria-label={t("ach.quantite")} placeholder={unite ? `${t("ach.quantite")} (${uniteLabel(unite)})` : t("ach.quantite")} value={l.quantite} onChange={(e) => maj(i, "quantite", e.target.value)} className={inputClass} data-testid={`quantite-${i}`} />
                </div>
                <div className="col-span-5 sm:col-span-3">
                  <input required inputMode="decimal" aria-label={t("ach.prixUnitaire")} placeholder={t("ach.prixUnitaire")} value={l.prixUnitaire} onChange={(e) => maj(i, "prixUnitaire", e.target.value)} className={inputClass} data-testid={`prix-${i}`} />
                </div>
                <div className="col-span-2 sm:col-span-2 text-right">
                  <Button type="button" variant="ghost" size="sm" icon={Trash2} disabled={lignes.length === 1} onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))} aria-label={t("ach.retirerLigne")} />
                </div>
                <FieldError messages={details?.lignes} />
              </div>
            );
          })}
          <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={() => setLignes((ls) => [...ls, ligneVide()])} data-testid="ajouter-ligne">
            {t("ach.ajouterLigne")}
          </Button>
          <p className="text-right text-sm font-medium text-neutral-800 dark:text-neutral-200" data-testid="total-achat">
            {t("ach.colTotal")} : {total}
          </p>
        </fieldset>

        <Field label={t("ach.notes")}>
          <textarea rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          <FieldError messages={details?.notes} />
        </Field>

        <div className="flex gap-2 pt-1">
          <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending} data-testid="enregistrer-achat">
            {t("ach.create")}
          </Button>
          <Button type="button" variant="secondary" icon={X} onClick={() => navigate(-1)}>
            {t("common.cancel")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
