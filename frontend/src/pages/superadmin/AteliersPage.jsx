import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, Plus, X, Save, CheckCircle2, Users, ClipboardList, UserCircle, ShieldOff, Eye, Search } from "lucide-react";
import { useAteliersQuery, useCreateAtelierMutation } from "../../features/ateliers/hooks.js";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import { LoadingState, ErrorState, EmptyState, FieldError, GlobalFormError } from "../../components/QueryState.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Pagination from "../../components/Pagination.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { ApiError } from "../../lib/apiClient.js";

const PAGE_SIZE = 20;
const FORM_INITIAL = { nom: "", devise: "FCFA", telephone: "", adresse: "", adminIdentifiant: "", adminPassword: "" };

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
}

// Formulaire de provisioning : crée l'atelier ET son premier compte ADMIN en
// une seule opération (voir backend/src/routes/ateliers.routes.js) — c'est
// la SEULE façon d'ajouter un atelier à la plateforme dans cette phase (pas
// d'inscription en libre-service, décision Phase 8).
function CreerAtelierForm({ onCancel, onCreated }) {
  const mutation = useCreateAtelierMutation();
  const [form, setForm] = useState(FORM_INITIAL);
  const details = mutation.error instanceof ApiError ? mutation.error.details : undefined;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate(
      {
        nom: form.nom,
        devise: form.devise,
        telephone: form.telephone || undefined,
        adresse: form.adresse || undefined,
        adminIdentifiant: form.adminIdentifiant,
        adminPassword: form.adminPassword,
      },
      { onSuccess: (result) => onCreated(result) },
    );
  }

  return (
    <Card as="form" variant="outlined" onSubmit={handleSubmit} className="space-y-4">
      <GlobalFormError error={mutation.error} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nom de l'atelier" required>
          <input required value={form.nom} onChange={(e) => update("nom", e.target.value)} className={inputClass} />
          <FieldError messages={details?.nom} />
        </Field>
        <Field label="Devise">
          <input value={form.devise} onChange={(e) => update("devise", e.target.value)} className={inputClass} />
          <FieldError messages={details?.devise} />
        </Field>
        <Field label="Téléphone">
          <input value={form.telephone} onChange={(e) => update("telephone", e.target.value)} className={inputClass} />
          <FieldError messages={details?.telephone} />
        </Field>
        <Field label="Adresse">
          <input value={form.adresse} onChange={(e) => update("adresse", e.target.value)} className={inputClass} />
          <FieldError messages={details?.adresse} />
        </Field>
      </div>

      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-600 mb-3">
          Premier compte ADMIN de cet atelier
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Identifiant" required hint="3 caractères minimum.">
            <input
              required
              value={form.adminIdentifiant}
              onChange={(e) => update("adminIdentifiant", e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.adminIdentifiant} />
          </Field>
          <Field label="Mot de passe" required hint="8 caractères minimum.">
            <input
              type="text"
              required
              value={form.adminPassword}
              onChange={(e) => update("adminPassword", e.target.value)}
              className={inputClass}
            />
            <FieldError messages={details?.adminPassword} />
          </Field>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" variant="primary" icon={Save} loading={mutation.isPending}>
          Créer l'atelier
        </Button>
        <Button type="button" variant="secondary" icon={X} onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </Card>
  );
}

export default function AteliersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const [qInput, setQInput] = useState(searchParams.get("q") ?? "");
  const q = useDebouncedValue(qInput, 300);

  const { data, isPending, isError, error, refetch, isFetching } = useAteliersQuery({
    q: q || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const [showForm, setShowForm] = useState(false);
  const [justCreated, setJustCreated] = useState(null);

  function updateParams(patch) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "" || value === null) next.delete(key);
      else next.set(key, String(value));
    }
    // replace: true — évite d'empiler une entrée d'historique par frappe
    // (voir ClientesListPage.jsx pour l'explication complète).
    setSearchParams(next, { replace: true });
  }

  function handleSearchChange(value) {
    setQInput(value);
    updateParams({ q: value || undefined, page: undefined });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Building2}
        title="Ateliers"
        subtitle="Les ateliers (tenants) de la plateforme Gestion d'Atelier."
        actions={
          !showForm && (
            <Button variant="primary" icon={Plus} onClick={() => setShowForm(true)}>
              Nouvel atelier
            </Button>
          )
        }
      />

      {justCreated && (
        <p className="flex items-center gap-2 rounded-xl bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-300 text-sm px-3 py-2 animate-fade-in">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          Atelier « {justCreated.atelier.nom} » créé — son admin peut se connecter avec l'identifiant «{" "}
          {justCreated.admin.identifiant} ».
        </p>
      )}

      {showForm && (
        <CreerAtelierForm
          onCancel={() => setShowForm(false)}
          onCreated={(result) => {
            setJustCreated(result);
            setShowForm(false);
          }}
        />
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" aria-hidden="true" />
        <input
          type="search"
          placeholder="Rechercher un atelier…"
          value={qInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className={`${inputClass} pl-9`}
        />
      </div>

      {isPending && <LoadingState label="Chargement des ateliers…" />}
      {isError && <ErrorState error={error} onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState icon={Building2}>
          {q ? "Aucun atelier ne correspond à cette recherche." : "Aucun atelier pour l'instant — créez le premier."}
        </EmptyState>
      )}

      {data && data.data.length > 0 && (
        <div className={isFetching ? "opacity-60 transition-opacity" : ""}>
          {/* Tableau (desktop/tablette) */}
          <Card variant="outlined" padded={false} className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Atelier</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Devise</th>
                  <th className="px-4 py-3 font-medium">Téléphone</th>
                  <th className="px-4 py-3 font-medium text-right">Comptes</th>
                  <th className="px-4 py-3 font-medium text-right">Clientes</th>
                  <th className="px-4 py-3 font-medium text-right">Commandes</th>
                  <th className="px-4 py-3 font-medium">Créé le</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((atelier) => (
                  <tr
                    key={atelier.id}
                    className={`border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors ${!atelier.actif ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">
                      <Link to={`/ateliers/${atelier.id}`} className="flex items-center gap-2 hover:underline">
                        {atelier.logoUrl ? (
                          <img src={atelier.logoUrl} alt="" className="size-6 rounded object-contain bg-white" />
                        ) : (
                          <span className="flex size-6 shrink-0 items-center justify-center rounded bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-300">
                            <Building2 className="size-3.5" aria-hidden="true" />
                          </span>
                        )}
                        {atelier.nom}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {atelier.actif ? (
                        <span className="text-xs text-green-700 dark:text-green-400">Actif</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                          <ShieldOff className="size-3" aria-hidden="true" />
                          Suspendu
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{atelier.devise}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{atelier.telephone || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-neutral-100">
                      {atelier.nombreComptes}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-neutral-100">
                      {atelier.nombreClientes}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-neutral-100">
                      {atelier.nombreCommandes}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{formatDate(atelier.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button as={Link} to={`/ateliers/${atelier.id}`} variant="ghost" size="sm" icon={Eye}>
                        Gérer
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Cartes (mobile) */}
          <ul className="md:hidden space-y-2">
            {data.data.map((atelier) => (
              <li key={atelier.id}>
                <Link to={`/ateliers/${atelier.id}`}>
                  <Card variant="outlined" className={`space-y-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors ${!atelier.actif ? "opacity-60" : ""}`}>
                    <div className="flex items-center gap-2">
                      {atelier.logoUrl ? (
                        <img src={atelier.logoUrl} alt="" className="size-7 rounded object-contain bg-white" />
                      ) : (
                        <span className="flex size-7 shrink-0 items-center justify-center rounded bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-300">
                          <Building2 className="size-4" aria-hidden="true" />
                        </span>
                      )}
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">{atelier.nom}</span>
                      {!atelier.actif && (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 ml-auto">
                          <ShieldOff className="size-3" aria-hidden="true" />
                          Suspendu
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <span className="flex items-center gap-1">
                        <UserCircle className="size-3.5" aria-hidden="true" />
                        {atelier.nombreComptes}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3.5" aria-hidden="true" />
                        {atelier.nombreClientes}
                      </span>
                      <span className="flex items-center gap-1">
                        <ClipboardList className="size-3.5" aria-hidden="true" />
                        {atelier.nombreCommandes}
                      </span>
                      <span className="ml-auto">{formatDate(atelier.createdAt)}</span>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            total={data.meta.total}
            onChange={(p) => updateParams({ page: p })}
          />
        </div>
      )}
    </div>
  );
}
