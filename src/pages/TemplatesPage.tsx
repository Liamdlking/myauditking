import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/utils/supabaseClient";
import type { CurrentUser } from "@/types";
import ImportTemplateFromPdfModal from "@/components/ImportTemplateFromPdfModal";

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  site_id: string | null;
  logo_data_url: string | null;
  is_published: boolean;
  definition: any | null;
  created_at: string | null;
  updated_at: string | null;
};

type SiteRow = {
  id: string;
  name: string;
};

export default function TemplatesPage() {
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState<string>("");

  const [showImportModal, setShowImportModal] = useState(false);

  // ------------------------------------------------
  // Load current user profile (for role & site access)
  // ------------------------------------------------
  useEffect(() => {
    let isMounted = true;
    async function loadUser() {
      setLoadingUser(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (!session) {
          if (isMounted) {
            setCurrentUser(null);
            setLoadingUser(false);
          }
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("id,email,name,role,site_access,is_banned")
          .eq("id", session.user.id)
          .single();

        if (error || !data) {
          if (isMounted) {
            setCurrentUser({
              id: session.user.id,
              email: session.user.email || "",
              name: session.user.email || "",
              role: "inspector",
              site_access: [],
              is_banned: false,
            });
          }
        } else {
          if (isMounted) {
            setCurrentUser({
              id: data.id,
              email: data.email || "",
              name: data.name || data.email || "",
              role: (data.role as any) || "inspector",
              site_access: data.site_access || [],
              is_banned: data.is_banned,
            });
          }
        }
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setCurrentUser(null);
        }
      } finally {
        if (isMounted) setLoadingUser(false);
      }
    }

    loadUser();
    return () => {
      isMounted = false;
    };
  }, []);

  const canCreate = currentUser && (currentUser.role === "manager" || currentUser.role === "admin");
  const canDelete = currentUser && currentUser.role === "admin";

  // ------------------------------------------------
  // Load sites
  // ------------------------------------------------
  const loadSites = async () => {
    try {
      const { data, error } = await supabase
        .from("sites")
        .select("id,name")
        .order("name", { ascending: true });

      if (error) {
        console.error(error);
      } else {
        setSites((data || []) as SiteRow[]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ------------------------------------------------
  // Load templates
  // ------------------------------------------------
  const loadTemplates = async () => {
    setLoadingTemplates(true);
    setErrorText(null);
    try {
      const { data, error } = await supabase
        .from("templates")
        .select(
          "id,name,description,site_id,logo_data_url,is_published,definition,created_at,updated_at"
        )
        .order("updated_at", { ascending: false });

      if (error) {
        console.error(error);
        setErrorText(error.message || "Could not load templates.");
      } else {
        setTemplates((data || []) as TemplateRow[]);
      }
    } catch (err: any) {
      console.error(err);
      setErrorText("Unexpected error loading templates.");
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    loadSites();
    loadTemplates();
  }, []);

  // ------------------------------------------------
  // Derived maps & filtered list
  // ------------------------------------------------
  const sitesMap = useMemo(() => {
    const m: Record<string, string> = {};
    sites.forEach((s) => {
      m[s.id] = s.name;
    });
    return m;
  }, [sites]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchesSearch =
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.description || "").toLowerCase().includes(search.toLowerCase());

      const matchesSite =
        !siteFilter || (t.site_id && t.site_id === siteFilter);

      return matchesSearch && matchesSite;
    });
  }, [templates, search, siteFilter]);

  // ------------------------------------------------
  // Helpers
  // ------------------------------------------------
  const questionCounts = (tpl: TemplateRow) => {
    const def = tpl.definition;
    if (!def || !def.sections || !Array.isArray(def.sections)) return 0;
    return def.sections.reduce((acc: number, sec: any) => {
      if (!sec || !Array.isArray(sec.items)) return acc;
      return acc + sec.items.length;
    }, 0);
  };

  const openNewTemplate = () => {
    if (!canCreate) return;
    // Adjust this to your actual route for creating a new template
    // e.g. navigate("/templates/new");
    navigate("/templates/new");
  };

  const openEditTemplate = (id: string) => {
    if (!canCreate) return;
    // Adjust to your edit route (for example: /templates/:id/edit)
    navigate(`/templates/${id}`);
  };

  const handleDeleteTemplate = async (tpl: TemplateRow) => {
    if (!canDelete) return;
    const ok = window.confirm(
      `Delete template "${tpl.name}"? This cannot be undone.`
    );
    if (!ok) return;

    try {
      const { error } = await supabase
        .from("templates")
        .delete()
        .eq("id", tpl.id);

      if (error) {
        console.error(error);
        alert(error.message || "Could not delete template.");
        return;
      }

      setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
    } catch (err: any) {
      console.error(err);
      alert("Unexpected error deleting template.");
    }
  };

  // ------------------------------------------------
  // Render
  // ------------------------------------------------
  if (loadingUser) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Loading account…
      </div>
    );
  }

  if (currentUser?.is_banned) {
    return (
      <div className="p-6 text-sm text-rose-600">
        Your account is banned. Please contact an administrator.
      </div>
    );
  }

  return (
    <>
      <div className="p-6 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-purple-700">Templates</h1>
            <p className="text-xs text-gray-600">
              Manage safety checklists, assign to sites, and import from existing PDFs.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-center text-xs">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="border rounded-xl px-3 py-2 text-xs"
            />
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="border rounded-xl px-3 py-2 text-xs"
            >
              <option value="">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <button
              onClick={loadTemplates}
              className="px-3 py-2 rounded-xl border text-xs hover:bg-gray-50"
            >
              Refresh
            </button>

            {canCreate && (
              <>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="px-3 py-2 rounded-xl border text-xs hover:bg-gray-50"
                >
                  Import from PDF / text
                </button>
                <button
                  onClick={openNewTemplate}
                  className="px-3 py-2 rounded-xl bg-purple-700 text-white text-xs hover:bg-purple-800"
                >
                  New template
                </button>
              </>
            )}
          </div>
        </div>

        {errorText && (
          <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
            {errorText}
          </div>
        )}

        {loadingTemplates && (
          <div className="text-xs text-gray-500">Loading templates…</div>
        )}

        {!loadingTemplates && filteredTemplates.length === 0 && !errorText && (
          <div className="text-xs text-gray-600">
            No templates found. {canCreate ? "Create a new one to get started." : ""}
          </div>
        )}

        {!loadingTemplates && filteredTemplates.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredTemplates.map((tpl) => {
              const siteName = tpl.site_id ? sitesMap[tpl.site_id] || "—" : "—";
              const qCount = questionCounts(tpl);

              return (
                <div
                  key={tpl.id}
                  className="bg-white border rounded-2xl p-4 flex flex-col gap-2 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    {tpl.logo_data_url ? (
                      <img
                        src={tpl.logo_data_url}
                        alt="logo"
                        className="w-10 h-10 rounded-full border object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full border flex items-center justify-center text-[10px] text-gray-500 bg-gray-50">
                        Logo
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-sm text-gray-900">
                          {tpl.name}
                        </div>
                        {!tpl.is_published && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                            Unpublished
                          </span>
                        )}
                      </div>
                      {tpl.description && (
                        <div className="text-[11px] text-gray-600 line-clamp-2 mt-0.5">
                          {tpl.description}
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-gray-500 space-x-2">
                        <span>Site: {siteName}</span>
                        <span>•</span>
                        <span>{qCount} questions</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[11px] mt-2">
                    <div className="text-gray-400">
                      {tpl.updated_at
                        ? `Updated ${tpl.updated_at.slice(0, 10)}`
                        : ""}
                    </div>
                    <div className="flex gap-1">
                      {canCreate && (
                        <button
                          onClick={() => openEditTemplate(tpl.id)}
                          className="px-2 py-1 rounded-xl border text-[11px] hover:bg-gray-50"
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDeleteTemplate(tpl)}
                          className="px-2 py-1 rounded-xl border text-[11px] text-rose-600 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showImportModal && (
        <ImportTemplateFromPdfModal
          open={showImportModal}
          onClose={() => setShowImportModal(false)}
          onCreated={loadTemplates}
        />
      )}
    </>
  );
}