import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/utils/supabaseClient";
import ImportTemplateFromPdfModal from "@/components/ImportTemplateFromPdfModal";

// ---------------------------
// Types
// ---------------------------
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

type ProfileRow = {
  user_id: string;
  name: string;
  role: string;
};

// ---------------------------
// PAGE
// ---------------------------
export default function TemplatesPage() {
  const navigate = useNavigate();

  // USER
  const [currentUser, setCurrentUser] = useState<ProfileRow | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // DATA
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // FILTER UI
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("");

  // MODALS
  const [showImportModal, setShowImportModal] = useState(false);

  const canCreate =
    currentUser && (currentUser.role === "manager" || currentUser.role === "admin");

  const canDelete = currentUser && currentUser.role === "admin";

  // ---------------------------
  // Load current user
  // ---------------------------
  useEffect(() => {
    let active = true;
    async function run() {
      setLoadingUser(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session) {
        if (active) setCurrentUser(null);
        return;
      }

      // IMPORTANT: Select using user_id not id
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, name, role")
        .eq("user_id", session.user.id)
        .single();

      if (!error && data) {
        if (active)
          setCurrentUser({
            user_id: data.user_id,
            name: data.name,
            role: data.role,
          });
      } else {
        // default to inspector if profile missing
        if (active)
          setCurrentUser({
            user_id: session.user.id,
            name: session.user.email ?? "",
            role: "inspector",
          });
      }

      if (active) setLoadingUser(false);
    }
    run();
    return () => {
      active = false;
    };
  }, []);

  // ---------------------------
  // Load Sites
  // ---------------------------
  const loadSites = async () => {
    const { data, error } = await supabase.from("sites").select("id,name");
    if (!error) setSites(data || []);
  };

  // ---------------------------
  // Load Templates
  // ---------------------------
  const loadTemplates = async () => {
    setLoadingTemplates(true);
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      setErrorText(error.message);
    } else {
      setTemplates(data || []);
    }
    setLoadingTemplates(false);
  };

  useEffect(() => {
    loadSites();
    loadTemplates();
  }, []);

  const sitesMap = useMemo(() => {
    const m: Record<string, string> = {};
    sites.forEach((s) => (m[s.id] = s.name));
    return m;
  }, [sites]);

  // FILTERING
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchesSearch =
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.description || "").toLowerCase().includes(search.toLowerCase());

      const matchesSite = !siteFilter || t.site_id === siteFilter;

      return matchesSearch && matchesSite;
    });
  }, [templates, search, siteFilter]);

  const questionCounts = (tpl: TemplateRow) => {
    if (!tpl.definition || !tpl.definition.sections) return 0;

    return tpl.definition.sections.reduce(
      (total: number, sec: any) =>
        total + (sec.items ? sec.items.length : 0),
      0
    );
  };

  const openNewTemplate = () => {
    navigate("/templates/new");
  };

  const openEditTemplate = (id: string) => {
    navigate(`/templates/${id}`);
  };

  const startInspection = (id: string) => {
    navigate(`/inspections?templateId=${id}`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;

    const { error } = await supabase.from("templates").delete().eq("id", id);
    if (error) return alert(error.message);

    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  // ---------------------------
  // RENDER
  // ---------------------------
  if (loadingUser) return <>Loading…</>;

  return (
    <>
      <div className="p-6 space-y-4">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-purple-700">Templates</h1>
            <p className="text-xs text-gray-600">
              Create, manage, assign and import inspection templates.
            </p>
          </div>

          <div className="flex gap-2 text-xs">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="border rounded-xl px-3 py-2 text-xs"
            />

            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="border rounded-xl px-3 py-2 text-xs"
            >
              <option value="">All Sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {canCreate && (
              <>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="border rounded-xl px-3 py-2 hover:bg-gray-50"
                >
                  Import PDF
                </button>
                <button
                  onClick={openNewTemplate}
                  className="rounded-xl px-3 py-2 bg-purple-700 text-white hover:bg-purple-800"
                >
                  New Template
                </button>
              </>
            )}
          </div>
        </div>

        {/* LIST */}
        {filteredTemplates.length === 0 && (
          <div className="text-xs text-gray-500">No templates found.</div>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white border rounded-2xl p-4 flex flex-col gap-3 shadow-sm"
            >
              <div className="flex gap-3">
                {tpl.logo_data_url ? (
                  <img
                    src={tpl.logo_data_url}
                    className="w-12 h-12 rounded-full border object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-100 border flex items-center justify-center text-[10px]">
                    Logo
                  </div>
                )}

                <div className="flex-1">
                  <div className="font-semibold text-sm">{tpl.name}</div>
                  <div className="text-[11px] text-gray-600 line-clamp-2">
                    {tpl.description}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {tpl.site_id ? sitesMap[tpl.site_id] : "No site"} •{" "}
                    {questionCounts(tpl)} questions
                  </div>
                </div>
              </div>

              {/* BUTTONS */}
              <div className="flex justify-between text-[11px] items-center">
                <div className="text-gray-400">
                  {tpl.updated_at
                    ? "Updated " + tpl.updated_at.slice(0, 10)
                    : ""}
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => startInspection(tpl.id)}
                    className="px-2 py-1 rounded-xl border bg-purple-50 text-purple-700 hover:bg-purple-100"
                  >
                    Start
                  </button>

                  {canCreate && (
                    <button
                      onClick={() => openEditTemplate(tpl.id)}
                      className="px-2 py-1 rounded-xl border hover:bg-gray-50"
                    >
                      Edit
                    </button>
                  )}

                  {canDelete && (
                    <button
                      onClick={() => handleDelete(tpl.id)}
                      className="px-2 py-1 rounded-xl border text-rose-600 hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Import Modal */}
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