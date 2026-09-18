import { Link } from "react-router-dom";
import { Wallet, Receipt, FileText, ChevronRight } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import { useTranslation } from "../i18n/index.js";

// Page d'accès rapide — existe uniquement pour donner à "Finances" une
// destination unique en un clic depuis la bottom navigation mobile (voir
// AppLayout.jsx). Regroupe les trois modules déjà réunis sous "Finances"
// dans la sidebar desktop (Paiements/Dépenses/Reçus) : aucune nouvelle
// donnée, aucune logique métier, juste des liens vers les pages existantes.
const LIENS = [
  { labelKey: "nav.payments", to: "/paiements", icon: Wallet, descriptionKey: "ui.finances.paymentsDesc" },
  { labelKey: "nav.expenses", to: "/depenses", icon: Receipt, descriptionKey: "ui.finances.expensesDesc" },
  { labelKey: "nav.receipts", to: "/recus", icon: FileText, descriptionKey: "ui.finances.receiptsDesc" },
];

export default function FinancesPage() {
  const { t } = useTranslation();
  return (
    <div className="max-w-xl space-y-5">
      <PageHeader icon={Wallet} title={t("nav.finances")} subtitle={t("ui.finances.subtitle")} />

      <div className="space-y-2">
        {LIENS.map((lien) => (
          <Card
            key={lien.to}
            as={Link}
            to={lien.to}
            variant="outlined"
            className="flex items-center gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 hover:shadow-md transition-all"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400">
              <lien.icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-neutral-900 dark:text-neutral-100">{t(lien.labelKey)}</p>
              <p className="text-sm text-neutral-500 truncate">{t(lien.descriptionKey)}</p>
            </div>
            <ChevronRight className="size-4 text-neutral-400 shrink-0" aria-hidden="true" />
          </Card>
        ))}
      </div>
    </div>
  );
}
