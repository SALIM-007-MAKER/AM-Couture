import { MessageCircle, Share2 } from "lucide-react";
import { statutLabel } from "../constants.js";
import { waMeLink, buildStatutMessage, buildPretMessage, buildRecuMessage } from "../../../lib/whatsapp.js";
import Button from "../../../components/Button.jsx";

/**
 * Actions WhatsApp de la fiche commande (Phase 3) — voir frontend/src/lib/whatsapp.js
 * pour la construction des liens/messages. Aucun appel réseau : ce sont de
 * simples liens `wa.me` ouverts dans un nouvel onglet, comme les liens PDF
 * existants (voir RecusSection.jsx).
 *
 * "Prêt — WhatsApp" remplace "Envoyer le statut" une fois la commande au
 * statut TERMINEE (pas de statut "PRÊT" dédié dans l'enum — voir audit
 * Phase 3, TERMINEE est déjà sémantiquement "prête à récupérer").
 */
export default function WhatsAppActions({ commande, atelier }) {
  const cliente = commande.cliente;
  const estPrete = commande.statut === "TERMINEE";

  const messageStatut = estPrete
    ? buildPretMessage({ cliente, atelier })
    : buildStatutMessage({ commande, cliente, atelier, statutLabel: statutLabel(commande.statut) });
  const lienStatut = waMeLink(cliente.telephone, messageStatut);

  const messageRecu = buildRecuMessage({
    commande,
    cliente,
    atelier,
    totalPaye: commande.totalPaye,
    solde: commande.solde,
  });
  const lienRecu = waMeLink(cliente.telephone, messageRecu);

  if (!lienStatut && !lienRecu) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {lienStatut && (
        <Button as="a" href={lienStatut} target="_blank" rel="noreferrer" variant="whatsapp" size="sm" icon={MessageCircle}>
          {estPrete ? "Prêt — WhatsApp" : "Envoyer le statut au client"}
        </Button>
      )}
      {lienRecu && (
        <Button as="a" href={lienRecu} target="_blank" rel="noreferrer" variant="secondary" size="sm" icon={Share2}>
          Partager le reçu (WhatsApp)
        </Button>
      )}
    </div>
  );
}
