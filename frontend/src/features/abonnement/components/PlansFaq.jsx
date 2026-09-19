import { HelpCircle } from "lucide-react";
import SectionTitle from "../../../components/SectionTitle.jsx";
import { useTranslation } from "../../../i18n/index.js";

const QUESTIONS = [1, 2, 3, 4];

// Questions fréquentes — réponses volontairement alignées sur le
// fonctionnement RÉEL (activation manuelle, aucun paiement en ligne).
export default function PlansFaq() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <SectionTitle icon={HelpCircle}>{t("sub.faqTitle")}</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
        {QUESTIONS.map((n) => (
          <div key={n}>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t(`sub.faq.q${n}`)}</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{t(`sub.faq.a${n}`)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
