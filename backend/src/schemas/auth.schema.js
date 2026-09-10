import { z } from "zod";

export const loginSchema = z.object({
  identifiant: z.string().trim().min(1, "Identifiant requis."),
  password: z.string().min(1, "Mot de passe requis."),
});
