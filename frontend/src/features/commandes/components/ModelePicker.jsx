import { useQuery } from "@tanstack/react-query";
import { Shirt } from "lucide-react";
import { modelesApi } from "../../modeles/api.js";
import { inputClass } from "../../../components/FormField.jsx";
import { useTranslation } from "../../../i18n/index.js";

// N'importe QUE la fonction fetch pure de la feature Modèles (api.js), pas
// ses hooks/pages — simple découplage (Commandes ne dépend d'aucun composant
// UI d'une autre feature). Hook de requête défini ici, local à Commandes.
function useModeleOptionsQuery() {
  return useQuery({
    queryKey: ["modeles", "options"],
    queryFn: () => modelesApi.list({ archived: "false", page: 1, pageSize: 100 }),
  });
}

// Optionnel (contrairement à ClientePicker) : reflète modeleId nullable côté
// backend. `value === ""` signifie "aucun modèle" (envoyé comme `undefined`
// au submit, voir CommandeFormPage.jsx).
export default function ModelePicker({ value, onChange }) {
  const { t } = useTranslation();
  const { data, isPending, isError } = useModeleOptionsQuery();

  return (
    <div className="relative">
      <Shirt className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400 pointer-events-none" aria-hidden="true" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isPending}
        className={`${inputClass} pl-9`}
      >
        <option value="">{isPending ? t("cmd.pickerLoading") : t("cmd.pickerAucunModele")}</option>
        {isError && <option value="">{t("cmd.pickerErreur")}</option>}
        {data?.data.map((modele) => (
          <option key={modele.id} value={modele.id}>
            {modele.nom}
          </option>
        ))}
      </select>
    </div>
  );
}
