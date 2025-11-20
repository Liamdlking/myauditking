import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/utils/supabaseClient";
import ImportTemplateFromPdfModal from "@/components/ImportTemplateFromPdfModal";

type Role = "admin" | "manager" | "inspector" | string | null;

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  site_id: string | null;
  is_published: boolean;
  logo_data_url?: string | null;
};

type SiteRow = {
  id: string;
  name: string;
};

export default function TemplatesPage() {
  const [role, setRole] = useState<Role>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");
  const [publishedFilter, setPublishedFilter] = useState<
    "all" | "published" | "unpublished"
  >("all");

  const [showImportModal, setShowImportModal] = useState(false);

  const navigate = useNavigate();

  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const canEdit = isAdmin || isManager;

  // --------------------------
  // Load current user + role
  // --------------------------
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) {
          setCurrentUserId(null);
          setRole(null);
          return;
        }
        setCurrentUserId(user.id);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", user.id)
          .single();

        if (!profileError && profile) {
          setRole((profile.role as Role) || "inspector");
        } else {
          setRole("inspector");
        }
      } catch (e) {
        console.error("loadUser error", e);
        setRole("inspector");
      }
    };

    loadUser();
  }, []);

  // --------------------------
  // Load sites + templates
  // --------------------------
  const loadSites = async () => {
    try {
      const { data, error } = await supabase
        .from("sites")
        .select("id, name")
        .order("name", { ascending: true });

      if (error) throw error;
      setSites(
        (data || []).map((s: any) => ({
          id: s.id,
          name: s.name,
        }))
      );
    } catch (e) {
      console.error("loadSites error", e);
    }
  };

  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("templates")
        .select("id, name, description, site_id, is_published, logo_data_url")
        .order("name", { ascending: true });

      if (error) throw error;

      const mapped: TemplateRow[] = (data || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description ?? null,
        site_id: t.site_id ?? null,
        is_published: !!t.is_published,
        logo_data_url: t.logo_data_url ?? null,
      }));

      setTemplates(mapped);
    } catch (e: any) {
      console.error("loadTemplates error", e);
      setError(
        e?.message ||
          "Could not load templates. Check the templates table schema."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSites();
    loadTemplates();
  }, []);

  // --------------------------
  // Helpers
  // --------------------------
  const siteNameFor = (site_id: string | null) => {
    if (!site_id) return "All sites";
    const s = sites.find((x) => x.id === site_id);
    return s ? s.name : "Unknown site";
  };

  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      if (selectedSiteId !== "all" && tpl.site_id !== selectedSiteId) {
        return false;
      }
      if (publishedFilter === "published" && !tpl.is_published) {
        return false;
      }
      if (publishedFilter === "unpublished" && tpl.is_published) {
        return false;
      }
      return true;
    });
  }, [templates, selectedSiteId, publishedFilter]);

  // --------------------------
  // Actions
  // --------------------------
  const handleNewTemplate = () => {
    if (!canEdit) {
      alert("Only managers/admins can create templates.");
      return;
    }
    navigate("/templates/new");
  };

  const handleEditTemplate = (id: string) => {
    if (!canEdit) {
      alert("Only managers/admins can edit templates.");
      return;
    }
    navigate(`/templates/${id}/edit`);
  };

  const handleTogglePublished = async (tpl: TemplateRow) => {
    if (!canEdit) {
      alert("Only managers/admins can change publish state.");
      return;
    }
    try {
      const next = !tpl.is_published;
      const { error } = await supabase
        .from("templates")
        .update({ is_published: next })
        .eq("id", tpl.id);

      if (error) throw error;
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === tpl.id ? { ...t, is_published: next } : t
        )
      );
    } catch (e: any) {
      console.error("togglePublished error", e);
      alert(e?.message || "Could not update template publish state.");
    }
  };

  const handleStartInspection = async (tpl: TemplateRow) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        alert("Please log in first.");
        return;
      }

      // Load profile for display name
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("user_id", user.id)
        .single();

      const ownerName =
        profile?.name || user.email || "Inspector";

      const nowIso = new Date().toISOString();

      const { data, error } = await supabase
        .from("inspections")
        .insert({
          template_id: tpl.id,
          template_name: tpl.name,
          site_id: tpl.site_id,
          site: siteNameFor(tpl.site_id),
          status: "in_progress",
          started_at: nowIso,
          submitted_at: null,
          score: null,
          items: null,
          owner_user_id: user.id,
          owner_name: ownerName,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Go to inspections page; user can open + complete it there
      navigate("/inspections");
    } catch (e: any) {
      console.error("startInspection error", e);
      alert(
        e?.message || "Could not start inspection. Check the inspections table."
      );
    }
  };

  // --------------------------
  // Render
  // --------------------------
  return (
    <div className="max-w-6xl mx-auto py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-purple-700">
            Templates
          </h1>
          <p className="text-sm text-gray-600">
            Create, import and manage templates. Start inspections from
            any template.
          </p>
          {role && (
            <p className="text-[11px] text-gray-400 mt-1">
              Your role: <span className="font-medium">{role}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          {(isAdmin || isManager) && (
            <>
              <button
                onClick={() => setShowImportModal(true)}
                className="px-3 py-2 rounded-xl border text-sm hover:bg-gray-50"
              >
                Import from PDF
              </button>
              <button
                onClick={handleNewTemplate}
                className="px-3 py-2 rounded-xl bg-purple-700 text-white text-sm hover:bg-purple-800"
              >
                + New Template
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center text-xs">
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Site:</span>
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="border rounded-xl px-3 py-1"
          >
            <option value="all">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-gray-500">Status:</span>
          <select
            value={publishedFilter}
            onChange={(e) =>
              setPublishedFilter(
                e.target.value as "all" | "published" | "unpublished"
              )
            }
            className="border rounded-xl px-3 py-1"
          >
            <option value="all">All</option>
            <option value="published">Published</option>
            <option value="unpublished">Unpublished</option>
          </select>
        </div>
      </div>

      {/* Error / loading / list */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
          Loading templates…
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
          No templates found for the current filters.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="border rounded-2xl bg-white p-4 space-y-3 shadow-sm"
            >
              <div className="flex items-center gap-3">
                {tpl.logo_data_url && (
                  <img
                    src={tpl.logo_data_url}
                    alt={tpl.name}
                    className="h-10 w-10 rounded-md object-cover border bg-white flex-shrink-0"
                  />
                )}
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {tpl.name}
                  </h2>
                  <div className="flex flex-wrap gap-2 items-center text-[11px] mt-1">
                    <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">
                      {siteNameFor(tpl.site_id)}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 ${
                        tpl.is_published
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                          : "bg-amber-50 text-amber-700 border border-amber-100"
                      }`}
                    >
                      {tpl.is_published ? "Published" : "Unpublished"}
                    </span>
                  </div>
                </div>
              </div>

              {tpl.description && (
                <p className="text-xs text-gray-600 line-clamp-3">
                  {tpl.description}
                </p>
              )}

              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => handleStartInspection(tpl)}
                  className="flex-1 px-3 py-1 rounded-xl border hover:bg-gray-50"
                >
                  Start inspection
                </button>
                {canEdit && (
                  <>
                    <button
                      onClick={() => handleEditTemplate(tpl.id)}
                      className="px-3 py-1 rounded-xl border hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleTogglePublished(tpl)}
                      className="px-3 py-1 rounded-xl border hover:bg-gray-50"
                    >
                      {tpl.is_published ? "Unpublish" : "Publish"}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Import from PDF modal */}
      {showImportModal && (
        <ImportTemplateFromPdfModal
          onClose={() => setShowImportModal(false)}
          onTemplateCreated={() => {
            setShowImportModal(false);
            loadTemplates();
          }}
        />
      )}
    </div>
  );
}