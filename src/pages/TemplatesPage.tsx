import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";

type Role = "admin" | "manager" | "inspector" | string | null;

type QuestionType =
  | "yes_no_na"
  | "good_fair_poor"
  | "multiple_choice"
  | "text";

type TemplateQuestion = {
  id: string;
  label: string;
  type: QuestionType;
  options?: string[]; // for multiple_choice
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
  site: string | null;
  updated_at: string | null;
  definition: TemplateDefinition | null;
  logo_data_url: string | null;
};

function uuid() {
  const g: any = globalThis as any;
  if (g.crypto && typeof g.crypto.randomUUID === "function") {
    return g.crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<Role>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(
    null
  );
  const [isCreating, setIsCreating] = useState(false);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSite, setFormSite] = useState("");
  const [formLogoDataUrl, setFormLogoDataUrl] = useState<string | null>(null);
  const [formSections, setFormSections] = useState<TemplateSection[]>([]);
  const [saving, setSaving] = useState(false);

  // ------------------------------
  // Load current user's role
  // ------------------------------
  useEffect(() => {
    const loadRole = async () => {
      setRoleLoading(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) {
          setRole(null);
          return;
        }

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

    loadRole();
  }, []);

  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isInspector = role === "inspector" || !role;

  // ------------------------------
  // Load templates list
  // ------------------------------
  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("templates")
        .select(
          "id, name, description, site, updated_at, definition, logo_data_url"
        )
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map((t: any) => {
        const def: TemplateDefinition =
          (t.definition as TemplateDefinition) || { sections: [] };
        return {
          id: t.id,
          name: t.name,
          description: t.description,
          site: t.site,
          updated_at: t.updated_at,
          logo_data_url: t.logo_data_url || null,
          definition:
            def && Array.isArray(def.sections) ? def : { sections: [] },
        } as TemplateRow;
      });

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
    loadTemplates();
  }, []);

  // ------------------------------
  // Start inspection from template
  // ------------------------------
  const startInspection = async (tpl: TemplateRow) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        alert("You must be logged in to start an inspection.");
        return;
      }

      const payload = {
        template_id: tpl.id,
        template_name: tpl.name,
        site: tpl.site,
        status: "in_progress",
        started_at: new Date().toISOString(),
        submitted_at: null,
        score: null,
        items: [],
        owner_user_id: user.id,
        owner_name: user.email ?? "Unknown",
      };

      const { error } = await supabase.from("inspections").insert([payload]);
      if (error) throw error;

      alert(
        "Inspection started. You can continue it from the Inspections page."
      );

      // If you prefer to redirect straight away, swap the alert for:
      // window.location.href = "/inspections";
    } catch (e: any) {
      console.error("startInspection error", e);
      alert(
        e?.message ||
          "Could not start inspection. Check the inspections table schema."
      );
    }
  };

  const handleStartInspectionClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    tpl: TemplateRow
  ) => {
    e.preventDefault(); // make sure no parent form submits
    e.stopPropagation();
    void startInspection(tpl);
  };

  // ------------------------------
  // Open / close modal
  // ------------------------------
  const openCreate = () => {
    setIsCreating(true);
    setEditingTemplate(null);
    setFormName("");
    setFormDescription("");
    setFormSite("");
    setFormLogoDataUrl(null);
    setFormSections([]);
  };

  const openEdit = (tpl: TemplateRow) => {
    setIsCreating(false);
    setEditingTemplate(tpl);
    setFormName(tpl.name);
    setFormDescription(tpl.description || "");
    setFormSite(tpl.site || "");
    setFormLogoDataUrl(tpl.logo_data_url || null);

    const def: TemplateDefinition = tpl.definition || { sections: [] };
    setFormSections(def.sections || []);
  };

  const closeModal = () => {
    setEditingTemplate(null);
    setIsCreating(false);
    setFormName("");
    setFormDescription("");
    setFormSite("");
    setFormLogoDataUrl(null);
    setFormSections([]);
    setSaving(false);
  };

  // ------------------------------
  // Logo upload
  // ------------------------------
  const handleLogoFile = (file: File | null) => {
    if (!file) {
      setFormLogoDataUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFormLogoDataUrl(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  // ------------------------------
  // Section helpers
  // ------------------------------
  const addSection = () => {
    setFormSections((prev) => [
      ...prev,
      {
        id: uuid(),
        title: "New section",
        image_data_url: null,
        questions: [],
      },
    ]);
  };

  const updateSection = (id: string, patch: Partial<TemplateSection>) => {
    setFormSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };

  const deleteSection = (id: string) => {
    setFormSections((prev) => prev.filter((s) => s.id !== id));
  };

  const moveSection = (id: string, direction: "up" | "down") => {
    setFormSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === -1) return prev;
      if (direction === "up" && idx === 0) return prev;
      if (direction === "down" && idx === prev.length - 1) return prev;
      const newArr = [...prev];
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      const tmp = newArr[idx];
      newArr[idx] = newArr[swapWith];
      newArr[swapWith] = tmp;
      return newArr;
    });
  };

  const handleSectionImageFile = (sectionId: string, file: File | null) => {
    if (!file) {
      updateSection(sectionId, { image_data_url: null });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateSection(sectionId, { image_data_url: String(reader.result) });
    };
    reader.readAsDataURL(file);
  };

  // ------------------------------
  // Question helpers
  // ------------------------------
  const addQuestionToSection = (sectionId: string) => {
    setFormSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              questions: [
                ...s.questions,
                {
                  id: uuid(),
                  label: "New question",
                  type: "yes_no_na",
                  options: [],
                  allowNotes: true,
                  allowPhoto: false,
                  required: true,
                },
              ],
            }
          : s
      )
    );
  };

  const updateQuestionInSection = (
    sectionId: string,
    questionId: string,
    patch: Partial<TemplateQuestion>
  ) => {
    setFormSections((prev) =>
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

  const deleteQuestionFromSection = (sectionId: string, questionId: string) => {
    setFormSections((prev) =>
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

  const moveQuestionWithinSection = (
    sectionId: string,
    questionId: string,
    direction: "up" | "down"
  ) => {
    setFormSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const idx = s.questions.findIndex((q) => q.id === questionId);
        if (idx === -1) return s;
        if (direction === "up" && idx === 0) return s;
        if (direction === "down" && idx === s.questions.length - 1) return s;
        const newQuestions = [...s.questions];
        const swapWith = direction === "up" ? idx - 1 : idx + 1;
        const tmp = newQuestions[idx];
        newQuestions[idx] = newQuestions[swapWith];
        newQuestions[swapWith] = tmp;
        return { ...s, questions: newQuestions };
      })
    );
  };

  const updateQuestionOption = (
    sectionId: string,
    questionId: string,
    index: number,
    value: string
  ) => {
    setFormSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          questions: s.questions.map((q) => {
            if (q.id !== questionId) return q;
            const opts = q.options ? [...q.options] : [];
            opts[index] = value;
            return { ...q, options: opts };
          }),
        };
      })
    );
  };

  const addQuestionOption = (sectionId: string, questionId: string) => {
    setFormSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          questions: s.questions.map((q) => {
            if (q.id !== questionId) return q;
            const opts = q.options ? [...q.options] : [];
            opts.push("New option");
            return { ...q, options: opts };
          }),
        };
      })
    );
  };

  const removeQuestionOption = (
    sectionId: string,
    questionId: string,
    index: number
  ) => {
    setFormSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          questions: s.questions.map((q) => {
            if (q.id !== questionId) return q;
            const opts = q.options ? [...q.options] : [];
            opts.splice(index, 1);
            return { ...q, options: opts };
          }),
        };
      })
    );
  };

  // ------------------------------
  // Save / delete template
  // ------------------------------
  const handleSaveTemplate = async () => {
    if (!formName.trim()) {
      alert("Template name is required.");
      return;
    }

    setSaving(true);
    try {
      const definition: TemplateDefinition = {
        sections: formSections,
      };

      if (isCreating || !editingTemplate) {
        const { error } = await supabase.from("templates").insert([
          {
            name: formName.trim(),
            description: formDescription.trim() || null,
            site: formSite.trim() || null,
            logo_data_url: formLogoDataUrl,
            definition,
          },
        ]);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("templates")
          .update({
            name: formName.trim(),
            description: formDescription.trim() || null,
            site: formSite.trim() || null,
            logo_data_url: formLogoDataUrl,
            definition,
          })
          .eq("id", editingTemplate.id);
        if (error) throw error;
      }

      await loadTemplates();
      closeModal();
    } catch (e: any) {
      console.error("handleSaveTemplate error", e);
      alert(e?.message || "Could not save template.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (tpl: TemplateRow) => {
    if (!window.confirm(`Delete template "${tpl.name}"? This cannot be undone.`))
      return;
    try {
      const { error } = await supabase
        .from("templates")
        .delete()
        .eq("id", tpl.id);
      if (error) throw error;
      await loadTemplates();
    } catch (e: any) {
      console.error("handleDeleteTemplate error", e);
      alert(e?.message || "Could not delete template.");
    }
  };

  // ------------------------------
  // Render
  // ------------------------------
  const canEditTemplates = isAdmin || isManager;

  if (roleLoading || loading) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h1>Templates</h1>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h1>Templates</h1>
        {canEditTemplates && (
          <button type="button" onClick={openCreate}>
            New Template
          </button>
        )}
      </div>

      {error && (
        <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>
      )}

      {templates.length === 0 ? (
        <p>No templates yet.</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginBottom: "2rem",
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                Name
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                Site
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                Updated
              </th>
              <th style={{ borderBottom: "1px solid #ccc" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((tpl) => (
              <tr key={tpl.id}>
                <td
                  style={{
                    padding: "0.5rem 0.25rem",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  {tpl.name}
                </td>
                <td
                  style={{
                    padding: "0.5rem 0.25rem",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  {tpl.site || "-"}
                </td>
                <td
                  style={{
                    padding: "0.5rem 0.25rem",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  {tpl.updated_at
                    ? new Date(tpl.updated_at).toLocaleString()
                    : "-"}
                </td>
                <td
                  style={{
                    padding: "0.5rem 0.25rem",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => handleStartInspectionClick(e, tpl)}
                  >
                    Start Inspection
                  </button>
                  {canEditTemplates && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(tpl)}
                        style={{ marginLeft: "0.5rem" }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(tpl)}
                        style={{ marginLeft: "0.5rem" }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Modal */}
      {(isCreating || editingTemplate) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            overflowY: "auto",
            padding: "2rem 1rem",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "white",
              maxWidth: "900px",
              width: "100%",
              borderRadius: "8px",
              padding: "1rem 1.5rem 2rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h2>{isCreating ? "Create Template" : "Edit Template"}</h2>
              <button type="button" onClick={closeModal}>
                Close
              </button>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label>
                Name
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: "0.25rem" }}
                />
              </label>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label>
                Description
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "0.25rem",
                    minHeight: "60px",
                  }}
                />
              </label>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label>
                Site
                <input
                  type="text"
                  value={formSite}
                  onChange={(e) => setFormSite(e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: "0.25rem" }}
                />
              </label>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label>
                Logo
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    handleLogoFile(e.target.files ? e.target.files[0] : null)
                  }
                  style={{ display: "block", marginTop: "0.25rem" }}
                />
              </label>
              {formLogoDataUrl && (
                <div style={{ marginTop: "0.5rem" }}>
                  <img
                    src={formLogoDataUrl}
                    alt="Logo preview"
                    style={{ maxHeight: "80px" }}
                  />
                </div>
              )}
            </div>

            <hr style={{ margin: "1.5rem 0" }} />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.5rem",
              }}
            >
              <h3>Sections</h3>
              <button type="button" onClick={addSection}>
                Add Section
              </button>
            </div>

            {formSections.length === 0 && <p>No sections yet.</p>}

            {formSections.map((section, sectionIndex) => (
              <div
                key={section.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  padding: "0.75rem",
                  marginBottom: "1rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <strong>
                    Section {sectionIndex + 1}:{" "}
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) =>
                        updateSection(section.id, { title: e.target.value })
                      }
                      style={{ marginLeft: "0.5rem" }}
                    />
                  </strong>
                  <div>
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, "up")}
                      style={{ marginRight: "0.25rem" }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, "down")}
                      style={{ marginRight: "0.25rem" }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSection(section.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: "0.5rem" }}>
                  <label>
                    Section Image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        handleSectionImageFile(
                          section.id,
                          e.target.files ? e.target.files[0] : null
                        )
                      }
                      style={{ display: "block", marginTop: "0.25rem" }}
                    />
                  </label>
                  {section.image_data_url && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <img
                        src={section.image_data_url}
                        alt="Section preview"
                        style={{ maxHeight: "120px" }}
                      />
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.25rem",
                  }}
                >
                  <span>Questions</span>
                  <button
                    type="button"
                    onClick={() => addQuestionToSection(section.id)}
                  >
                    Add Question
                  </button>
                </div>

                {section.questions.length === 0 && (
                  <p style={{ fontSize: "0.9rem" }}>No questions in this section.</p>
                )}

                {section.questions.map((q, qIndex) => (
                  <div
                    key={q.id}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: "4px",
                      padding: "0.5rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.25rem",
                      }}
                    >
                      <strong>
                        Q{qIndex + 1}:{" "}
                        <input
                          type="text"
                          value={q.label}
                          onChange={(e) =>
                            updateQuestionInSection(section.id, q.id, {
                              label: e.target.value,
                            })
                          }
                          style={{ marginLeft: "0.5rem", width: "70%" }}
                        />
                      </strong>
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            moveQuestionWithinSection(section.id, q.id, "up")
                          }
                          style={{ marginRight: "0.25rem" }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            moveQuestionWithinSection(section.id, q.id, "down")
                          }
                          style={{ marginRight: "0.25rem" }}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            deleteQuestionFromSection(section.id, q.id)
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <label>
                        Type{" "}
                        <select
                          value={q.type}
                          onChange={(e) =>
                            updateQuestionInSection(section.id, q.id, {
                              type: e.target.value as QuestionType,
                            })
                          }
                        >
                          <option value="yes_no_na">Yes / No / N/A</option>
                          <option value="good_fair_poor">
                            Good / Fair / Poor
                          </option>
                          <option value="multiple_choice">
                            Multiple Choice
                          </option>
                          <option value="text">Text</option>
                        </select>
                      </label>

                      <label>
                        <input
                          type="checkbox"
                          checked={q.allowNotes}
                          onChange={(e) =>
                            updateQuestionInSection(section.id, q.id, {
                              allowNotes: e.target.checked,
                            })
                          }
                        />{" "}
                        Allow Notes
                      </label>

                      <label>
                        <input
                          type="checkbox"
                          checked={q.allowPhoto}
                          onChange={(e) =>
                            updateQuestionInSection(section.id, q.id, {
                              allowPhoto: e.target.checked,
                            })
                          }
                        />{" "}
                        Allow Photo
                      </label>

                      <label>
                        <input
                          type="checkbox"
                          checked={q.required}
                          onChange={(e) =>
                            updateQuestionInSection(section.id, q.id, {
                              required: e.target.checked,
                            })
                          }
                        />{" "}
                        Required
                      </label>
                    </div>

                    {q.type === "multiple_choice" && (
                      <div style={{ marginTop: "0.25rem" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "0.25rem",
                          }}
                        >
                          <span>Options</span>
                          <button
                            type="button"
                            onClick={() =>
                              addQuestionOption(section.id, q.id)
                            }
                          >
                            Add Option
                          </button>
                        </div>
                        {(q.options || []).map((opt, optIndex) => (
                          <div
                            key={optIndex}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              marginBottom: "0.25rem",
                            }}
                          >
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) =>
                                updateQuestionOption(
                                  section.id,
                                  q.id,
                                  optIndex,
                                  e.target.value
                                )
                              }
                              style={{ flex: 1, marginRight: "0.25rem" }}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                removeQuestionOption(
                                  section.id,
                                  q.id,
                                  optIndex
                                )
                              }
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {(!q.options || q.options.length === 0) && (
                          <p style={{ fontSize: "0.85rem" }}>
                            No options yet.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
                marginTop: "1rem",
              }}
            >
              <button type="button" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}