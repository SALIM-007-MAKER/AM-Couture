import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Scissors, Building2, User, Mail, Lock, Eye, EyeOff, Phone, MapPin, ArrowRight } from "lucide-react";
import { useInscriptionAtelierMutation } from "../../hooks/useAuth.js";
import { LANGUES_DISPONIBLES } from "../../features/compte/constants.js";
import { ApiError } from "../../lib/apiClient.js";
import { GlobalFormError, FieldError } from "../../components/QueryState.jsx";
import ImageUploadField from "../../components/ImageUploadField.jsx";

// Même esthétique que LoginPage.jsx (voir ses commentaires) — un propriétaire
// d'atelier crée ici SON atelier + son propre compte ADMIN en une seule
// étape (Phase 8, inscription en libre-service — voir
// POST /api/auth/inscription-atelier). Pas de champ "identifiant" séparé :
// l'email tapé ici sert directement d'identifiant de connexion (voir la
// route backend) — plus proche de ce qu'un propriétaire attend d'un
// formulaire d'inscription grand public.
//
// Volontairement PAS reproduits ici (voir échange avec l'utilisateur) :
// bouton "Continuer avec Google" (aucune intégration OAuth dans ce projet),
// bascule client/employé (portail self-service USER/CLIENT hors scope,
// décision Phase 8), code de parrainage (aucun système de parrainage
// n'existe derrière) — jamais de fonctionnalité simulée qui ne ferait rien.
const NOM_PLATEFORME = "Gestion d'Atelier";

const FORM_INITIAL = {
  nom: "",
  logoUrl: "",
  prenom: "",
  nomProprietaire: "",
  email: "",
  adminPassword: "",
  confirmation: "",
  telephone: "",
  ville: "",
  pays: "",
  devise: "FCFA",
  langue: "fr",
};

export default function InscriptionAtelierPage() {
  const [form, setForm] = useState(FORM_INITIAL);
  const [confirmationError, setConfirmationError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const mutation = useInscriptionAtelierMutation();

  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;
  const darkInputClass =
    "w-full rounded-xl bg-white/5 border border-white/10 pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition";
  const darkSelectClass =
    "w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition";

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setConfirmationError("");
    if (form.adminPassword !== form.confirmation) {
      setConfirmationError("La confirmation ne correspond pas au mot de passe.");
      return;
    }
    mutation.mutate(
      {
        nom: form.nom || undefined,
        logoUrl: form.logoUrl || undefined,
        prenom: form.prenom,
        nomProprietaire: form.nomProprietaire,
        email: form.email,
        adminPassword: form.adminPassword,
        telephone: form.telephone,
        ville: form.ville || undefined,
        pays: form.pays || undefined,
        devise: form.devise,
        langue: form.langue,
      },
      { onSuccess: () => navigate("/", { replace: true }) },
    );
  }

  return (
    <div className="dark min-h-svh relative flex items-center justify-center overflow-hidden bg-neutral-950 px-4 py-12">
      {/* Fond — identique à LoginPage.jsx, aucune image externe */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(217,158,63,0.16),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(39,99,134,0.25),_transparent_60%)]" />
      </div>

      <div className="relative w-full max-w-md flex flex-col items-center">
        <div className="mb-7">
          <div className="flex size-24 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-[0_0_50px_-5px_rgba(217,158,63,0.45)]">
            <Scissors className="size-10 text-neutral-950" aria-hidden="true" />
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full rounded-3xl bg-neutral-900/70 backdrop-blur-xl border border-white/10 shadow-2xl p-6 space-y-4"
        >
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Créez votre <span className="text-amber-400">atelier</span>
            </h1>
            <p className="text-sm text-neutral-400">Rejoignez {NOM_PLATEFORME}</p>
          </div>

          <GlobalFormError error={mutation.error} />

          <div className="space-y-1.5">
            <label htmlFor="nom" className="text-sm font-medium text-neutral-300">
              Nom de l'atelier <span className="text-neutral-500 font-normal">(optionnel)</span>
            </label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" aria-hidden="true" />
              <input
                id="nom"
                type="text"
                value={form.nom}
                onChange={(e) => update("nom", e.target.value)}
                className={darkInputClass}
                placeholder="Ex: Atelier Élégance"
              />
            </div>
            <FieldError messages={details?.nom} />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium text-neutral-300">
              Logo de l'atelier <span className="text-neutral-500 font-normal">(optionnel)</span>
            </span>
            <ImageUploadField
              value={form.logoUrl}
              onChange={(v) => update("logoUrl", v)}
              alt="Logo de l'atelier"
              previewClassName="h-16 w-16 object-contain bg-white"
            />
            <FieldError messages={details?.logoUrl} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="prenom" className="text-sm font-medium text-neutral-300">
                Prénom *
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" aria-hidden="true" />
                <input
                  id="prenom"
                  type="text"
                  autoComplete="given-name"
                  required
                  value={form.prenom}
                  onChange={(e) => update("prenom", e.target.value)}
                  className={darkInputClass}
                />
              </div>
              <FieldError messages={details?.prenom} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="nomProprietaire" className="text-sm font-medium text-neutral-300">
                Nom *
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" aria-hidden="true" />
                <input
                  id="nomProprietaire"
                  type="text"
                  autoComplete="family-name"
                  required
                  value={form.nomProprietaire}
                  onChange={(e) => update("nomProprietaire", e.target.value)}
                  className={darkInputClass}
                />
              </div>
              <FieldError messages={details?.nomProprietaire} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-neutral-300">
              Email *
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" aria-hidden="true" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className={darkInputClass}
                placeholder="vous@exemple.com"
              />
            </div>
            <FieldError messages={details?.email} />
            <p className="text-xs text-neutral-500">Sert aussi d'identifiant de connexion.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="adminPassword" className="text-sm font-medium text-neutral-300">
                Mot de passe *
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" aria-hidden="true" />
                <input
                  id="adminPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={form.adminPassword}
                  onChange={(e) => update("adminPassword", e.target.value)}
                  className={`${darkInputClass} pr-10`}
                  placeholder="8 caractères min."
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
              </div>
              <FieldError messages={details?.adminPassword} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirmation" className="text-sm font-medium text-neutral-300">
                Confirmer *
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" aria-hidden="true" />
                <input
                  id="confirmation"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={form.confirmation}
                  onChange={(e) => update("confirmation", e.target.value)}
                  className={darkInputClass}
                />
              </div>
              {confirmationError && <p className="text-xs text-red-400 mt-1">{confirmationError}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="telephone" className="text-sm font-medium text-neutral-300">
              Téléphone (avec indicatif pays) *
            </label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" aria-hidden="true" />
              <input
                id="telephone"
                type="tel"
                autoComplete="tel"
                required
                value={form.telephone}
                onChange={(e) => update("telephone", e.target.value)}
                className={darkInputClass}
                placeholder="+227 96 59 22 53"
              />
            </div>
            <FieldError messages={details?.telephone} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="ville" className="text-sm font-medium text-neutral-300">
                Ville <span className="text-neutral-500 font-normal">(optionnel)</span>
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" aria-hidden="true" />
                <input
                  id="ville"
                  type="text"
                  value={form.ville}
                  onChange={(e) => update("ville", e.target.value)}
                  className={darkInputClass}
                />
              </div>
              <FieldError messages={details?.ville} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="pays" className="text-sm font-medium text-neutral-300">
                Pays <span className="text-neutral-500 font-normal">(optionnel)</span>
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" aria-hidden="true" />
                <input
                  id="pays"
                  type="text"
                  value={form.pays}
                  onChange={(e) => update("pays", e.target.value)}
                  className={darkInputClass}
                />
              </div>
              <FieldError messages={details?.pays} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="devise" className="text-sm font-medium text-neutral-300">
                Devise *
              </label>
              <input
                id="devise"
                type="text"
                required
                value={form.devise}
                onChange={(e) => update("devise", e.target.value)}
                className={darkSelectClass}
                placeholder="FCFA"
              />
              <FieldError messages={details?.devise} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="langue" className="text-sm font-medium text-neutral-300">
                Langue *
              </label>
              <select
                id="langue"
                required
                value={form.langue}
                onChange={(e) => update("langue", e.target.value)}
                className={darkSelectClass}
              >
                {LANGUES_DISPONIBLES.map((l) => (
                  <option key={l.code} value={l.code} className="bg-neutral-900">
                    {l.label}
                  </option>
                ))}
              </select>
              <FieldError messages={details?.langue} />
            </div>
          </div>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 text-sm font-semibold py-2.5 shadow-lg shadow-amber-900/30 transition disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {mutation.isPending ? "Création…" : "Créer mon compte"}
            {!mutation.isPending && <ArrowRight className="size-4" aria-hidden="true" />}
          </button>

          <p className="text-center text-sm text-neutral-400">
            Déjà un compte ?{" "}
            <Link to="/login" className="text-amber-400 hover:text-amber-300 font-medium transition-colors">
              Se connecter
            </Link>
          </p>
        </form>

        <p className="mt-6 text-xs text-neutral-500">{NOM_PLATEFORME}</p>
      </div>
    </div>
  );
}
