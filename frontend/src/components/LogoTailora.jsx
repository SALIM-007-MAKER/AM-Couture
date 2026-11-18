import { useTranslation } from "../i18n/index.js";

// Logo de la plateforme Tailora. Le logo est bleu nuit sur fond transparent : il est posé sur une carte blanche pour rester
// lisible quel que soit le thème (les écrans d'accès sont sombres). Chemin absolu : le fichier vit dans frontend/public.
export default function LogoTailora({ className = "" }) {
  const { t } = useTranslation();
  return (
    <div
      className={`rounded-3xl bg-white p-3 shadow-[0_0_50px_-5px_rgba(217,158,63,0.45)] ${className}`}
    >
      <img src="/logo-tailora.png" alt={t("brand.logoAlt")} width="640" height="640" className="size-40 sm:size-48 object-contain" />
    </div>
  );
}
