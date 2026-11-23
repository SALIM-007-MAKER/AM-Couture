import { Gauge } from "lucide-react";
import { useUtilisationQuery } from "../hooks.js";
import JaugesUtilisation from "./JaugesUtilisation.jsx";
import { LoadingState, ErrorState } from "../../../components/QueryState.jsx";
import Card from "../../../components/Card.jsx";
import SectionTitle from "../../../components/SectionTitle.jsx";
import { useTranslation } from "../../../i18n/index.js";

/** Consommation des quotas de la formule (PDG) : une jauge par ressource, ce qui s'applique et pourquoi. */
export default function UtilisationCard() {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useUtilisationQuery();

  return (
    <div className="space-y-2" data-testid="utilisation-formule">
      <SectionTitle icon={Gauge}>{t("quotas.utilisation.titre")}</SectionTitle>
      {isPending && <LoadingState label={t("common.loading")} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && (
        <Card variant="outlined" className="space-y-4">
          <JaugesUtilisation data={data} />
        </Card>
      )}
    </div>
  );
}
