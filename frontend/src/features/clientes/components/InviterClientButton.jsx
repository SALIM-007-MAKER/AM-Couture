import { useState } from "react";
import { UserPlus, Copy, Check, CheckCircle2 } from "lucide-react";
import { useInviterClienteMutation } from "../hooks.js";
import { GlobalFormError } from "../../../components/QueryState.jsx";
import Button from "../../../components/Button.jsx";
import Card from "../../../components/Card.jsx";
import { useTranslation } from "../../../i18n/index.js";

/**
 * Invite un client à créer son propre compte (§ plan rôle USER, Phase 3) —
 * pas d'infrastructure SMS dans ce projet : le lien d'activation n'est
 * affiché QU'UNE FOIS, à l'ADMIN de le transmettre au client par le canal de
 * son choix (WhatsApp, appel...), exactement comme le mot de passe généré
 * par le SUPERADMIN (voir ReinitialiserMotDePasseForm, AtelierDetailPage.jsx).
 */
export default function InviterClientButton({ clienteId, clienteEmail }) {
  const { t } = useTranslation();
  const mutation = useInviterClienteMutation(clienteId);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard
      ?.writeText(mutation.data.lienActivation)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Presse-papiers indisponible — le lien reste affiché et
        // sélectionnable à la main (voir `select-all` ci-dessous).
      });
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" icon={UserPlus} onClick={() => setOpen(true)}>
        {t("clientes.inviter.inviterCeClient")}
      </Button>
    );
  }

  if (mutation.data) {
    return (
      <Card variant="outlined" className="w-full space-y-2">
        <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          {clienteEmail
            ? t("clientes.inviter.compteCreeEmail", { email: clienteEmail })
            : t("clientes.inviter.compteCreeSansEmail")}
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate rounded-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs font-mono select-all">
            {mutation.data.lienActivation}
          </code>
          <Button type="button" variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={handleCopy}>
            {copied ? t("clientes.inviter.copie") : t("clientes.inviter.copier")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="outlined" className="w-full space-y-2">
      <GlobalFormError error={mutation.error} />
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{t("clientes.inviter.confirmerInvitationTexte")}</p>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" loading={mutation.isPending} onClick={() => mutation.mutate()}>
          {t("clientes.inviter.confirmerInvitation")}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={mutation.isPending}>
          {t("common.cancel")}
        </Button>
      </div>
    </Card>
  );
}
