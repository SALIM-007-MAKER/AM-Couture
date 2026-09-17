import { useState } from "react";
import { UserPlus, Copy, Check, CheckCircle2 } from "lucide-react";
import { useInviterClienteMutation } from "../hooks.js";
import { GlobalFormError } from "../../../components/QueryState.jsx";
import Button from "../../../components/Button.jsx";
import Card from "../../../components/Card.jsx";

/**
 * Invite un client à créer son propre compte (§ plan rôle USER, Phase 3) —
 * pas d'infrastructure SMS dans ce projet : le lien d'activation n'est
 * affiché QU'UNE FOIS, à l'ADMIN de le transmettre au client par le canal de
 * son choix (WhatsApp, appel...), exactement comme le mot de passe généré
 * par le SUPERADMIN (voir ReinitialiserMotDePasseForm, AtelierDetailPage.jsx).
 */
export default function InviterClientButton({ clienteId }) {
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
        Inviter ce client
      </Button>
    );
  }

  if (mutation.data) {
    return (
      <Card variant="outlined" className="w-full space-y-2">
        <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          Compte créé — transmettez ce lien au client pour qu'il choisisse son mot de passe (valable 7 jours).
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate rounded-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs font-mono select-all">
            {mutation.data.lienActivation}
          </code>
          <Button type="button" variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={handleCopy}>
            {copied ? "Copié" : "Copier"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="outlined" className="w-full space-y-2">
      <GlobalFormError error={mutation.error} />
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Créer un accès pour que ce client suive lui-même ses commandes, mesures et paiements ?
      </p>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Confirmer l'invitation
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={mutation.isPending}>
          Annuler
        </Button>
      </div>
    </Card>
  );
}
