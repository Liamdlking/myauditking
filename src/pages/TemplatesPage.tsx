import React, { useEffect, useMemo, useState } from "react";
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

type QuestionType = "yesno" | "gfp" | "multi" | "text";

type TemplateQuestion = {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options?: string[];
};

type TemplateSection = {
  id: string;
  title: string;
  image?: string | null;
  items: TemplateQuestion[];
};

// small id helper
const makeId = () =>
  (globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2, 10)) as string;

// -----------------------------------------------------
// Editor modal (create / edit template inline)
// -----------------------------------------------------
interface EditorProps {
  open: boolean;
  template: TemplateRow | null;
  sites: SiteRow[];
  onClose: () => void;
  onSaved: () => void;
}

function TemplateEditorModal({
  open,
  template,
  sites,
  onClose,
  onSaved,
}: EditorProps) {
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [siteId, setSiteId] = useState<string>(template?.site_id || "");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(
    template?.logo_data_url || null
  );
  const [isPublished, setIsPublished] = useState<boolean>(
    template?.is_published ?? false
  );

  const [sections, setSections] = useState<TemplateSection[]>(() => {
    const def = template?.definition;
    if (def && Array.isArray(def.sections)) {
      return def.sections.map((s: any) => ({
        id: s.id || makeId(),
        title: s.title || "Section",
        image: s.image || null,
        items: (s.items || []).map((q: any) => ({
          id: q.id || makeId(),
          label: q.label || "",
          type: (q.type as QuestionType) || "yesno",
          required: !!q.required,
          options: q.options || [],
        })),
      }));
    }
    return [
      {
        id: makeId(),
        title: "Section 1",
        image: null,
        items: [],
      },
    ];
  });

  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // reset basic fields when template changes
    setName(template?.name || "");
    setDescription(template?.description || "");
    setSiteId(template?.site_id || "");
    setLogoDataUrl(template?.logo_data_url || null);
    setIsPublished(template?.is_published ?? false);

    const def = template?.definition;
    if (def && Array.isArray(def.sections)) {
      setSections(
        def.sections.map((s: any) => ({
          id: s.id || makeId(),
          title: s.title || "Section",
          image: s.image || null,
          items: (s.items || []).map((q: any) => ({
            id: q.id || makeId(),
            label: q.label || "",
            type: (q.type as QuestionType) || "yesno",
            required: !!q.required,
            options: q.options || [],
          })),
        }))
      );
    } else {
      setSections([
        {
          id: makeId(),
          title: "Section 1",
          image: null,
          items: [],
        },
      ]);
    }
  }, [open, template]);

  if (!open) return null;

  const onLogoChange = (file: File | null) => {
    if (!file) {
      setLogoDataUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoDataUrl(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const updateSection = (sectionId: string, patch: Partial<TemplateSection>) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s))
    );
  };

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        id: makeId(),
        title: `Section ${prev.length + 1}`,
        image: null,
        items: [],
      },
    ]);
  };

  const removeSection = (sectionId: string) => {
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
  };

  const addQuestion = (sectionId: string, type: QuestionType) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: [
                ...s.items,
                {
                  id: makeId(),
                  label: "New question",
                  type,
                  required: false,
                  options:
                    type === "multi"
                      ? ["Option 1", "Option 2"]
                      : undefined,
                },
              ],
            }
          : s
      )
    );
  };

  const updateQuestion = (
    sectionId: string,
    qId: string,
    patch: Partial<TemplateQuestion>
  ) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: s.items.map((q) =>
                q.id === qId ? { ...q, ...patch } : q
              ),
            }
          : s
      )
    );
  };

  const removeQuestion = (sectionId: string, qId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, items: s.items.filter((q) => q.id !== qId) }
          : s
      )
    );
  };

  const handleSave = async () => {
    setErrorText(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorText("Template name is required.");
      return;
    }

    const totalQuestions = sections.reduce(
      (acc, s) => acc + s.items.length,
      0
    );
    if (totalQuestions === 0) {
      const ok = window.confirm(
        "This template has no questions. Save anyway?"
      );
      if (!ok) return;
    }

    const definition = {
      sections: sections.map((s) => ({
        id: s.id,
        title: s.title,
        image: s.image || null,
        items: s.items.map((q) => ({
          id: q.id,
          label: q.label,
          type: q.type,
          required: q.required,
          options: q.options && q.options.length ? q.options : undefined,
        })),
      })),
    };

    setSaving(true);
    try {
      if (template) {
        // update
        const { error } = await supabase
          .from("templates")
          .update({
            name: trimmedName,
            description: description || null,
            site_id: siteId || null,
            logo_data_url: logoDataUrl,
            is_published: isPublished,
            definition,
          })
          .eq("id", template.id);

        if (error) {
          console.error(error);
          setErrorText(error.message || "Could not update template.");
          setSaving(false);
          return;
        }
      } else {
        // insert new
        const { error } = await supabase.from("templates").insert({
          name: trimmedName,
          description: description || null,
          site_id: siteId || null,
          logo_data_url: logoDataUrl,
          is_published: isPublished,
          definition,
        } as any);

        if (error) {
          console.error(error);
          setErrorText(error.message || "Could not create template.");
          setSaving(false);
          return;
        }
      }

      setSaving(false);
      onSaved();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorText("Unexpected error saving template.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-800">
              {template ? "Edit template" : "New template"}
            </div>
            <div className="text-xs text-gray-500">
              Add sections, questions, logos and assign to sites.
            </div>
          </div>
          <div className="flex gap-2 text-xs">
            <button
              onClick={onClose}
              className="px-3 py-1 rounded-xl border hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 rounded-xl bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 grid gap-4 md:grid-cols-3">
          {/* Left: meta */}
          <div className="space-y-3 md:col-span-1">
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Template name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm"
                placeholder="Warehouse Daily Safety Walkthrough"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-600">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full border rounded-xl px-3 py-2 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-600">Site</label>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              >
                <option value="">No specific site</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-600">Template logo</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onLogoChange(e.target.files?.[0] || null)}
                className="w-full text-xs"
              />
              {logoDataUrl && (
                <img
                  src={logoDataUrl}
                  alt="logo preview"
                  className="mt-2 w-16 h-16 rounded-full border object-cover"
                />
              )}
              <div className="text-[10px] text-gray-400">
                This appears on the Templates and Inspections lists and in PDF
                exports.
              </div>
            </div>

            <div className="space-y-1">
              <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                />
                Template published
              </label>
              <div className="text-[10px] text-gray-400">
                Unpublished templates are hidden from inspectors when starting new
                inspections.
              </div>
            </div>

            {errorText && (
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                {errorText}
              </div>
            )}
          </div>

          {/* Right: sections & questions */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-700">
                Sections & questions
              </div>
              <button
                onClick={addSection}
                className="px-2 py-1 rounded-xl border text-xs hover:bg-gray-50"
              >
                Add section
              </button>
            </div>

            {sections.map((section) => (
              <div
                key={section.id}
                className="border rounded-2xl p-3 bg-gray-50 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={section.title}
                    onChange={(e) =>
                      updateSection(section.id, { title: e.target.value })
                    }
                    className="flex-1 border rounded-xl px-2 py-1 text-xs bg-white"
                  />
                  <button
                    onClick={() => removeSection(section.id)}
                    className="text-[11px] text-rose-600 px-2 py-1 rounded-xl border hover:bg-rose-50"
                  >
                    Remove
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-gray-600">
                    Header image (optional)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (!file) {
                        updateSection(section.id, { image: null });
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        updateSection(section.id, {
                          image: String(reader.result),
                        });
                      };
                      reader.readAsDataURL(file);
                    }}
                    className="w-full text-[11px]"
                  />
                  {section.image && (
                    <img
                      src={section.image}
                      alt="header"
                      className="mt-1 h-20 w-full object-cover rounded-xl border bg-white"
                    />
                  )}
                </div>

                <div className="flex flex-wrap gap-1 text-[11px] mt-1">
                  <span className="text-gray-500 mr-2">Add question:</span>
                  <button
                    onClick={() => addQuestion(section.id, "yesno")}
                    className="px-2 py-1 rounded-xl border bg-white hover:bg-gray-100"
                  >
                    Yes / No / N/A
                  </button>
                  <button
                    onClick={() => addQuestion(section.id, "gfp")}
                    className="px-2 py-1 rounded-xl border bg-white hover:bg-gray-100"
                  >
                    Good / Fair / Poor
                  </button>
                  <button
                    onClick={() => addQuestion(section.id, "multi")}
                    className="px-2 py-1 rounded-xl border bg-white hover:bg-gray-100"
                  >
                    Multiple choice
                  </button>
                  <button
                    onClick={() => addQuestion(section.id, "text")}
                    className="px-2 py-1 rounded-xl border bg-white hover:bg-gray-100"
                  >
                    Text only
                  </button>
                </div>

                <div className="mt-2 space-y-2">
                  {section.items.length === 0 && (
                    <div className="text-[11px] text-gray-500">
                      No questions in this section yet.
                    </div>
                  )}
                  {section.items.map((q) => (
                    <div
                      key={q.id}
                      className="bg-white border rounded-xl px-2 py-2 text-[11px] space-y-1"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          value={q.label}
                          onChange={(e) =>
                            updateQuestion(section.id, q.id, {
                              label: e.target.value,
                            })
                          }
                          className="flex-1 border rounded-xl px-2 py-1 text-[11px]"
                        />
                        <select
                          value={q.type}
                          onChange={(e) =>
                            updateQuestion(section.id, q.id, {
                              type: e.target.value as QuestionType,
                            })
                          }
                          className="border rounded-xl px-2 py-1"
                        >
                          <option value="yesno">Yes / No / N/A</option>
                          <option value="gfp">Good / Fair / Poor</option>
                          <option value="multi">Multiple choice</option>
                          <option value="text">Text</option>
                        </select>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={q.required}
                            onChange={(e) =>
                              updateQuestion(section.id, q.id, {
                                required: e.target.checked,
                              })
                            }
                          />
                          required
                        </label>
                        <button
                          onClick={() => removeQuestion(section.id, q.id)}
                          className="text-rose-600 px-2 py-1 rounded-xl border hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>

                      {q.type === "multi" && (
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-500">
                            Options (comma separated)
                          </label>
                          <input
                            value={(q.options || []).join(", ")}
                            onChange={(e) =>
                              updateQuestion(section.id, q.id, {
                                options: e.target.value
                                  .split(",")
                                  .map((o) => o.trim())
                                  .filter(Boolean),
                              })
                            }
                            className="w-full border rounded-xl px-2 py-1 text-[11px]"
                            placeholder="Option 1, Option 2, Option 3"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------
// Main TemplatesPage
// -----------------------------------------------------
export default function TemplatesPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState<string>("");

  const [showImportModal, setShowImportModal] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(
    null
  );

  // Load user (NOTE: uses user_id)
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
          .select("user_id,name,role")
          .eq("user_id", session.user.id)
          .single();

        if (error || !data) {
          console.warn("profiles lookup failed, defaulting to inspector", error);
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
              id: data.user_id,
              email: session.user.email || "",
              name: data.name || session.user.email || "",
              role: (data.role as any) || "inspector",
              site_access: [],
              is_banned: false,
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

  const canCreate =
    currentUser && (currentUser.role === "manager" || currentUser.role === "admin");
  const canDelete = currentUser && currentUser.role === "admin";

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

      const matchesSite = !siteFilter || (t.site_id && t.site_id === siteFilter);
      return matchesSearch && matchesSite;
    });
  }, [templates, search, siteFilter]);

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
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  const openEditTemplate = (tpl: TemplateRow) => {
    if (!canCreate) return;
    setEditingTemplate(tpl);
    setEditorOpen(true);
  };

  const handleDeleteTemplate = async (tpl: TemplateRow) => {
    if (!canDelete) return;
    const ok = window.confirm(
      `Delete template "${tpl.name}"? This cannot be undone.`
    );
    if (!ok) return;

    try {
      const { error } = await supabase.from("templates").delete().eq("id", tpl.id);
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

  if (loadingUser) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Loading account…
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
                          onClick={() => openEditTemplate(tpl)}
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

      {editorOpen && (
        <TemplateEditorModal
          open={editorOpen}
          template={editingTemplate}
          sites={sites}
          onClose={() => setEditorOpen(false)}
          onSaved={loadTemplates}
        />
      )}
    </>
  );
}