import { Users } from "lucide-react";
import { useClientesQuery } from "../../clientes/hooks.js";
import { inputClass } from "../../../components/FormField.jsx";
import { useTranslation } from "../../../i18n/index.js";

// Sélecteur simple (liste bornée à 100 clientes actives, triées par nom —
// cohérent avec le tri par défaut du backend). Pas de recherche serveur ici
// pour rester simple ; à revoir si le nombre de clientes actives dépasse
// largement 100 dans la pratique.
export default function ClientePicker({ value, onChange, required }) {
  const { t } = useTranslation();
  const { data, isPending, isError } = useClientesQuery({ archived: "false", page: 1, pageSize: 100 });

  return (
    <div className="relative">
      <Users className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400 pointer-events-none" aria-hidden="true" />
      <select
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isPending}
        className={`${inputClass} pl-9`}
      >
        <option value="" disabled>
          {isPending ? t("cmd.pickerLoading") : t("cmd.pickerChoisirClient")}
        </option>
        {isError && <option value="">{t("cmd.pickerErreur")}</option>}
        {data?.data.map((cliente) => (
          <option key={cliente.id} value={cliente.id}>
            {cliente.nom} {cliente.prenom} — {cliente.telephone}
          </option>
        ))}
      </select>
    </div>
  );
}
