import { z } from "zod";

// Helpers Zod partagés, extraits des patterns déjà validés dans Clientes/Mesures.
// Nouveau code uniquement : les schémas existants (cliente.schema.js,
// mesure.schema.js) gardent leurs définitions inline telles quelles — pas de
// refactor hors périmètre sur du code déjà testé et approuvé.

// undefined/"" traités comme "champ non fourni" pour tous les champs optionnels
// (un formulaire frontend envoie souvent "" plutôt que d'omettre la clé).
export const emptyToUndefined = (v) => (v === "" || v === null || v === undefined ? undefined : v);

export function normalizeText(v) {
  return v.trim().replace(/\s+/g, " ");
}

export const optionalTrimmed = (max) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).transform(normalizeText).optional());

/**
 * URL http(s) optionnelle — utilisée pour les champs qui restent de simples
 * liens externes (ex: justificatifUrl des dépenses). Voir optionalImageField
 * ci-dessous pour les champs image upload-able (photoUrl, logoUrl).
 */
export const optionalUrlField = (max = 2048) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(max)
      .superRefine((v, ctx) => {
        let url;
        try {
          url = new URL(v);
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "URL invalide." });
          return;
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Seules les URL http(s) sont acceptées." });
        }
      })
      .optional(),
  );

// data:image/<png|jpeg|jpg|webp|gif>;base64,<...> — format produit par
// fileToResizedDataUrl côté frontend (redimensionnement + compression avant
// envoi, voir frontend/src/lib/imageFile.js).
const IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i;

/**
 * Image optionnelle stockée directement en base (data URL base64) dans le
 * champ texte existant (photoUrl, logoUrl) — pas de service de stockage
 * externe (voir décision : base64 en base plutôt que Vercel Blob, pour rester
 * fonctionnel à l'identique en local et sur Vercel sans configuration
 * supplémentaire). Une URL http(s) reste acceptée en plus, par compatibilité
 * avec une éventuelle valeur déjà enregistrée avant l'introduction de l'upload.
 */
/**
 * Vérifie que le contenu décodé est RÉELLEMENT une image du type annoncé (octets
 * magiques), pas seulement un préfixe `data:image/...` déclaré par le client.
 */
export function signatureImageValide(mime, base64) {
  let buf;
  try {
    buf = Buffer.from(base64.slice(0, 64), "base64");
  } catch {
    return false;
  }
  const type = mime.toLowerCase();
  if (type === "png") return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === "jpeg" || type === "jpg") return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (type === "gif") return ["GIF87a", "GIF89a"].includes(buf.subarray(0, 6).toString("latin1"));
  if (type === "webp") return buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP";
  return false;
}

export const optionalImageField = (maxBytes = 2 * 1024 * 1024) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      // Pas de .max() séparé ici : la taille décodée est déjà vérifiée
      // précisément ci-dessous, et express.json({ limit: "5mb" }) borne de
      // toute façon la taille totale du corps de la requête en amont.
      .superRefine((v, ctx) => {
        const match = v.match(IMAGE_DATA_URL_RE);
        if (match) {
          const base64 = match[2];
          if (!signatureImageValide(match[1], base64)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Le fichier n'est pas une image valide." });
            return;
          }
          const padding = (base64.match(/=*$/) || [""])[0].length;
          const bytes = (base64.length * 3) / 4 - padding;
          if (bytes > maxBytes) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Image trop volumineuse (max ${(maxBytes / (1024 * 1024)).toFixed(1)} Mo).`,
            });
          }
          return;
        }
        // Compatibilité : une URL http(s) déjà enregistrée reste valide.
        let url;
        try {
          url = new URL(v);
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Image invalide." });
          return;
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Image invalide." });
        }
      })
      .optional(),
  );
