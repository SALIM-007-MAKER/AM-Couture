import { Link, useParams } from "react-router-dom";
import { ClipboardList, Pencil, User, Shirt, Ruler, Banknote, Wallet, Truck, FileText, Download } from "lucide-react";
import { useCommandeQuery } from "./hooks.js";
import { prioriteLabel, dateLocale } from "./constants.js";
import { useTranslation } from "../../i18n/index.js";
import { fichePdfUrl } from "./api.js";
import { CATEGORIES_VETEMENT } from "../modeles/constants.js";
import { MESURE_FIELDS } from "../clientes/constants.js";
import { useDerniereMesureQuery } from "../clientes/hooks.js";
import { useParametresQuery } from "../parametres/hooks.js";
import { LoadingState, ErrorState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import CommandeStatutBadge from "./components/CommandeStatutBadge.jsx";
import PaiementStatutBadge from "./components/PaiementStatutBadge.jsx";
import StatutTransitions from "./components/StatutTransitions.jsx";
import WhatsAppActions from "./components/WhatsAppActions.jsx";
import PaiementsSection from "./components/PaiementsSection.jsx";
import LivraisonSection from "./components/LivraisonSection.jsx";
import RecusSection from "../recus/components/RecusSection.jsx";
import { useRecusQuery } from "../recus/hooks.js";
import { ApiError } from "../../lib/apiClient.js";

function categorieLabelLocal(value) {
  return CATEGORIES_VETEMENT.find((c) => c.value === value)?.label ?? value;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(dateLocale(), { year: "numeric", month: "long", day: "numeric" });
}

export default function CommandeDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const commandeQuery = useCommandeQuery(id);

  if (commandeQuery.isPending) return <LoadingState label={t("cmd.loadingCommande")} />;
  if (commandeQuery.isError) return <ErrorState error={commandeQuery.error} onRetry={commandeQuery.refetch} />;

  const commande = commandeQuery.data;

  return <CommandeDetailContent id={id} commande={commande} />;
}

function CommandeDetailContent({ id, commande }) {
  const { t } = useTranslation();
  // Chargée une seule fois ici, partagée entre PaiementsSection (lien "voir
  // le reçu" par ligne) et RecusSection (liste + émission récapitulative) —
  // pas de requête dupliquée.
  const recusQuery = useRecusQuery(id);
  const recus = recusQuery.data?.data ?? [];

  // Dernière prise de mesures de la cliente, affichée directement sur la
  // fiche commande (demande de refonte) — endpoint déjà existant côté
  // backend (GET /clientes/:id/mesures/derniere), rien à ajouter côté API.
  const mesureQuery = useDerniereMesureQuery(commande.cliente.id);
  const mesureNotFound =
    mesureQuery.isError && mesureQuery.error instanceof ApiError && mesureQuery.error.status === 404;
  const mesure = mesureQuery.data;
  const populatedMesures = mesure ? MESURE_FIELDS.filter((f) => mesure[f.name] != null) : [];

  // Nom/coordonnées atelier pour les messages WhatsApp (voir
  // WhatsAppActions.jsx) — dégradé proprement si Paramètres pas encore
  // chargé/configuré (même logique que le logo dans AppLayout.jsx).
  const atelierQuery = useParametresQuery();
  const atelier = atelierQuery.data;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={ClipboardList}
        title={commande.numero}
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <CommandeStatutBadge statut={commande.statut} />
            <PaiementStatutBadge statut={commande.statutPaiement} />
            {prioriteLabel(commande.priorite)}
          </span>
        }
        actions={
          <>
            <Button as="a" href={fichePdfUrl(id)} target="_blank" rel="noreferrer" variant="secondary" icon={Download}>
              {t("cmd.fichePdf")}
            </Button>
            <Button as={Link} to={`/commandes/${id}/modifier`} variant="secondary" icon={Pencil}>
              {t("common.edit")}
            </Button>
          </>
        }
      />

      <StatutTransitions commandeId={id} statutActuel={commande.statut} />
      <WhatsAppActions commande={commande} atelier={atelier} />

      <div className="space-y-2">
        <SectionTitle icon={User}>{t("cmd.sectionClient")}</SectionTitle>
        <Card>
          <Link
            to={`/clientes/${commande.cliente.id}`}
            className="font-medium text-neutral-900 dark:text-neutral-100 hover:underline"
          >
            {commande.cliente.nom} {commande.cliente.prenom}
          </Link>
          <p className="text-neutral-500 text-sm mt-0.5">{commande.cliente.telephone}</p>
        </Card>
      </div>

      <div className="space-y-2">
        <SectionTitle icon={Shirt}>{t("cmd.sectionModele")}</SectionTitle>
        <Card className="text-sm space-y-3">
          {commande.modele ? (
            <Link
              to={`/modeles/${commande.modele.id}`}
              className="font-medium text-neutral-900 dark:text-neutral-100 hover:underline"
            >
              {commande.modele.nom}
            </Link>
          ) : (
            <p className="text-neutral-500">{t("cmd.aucunModele")}</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <InfoRow label={t("cmd.fieldType")} value={categorieLabelLocal(commande.typeVetement)} />
            <InfoRow label={t("cmd.fieldCouleur")} value={commande.couleur} />
            <InfoRow label={t("cmd.fieldTissu")} value={commande.tissu} />
            <InfoRow label={t("cmd.fieldQuantite")} value={commande.quantite} />
            <InfoRow label={t("cmd.fieldDateCommande")} value={formatDate(commande.dateCommande)} />
            <InfoRow label={t("cmd.fieldLivraisonPrevue")} value={formatDate(commande.dateLivraisonPrevue)} />
          </div>
          {commande.description && (
            <div>
              <p className="text-neutral-500 text-xs mb-0.5">{t("cmd.fieldDescription")}</p>
              <p className="text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">{commande.description}</p>
            </div>
          )}
          {commande.observations && (
            <div>
              <p className="text-neutral-500 text-xs mb-0.5">{t("cmd.fieldObservations")}</p>
              <p className="text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">{commande.observations}</p>
            </div>
          )}
          {(commande.photoTissuUrl || commande.photoModeleUrl) && (
            <div className="flex gap-4 pt-3 border-t border-neutral-200 dark:border-neutral-800">
              {commande.photoTissuUrl && (
                <div>
                  <p className="text-neutral-500 text-xs mb-1">{t("cmd.photoTissu")}</p>
                  <img
                    src={commande.photoTissuUrl}
                    alt={t("cmd.photoTissuAlt")}
                    className="h-24 w-20 object-cover rounded-lg border border-neutral-200 dark:border-neutral-800"
                  />
                </div>
              )}
              {commande.photoModeleUrl && (
                <div>
                  <p className="text-neutral-500 text-xs mb-1">{t("cmd.photoModele")}</p>
                  <img
                    src={commande.photoModeleUrl}
                    alt={t("cmd.photoModeleAlt")}
                    className="h-24 w-20 object-cover rounded-lg border border-neutral-200 dark:border-neutral-800"
                  />
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-2">
        <SectionTitle
          icon={Ruler}
          actions={
            <Button as={Link} to={`/clientes/${commande.cliente.id}`} variant="ghost" size="sm">
              {t("cmd.historiqueComplet")}
            </Button>
          }
        >
          {t("cmd.sectionMesures")}
        </SectionTitle>
        <Card className="text-sm">
          {mesureQuery.isPending ? (
            <LoadingState label={t("cmd.loadingMesures")} />
          ) : mesureNotFound || populatedMesures.length === 0 ? (
            <p className="text-neutral-500">{t("cmd.aucuneMesure")}</p>
          ) : (
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              {populatedMesures.map((f) => (
                <div key={f.name}>
                  <dt className="text-neutral-500 text-xs">{f.label}</dt>
                  <dd className="text-neutral-900 dark:text-neutral-100 tabular-nums">{t("cmd.cm", { valeur: mesure[f.name] })}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>

      <div className="space-y-2">
        <SectionTitle icon={Banknote}>{t("cmd.sectionFinances")}</SectionTitle>
        <Card className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-center">
          <div>
            <p className="text-neutral-500 text-xs">{t("cmd.prixTotal")}</p>
            <p className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100 mt-0.5">
              {commande.prixTotal}
            </p>
          </div>
          <div>
            <p className="text-neutral-500 text-xs">{t("cmd.encaisse")}</p>
            <p className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400 mt-0.5">
              {commande.totalPaye}
            </p>
          </div>
          <div>
            <p className="text-neutral-500 text-xs">{t("cmd.resteAPayer")}</p>
            <p className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100 mt-0.5">
              {commande.solde}
            </p>
          </div>
        </Card>
      </div>

      <div className="space-y-2">
        <SectionTitle icon={Truck}>{t("cmd.sectionLivraison")}</SectionTitle>
        <LivraisonSection
          commandeId={id}
          statutActuel={commande.statut}
          livraisons={commande.livraisons}
          solde={commande.solde}
        />
      </div>

      <div className="space-y-2">
        <SectionTitle icon={Wallet}>{t("cmd.sectionPaiements")}</SectionTitle>
        <PaiementsSection commandeId={id} statutActuel={commande.statut} recus={recus} />
      </div>

      <div className="space-y-2">
        <SectionTitle icon={FileText}>{t("cmd.sectionRecus")}</SectionTitle>
        <RecusSection commandeId={id} recus={recus} isLoading={recusQuery.isPending} />
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-neutral-500 text-xs mb-0.5">{label}</p>
      <p className="text-neutral-900 dark:text-neutral-100">{value || "—"}</p>
    </div>
  );
}
