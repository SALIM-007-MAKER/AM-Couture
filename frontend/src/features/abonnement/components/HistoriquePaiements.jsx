import { FileText, Receipt } from "lucide-react";
import { useTransactionsAbonnementQuery } from "../hooks.js";
import { abonnementsApi } from "../api.js";
import { styleTransaction } from "../paiement.js";
import { formatDateFr, formatPrix } from "../constants.js";
import Card from "../../../components/Card.jsx";
import SectionTitle from "../../../components/SectionTitle.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../../components/QueryState.jsx";
import { useTranslation } from "../../../i18n/index.js";

export function BadgeTransaction({ statut }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styleTransaction(statut)}`}>
      {t(`subPay.txStatus.${statut}`)}
    </span>
  );
}

/** Historique des paiements de l'atelier, avec le justificatif PDF des paiements confirmés. */
export default function HistoriquePaiements() {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useTransactionsAbonnementQuery();
  const lignes = data?.data ?? [];

  return (
    <div className="space-y-2" data-testid="historique-paiements">
      <SectionTitle icon={Receipt}>{t("subPay.historyTitle")}</SectionTitle>
      {isPending && <LoadingState />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && lignes.length === 0 && <EmptyState icon={Receipt}>{t("subPay.historyEmpty")}</EmptyState>}
      {lignes.length > 0 && (
        <Card variant="outlined" padded={false} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t("subPay.colDate")}</th>
                <th className="px-4 py-3 font-medium">{t("subPay.colNumber")}</th>
                <th className="px-4 py-3 font-medium">{t("subPay.colPlan")}</th>
                <th className="px-4 py-3 font-medium">{t("subPay.colAmount")}</th>
                <th className="px-4 py-3 font-medium">{t("subPay.colMethod")}</th>
                <th className="px-4 py-3 font-medium">{t("subPay.colStatus")}</th>
                <th className="px-4 py-3 font-medium">{t("subPay.colInvoice")}</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((tx) => (
                <tr key={tx.id} className="border-t border-neutral-100 dark:border-neutral-800 align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateFr(tx.declareLe ?? tx.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{tx.numero}</td>
                  <td className="px-4 py-3">
                    {tx.abonnement?.planNom ?? "—"}
                    {tx.abonnement?.dureeMois ? ` — ${t("sub.months", { mois: tx.abonnement.dureeMois })}` : ""}
                  </td>
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">{formatPrix(tx.montant)} FCFA</td>
                  <td className="px-4 py-3">{t(`subPay.methods.${tx.moyenPaiement}`)}</td>
                  <td className="px-4 py-3">
                    <BadgeTransaction statut={tx.statut} />
                    {tx.motifRejet && <p className="text-xs text-neutral-500 mt-1">{t("subPay.reason", { motif: tx.motifRejet })}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {tx.facture ? (
                      <span className="flex flex-col gap-0.5">
                        <a
                          href={abonnementsApi.urlFacture(tx.facture.id)}
                          className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          <FileText className="size-3.5" aria-hidden="true" />
                          {tx.facture.numero}
                        </a>
                        {tx.facture.annuleeLe && <span className="text-xs text-red-600">{t("subPay.invoiceCancelled")}</span>}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
