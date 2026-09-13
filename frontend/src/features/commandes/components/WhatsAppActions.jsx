import { useState } from "react";
import { MessageCircle, Share2 } from "lucide-react";
import { statutLabel } from "../constants.js";
import { fichePdfUrl } from "../api.js";
import {
  waMeLink,
  buildStatutMessage,
  buildPretMessage,
  buildRecuMessage,
  peutPartagerFichier,
  partagerPdfNatif,
} from "../../../lib/whatsapp.js";
import Button from "../../../components/Button.jsx";

/**
 * Actions WhatsApp de la fiche commande (Phase 3, étendu ensuite) — voir
 * frontend/src/lib/whatsapp.js pour la construction des liens/messages/
 * partage de fichier.
 *
 * "Prêt — WhatsApp" remplace "Envoyer le statut" une fois la commande au
 * statut TERMINEE (pas de statut "PRÊT" dédié dans l'enum — voir audit
 * Phase 3, TERMINEE est déjà sémantiquement "prête à récupérer").
 *
 * "Partager le reçu" envoie le VRAI PDF (fiche commande) via la feuille de
 * partage native de l'appareil quand c'est possible (mobile, voir
 * peutPartagerFichier()) — l'utilisateur y choisit WhatsApp lui-même,
 * aucune API ne permet un envoi automatique direct depuis un navigateur.
 * Sans ce support (desktop, navigateurs plus anciens), on retombe sur un
 * simple lien wa.me avec un résumé texte, jamais un bouton qui prétend
 * partager un fichier sans le faire réellement.
 */
export default function WhatsAppActions({ commande, atelier }) {
  const [partageEnCours, setPartageEnCours] = useState(false);
  const [erreurPartage, setErreurPartage] = useState(null);

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
  const lienRecuTexteSeul = waMeLink(cliente.telephone, messageRecu);

  const partageFichierSupporte = peutPartagerFichier();

  async function handlePartagerRecu() {
    setErreurPartage(null);
    setPartageEnCours(true);
    try {
      await partagerPdfNatif({
        pdfUrl: fichePdfUrl(commande.id),
        nomFichier: `${commande.numero}.pdf`,
        texte: messageRecu,
      });
    } catch (err) {
      // AbortError : l'utilisateur a simplement fermé la feuille de partage
      // sans rien choisir — pas une vraie erreur à afficher.
      if (err?.name !== "AbortError") {
        setErreurPartage(err.message || "Le partage a échoué.");
      }
    } finally {
      setPartageEnCours(false);
    }
  }

  if (!lienStatut && !lienRecuTexteSeul) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {lienStatut && (
          <Button as="a" href={lienStatut} target="_blank" rel="noreferrer" variant="whatsapp" size="sm" icon={MessageCircle}>
            {estPrete ? "Prêt — WhatsApp" : "Envoyer le statut au client"}
          </Button>
        )}
        {partageFichierSupporte ? (
          <Button
            variant="secondary"
            size="sm"
            icon={Share2}
            loading={partageEnCours}
            onClick={handlePartagerRecu}
          >
            Partager le reçu (PDF)
          </Button>
        ) : (
          lienRecuTexteSeul && (
            <Button
              as="a"
              href={lienRecuTexteSeul}
              target="_blank"
              rel="noreferrer"
              variant="secondary"
              size="sm"
              icon={Share2}
              title="Partage de fichier non pris en charge sur cet appareil — résumé texte uniquement"
            >
              Partager le reçu (résumé texte)
            </Button>
          )
        )}
      </div>
      {erreurPartage && <p className="text-xs text-red-600 dark:text-red-400">{erreurPartage}</p>}
    </div>
  );
}
