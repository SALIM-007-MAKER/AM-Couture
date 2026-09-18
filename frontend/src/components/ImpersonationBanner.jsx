import { useNavigate } from "react-router-dom";
import { UserCog, LogOut } from "lucide-react";
import { useMeQuery, useQuitterImpersonationMutation } from "../hooks/useAuth.js";
import Button from "./Button.jsx";
import { useTranslation } from "../i18n/index.js";

/**
 * Bandeau visible sur TOUTE page de l'app quand la session en cours est une
 * impersonation SUPERADMIN (voir GET /auth/me → impersonation, et POST
 * /ateliers/:id/comptes/:userId/impersonation côté SUPERADMIN qui la
 * déclenche) — rappel permanent qu'on agit "en tant que" ce compte, jamais
 * silencieux. `atelierId` est capturé AVANT de quitter : une fois la session
 * SUPERADMIN restaurée, `me.atelierId` redevient null (voir schema.prisma).
 */
export default function ImpersonationBanner() {
  const { t } = useTranslation();
  const { data: user } = useMeQuery();
  const navigate = useNavigate();
  const mutation = useQuitterImpersonationMutation();

  if (!user?.impersonation) return null;

  function handleQuitter() {
    const atelierId = user.atelierId;
    mutation.mutate(undefined, {
      onSuccess: () => navigate(atelierId ? `/ateliers/${atelierId}` : "/ateliers"),
    });
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500 text-amber-950 text-sm px-4 py-2 flex-wrap">
      <span className="flex items-center gap-1.5 font-medium">
        <UserCog className="size-4 shrink-0" aria-hidden="true" />
        {t("ui.impersonation.banner", { identifiant: user.identifiant, superadmin: user.impersonation.superadminIdentifiant })}
      </span>
      <Button variant="secondary" size="sm" icon={LogOut} loading={mutation.isPending} onClick={handleQuitter}>
        {t("ui.impersonation.quit")}
      </Button>
    </div>
  );
}
