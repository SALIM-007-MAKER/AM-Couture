import { Link } from "react-router-dom";
import { Compass, Home } from "lucide-react";
import { useTranslation } from "../i18n/index.js";

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-svh flex items-center justify-center bg-neutral-50 dark:bg-neutral-900">
      <div className="text-center space-y-3">
        <Compass className="mx-auto size-10 text-neutral-300 dark:text-neutral-700" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{t("ui.notFound.title")}</h1>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm underline text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
        >
          <Home className="size-4" aria-hidden="true" />
          {t("ui.notFound.home")}
        </Link>
      </div>
    </div>
  );
}
