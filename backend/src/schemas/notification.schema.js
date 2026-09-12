import { z } from "zod";
import { emptyToUndefined } from "../lib/zodHelpers.js";

export const listNotificationsQuerySchema = z.object({
  lu: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).transform((v) => v === "true").optional()),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const patchNotificationSchema = z.object({ lu: z.boolean() }).strict();

// Sélection multiple (marquer lu / supprimer en masse, voir demande Phase 4).
// max 200 : borne applicative raisonnable, une page de notifications ne
// dépassera jamais ça en pratique.
export const idsBodySchema = z
  .object({ ids: z.array(z.string().trim().min(1)).min(1, "Au moins un identifiant requis.").max(200) })
  .strict();
