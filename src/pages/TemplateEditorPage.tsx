import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/utils/supabaseClient";

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

type SiteRow = {
  id: string;
  name: string;
};

type Mode = "create" | "edit";

type Props = {
  mode: Mode;
};

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function TemplateEditorPage({ mode }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [role, setRole] = useState<Role>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Template form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [sections, setSections] = useState<TemplateSection[]>([]);

  // --------------------------
  // Load role + sites + existing template (for edit mode)
  // --------------------------
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        // 1) Role
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) {
          setRole(null);
          setError("You must be logged in.");
          setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", user.id)
          .single();

        const r: Role = (profile?.role as Role) || "inspector";
        setRole(r);

        // Only managers + admins can edit templates
        if (r !== "admin" && r !== "manager") {
          setError("You are not authorised to edit templates.");
          setLoading(false);
          return;
        }

        // 2) Sites
        const { data: sitesData, error: sitesErr } = await supabase
          .from("sites")
          .select("id, name")
          .order("name", { ascending: true });

        if (sitesErr) throw sitesErr;

        setSites(
          (sitesData || []).map((s: any) => ({
            id: s.id,
            name: s.name,
          }))
        );

        // 3) If edit mode, load existing template
        if (mode === "edit") {
          if (!id) {
            setNotFound(true);
            setLoading(false);
            return;
          }

          const { data: tpl, error: tplErr } = await supabase
            .from("templates")
            .select(
              "id, name, description, site_id, is_published, logo_data_url, definition"
            )
            .eq("id", id)
            .single();

          if (tplErr) {
            if ((tplErr as any).code === "PGRST116") {
              setNotFound(true);
            } else {
              throw tplErr;
            }
            setLoading(false);
            return;
          }

          setName(tpl.name || "");
          setDescription(tpl.description || "");
          setSiteId(tpl.site_id || null);
          setIsPublished(!!tpl.is_published);
          setLogoDataUrl(tpl.logo_data_url || null);

          const def: TemplateDefinition =
            (tpl.definition as TemplateDefinition) || { sections: [] };
          setSections(def.sections || []);
        } else {
          // fresh create mode: one starter section
          setName("New template");
          setDescription("");
          setSiteId(null);
          setIsPublished(false);
          setLogoDataUrl(null);
          setSections([
            {
              id: randomId("sec"),
              title: "Section 1",
              image_data_url: null,
              questions: [
                {
                  id: randomId("q"),
                  label: "Example yes/no question",
                  type: "yes_no_na",
                  options: [],
                  allowNotes: true,
                  allowPhoto: true,
                  required: true,
                },
              ],
            },
          ]);
        }
      } catch (e: any) {
        console.error("TemplateEditorPage init error", e);
        setError(e?.message || "Could not load template editor.");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [mode, id]);

  const canEdit = role === "admin" || role === "manager";

  // --------------------------
  // Mutators
  // --------------------------
  const updateSection = (sectionId: string, patch: Partial<TemplateSection>) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s))
    );
  };

  // Insert a new section at a specific index
  const insertSectionAt = (index: number, initialTitle?: string) => {
    setSections((prev) => {
      const newSection: TemplateSection = {
        id: randomId("sec"),
        title: initialTitle || `Section ${index + 1}`,
        image_data_url: null,
        questions: [],
      };
      const next = [...prev];
      next.splice(index, 0, newSection);
      return next;
    });
  };

  // Original "Add section" now just appends at the end
  const addSection = () => {
    insertSectionAt(sections.length);
  };

  const removeSection = (sectionId: string) => {
    if (!window.confirm("Remove this section?")) return;
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
  };

  const addQuestion = (sectionId: string, type: QuestionType) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              questions: [
                ...s.questions,
                {
                  id: randomId("q"),
                  label: "New question",
                  type,
                  options: [],
                  allowNotes: true,
                  allowPhoto: true,
                  required: false,
                },
              ],
            }
          : s
      )
    );
  };

  const updateQuestion = (
    sectionId: string,
    questionId: string,
    patch: Partial<TemplateQuestion>
  ) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              questions: s.questions.map((q) =>
                q.id === questionId ? { ...q, ...patch } : q
              ),
            }
          : s
      )
    );
  };

  const removeQuestion = (sectionId: string, questionId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              questions: s.questions.filter((q) => q.id !== questionId),
            }
          : s
      )
    );
  };

  const handleSectionImage = (sectionId: string, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      updateSection(sectionId, { image_data_url: url });
    };
    reader.readAsDataURL(file);
  };

  const handleLogoChange = (file: File | null) => {
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

  // --------------------------
  // Save template
  // --------------------------
  const handleSave = async () => {
    if (!canEdit) {
      alert("You are not authorised to save templates.");
      return;
    }

    if (!name.trim()) {
      alert("Please enter a template name.");
      return;
    }

    // Build definition, trimming labels and options
    const cleanedSections: TemplateSection[] = sections.map((s) => ({
      ...s,
      title: s.title || "",
      questions: s.questions.map((q) => ({
        ...q,
        label: q.label || "",
        options:
          q.type === "multiple_choice"
            ? (q.options || []).map((o) => o.trim()).filter(Boolean)
            : [],
      })),
    }));

    const definition: TemplateDefinition = {
      sections: cleanedSections,
    };

    setSaving(true);
    setError(null);

    try {
      if (mode === "edit" && id) {
        const { error } = await supabase
          .from("templates")
          .update({
            name: name.trim(),
            description: description.trim() || null,
            site_id: siteId || null,
            is_published: isPublished,
            logo_data_url: logoDataUrl,
            definition,
          })
          .eq("id", id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("templates").insert({
          name: name.trim(),
          description: description.trim() || null,
          site_id: siteId || null,
          is_published: isPublished,
          logo_data_url: logoDataUrl,
          definition,
        });

        if (error) throw error;
      }

      alert("Template saved.");
      navigate("/templates");
    } catch (e: any) {
      console.error("handleSave error", e);
      setError(e?.message || "Could not save template.");
    } finally {
      setSaving(false);
    }
  };

  // --------------------------
  // Render
  // --------------------------
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-6">
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">
          Loading template editor…
        </div>
      </div>
    );
  }

  if (error && !canEdit) {
    return (
      <div className="max-w-5xl mx-auto py-6">
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">
          {error}
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-5xl mx_auto py-6">
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">
          Template not found.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-purple-700">
            {mode === "edit" ? "Edit template" : "New template"}
          </h1>
          <p className="text-sm text-gray-600">
            Configure sections, questions, notes, photos and logo.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/templates")}
            className="px-3 py-2 rounded-xl border text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-2 rounded-xl bg-purple-700 text-white text-sm hover:bg-purple-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Basic details */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-3">
          <div className="rounded-2xl border bg-white p-4 space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Template name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm"
                placeholder="E.g. Warehouse safety walkthrough"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm min-h-[60px]"
                placeholder="Short description (optional)…"
              />
            </div>
            <div className="flex flex-wrap gap-4 items-center">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Site
                </label>
                <select
                  value={siteId || ""}
                  onChange={(e) => setSiteId(e.target.value || null)}
                  className="border rounded-xl px-3 py-2 text-sm"
                >
                  <option value="">All sites</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="inline-flex items-center gap-2 text-xs mt-4">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                />
                <span>Published (visible for inspections)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Logo */}
        <div className="space-y-3">
          <div className="rounded-2xl border bg-white p-4 space-y-3">
            <div className="text-xs font-semibold text-gray-700">
              Template logo
            </div>
            {logoDataUrl ? (
              <div className="space-y-2">
                <img
                  src={logoDataUrl}
                  alt="Template logo"
                  className="h-20 w-20 rounded-md object-cover border bg-gray-50"
                />
                <button
                  onClick={() => setLogoDataUrl(null)}
                  className="text-[11px] text-rose-600 hover:underline"
                >
                  Remove logo
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-gray-500">
                Upload a logo so templates + inspection PDFs are easily
                recognizable.
              </p>
            )}
            <label className="inline-flex items-center gap-2 text-[11px] cursor-pointer">
              <span className="px-2 py-1 border rounded-xl bg-white hover:bg-gray-50">
                {logoDataUrl ? "Change logo" : "Upload logo"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) =>
                  handleLogoChange(
                    e.target.files ? e.target.files[0] : null
                  )
                }
              />
            </label>
          </div>
        </div>
      </div>

      {/* Sections & questions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-800">
            Sections & questions
          </div>
          <button
            onClick={addSection}
            className="px-3 py-1.5 rounded-xl border text-xs hover:bg-gray-50"
          >
            + Add section at end
          </button>
        </div>

        {sections.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 text-xs text-gray-600">
            No sections yet. Add one to start building your template.
          </div>
        ) : (
          <div className="space-y-3">
            {sections.map((section, idx) => (
              <React.Fragment key={section.id}>
                <div className="rounded-2xl border bg-white p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">
                          Section title
                        </label>
                        <input
                          value={section.title}
                          onChange={(e) =>
                            updateSection(section.id, {
                              title: e.target.value,
                            })
                          }
                          className="w-full border rounded-xl px-3 py-2 text-sm"
                          placeholder="E.g. Housekeeping / Title row"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        {section.image_data_url && (
                          <img
                            src={section.image_data_url}
                            alt={section.title}
                            className="h-10 w-10 rounded-md object-cover border bg-gray-50"
                          />
                        )}
                        <label className="inline-flex items-center gap-2 text-[11px] cursor-pointer">
                          <span className="px-2 py-1 border rounded-xl bg-white hover:bg-gray-50">
                            {section.image_data_url
                              ? "Change header image"
                              : "Upload header image"}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              handleSectionImage(
                                section.id,
                                e.target.files
                                  ? e.target.files[0]
                                  : null
                              )
                            }
                          />
                        </label>
                      </div>
                    </div>
                    <button
                      onClick={() => removeSection(section.id)}
                      className="text-[11px] text-rose-600 hover:underline"
                    >
                      Remove section
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="text-gray-500">Add question:</span>
                    <button
                      onClick={() => addQuestion(section.id, "yes_no_na")}
                      className="px-2 py-0.5 border rounded-xl hover:bg-gray-50"
                    >
                      Yes / No / N/A
                    </button>
                    <button
                      onClick={() =>
                        addQuestion(section.id, "good_fair_poor")
                      }
                      className="px-2 py-0.5 border rounded-xl hover:bg-gray-50"
                    >
                      Good / Fair / Poor
                    </button>
                    <button
                      onClick={() =>
                        addQuestion(section.id, "multiple_choice")
                      }
                      className="px-2 py-0.5 border rounded-xl hover:bg-gray-50"
                    >
                      Multiple choice
                    </button>
                    <button
                      onClick={() => addQuestion(section.id, "text")}
                      className="px-2 py-0.5 border rounded-xl hover:bg-gray-50"
                    >
                      Text only
                    </button>
                  </div>

                  <div className="space-y-2">
                    {section.questions.length === 0 ? (
                      <div className="border rounded-xl bg-gray-50 p-3 text-[11px] text-gray-500">
                        No questions in this section yet. You can leave it
                        empty if you just want a title/header.
                      </div>
                    ) : (
                      section.questions.map((q) => (
                        <div
                          key={q.id}
                          className="border rounded-xl bg-gray-50 p-3 space-y-2 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 space-y-1">
                              <input
                                value={q.label}
                                onChange={(e) =>
                                  updateQuestion(section.id, q.id, {
                                    label: e.target.value,
                                  })
                                }
                                className="w-full border rounded-xl px-2 py-1 text-xs"
                                placeholder="Question text…"
                              />
                              <div className="flex flex-wrap gap-2 items-center">
                                <select
                                  value={q.type}
                                  onChange={(e) =>
                                    updateQuestion(section.id, q.id, {
                                      type: e.target
                                        .value as QuestionType,
                                    })
                                  }
                                  className="border rounded-xl px-2 py-1 text-[11px]"
                                >
                                  <option value="yes_no_na">
                                    Yes / No / N/A
                                  </option>
                                  <option value="good_fair_poor">
                                    Good / Fair / Poor
                                  </option>
                                  <option value="multiple_choice">
                                    Multiple choice
                                  </option>
                                  <option value="text">
                                    Text only
                                  </option>
                                </select>
                                <label className="inline-flex items-center gap-1 text-[11px]">
                                  <input
                                    type="checkbox"
                                    checked={q.required}
                                    onChange={(e) =>
                                      updateQuestion(section.id, q.id, {
                                        required: e.target.checked,
                                      })
                                    }
                                  />
                                  <span>Required</span>
                                </label>
                                <label className="inline-flex items-center gap-1 text-[11px]">
                                  <input
                                    type="checkbox"
                                    checked={q.allowNotes}
                                    onChange={(e) =>
                                      updateQuestion(section.id, q.id, {
                                        allowNotes: e.target.checked,
                                      })
                                    }
                                  />
                                  <span>Notes</span>
                                </label>
                                <label className="inline-flex items-center gap-1 text-[11px]">
                                  <input
                                    type="checkbox"
                                    checked={q.allowPhoto}
                                    onChange={(e) =>
                                      updateQuestion(section.id, q.id, {
                                        allowPhoto: e.target.checked,
                                      })
                                    }
                                  />
                                  <span>Photos</span>
                                </label>
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                removeQuestion(section.id, q.id)
                              }
                              className="text-[11px] text-rose-600 hover:underline"
                            >
                              Remove
                            </button>
                          </div>

                          {q.type === "multiple_choice" && (
                            <div>
                              <label className="block text-[11px] text-gray-500 mb-1">
                                Choices (comma-separated)
                              </label>
                              <input
                                value={(q.options || []).join(", ")}
                                onChange={(e) => {
                                  const text = e.target.value;
                                  const arr = text
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean);
                                  updateQuestion(section.id, q.id, {
                                    options: arr,
                                  });
                                }}
                                className="w-full border rounded-xl px-2 py-1 text-xs"
                                placeholder="E.g. Option A, Option B, Option C"
                              />
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Insert controls between sections */}
                <div className="flex justify-center gap-2 text-[11px]">
                  <button
                    onClick={() =>
                      insertSectionAt(idx + 1, "Title")
                    }
                    className="px-3 py-1 rounded-xl border bg-white hover:bg-gray-50"
                  >
                    + Add title here
                  </button>
                  <button
                    onClick={() => insertSectionAt(idx + 1)}
                    className="px-3 py-1 rounded-xl border bg-white hover:bg-gray-50"
                  >
                    + Add section here
                  </button>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}