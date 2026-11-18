import { useTranslation } from "../i18n/index.js";

// Logo de la plateforme Tailora, en médaillon rond. Il est bleu nuit sur fond transparent : il est posé sur un disque blanc
// pour rester lisible quel que soit le thème (les écrans d'accès sont sombres). Chemin absolu : le fichier vit dans
// frontend/public.
export default function LogoTailora({ className = "" }) {
  const { t } = useTranslation();
  return (
    <div
      className={`flex size-24 sm:size-28 items-center justify-center overflow-hidden rounded-full bg-white p-1.5 ring-2 ring-amber-400/70 shadow-[0_0_40px_-6px_rgba(217,158,63,0.5)] ${className}`}
    >
      <img src="/logo-tailora.png" alt={t("brand.logoAlt")} width="640" height="640" className="size-full object-contain" />
    </div>
  );
}
