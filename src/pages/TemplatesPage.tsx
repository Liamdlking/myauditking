import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import ImportTemplateFromPdfModal from "@/components/ImportTemplateFromPdfModal";

type Role = "admin" | "manager" | "inspector" | string | null;

type QuestionType = "yes_no_na" | "good_fair_poor" | "multiple_choice" | "text";

type TemplateQuestion = {
  id: string;
  label: string;
  type: QuestionType;
  options?: string[];
  allowNotes: boolean;
  allowPhoto: boolean;
  required: boolean;
};

type TemplateSection = {
  id: string;
  title: string;
  image_data_url?: string | null;
  questions: TemplateQuestion[];
};

type TemplateDefinition = {
  sections: TemplateSection[];
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  site_id: string | null;
  definition: TemplateDefinition;
  updated_at: string | null;
  logo_data_url?: string | null;
};

type SiteRow = {
  id: string;
  name: string;
};

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function TemplatesPage() {
  const [role, setRole] = useState<Role>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitial, setEditorInitial] = useState<TemplateRow | null>(null);

  const [starting, setStarting] = useState<string | null>(null);

  // ----------------------------------
  // Load current user role
  // ----------------------------------
  useEffect(() => {
    const loadUserAndRole = async () => {
      setRoleLoading(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) {
          setRole(null);
          setCurrentUserId(null);
          return;
        }
        setCurrentUserId(user.id);

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", user.id)
          .single();

        if (!error && data) {
          setRole((data.role as Role) || "inspector");
        } else {
          setRole("inspector");
        }
      } catch {
        setRole("inspector");
      } finally {
        setRoleLoading(false);
      }
    };

    loadUserAndRole();
  }, []);

  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const canEditTemplates = isAdmin || isManager;

  // ----------------------------------
  // Load sites
  // ----------------------------------
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
    } catch (e: any) {
      console.error("loadSites error", e);
      // Soft-fail: templates still usable without sites
    }
  };

  // ----------------------------------
  // Load templates
  // ----------------------------------
  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("templates")
        .select(
          "id, name, description, site_id, definition, updated_at, logo_data_url"
        )
        .order("name", { ascending: true });

      if (error) throw error;

      const mapped: TemplateRow[] = (data || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description || null,
        site_id: t.site_id || null,
        definition:
          (t.definition as TemplateDefinition) || { sections: [] },
        updated_at: t.updated_at || null,
        logo_data_url: t.logo_data_url || null,
      }));

      setTemplates(mapped);
    } catch (e: any) {
      console.error("loadTemplates error", e);
      setError(
        e?.message || "Could not load templates. Check Supabase settings."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSites();
    loadTemplates();
  }, []);

  // ----------------------------------
  // Filtered list by site
  // ----------------------------------
  const templatesFiltered = useMemo(() => {
    return templates.filter((tpl) => {
      if (selectedSiteId === "all") return true;
      return tpl.site_id === selectedSiteId;
    });
  }, [templates, selectedSiteId]);

  const siteNameFor = (site_id: string | null) => {
    if (!site_id) return "All sites";
    const s = sites.find((x) => x.id === site_id);
    return s ? s.name : "Unknown site";
  };

  // ----------------------------------
  // Start inspection from template
  // ----------------------------------
  const startInspection = async (tpl: TemplateRow) => {
    if (!currentUserId) {
      alert("You must be signed in to start an inspection.");
      return;
    }
    if (!tpl.site_id) {
      alert(
        "This template is not assigned to a site. Edit the template and choose a site first."
      );
      return;
    }

    setStarting(tpl.id);
    try {
      const site = sites.find((s) => s.id === tpl.site_id);
      const siteName = site?.name || null;

      // Get display name for owner if available
      let ownerName: string | null = null;
      try {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", currentUserId)
          .single();
        if (!profileError && profile) {
          ownerName = profile.display_name || null;
        }
      } catch {
        // ignore
      }

      const { error } = await supabase.from("inspections").insert({
        template_id: tpl.id,
        template_name: tpl.name,
        site_id: tpl.site_id,
        site: siteName,
        status: "in_progress",
        started_at: new Date().toISOString(),
        items: [],
        owner_user_id: currentUserId,
        owner_name: ownerName,
      });

      if (error) throw error;

      alert(
        "Inspection started. Go to the Inspections page to complete it."
      );
    } catch (e: any) {
      console.error("startInspection error", e);
      alert(
        e?.message ||
          "Could not start inspection. Check that the inspections table has the right columns (including site_id, items)."
      );
    } finally {
      setStarting(null);
    }
  };

  // ----------------------------------
  // Delete template (admin only)
  // ----------------------------------
  const deleteTemplate = async (tpl: TemplateRow) => {
    if (!isAdmin) {
      alert("Only admins can delete templates.");
      return;
    }
    if (
      !confirm(
        `Delete template "${tpl.name}"? This will not delete existing inspections that used it.`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from("templates")
        .delete()
        .eq("id", tpl.id);
      if (error) throw error;
      await loadTemplates();
      alert("Template deleted.");
    } catch (e: any) {
      console.error("deleteTemplate error", e);
      alert(e?.message || "Could not delete template.");
    }
  };

  const openNewTemplate = () => {
    if (!canEditTemplates) {
      alert("Only managers/admins can create templates.");
      return;
    }
    const empty: TemplateRow = {
      id: "",
      name: "",
      description: "",
      site_id: null,
      definition: { sections: [] },
      updated_at: null,
      logo_data_url: null,
    };
    setEditorInitial(empty);
    setEditorOpen(true);
  };

  const openEditTemplate = (tpl: TemplateRow) => {
    if (!canEditTemplates) {
      alert("Only managers/admins can edit templates.");
      return;
    }
    setEditorInitial(tpl);
    setEditorOpen(true);
  };

  // ----------------------------------
  // Rendering
  // ----------------------------------
  return (
    <div className="max-w-6xl mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-purple-700">Templates</h1>
          {roleLoading ? (
            <p className="text-xs text-gray-500">Checking permissions…</p>
          ) : (
            <p className="text-sm text-gray-600">
              Build structured checklists with sections, logos, images and
              multiple-choice questions. Assign them to sites so your teams
              can start inspections quickly.
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2 items-center text-xs">
            <span className="text-gray-500">Filter by site:</span>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="border rounded-xl px-3 py-1 text-xs"
            >
              <option value="all">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {canEditTemplates && (
            <button
              onClick={openNewTemplate}
              className="px-3 py-2 rounded-xl bg-purple-700 text-white text-xs font-medium hover:bg-purple-800"
            >
              New template
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
          Loading templates…
        </div>
      ) : templatesFiltered.length === 0 ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
          No templates found.{" "}
          {canEditTemplates && "Click “New template” to create your first one."}
        </div>
      ) : (
        <div className="space-y-2">
          {templatesFiltered.map((tpl) => (
            <div
              key={tpl.id}
              className="border rounded-2xl bg-white p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2 shadow-sm"
            >
              <div className="flex items-start gap-3 flex-1">
                {tpl.logo_data_url && (
                  <img
                    src={tpl.logo_data_url}
                    alt={tpl.name}
                    className="h-10 w-10 object-cover rounded-md border bg-white flex-shrink-0"
                  />
                )}
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {tpl.name}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-[11px]">
                      {siteNameFor(tpl.site_id)}
                    </span>
                  </div>
                  {tpl.description && (
                    <div className="text-xs text-gray-600">
                      {tpl.description}
                    </div>
                  )}
                  <div className="text-[11px] text-gray-500">
                    Sections: {tpl.definition.sections?.length || 0}
                    {tpl.updated_at && (
                      <>
                        {" "}
                        • Updated:{" "}
                        {new Date(tpl.updated_at).toLocaleDateString()}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => startInspection(tpl)}
                  disabled={!!starting}
                  className="px-3 py-1 rounded-xl border hover:bg-gray-50 disabled:opacity-50"
                >
                  {starting === tpl.id ? "Starting…" : "Start inspection"}
                </button>
                {canEditTemplates && (
                  <button
                    onClick={() => openEditTemplate(tpl)}
                    className="px-3 py-1 rounded-xl border hover:bg-gray-50"
                  >
                    Edit
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => deleteTemplate(tpl)}
                    className="px-3 py-1 rounded-xl border text-rose-600 hover:bg-rose-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editorOpen && editorInitial && (
        <TemplateEditorModal
          initial={editorInitial}
          sites={sites}
          onClose={() => {
            setEditorOpen(false);
            setEditorInitial(null);
          }}
          onSaved={() => {
            setEditorOpen(false);
            setEditorInitial(null);
            loadTemplates();
          }}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------
// Template editor modal (with template logo)
// --------------------------------------------------------

type TemplateEditorModalProps = {
  initial: TemplateRow;
  sites: SiteRow[];
  onClose: () => void;
  onSaved: () => void;
};

function TemplateEditorModal({
  initial,
  sites,
  onClose,
  onSaved,
}: TemplateEditorModalProps) {
  const isNew = !initial.id;

  const [name, setName] = useState(initial.name || "");
  const [description, setDescription] = useState(initial.description || "");
  const [siteId, setSiteId] = useState<string>(initial.site_id || "");
  const [sections, setSections] = useState<TemplateSection[]>(
    initial.definition?.sections?.length
      ? initial.definition.sections
      : [
          {
            id: randomId("sec"),
            title: "Section 1",
            image_data_url: null,
            questions: [],
          },
        ]
  );
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(
    initial.logo_data_url || null
  );
  const [saving, setSaving] = useState(false);

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        id: randomId("sec"),
        title: `Section ${prev.length + 1}`,
        image_data_url: null,
        questions: [],
      },
    ]);
  };

  const updateSection = (id: string, patch: Partial<TemplateSection>) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };

  const removeSection = (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
  };

  const addQuestion = (sectionId: string, type: QuestionType) => {
    setSections((prev) =>
      prev.map((sec) =>
        sec.id === sectionId
          ? {
              ...sec,
              questions: [
                ...sec.questions,
                {
                  id: randomId("q"),
                  label: "New question",
                  type,
                  options:
                    type === "multiple_choice"
                      ? ["Option 1", "Option 2"]
                      : [],
                  allowNotes: true,
                  allowPhoto: false,
                  required: false,
                },
              ],
            }
          : sec
      )
    );
  };

  const updateQuestion = (
    sectionId: string,
    questionId: string,
    patch: Partial<TemplateQuestion>
  ) => {
    setSections((prev) =>
      prev.map((sec) =>
        sec.id === sectionId
          ? {
              ...sec,
              questions: sec.questions.map((q) =>
                q.id === questionId ? { ...q, ...patch } : q
              ),
            }
          : sec
      )
    );
  };

  const removeQuestion = (sectionId: string, questionId: string) => {
    setSections((prev) =>
      prev.map((sec) =>
        sec.id === sectionId
          ? {
              ...sec,
              questions: sec.questions.filter((q) => q.id !== questionId),
            }
          : sec
      )
    );
  };

  const onSectionImageChange = (sectionId: string, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateSection(sectionId, {
        image_data_url: String(reader.result),
      });
    };
    reader.readAsDataURL(file);
  };

  const onLogoChange = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLogoDataUrl(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const onSave = async () => {
    if (!name.trim()) {
      alert("Template name is required.");
      return;
    }

    const cleanedSections: TemplateSection[] = sections.map((sec) => ({
      ...sec,
      title: sec.title || "Untitled section",
      questions: sec.questions.map((q) => ({
        ...q,
        label: q.label || "Untitled question",
        options:
          q.type === "multiple_choice"
            ? (q.options || []).filter((o) => o.trim() !== "")
            : [],
      })),
    }));

    const definition: TemplateDefinition = {
      sections: cleanedSections,
    };

    setSaving(true);
    try {
      if (isNew) {
        const { error } = await supabase.from("templates").insert({
          name,
          description: description || null,
          site_id: siteId || null,
          definition,
          logo_data_url: logoDataUrl,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("templates")
          .update({
            name,
            description: description || null,
            site_id: siteId || null,
            definition,
            logo_data_url: logoDataUrl,
          })
          .eq("id", initial.id);
        if (error) throw error;
      }

      onSaved();
    } catch (e: any) {
      console.error("Template save error", e);
      alert(e?.message || "Could not save template.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-auto rounded-2xl bg-white shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-3">
            {logoDataUrl && (
              <img
                src={logoDataUrl}
                alt={name || "Template logo"}
                className="h-10 w-10 object-cover rounded-md border bg-white"
              />
            )}
            <div>
              <h2 className="font-semibold text-lg text-gray-900">
                {isNew ? "New template" : "Edit template"}
              </h2>
              <p className="text-xs text-gray-500">
                Add a template logo, sections, images and questions. Multiple
                choice uses simple comma-separated options.
              </p>
            </div>
          </div>
          <div className="flex gap-2 text-sm">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-xl border text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="px-3 py-2 rounded-xl bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {/* Basic info + logo */}
        <div className="grid md:grid-cols-3 gap-3 text-sm">
          <div className="md:col-span-2 space-y-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Template name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded-xl px-3 py-2"
                placeholder="e.g. Warehouse daily safety walk"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 min-h-[60px]"
                placeholder="Short description for your team…"
              />
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Site (optional)
              </label>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full border rounded-xl px-3 py-2"
              >
                <option value="">All sites</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] text-gray-500">
                When assigned, this template will appear under that site
                filter and new inspections will be tagged with that site.
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Template logo
              </label>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <span className="px-2 py-1 border rounded-xl bg-white hover:bg-gray-50 text-xs">
                    {logoDataUrl ? "Change logo" : "Upload logo"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      onLogoChange(
                        e.target.files ? e.target.files[0] : null
                      )
                    }
                  />
                </label>
                {logoDataUrl && (
                  <button
                    onClick={() => setLogoDataUrl(null)}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Remove logo
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                Shown on the Templates list and in inspection popups to help
                users quickly identify this check.
              </p>
            </div>
          </div>
        </div>

        {/* Sections & questions */}
        <div className="space-y-3">
          {sections.map((sec, secIdx) => (
            <div
              key={sec.id}
              className="border rounded-2xl p-3 bg-gray-50 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  {sec.image_data_url && (
                    <img
                      src={sec.image_data_url}
                      alt={sec.title}
                      className="h-10 w-10 object-cover rounded-md border bg-white"
                    />
                  )}
                  <input
                    value={sec.title}
                    onChange={(e) =>
                      updateSection(sec.id, { title: e.target.value })
                    }
                    className="border rounded-xl px-3 py-1 text-sm bg-white"
                    placeholder={`Section ${secIdx + 1} title`}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <span className="px-2 py-1 border rounded-xl bg-white hover:bg-gray-50">
                      {sec.image_data_url ? "Change image" : "Add image"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        onSectionImageChange(
                          sec.id,
                          e.target.files ? e.target.files[0] : null
                        )
                      }
                    />
                  </label>
                  {sections.length > 1 && (
                    <button
                      onClick={() => removeSection(sec.id)}
                      className="px-2 py-1 rounded-xl border text-rose-600 hover:bg-rose-50"
                    >
                      Remove section
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  onClick={() => addQuestion(sec.id, "yes_no_na")}
                  className="px-2 py-1 rounded-xl border bg-white hover:bg-gray-50"
                >
                  + Yes / No / N/A
                </button>
                <button
                  onClick={() => addQuestion(sec.id, "good_fair_poor")}
                  className="px-2 py-1 rounded-xl border bg-white hover:bg-gray-50"
                >
                  + Good / Fair / Poor
                </button>
                <button
                  onClick={() => addQuestion(sec.id, "multiple_choice")}
                  className="px-2 py-1 rounded-xl border bg-white hover:bg-gray-50"
                >
                  + Multiple choice
                </button>
                <button
                  onClick={() => addQuestion(sec.id, "text")}
                  className="px-2 py-1 rounded-xl border bg-white hover:bg-gray-50"
                >
                  + Text
                </button>
              </div>

              <div className="space-y-2">
                {sec.questions.map((q) => (
                  <div
                    key={q.id}
                    className="border rounded-xl p-3 bg-white grid md:grid-cols-12 gap-2 items-start text-xs"
                  >
                    <div className="md:col-span-5 space-y-1">
                      <input
                        value={q.label}
                        onChange={(e) =>
                          updateQuestion(sec.id, q.id, {
                            label: e.target.value,
                          })
                        }
                        className="w-full border rounded-xl px-3 py-1 text-sm"
                        placeholder="Question text"
                      />
                      <div className="flex flex-wrap gap-3">
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={q.required}
                            onChange={(e) =>
                              updateQuestion(sec.id, q.id, {
                                required: e.target.checked,
                              })
                            }
                          />
                          <span>Required</span>
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={q.allowNotes}
                            onChange={(e) =>
                              updateQuestion(sec.id, q.id, {
                                allowNotes: e.target.checked,
                              })
                            }
                          />
                          <span>Allow notes</span>
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={q.allowPhoto}
                            onChange={(e) =>
                              updateQuestion(sec.id, q.id, {
                                allowPhoto: e.target.checked,
                              })
                            }
                          />
                          <span>Allow photos</span>
                        </label>
                      </div>
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[11px] text-gray-500 mb-1">
                        Answer type
                      </label>
                      <select
                        value={q.type}
                        onChange={(e) =>
                          updateQuestion(sec.id, q.id, {
                            type: e.target.value as QuestionType,
                            options:
                              e.target.value === "multiple_choice"
                                ? q.options && q.options.length
                                  ? q.options
                                  : ["Option 1", "Option 2"]
                                : [],
                          })
                        }
                        className="w-full border rounded-xl px-3 py-1"
                      >
                        <option value="yes_no_na">Yes / No / N/A</option>
                        <option value="good_fair_poor">
                          Good / Fair / Poor
                        </option>
                        <option value="multiple_choice">
                          Multiple choice
                        </option>
                        <option value="text">Text</option>
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      {q.type === "multiple_choice" && (
                        <>
                          <label className="block text-[11px] text-gray-500 mb-1">
                            Options (comma separated)
                          </label>
                          <input
                            value={(q.options || []).join(", ")}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const arr = raw
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean);
                              updateQuestion(sec.id, q.id, {
                                options: arr,
                              });
                            }}
                            className="w-full border rounded-xl px-3 py-1"
                            placeholder="e.g. Red, Amber, Green"
                          />
                        </>
                      )}
                      {q.type !== "multiple_choice" && (
                        <p className="text-[11px] text-gray-400">
                          No extra configuration.
                        </p>
                      )}
                    </div>

                    <div className="md:col-span-1 flex justify-end">
                      <button
                        onClick={() => removeQuestion(sec.id, q.id)}
                        className="px-2 py-1 rounded-xl border text-rose-600 hover:bg-rose-50"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                {sec.questions.length === 0 && (
                  <div className="text-[11px] text-gray-500">
                    No questions yet. Use the buttons above to add some.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center">
          <button
            onClick={addSection}
            className="px-3 py-2 rounded-xl border text-xs hover:bg-gray-50"
          >
            + Add section
          </button>
          <p className="text-[11px] text-gray-500">
            Tip: Use sections for areas (e.g. “External area”, “Warehouse
            aisles”) and add images to guide inspectors.
          </p>
        </div>
      </div>
    </div>
  );
}