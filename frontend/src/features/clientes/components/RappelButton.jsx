import { MessageCircle } from "lucide-react";
import { useCommandesQuery } from "../../commandes/hooks.js";
import { useParametresQuery } from "../../parametres/hooks.js";
import { waMeLink, buildRappelMessage } from "../../../lib/whatsapp.js";
import Button from "../../../components/Button.jsx";
import { useTranslation } from "../../../i18n/index.js";

/**
 * "Envoyer un rappel" (Phase 3, fiche client) — priorité à une commande
 * TERMINEE (prête à récupérer, pas encore livrée) sur le rappel de solde :
 * une cliente qui doit venir chercher sa commande est plus urgent qu'un
 * rappel de paiement générique. `pageSize: 1` suffit, on ne teste que
 * l'existence d'au moins une commande dans cet état (voir
 * listCommandesQuerySchema, backend/src/schemas/commande.schema.js — filtre
 * clienteId+statut déjà pris en charge, rien à ajouter côté API).
 */
export default function RappelButton({ cliente, totalRestant }) {
  const { t } = useTranslation();
  const commandePreteQuery = useCommandesQuery({ clienteId: cliente.id, statut: "TERMINEE", pageSize: 1 });
  const atelierQuery = useParametresQuery();
  const atelier = atelierQuery.data;
  const commandePrete = commandePreteQuery.data?.data?.[0];

  const aRestantAPayer = Number(totalRestant) > 0;
  if (!commandePrete && !aRestantAPayer) return null;

  const message = buildRappelMessage({
    cliente,
    atelier,
    commandePrete,
    totalRestant,
    devise: atelier?.devise,
  });
  const lien = waMeLink(cliente.telephone, message);
  if (!lien) return null;

  return (
    <Button as="a" href={lien} target="_blank" rel="noreferrer" variant="whatsapp" size="sm" icon={MessageCircle}>
      {t("cli.rappel.send")}
    </Button>
  );
}
