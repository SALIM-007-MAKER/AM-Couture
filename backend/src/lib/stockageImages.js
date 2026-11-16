// Stockage des images du lookbook, derrière une interface : le reste de l'application ne sait pas OÙ sont les octets.
//
// Interface d'un adaptateur :
//   enregistrer(client, { atelierId, mime, octets }) -> { id }
//   lire(client, { id, atelierId })                  -> { mime, octets } | null   (toujours borné à l'atelier)
//   supprimer(client, { id, atelierId })             -> void
//
// Adaptateur fourni : « base de données » (table ImageAtelier). Il sert au développement, aux tests et aux petits
// ateliers. Un adaptateur objet (S3, R2, Vercel Blob) implémenterait les mêmes trois fonctions en stockant les octets
// ailleurs et en ne gardant en base qu'une référence : il n'est PAS fourni ici (aucun compte ni clé disponibles pour le
// vérifier). Brancher un autre adaptateur ne demande que de changer `stockage` ci-dessous.
import { signatureImageValide } from "./zodHelpers.js";

const TYPES = { png: "image/png", jpeg: "image/jpeg", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const DATA_URL = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i;

/** Décode une data URL d'image déjà validée par le schéma ; refuse tout ce dont la signature ne correspond pas au type. */
export function decoderImage(dataUrl) {
  const m = DATA_URL.exec(dataUrl ?? "");
  if (!m || !signatureImageValide(m[1], m[2])) return null;
  const octets = Buffer.from(m[2], "base64");
  return { mime: TYPES[m[1].toLowerCase()], octets };
}

const adaptateurBase = {
  async enregistrer(client, { atelierId, mime, octets }) {
    const image = await client.imageAtelier.create({ data: { atelierId, mime, taille: octets.length, contenu: octets }, select: { id: true } });
    return { id: image.id };
  },
  async lire(client, { id, atelierId }) {
    const image = await client.imageAtelier.findFirst({ where: { id, atelierId }, select: { mime: true, contenu: true } });
    return image ? { mime: image.mime, octets: Buffer.from(image.contenu) } : null;
  },
  async supprimer(client, { id, atelierId }) {
    await client.imageAtelier.deleteMany({ where: { id, atelierId } });
  },
};

export const stockage = adaptateurBase;
