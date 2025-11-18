import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";

const TPL_KEY = "ak_templates";

// Types used by inspections & template editor
type QuestionType = "yesno" | "rating" | "multi" | "text";

type Question = {
  id: string;
  label: string;
  type: QuestionType;
  options?: string[];
  instruction?: string;
  refImages?: string[]; // data URLs
};

type TemplateSection = {
  id: string;
  title: string;
  headerImageDataUrl?: string;
  questions: Question[];
};

type TemplateUI = {
  id: string;
  name: string;
  siteId?: string | null;
  siteName?: string | null;
  logoDataUrl?: string | null;
  sections: TemplateSection[];
  published: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type Site = {
  id: string;
  name: string;
  code: string | null;
};

const makeId = () =>
  (crypto as any)?.randomUUID?.() ?? Math.random().toString(36).slice(2);

// Normalise JSON definition from DB into sections/questions
function normaliseDefinition(def: any): TemplateSection[] {
  if (!def) {
    return [
      {
        id: makeId(),
        title: "General",
        questions: [],
      },
    ];
  }

  if (Array.isArray(def.sections) && def.sections.length > 0) {
    return def.sections.map((sec: any, secIdx: number) => ({
      id: sec.id || `sec-${secIdx + 1}`,
      title: sec.title || `Section ${secIdx + 1}`,
      headerImageDataUrl: sec.headerImageDataUrl || undefined,
      questions: Array.isArray(sec.questions)
        ? sec.questions.map((q: any, qIdx: number) => ({
            id: q.id || `q-${secIdx + 1}-${qIdx + 1}`,
            label: q.label || "Question",
            type: (["yesno", "rating", "multi", "text"] as QuestionType[]).includes(
              q.type
            )
              ? (q.type as QuestionType)
              : "yesno",
            options: Array.isArray(q.options) ? q.options : undefined,
            instruction:
              typeof q.instruction === "string" ? q.instruction : undefined,
            refImages: Array.isArray(q.refImages) ? q.refImages : undefined,
          }))
        : [],
    }));
  }

  if (Array.isArray(def.questions)) {
    const questions = def.questions.map((q: any, idx: number) => ({
      id: q.id || `q-${idx + 1}`,
      label: q.label || String(q),
      type: (["yesno", "rating", "multi", "text"] as QuestionType[]).includes(
        q.type
      )
        ? (q.type as QuestionType)
        : "yesno",
      options: Array.isArray(q.options) ? q.options : undefined,
      instruction: typeof q.instruction === "string" ? q.instruction : undefined,
      refImages: Array.isArray(q.refImages) ? q.refImages : undefined,
    }));

    return [
      {
        id: makeId(),
        title: "General",
        questions,
      },
    ];
  }

  return [
    {
      id: makeId(),
      title: "General",
      questions: [],
    },
  ];
}

// Save templates to localStorage in a format InspectionsPage expects
function saveTemplatesToLocalStorage(templates: TemplateUI[]) {
  try {
    const payload = templates.map((t) => ({
      id: t.id,
      name: t.name,
      site: t.siteName || null,
      logoDataUrl: t.logoDataUrl || null,
      sections: t.sections,
    }));
    localStorage.setItem(TPL_KEY, JSON.stringify(payload));
  } catch (err) {
    console.error("Failed to save templates to localStorage", err);
  }
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateUI[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const [editing, setEditing] = useState<TemplateUI | null>(null);
  const [showEditor, setShowEditor] = useState<boolean>(false);

  // ---- Load sites & templates from Supabase ----

  const loadSites = async () => {
    const { data, error } = await supabase
      .from("sites")
      .select("id, name, code")
      .order("name", { ascending: true });

    if (!error && data) {
      setSites(data as Site[]);
    } else if (error) {
      console.error("TemplatesPage: loadSites error", error);
    }
  };

  const loadTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("templates")
      .select(
        "id, name, site_id, site, logo_data_url, definition, published, created_at, updated_at"
      )
      .order("name", { ascending: true });

    if (error) {
      console.error("TemplatesPage: loadTemplates error", error);
      setTemplates([]);
      setLoading(false);
      return;
    }

    const mapped: TemplateUI[] =
      (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        siteId: row.site_id ?? null,
        siteName: row.site ?? null,
        logoDataUrl: row.logo_data_url ?? null,
        sections: normaliseDefinition(row.definition),
        published: row.published ?? true,
        createdAt: row.created_at ?? undefined,
        updatedAt: row.updated_at ?? undefined,
      })) ?? [];

    setTemplates(mapped);
    saveTemplatesToLocalStorage(mapped);
    setLoading(false);
  };

  useEffect(() => {
    loadSites();
    loadTemplates();
  }, []);

  // ---- Filtering ----

  const filteredTemplates = templates.filter((t) => {
    const matchesSite =
      siteFilter === "all" ? true : t.siteId === siteFilter || t.siteId === null;
    const matchesSearch = t.name
      .toLowerCase()
      .includes(search.toLowerCase().trim());
    return matchesSite && matchesSearch;
  });

  // ---- Editor logic ----

  const openNewTemplate = () => {
    const blank: TemplateUI = {
      id: makeId(),
      name: "New template",
      siteId: null,
      siteName: null,
      logoDataUrl: undefined,
      published: false,
      sections: [
        {
          id: makeId(),
          title: "Section 1",
          headerImageDataUrl: undefined,
          questions: [],
        },
      ],
    };
    setEditing(blank);
    setShowEditor(true);
  };

  const openEditTemplate = (tpl: TemplateUI) => {
    setEditing(tpl);
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditing(null);
  };

  const handleLogoChange = (file: File | null) => {
    if (!editing || !file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setEditing((prev) =>
          prev ? { ...prev, logoDataUrl: reader.result as string } : prev
        );
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSectionHeaderImage = (sectionId: string, file: File | null) => {
    if (!editing || !file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setEditing((prev) => {
          if (!prev) return prev;
          const sections = prev.sections.map((s) =>
            s.id === sectionId
              ? { ...s, headerImageDataUrl: reader.result as string }
              : s
          );
          return { ...prev, sections };
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddSection = () => {
    if (!editing) return;
    const sec: TemplateSection = {
      id: makeId(),
      title: `Section ${editing.sections.length + 1}`,
      questions: [],
    };
    setEditing({ ...editing, sections: [...editing.sections, sec] });
  };

  const handleRemoveSection = (sectionId: string) => {
    if (!editing) return;
    if (editing.sections.length === 1) {
      alert("You must have at least one section.");
      return;
    }
    setEditing({
      ...editing,
      sections: editing.sections.filter((s) => s.id !== sectionId),
    });
  };

  const handleSectionTitleChange = (sectionId: string, title: string) => {
    if (!editing) return;
    setEditing({
      ...editing,
      sections: editing.sections.map((s) =>
        s.id === sectionId ? { ...s, title } : s
      ),
    });
  };

  const handleAddQuestion = (sectionId: string) => {
    if (!editing) return;
    const newQ: Question = {
      id: makeId(),
      label: "New question",
      type: "yesno",
    };
    setEditing({
      ...editing,
      sections: editing.sections.map((s) =>
        s.id === sectionId ? { ...s, questions: [...s.questions, newQ] } : s
      ),
    });
  };

  const handleRemoveQuestion = (sectionId: string, questionId: string) => {
    if (!editing) return;
    setEditing({
      ...editing,
      sections: editing.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              questions: s.questions.filter((q) => q.id !== questionId),
            }
          : s
      ),
    });
  };

  const handleQuestionChange = (
    sectionId: string,
    questionId: string,
    patch: Partial<Question>
  ) => {
    if (!editing) return;
    setEditing({
      ...editing,
      sections: editing.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              questions: s.questions.map((q) =>
                q.id === questionId ? { ...q, ...patch } : q
              ),
            }
          : s
      ),
    });
  };

  const handleRefImageFiles = (
    sectionId: string,
    questionId: string,
    files: FileList | null
  ) => {
    if (!files || files.length === 0 || !editing) return;
    const arr = Array.from(files);
    const readers: string[] = [];
    let remaining = arr.length;

    arr.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          readers.push(reader.result as string);
        }
        remaining -= 1;
        if (remaining === 0) {
          // all files read
          setEditing((prev) => {
            if (!prev) return prev;
            const sections = prev.sections.map((s) => {
              if (s.id !== sectionId) return s;
              const questions = s.questions.map((q) => {
                if (q.id !== questionId) return q;
                const existing = q.refImages ?? [];
                return {
                  ...q,
                  refImages: [...existing, ...readers],
                };
              });
              return { ...s, questions };
            });
            return { ...prev, sections };
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Save template to Supabase + local state + localStorage
  const saveTemplate = async () => {
    if (!editing) return;
    const trimmedName = editing.name.trim();
    if (!trimmedName) {
      alert("Template name is required.");
      return;
    }

    const definition = {
      sections: editing.sections.map((s) => ({
        id: s.id,
        title: s.title,
        headerImageDataUrl: s.headerImageDataUrl || null,
        questions: s.questions.map((q) => ({
          id: q.id,
          label: q.label,
          type: q.type,
          options: q.options && q.options.length ? q.options : null,
          instruction: q.instruction || null,
          refImages: q.refImages && q.refImages.length ? q.refImages : null,
        })),
      })),
    };

    const chosenSite =
      editing.siteId && sites.length
        ? sites.find((s) => s.id === editing.siteId)
        : undefined;

    const payload = {
      name: trimmedName,
      site_id: editing.siteId || null,
      site: chosenSite ? chosenSite.name : editing.siteName || null,
      definition,
      logo_data_url: editing.logoDataUrl || null,
      published: editing.published,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (templates.find((t) => t.id === editing.id)) {
      const { error: upErr } = await supabase
        .from("templates")
        .update(payload)
        .eq("id", editing.id);
      error = upErr;
    } else {
      const { error: insErr } = await supabase
        .from("templates")
        .insert({ id: editing.id, ...payload });
      error = insErr;
    }

    if (error) {
      console.error("saveTemplate error", error);
      alert(
        `Could not save template: ${
          (error as any)?.message || "Unknown Supabase error"
        }`
      );
      return;
    }

    await loadTemplates();
    closeEditor();
  };

  const togglePublished = async (tpl: TemplateUI) => {
    const newPublished = !tpl.published;
    const { error } = await supabase
      .from("templates")
      .update({ published: newPublished, updated_at: new Date().toISOString() })
      .eq("id", tpl.id);

    if (error) {
      console.error("togglePublished error", error);
      alert("Could not update published state.");
      return;
    }

    const updated = templates.map((t) =>
      t.id === tpl.id ? { ...t, published: newPublished } : t
    );
    setTemplates(updated);
    saveTemplatesToLocalStorage(updated);
  };

  const deleteTemplate = async (tpl: TemplateUI) => {
    if (!window.confirm(`Delete template "${tpl.name}"? This cannot be undone.`)) {
      return;
    }
    const { error } = await supabase.from("templates").delete().eq("id", tpl.id);
    if (error) {
      console.error("deleteTemplate error", error);
      alert("Could not delete template.");
      return;
    }
    const updated = templates.filter((t) => t.id !== tpl.id);
    setTemplates(updated);
    saveTemplatesToLocalStorage(updated);
  };

  const displaySiteName = (tpl: TemplateUI) => {
    const s = tpl.siteId ? sites.find((x) => x.id === tpl.siteId) : null;
    if (s) return s.code ? `${s.name} (${s.code})` : s.name;
    if (tpl.siteName) return tpl.siteName;
    return "All sites";
  };

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-royal-700">Templates</h1>
          <p className="text-sm text-gray-600">
            Build templates with sections, guidance and images, and assign them
            to sites.
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <input
            type="text"
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={openNewTemplate}
            className="px-4 py-2 rounded-xl bg-royal-700 text-white text-sm hover:bg-royal-800"
          >
            New template
          </button>
        </div>
      </div>

      {/* Site filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500">Filter by site:</span>
        <select
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
          className="border rounded-xl px-3 py-1 text-xs"
        >
          <option value="all">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.code ? `(${s.code})` : ""}
            </option>
          ))}
        </select>
        {loading && (
          <span className="text-xs text-gray-400 ml-2">Loading templates…</span>
        )}
      </div>

      {/* Templates list */}
      <div className="space-y-2">
        {filteredTemplates.length === 0 && !loading && (
          <div className="bg-white border rounded-2xl p-4 text-sm text-gray-600">
            No templates yet. Create your first template.
          </div>
        )}

        {filteredTemplates.map((tpl) => (
          <div
            key={tpl.id}
            className="bg-white border rounded-2xl p-4 flex flex-col md:flex-row justify-between gap-3 text-sm"
          >
            <div className="flex items-start gap-3">
              {tpl.logoDataUrl && (
                <img
                  src={tpl.logoDataUrl}
                  alt="logo"
                  className="w-10 h-10 rounded-full object-cover border"
                />
              )}
              <div>
                <div className="font-semibold text-gray-900">{tpl.name}</div>
                <div className="text-xs text-gray-500">
                  Site: {displaySiteName(tpl)}
                </div>
                {tpl.updatedAt && (
                  <div className="text-[11px] text-gray-400">
                    Updated: {tpl.updatedAt.slice(0, 16).replace("T", " ")}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                onClick={() => togglePublished(tpl)}
                className={
                  "px-3 py-1 rounded-xl border text-xs " +
                  (tpl.published
                    ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                    : "bg-gray-50 border-gray-300 text-gray-600")
                }
              >
                {tpl.published ? "Published" : "Unpublished"}
              </button>
              <button
                onClick={() => openEditTemplate(tpl)}
                className="px-3 py-1 rounded-xl border text-xs hover:bg-gray-50"
              >
                Edit
              </button>
              <button
                onClick={() => deleteTemplate(tpl)}
                className="px-3 py-1 rounded-xl border text-xs text-rose-600 hover:bg-rose-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Editor modal */}
      {showEditor && editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-royal-700 text-sm">
                {templates.find((t) => t.id === editing.id)
                  ? "Edit template"
                  : "New template"}
              </h2>
              <button
                onClick={closeEditor}
                className="text-xs text-gray-500 hover:underline"
              >
                Close
              </button>
            </div>

            {/* Basic info */}
            <div className="grid md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Template name
                  </label>
                  <input
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                    value={editing.name}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Site
                  </label>
                  <select
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                    value={editing.siteId || ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        siteId: e.target.value || null,
                      })
                    }
                  >
                    <option value="">(No site / global)</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.code ? `(${s.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="tpl-published"
                    type="checkbox"
                    checked={editing.published}
                    onChange={(e) =>
                      setEditing({ ...editing, published: e.target.checked })
                    }
                  />
                  <label
                    htmlFor="tpl-published"
                    className="text-xs text-gray-600"
                  >
                    Published (visible to inspectors)
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Template logo
                  </label>
                  {editing.logoDataUrl && (
                    <img
                      src={editing.logoDataUrl}
                      alt="logo preview"
                      className="w-16 h-16 rounded-full object-cover border mb-2"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      handleLogoChange(e.target.files?.[0] ?? null)
                    }
                    className="text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-gray-800">
                  Sections & questions
                </h3>
                <button
                  type="button"
                  onClick={handleAddSection}
                  className="px-3 py-1 rounded-xl border text-xs hover:bg-gray-50"
                >
                  Add section
                </button>
              </div>

              {editing.sections.map((sec) => (
                <div
                  key={sec.id}
                  className="border rounded-2xl p-3 space-y-3 bg-gray-50"
                >
                  <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                    <div className="flex-1 space-y-1">
                      <label className="block text-xs text-gray-500 mb-1">
                        Section title
                      </label>
                      <input
                        className="w-full border rounded-xl px-3 py-2 text-sm"
                        value={sec.title}
                        onChange={(e) =>
                          handleSectionTitleChange(sec.id, e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs text-gray-500 mb-1">
                        Header image
                      </label>
                      {sec.headerImageDataUrl && (
                        <img
                          src={sec.headerImageDataUrl}
                          alt="section header"
                          className="w-16 h-16 rounded-lg object-cover border mb-1"
                        />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          handleSectionHeaderImage(
                            sec.id,
                            e.target.files?.[0] ?? null
                          )
                        }
                        className="text-xs"
                      />
                    </div>
                    <div className="flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRemoveSection(sec.id)}
                        className="text-xs text-rose-600 hover:underline"
                      >
                        Remove section
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {sec.questions.map((q) => (
                      <div
                        key={q.id}
                        className="bg-white border rounded-xl p-3 space-y-2"
                      >
                        <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
                          <input
                            className="flex-1 border rounded-xl px-3 py-2 text-sm"
                            value={q.label}
                            onChange={(e) =>
                              handleQuestionChange(sec.id, q.id, {
                                label: e.target.value,
                              })
                            }
                          />
                          <div className="flex gap-2 items-center">
                            <select
                              className="border rounded-xl px-2 py-1 text-xs"
                              value={q.type}
                              onChange={(e) =>
                                handleQuestionChange(sec.id, q.id, {
                                  type: e.target.value as QuestionType,
                                })
                              }
                            >
                              <option value="yesno">Yes / No / N/A</option>
                              <option value="rating">Good / Fair / Poor</option>
                              <option value="multi">Multiple choice</option>
                              <option value="text">Text only</option>
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveQuestion(sec.id, q.id)
                              }
                              className="text-xs text-rose-600 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        {(q.type === "rating" || q.type === "multi") && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Options (comma-separated)
                            </label>
                            <input
                              className="w-full border rounded-xl px-3 py-1 text-xs"
                              value={q.options?.join(", ") || ""}
                              onChange={(e) =>
                                handleQuestionChange(sec.id, q.id, {
                                  options: e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                })
                              }
                              placeholder={
                                q.type === "rating"
                                  ? "e.g. Good, Fair, Poor"
                                  : "e.g. Option A, Option B, Option C"
                              }
                            />
                          </div>
                        )}

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            Inspector guidance / instruction
                          </label>
                          <textarea
                            className="w-full border rounded-xl px-3 py-2 text-xs"
                            value={q.instruction || ""}
                            onChange={(e) =>
                              handleQuestionChange(sec.id, q.id, {
                                instruction: e.target.value,
                              })
                            }
                            placeholder="Optional guidance for the inspector (shown under the question)."
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs text-gray-500 mb-1">
                            Reference images
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) =>
                              handleRefImageFiles(
                                sec.id,
                                q.id,
                                e.target.files
                              )
                            }
                            className="text-xs"
                          />
                          {q.refImages && q.refImages.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {q.refImages.map((src, idx) => (
                                <img
                                  key={idx}
                                  src={src}
                                  alt="ref"
                                  className="h-10 w-10 object-cover rounded-md border"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => handleAddQuestion(sec.id)}
                      className="px-3 py-1 rounded-xl border text-xs hover:bg-gray-50"
                    >
                      Add question
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditor}
                className="px-4 py-2 rounded-xl border text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveTemplate}
                className="px-4 py-2 rounded-xl bg-royal-700 text-white text-sm hover:bg-royal-800"
              >
                Save template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}