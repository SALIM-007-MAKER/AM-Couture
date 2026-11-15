import { useState } from "react";
import { Link } from "react-router-dom";
import { Banknote, Building2, Check, FileText, Undo2, X } from "lucide-react";
import {
  usePaiementsAdminQuery,
  useConfirmerPaiementMutation,
  useRejeterPaiementMutation,
  useRembourserPaiementMutation,
} from "../../features/commerce/hooks.js";
import { paiementsAdminApi } from "../../features/commerce/api.js";
import { BadgeTransaction } from "../../features/abonnement/components/HistoriquePaiements.jsx";
import { formatDateFr, formatPrix } from "../../features/abonnement/constants.js";
import { LoadingState, ErrorState, EmptyState, GlobalFormError } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Pagination from "../../components/Pagination.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { inputClass } from "../../components/FormField.jsx";
import { useTranslation } from "../../i18n/index.js";

const STATUTS = ["EN_ATTENTE", "REUSSIE", "ECHOUEE", "ANNULEE", "EXPIREE", "REMBOURSEE"];

// Décision sur un paiement : confirmer demande une confirmation explicite (rapprochement avec le relevé), rejeter et
// rembourser exigent un motif. Le serveur applique chaque décision une seule fois.
function Decision({ tx }) {
  const { t } = useTranslation();
  const confirmer = useConfirmerPaiementMutation();
  const rejeter = useRejeterPaiementMutation();
  const rembourser = useRembourserPaiementMutation();
  const [mode, setMode] = useState(null); // "confirmer" | "rejeter" | "rembourser"
  const [motif, setMotif] = useState("");
  const wave = tx.moyenPaiement === "WAVE";
  const erreur = confirmer.error ?? rejeter.error ?? rembourser.error;
  const fermer = () => {
    setMode(null);
    setMotif("");
  };

  if (mode === "confirmer") {
    return (
      <div className="space-y-2 max-w-xs">
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          {t("saPay.confirmQuestion", { montant: formatPrix(tx.montant), reference: tx.referenceExterne ?? "—" })}
        </p>
        <GlobalFormError error={erreur} />
        <div className="flex gap-2 flex-wrap">
          <Button variant="primary" size="sm" icon={Check} loading={confirmer.isPending} onClick={() => confirmer.mutate(tx.id, { onSuccess: fermer })}>
            {t("saPay.confirmYes")}
          </Button>
          <Button variant="secondary" size="sm" icon={X} onClick={fermer}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "rejeter" || mode === "rembourser") {
    const mutation = mode === "rejeter" ? rejeter : rembourser;
    return (
      <div className="space-y-2 max-w-xs">
        <input
          value={motif}
          maxLength={500}
          placeholder={t("saPay.reasonPlaceholder")}
          onChange={(e) => setMotif(e.target.value)}
          className={inputClass}
          aria-label={t("saPay.reasonPlaceholder")}
        />
        {mode === "rembourser" && <p className="text-xs text-neutral-500">{t("saPay.refundNote")}</p>}
        <GlobalFormError error={erreur} />
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="danger"
            size="sm"
            loading={mutation.isPending}
            disabled={motif.trim().length < 3}
            onClick={() => mutation.mutate({ id: tx.id, motif: motif.trim() }, { onSuccess: fermer })}
          >
            {mode === "rejeter" ? t("saPay.rejectConfirm") : t("saPay.refundConfirm")}
          </Button>
          <Button variant="secondary" size="sm" icon={X} onClick={fermer}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {tx.statut === "EN_ATTENTE" && !wave && (
        <>
          <Button variant="primary" size="sm" icon={Check} onClick={() => setMode("confirmer")} data-testid={`confirmer-${tx.numero}`}>
            {t("saPay.confirm")}
          </Button>
          <Button variant="danger-ghost" size="sm" icon={X} onClick={() => setMode("rejeter")}>
            {t("saPay.reject")}
          </Button>
        </>
      )}
      {tx.statut === "EN_ATTENTE" && wave && <span className="text-xs text-neutral-500">{t("saPay.waveAuto")}</span>}
      {tx.statut === "REUSSIE" && (
        <Button variant="danger-ghost" size="sm" icon={Undo2} onClick={() => setMode("rembourser")}>
          {t("saPay.refund")}
        </Button>
      )}
    </div>
  );
}

export default function PaiementsAbonnementPage() {
  const { t } = useTranslation();
  const [statut, setStatut] = useState("EN_ATTENTE");
  const [page, setPage] = useState(1);
  const { data, isPending, isError, error, refetch } = usePaiementsAdminQuery({ statut, page, pageSize: 20 });
  const lignes = data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Banknote}
        title={t("saPay.title")}
        subtitle={t("saPay.subtitle")}
        actions={
          <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            {t("saPay.filterStatus")}
            <select
              value={statut}
              onChange={(e) => {
                setStatut(e.target.value);
                setPage(1);
              }}
              className={`${inputClass} w-auto`}
              data-testid="filtre-statut"
            >
              <option value="">{t("saPay.filterAll")}</option>
              {STATUTS.map((s) => (
                <option key={s} value={s}>
                  {t(`subPay.txStatus.${s}`)}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {isPending && <LoadingState label={t("saPay.loading")} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && lignes.length === 0 && <EmptyState icon={Banknote}>{t("saPay.empty")}</EmptyState>}

      {lignes.length > 0 && (
        <Card variant="outlined" padded={false} className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-paiements">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t("saPay.colWorkshop")}</th>
                <th className="px-4 py-3 font-medium">{t("saPay.colDeclared")}</th>
                <th className="px-4 py-3 font-medium">{t("saPay.colAmount")}</th>
                <th className="px-4 py-3 font-medium">{t("saPay.colMethod")}</th>
                <th className="px-4 py-3 font-medium">{t("saPay.colReference")}</th>
                <th className="px-4 py-3 font-medium">{t("saPay.colStatus")}</th>
                <th className="px-4 py-3 font-medium">{t("saPay.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((tx) => (
                <tr key={tx.id} className="border-t border-neutral-100 dark:border-neutral-800 align-top" data-testid={`ligne-${tx.numero}`}>
                  <td className="px-4 py-3">
                    <Link to={`/ateliers/${tx.atelierId}`} className="flex items-center gap-1.5 font-medium hover:underline">
                      <Building2 className="size-3.5 text-neutral-400" aria-hidden="true" />
                      {tx.atelierNom ?? "—"}
                    </Link>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {tx.abonnement ? t("saPay.plan", { plan: tx.abonnement.planNom ?? "—", duree: tx.abonnement.dureeMois ?? "—" }) : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDateFr(tx.declareLe ?? tx.createdAt)}
                    {tx.declarePar && <p className="text-xs text-neutral-500">{t("saPay.declaredBy", { par: tx.declarePar })}</p>}
                  </td>
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">{formatPrix(tx.montant)} FCFA</td>
                  <td className="px-4 py-3">
                    {t(`subPay.methods.${tx.moyenPaiement}`)}
                    {tx.operateur && <p className="text-xs text-neutral-500">{t("saPay.operator", { operateur: tx.operateur })}</p>}
                  </td>
                  <td className="px-4 py-3 max-w-[14rem]">
                    <span className="font-mono text-xs break-all">{tx.referenceExterne ?? "—"}</span>
                    <p className="text-xs text-neutral-400 mt-0.5">{tx.numero}</p>
                    {tx.preuveNote && <p className="text-xs text-neutral-500 mt-1">{t("saPay.noteLabel", { note: tx.preuveNote })}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <BadgeTransaction statut={tx.statut} />
                    {tx.confirmePar && tx.confirmeLe && (
                      <p className="text-xs text-neutral-500 mt-1">{t("saPay.decidedBy", { par: tx.confirmePar, date: formatDateFr(tx.confirmeLe) })}</p>
                    )}
                    {tx.motifRejet && <p className="text-xs text-neutral-500 mt-1">{t("subPay.reason", { motif: tx.motifRejet })}</p>}
                    {tx.motifRemboursement && <p className="text-xs text-neutral-500 mt-1">{t("subPay.reason", { motif: tx.motifRemboursement })}</p>}
                    {tx.facture && (
                      <a
                        href={paiementsAdminApi.urlFacture(tx.facture.id)}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        <FileText className="size-3" aria-hidden="true" />
                        {t("saPay.invoice")} {tx.facture.numero}
                        {tx.facture.annuleeLe ? ` (${t("saPay.invoiceCancelled")})` : ""}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Decision tx={tx} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {data && <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}
    </div>
  );
}
