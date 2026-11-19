import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ShoppingCart, PackageCheck, Banknote, Ban } from "lucide-react";
import { useCleOperation } from "../../lib/cleOperation.js";
import { useAchatQuery, useReceptionMutation, usePayerAchatMutation, useAnnulerAchatMutation } from "./hooks.js";
import { BadgeReception, BadgePaiement, BadgeAnnule } from "./Badges.jsx";
import { uniteLabel } from "../stock/constants.js";
import { dateLocale } from "../commandes/constants.js";
import { useCan } from "../../hooks/usePermissions.js";
import { LoadingState, ErrorState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import { ApiError } from "../../lib/apiClient.js";
import { useTranslation } from "../../i18n/index.js";

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString(dateLocale(), { year: "numeric", month: "short", day: "numeric" }) : "—");
const positif = (v) => Number(String(v).replace(",", ".")) > 0;

export default function AchatDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const can = useCan();
  const query = useAchatQuery(id);

  if (query.isPending) return <LoadingState label={t("ach.loadingOne")} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const achat = query.data;
  const annule = achat.statut === "ANNULE";
  const voirFinances = can("finances.voir");
  const peutRecevoir = !annule && (can("achats.recevoir") || can("achats.ecrire"));
  const peutAgir = !annule && can("achats.ecrire");
  const resteARecevoir = achat.lignes.some((l) => positif(l.quantiteRestante));

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={ShoppingCart}
        title={achat.numero}
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            {annule ? <BadgeAnnule /> : <BadgeReception statut={achat.statutReception} />}
            {!annule && <BadgePaiement statut={achat.statutPaiement} />}
            <Link to={`/fournisseurs/${achat.fournisseur.id}`} className="text-sm underline">
              {achat.fournisseur.nom}
            </Link>
          </span>
        }
      />

      <Card className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <Info label={t("ach.dateCommande")} value={formatDate(achat.dateCommande)} />
        <Info label={t("ach.dateAttendue")} value={formatDate(achat.dateAttendue)} />
        {voirFinances && <Info label={t("ach.colTotal")} value={achat.montantTotal} testid="montant-total" />}
        {achat.notes && <div className="sm:col-span-3"><Info label={t("ach.notes")} value={achat.notes} /></div>}
        {annule && <div className="sm:col-span-3 text-neutral-600"><Info label={t("ach.motifAnnulation")} value={achat.annuleMotif} /></div>}
      </Card>

      {peutRecevoir && resteARecevoir ? <ReceptionForm achat={achat} voirFinances={voirFinances} /> : <LignesLecture achat={achat} voirFinances={voirFinances} />}

      {voirFinances && achat.depense && !achat.depense.annuleAt && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {t("ach.depenseLiee")} <Link className="underline" to={`/depenses/${achat.depense.id}`}>{formatDate(achat.depense.date)}</Link>
        </p>
      )}

      {peutAgir && <Actions achat={achat} peutPayer={can("depenses.ecrire")} />}
    </div>
  );
}

function Info({ label, value, testid }) {
  return (
    <div>
      <p className="text-neutral-500 text-xs mb-0.5">{label}</p>
      <p className="text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap" data-testid={testid}>{value || "—"}</p>
    </div>
  );
}

function LignesLecture({ achat, voirFinances }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2">
      <SectionTitle icon={PackageCheck}>{t("ach.lignes")}</SectionTitle>
      <Card variant="outlined" padded={false} className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="table-lignes">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t("ach.article")}</th>
              <th className="px-4 py-3 font-medium text-right">{t("ach.commande")}</th>
              <th className="px-4 py-3 font-medium text-right">{t("ach.recu")}</th>
              {voirFinances && <th className="px-4 py-3 font-medium text-right">{t("ach.prixUnitaire")}</th>}
            </tr>
          </thead>
          <tbody>
            {achat.lignes.map((l) => (
              <tr key={l.id} className="border-t border-neutral-100 dark:border-neutral-800" data-testid={`ligne-${l.article.nom}`}>
                <td className="px-4 py-3 font-medium">{l.article.nom}</td>
                <td className="px-4 py-3 text-right tabular-nums">{l.quantite} {uniteLabel(l.article.unite)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{l.quantiteRecue}</td>
                {voirFinances && <td className="px-4 py-3 text-right tabular-nums">{l.prixUnitaire}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

/** Réception : une quantité par ligne (au plus le reste à recevoir) ; « Tout recevoir » remplit le reste de chaque ligne. */
function ReceptionForm({ achat, voirFinances }) {
  const { t } = useTranslation();
  const mutation = useReceptionMutation(achat.id);
  const [saisie, setSaisie] = useState({});
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;
  const lignes = achat.lignes.filter((l) => positif(l.quantiteRestante));
  const aEnvoyer = lignes.filter((l) => positif(saisie[l.id] ?? "")).map((l) => ({ ligneId: l.id, quantite: String(saisie[l.id]).replace(",", ".") }));
  // Même saisie = même clé : un double clic ne reçoit pas deux fois la marchandise.
  const cle = useCleOperation(JSON.stringify([achat.id, aEnvoyer]));

  return (
    <section className="space-y-2">
      <SectionTitle icon={PackageCheck}>{t("ach.reception.titre")}</SectionTitle>
      <Card
        as="form"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({ lignes: aEnvoyer, cle }, { onSuccess: () => setSaisie({}) });
        }}
        className="space-y-3"
      >
        <GlobalFormError error={mutation.error} />
        <table className="w-full text-sm" data-testid="table-reception">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="py-2 font-medium">{t("ach.article")}</th>
              <th className="py-2 font-medium text-right">{t("ach.commande")}</th>
              <th className="py-2 font-medium text-right">{t("ach.recu")}</th>
              {voirFinances && <th className="py-2 font-medium text-right">{t("ach.prixUnitaire")}</th>}
              <th className="py-2 font-medium text-right">{t("ach.recevoirMaintenant")}</th>
            </tr>
          </thead>
          <tbody>
            {achat.lignes.map((l) => (
              <tr key={l.id} className="border-t border-neutral-100 dark:border-neutral-800" data-testid={`ligne-${l.article.nom}`}>
                <td className="py-2 font-medium">{l.article.nom}</td>
                <td className="py-2 text-right tabular-nums">{l.quantite} {uniteLabel(l.article.unite)}</td>
                <td className="py-2 text-right tabular-nums">{l.quantiteRecue}</td>
                {voirFinances && <td className="py-2 text-right tabular-nums">{l.prixUnitaire}</td>}
                <td className="py-2 text-right">
                  {positif(l.quantiteRestante) ? (
                    <input
                      inputMode="decimal"
                      aria-label={`${t("ach.recevoirMaintenant")} — ${l.article.nom}`}
                      placeholder={l.quantiteRestante}
                      value={saisie[l.id] ?? ""}
                      onChange={(e) => setSaisie((s) => ({ ...s, [l.id]: e.target.value }))}
                      className={`${inputClass} w-28 text-right`}
                      data-testid={`recevoir-${l.article.nom}`}
                    />
                  ) : (
                    <span className="text-green-700 dark:text-green-400">✓</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <FieldError messages={details?.lignes} />
        <div className="flex gap-2">
          <Button type="submit" variant="primary" icon={PackageCheck} disabled={aEnvoyer.length === 0} loading={mutation.isPending} data-testid="valider-reception">
            {t("ach.reception.valider")}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setSaisie(Object.fromEntries(lignes.map((l) => [l.id, l.quantiteRestante])))} data-testid="tout-recevoir">
            {t("ach.toutRecevoir")}
          </Button>
        </div>
      </Card>
    </section>
  );
}

function Actions({ achat, peutPayer }) {
  const { t } = useTranslation();
  const payer = usePayerAchatMutation(achat.id);
  const annuler = useAnnulerAchatMutation(achat.id);
  const [confirmePaiement, setConfirmePaiement] = useState(false);
  const [annulation, setAnnulation] = useState(false);
  const [motif, setMotif] = useState("");
  const paye = achat.statutPaiement === "PAYE";
  const details = annuler.error instanceof ApiError ? annuler.error.details : undefined;

  return (
    <Card variant="outlined" className="space-y-4">
      <SectionTitle icon={Banknote}>{t("ach.actions")}</SectionTitle>
      <GlobalFormError error={payer.error} />
      {peutPayer && !paye && (
        confirmePaiement ? (
          <div className="space-y-2">
            <p className="text-sm">{t("ach.payerConfirm", { montant: achat.montantTotal })}</p>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" icon={Banknote} loading={payer.isPending} onClick={() => payer.mutate(undefined, { onSuccess: () => setConfirmePaiement(false) })} data-testid="confirmer-paiement">
                {t("ach.payerOui")}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmePaiement(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" icon={Banknote} onClick={() => setConfirmePaiement(true)} data-testid="payer">
            {t("ach.payer")}
          </Button>
        )
      )}
      {paye && <p className="text-sm text-green-700 dark:text-green-400">{t("ach.dejaPaye")}</p>}

      <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3">
        <GlobalFormError error={annuler.error} />
        {annulation ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              annuler.mutate(motif, { onSuccess: () => setAnnulation(false) });
            }}
          >
            <Field label={t("ach.motifAnnulation")} required>
              <input required minLength={3} maxLength={500} value={motif} onChange={(e) => setMotif(e.target.value)} className={inputClass} data-testid="motif-annulation" />
              <FieldError messages={details?.motif} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="danger" size="sm" icon={Ban} loading={annuler.isPending} data-testid="confirmer-annulation">
                {t("ach.annulerConfirm")}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setAnnulation(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="danger-ghost" size="sm" icon={Ban} onClick={() => setAnnulation(true)} data-testid="annuler-achat">
            {t("ach.annuler")}
          </Button>
        )}
        <p className="text-xs text-neutral-500 mt-2">{t("ach.annulerNote")}</p>
      </div>
    </Card>
  );
}
