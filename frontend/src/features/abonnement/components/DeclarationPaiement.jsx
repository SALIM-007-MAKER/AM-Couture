import { useState } from "react";
import { Send, X, Zap } from "lucide-react";
import { MOYENS_PAIEMENT, corpsDeclaration, nouvelleCleIdempotence, operateurPertinent, referenceRequise, validerDeclaration } from "../paiement.js";
import { useSouscrireMutation, usePayerWaveMutation } from "../hooks.js";
import { formatPrix } from "../constants.js";
import Card from "../../../components/Card.jsx";
import Button from "../../../components/Button.jsx";
import { Field, inputClass } from "../../../components/FormField.jsx";
import { FieldError, GlobalFormError } from "../../../components/QueryState.jsx";
import { ApiError } from "../../../lib/apiClient.js";
import { useTranslation } from "../../../i18n/index.js";

/**
 * Formulaire de souscription : l'atelier a choisi une formule et une durée, il DÉCLARE un paiement fait hors de
 * l'application (ou, si Wave est activé, l'ouvre en ligne). Rien ici ne fixe un prix ni n'active un abonnement : le prix
 * est celui du serveur, l'abonnement n'est activé qu'après vérification du paiement.
 */
export default function DeclarationPaiement({ plan, tarif, instructions, waveDisponible, onClose, onDeclare }) {
  const { t } = useTranslation();
  const souscrire = useSouscrireMutation();
  const payerWave = usePayerWaveMutation();
  const [valeurs, setValeurs] = useState({ moyenPaiement: "MOBILE_MONEY", operateur: "", reference: "", preuveNote: "" });
  const [tentative, setTentative] = useState(0);
  const [cle, setCle] = useState(() => nouvelleCleIdempotence());
  const erreursLocales = tentative > 0 ? validerDeclaration({ ...valeurs, dureeMois: tarif.dureeMois }) : {};
  const details = souscrire.error instanceof ApiError ? souscrire.error.details : undefined;

  // Une saisie modifiée est une nouvelle tentative : nouvelle clé, sans quoi le serveur rejouerait l'ancienne réponse.
  function maj(champ, valeur) {
    setValeurs((v) => ({ ...v, [champ]: valeur }));
    setCle(nouvelleCleIdempotence());
  }

  function handleSubmit(e) {
    e.preventDefault();
    setTentative((n) => n + 1);
    if (Object.keys(validerDeclaration({ ...valeurs, dureeMois: tarif.dureeMois })).length > 0) return;
    souscrire.mutate(
      { corps: corpsDeclaration({ planId: plan.id, dureeMois: tarif.dureeMois, ...valeurs }), cle },
      {
        onSuccess: () => {
          setCle(nouvelleCleIdempotence());
          onDeclare();
        },
      },
    );
  }

  function handleWave() {
    payerWave.mutate(
      { corps: { planId: plan.id, dureeMois: tarif.dureeMois }, cle: nouvelleCleIdempotence() },
      {
        onSuccess: (res) => {
          // Redirection vers la page de paiement Wave. On ne suit qu'une adresse https.
          if (typeof res.checkoutUrl === "string" && res.checkoutUrl.startsWith("https://")) window.location.assign(res.checkoutUrl);
        },
      },
    );
  }

  const erreur = (champ) => (erreursLocales[champ] ? [t(erreursLocales[champ])] : details?.[champ]);

  return (
    <Card as="form" variant="outlined" onSubmit={handleSubmit} className="space-y-4" data-testid="declaration-paiement" noValidate>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{t("subPay.sectionTitle")}</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t("subPay.selected", { plan: plan.nom, duree: t("sub.months", { mois: tarif.dureeMois }), prix: formatPrix(tarif.total) })}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" icon={X} onClick={onClose}>
          {t("subPay.close")}
        </Button>
      </div>

      {waveDisponible && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{t("subPay.waveHint")}</p>
          <GlobalFormError error={payerWave.error} />
          <Button type="button" variant="accent" size="sm" icon={Zap} loading={payerWave.isPending} onClick={handleWave}>
            {payerWave.isPending ? t("subPay.waveRedirect") : t("subPay.waveButton")}
          </Button>
        </div>
      )}

      <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800/50 p-3 text-sm space-y-1">
        <p className="font-medium text-neutral-800 dark:text-neutral-200">{t("subPay.howToPay")}</p>
        <p className="whitespace-pre-line text-neutral-600 dark:text-neutral-400" data-testid="instructions-paiement">
          {instructions || t("subPay.noInstructions")}
        </p>
        <p className="text-xs text-neutral-500 pt-1">{t("subPay.intro")}</p>
      </div>

      <GlobalFormError error={souscrire.error} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t("subPay.method")} required>
          <select
            value={valeurs.moyenPaiement}
            onChange={(e) => maj("moyenPaiement", e.target.value)}
            className={inputClass}
          >
            {MOYENS_PAIEMENT.map((m) => (
              <option key={m} value={m}>
                {t(`subPay.methods.${m}`)}
              </option>
            ))}
          </select>
          <FieldError messages={erreur("moyenPaiement")} />
        </Field>

        {operateurPertinent(valeurs.moyenPaiement) && (
          <Field label={t("subPay.operator")}>
            <input
              value={valeurs.operateur}
              maxLength={60}
              placeholder={t("subPay.operatorPlaceholder")}
              onChange={(e) => maj("operateur", e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.operateur} />
          </Field>
        )}

        <Field label={t("subPay.reference")} required={referenceRequise(valeurs.moyenPaiement)} hint={t("subPay.referenceHelp")}>
          <input
            value={valeurs.reference}
            maxLength={120}
            onChange={(e) => maj("reference", e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(erreur("reference"))}
          />
          <FieldError messages={erreur("reference")} />
        </Field>

        <Field label={t("subPay.note")}>
          <input value={valeurs.preuveNote} maxLength={500} onChange={(e) => maj("preuveNote", e.target.value)} className={inputClass} />
          <FieldError messages={details?.preuveNote} />
        </Field>
      </div>

      <Button type="submit" variant="primary" icon={Send} loading={souscrire.isPending}>
        {t("subPay.submit")}
      </Button>
    </Card>
  );
}
