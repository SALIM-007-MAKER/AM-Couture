import { useAtelierUtilisationQuery } from "../hooks.js";
import JaugesUtilisation from "../../abonnement/components/JaugesUtilisation.jsx";
import { LoadingState, ErrorState } from "../../../components/QueryState.jsx";
import Card from "../../../components/Card.jsx";
import { useTranslation } from "../../../i18n/index.js";

/** Consommation des quotas d'un atelier, vue par le SUPERADMIN (lecture seule). */
export default function UtilisationAtelierSection({ atelierId }) {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useAtelierUtilisationQuery(atelierId);
  return (
    <div data-testid="utilisation-atelier">
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
