import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";

type Role = "admin" | "manager" | "inspector" | string | null;

type QuestionType = "yes_no_na" | "good_fair_poor" | "multiple_choice" | "text";

type TemplateQuestion = {
  id: string;
  label: string;
  type: QuestionType;
  options?: string[]; // for multiple_choice
  allowNotes: boolean;
  allowPhoto: boolean;
  required: boolean;
};

type TemplateDefinition = {
  questions: TemplateQuestion[];
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  site: string | null;
  updated_at: string | null;
  definition: TemplateDefinition | null;
};

function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
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
  const [formQuestions, setFormQuestions] = useState<TemplateQuestion[]>([]);

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
        .select("id, name, description, site, updated_at, definition")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        site: t.site,
        updated_at: t.updated_at,
        definition: (t.definition || { questions: [] }) as TemplateDefinition,
      })) as TemplateRow[];

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
        items: [], // your InspectionsPage will handle populating items as needed
        owner_user_id: user.id,
        owner_name: user.email ?? "Unknown",
      };

      const { error } = await supabase.from("inspections").insert([payload]);
      if (error) throw error;

      alert(
        "Inspection started. You can continue it from the Inspections page."
      );
    } catch (e: any) {
      console.error("startInspection error", e);
      alert(
        e?.message ||
          "Could not start inspection. Check the inspections table schema."
      );
    }
  };

  // ------------------------------
  // Open create/edit modal
  // ------------------------------
  const openCreate = () => {
    setIsCreating(true);
    setEditingTemplate(null);
    setFormName("");
    setFormDescription("");
    setFormSite("");
    setFormQuestions([]);
  };

  const openEdit = (tpl: TemplateRow) => {
    setIsCreating(false);
    setEditingTemplate(tpl);
    setFormName(tpl.name);
    setFormDescription(tpl.description || "");
    setFormSite(tpl.site || "");
    const def: TemplateDefinition = tpl.definition || { questions: [] };
    setFormQuestions(def.questions || []);
  };

  const closeModal = () => {
    setEditingTemplate(null);
    setIsCreating(false);
    setFormName("");
    setFormDescription("");
    setFormSite("");
    setFormQuestions([]);
  };

  // ------------------------------
  // Question helpers
  // ------------------------------
  const addQuestion = () => {
    setFormQuestions((prev) => [
      ...prev,
      {
        id: uuid(),
        label: "New question",
        type: "yes_no_na",
        options: [],
        allowNotes: false,
        allowPhoto: false,
        required: false,
      },
    ]);
  };

  const updateQuestion = (id: string, patch: Partial<TemplateQuestion>) => {
    setFormQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...patch } : q))
    );
  };

  const deleteQuestion = (id: string) => {
    setFormQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const moveQuestion = (id: string, direction: "up" | "down") => {
    setFormQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx === -1) return prev;
      if (direction === "up" && idx === 0) return prev;
      if (direction === "down" && idx === prev.length - 1) return prev;
      const newArr = [...prev];
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      const temp = newArr[idx];
      newArr[idx] = newArr[swapWith];
      newArr[swapWith] = temp;
      return newArr;
    });
  };

  const csvFromOptions = (opts?: string[]) =>
    (opts || []).join(", ");

  const optionsFromCsv = (csv: string) =>
    csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  // ------------------------------
  // Save template (create or update)
  // ------------------------------
  const saveTemplate = async () => {
    if (!isAdmin && !isManager) {
      alert("Only admins (or managers) can edit templates.");
      return;
    }

    if (!formName.trim()) {
      alert("Template name is required.");
      return;
    }

    const cleanedQuestions: TemplateQuestion[] = formQuestions.map((q) => ({
      ...q,
      options:
        q.type === "multiple_choice" ? (q.options || []) : [],
    }));

    const definition: TemplateDefinition = {
      questions: cleanedQuestions,
    };

    try {
      const payload: any = {
        name: formName.trim(),
        description: formDescription.trim() || null,
        site: formSite.trim() || null,
        updated_at: new Date().toISOString(),
        definition,
      };

      if (isCreating || !editingTemplate) {
        const { error } = await supabase.from("templates").insert([payload]);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("templates")
          .update(payload)
          .eq("id", editingTemplate.id);
        if (error) throw error;
      }

      closeModal();
      loadTemplates();
    } catch (e: any) {
      console.error("saveTemplate error", e);
      alert(e?.message || "Could not save template.");
    }
  };

  // ------------------------------
  // Delete template (admin only)
  // ------------------------------
  const deleteTemplate = async (tpl: TemplateRow) => {
    if (!isAdmin) {
      alert("Only admins can delete templates.");
      return;
    }

    if (!confirm(`Delete template "${tpl.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("templates")
        .delete()
        .eq("id", tpl.id);

      if (error) throw error;

      loadTemplates();
    } catch (e: any) {
      console.error("deleteTemplate error", e);
      alert(e?.message || "Could not delete template.");
    }
  };

  // ------------------------------
  // Render
  // ------------------------------
  return (
    <div className="max-w-6xl mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-purple-700">Templates</h1>
          {roleLoading ? (
            <p className="text-xs text-gray-500">Checking permissions…</p>
          ) : isInspector ? (
            <p className="text-sm text-gray-600">
              You can view templates and start inspections. Only admins can
              create or edit templates.
            </p>
          ) : (
            <p className="text-sm text-gray-600">
              Create, edit and manage templates and their questions.
            </p>
          )}
        </div>

        {(isAdmin || isManager) && (
          <button
            onClick={openCreate}
            className="px-4 py-2 rounded-xl bg-purple-700 text-white text-sm font-medium hover:bg-purple-800"
          >
            New template
          </button>
        )}
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
      ) : templates.length === 0 ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
          No templates yet.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="border rounded-2xl bg-white p-4 flex flex-col gap-2 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-gray-900">{tpl.name}</h2>
                  {tpl.description && (
                    <p className="text-xs text-gray-600 mt-1">
                      {tpl.description}
                    </p>
                  )}
                  <div className="text-[11px] text-gray-500 mt-1">
                    Site: {tpl.site || "All sites"}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    Updated:{" "}
                    {tpl.updated_at
                      ? new Date(tpl.updated_at).toLocaleString()
                      : "—"}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1">
                    {tpl.definition?.questions?.length || 0} questions
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {/* Everyone can start inspections */}
                  <button
                    onClick={() => startInspection(tpl)}
                    className="px-3 py-1 rounded-xl border text-xs hover:bg-gray-50"
                  >
                    Start inspection
                  </button>

                  {/* Only admins (or managers) can edit/delete */}
                  {(isAdmin || isManager) && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(tpl)}
                        className="px-2 py-1 rounded-xl border text-xs hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => deleteTemplate(tpl)}
                          className="px-2 py-1 rounded-xl border text-xs text-rose-600 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal with questions */}
      {(isCreating || editingTemplate) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl space-y-4 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg text-gray-900">
                {isCreating ? "New template" : "Edit template"}
              </h2>
              <button
                onClick={closeModal}
                className="text-sm text-gray-500 hover:text-gray-800"
              >
                Close
              </button>
            </div>

            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="md:col-span-3 space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Template name
                  </label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2"
                    placeholder="e.g. Warehouse Daily Walk"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 min-h-[60px]"
                    placeholder="Short description…"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Site (optional)
                  </label>
                  <input
                    value={formSite}
                    onChange={(e) => setFormSite(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2"
                    placeholder="e.g. Manchester DC"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 text-sm">
                  Questions
                </h3>
                <button
                  onClick={addQuestion}
                  className="px-3 py-1 rounded-xl border text-xs hover:bg-gray-50"
                >
                  Add question
                </button>
              </div>

              {formQuestions.length === 0 ? (
                <div className="text-xs text-gray-500 border rounded-xl p-3">
                  No questions yet. Click "Add question" to start building your
                  checklist.
                </div>
              ) : (
                <div className="space-y-2">
                  {formQuestions.map((q, index) => (
                    <div
                      key={q.id}
                      className="border rounded-xl p-3 flex flex-col gap-2 text-xs bg-gray-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-gray-500">
                          Question {index + 1}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => moveQuestion(q.id, "up")}
                            className="px-2 py-1 border rounded-lg hover:bg-white"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveQuestion(q.id, "down")}
                            className="px-2 py-1 border rounded-lg hover:bg-white"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => deleteQuestion(q.id)}
                            className="px-2 py-1 border rounded-lg text-rose-600 hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">
                          Question text
                        </label>
                        <input
                          value={q.label}
                          onChange={(e) =>
                            updateQuestion(q.id, { label: e.target.value })
                          }
                          className="w-full border rounded-xl px-3 py-2 text-xs bg-white"
                          placeholder="e.g. Are walkways clear?"
                        />
                      </div>

                      <div className="grid md:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1">
                            Type
                          </label>
                          <select
                            value={q.type}
                            onChange={(e) =>
                              updateQuestion(q.id, {
                                type: e.target.value as QuestionType,
                              })
                            }
                            className="w-full border rounded-xl px-3 py-2 text-xs bg-white"
                          >
                            <option value="yes_no_na">Yes / No / N/A</option>
                            <option value="good_fair_poor">
                              Good / Fair / Poor
                            </option>
                            <option value="multiple_choice">
                              Multiple choice
                            </option>
                            <option value="text">Text only</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1">
                            Multiple choice options
                          </label>
                          <input
                            disabled={q.type !== "multiple_choice"}
                            value={
                              q.type === "multiple_choice"
                                ? csvFromOptions(q.options)
                                : ""
                            }
                            onChange={(e) =>
                              updateQuestion(q.id, {
                                options: optionsFromCsv(e.target.value),
                              })
                            }
                            className="w-full border rounded-xl px-3 py-2 text-xs bg-white disabled:bg-gray-100"
                            placeholder="e.g. Red, Amber, Green"
                          />
                          <div className="text-[10px] text-gray-400 mt-1">
                            Only used when type is “Multiple choice”.
                          </div>
                        </div>

                        <div className="flex flex-col gap-1 justify-center">
                          <label className="inline-flex items-center gap-2 text-[11px] text-gray-700">
                            <input
                              type="checkbox"
                              checked={q.allowNotes}
                              onChange={(e) =>
                                updateQuestion(q.id, {
                                  allowNotes: e.target.checked,
                                })
                              }
                            />
                            Allow notes
                          </label>
                          <label className="inline-flex items-center gap-2 text-[11px] text-gray-700">
                            <input
                              type="checkbox"
                              checked={q.allowPhoto}
                              onChange={(e) =>
                                updateQuestion(q.id, {
                                  allowPhoto: e.target.checked,
                                })
                              }
                            />
                            Allow photo
                          </label>
                          <label className="inline-flex items-center gap-2 text-[11px] text-gray-700">
                            <input
                              type="checkbox"
                              checked={q.required}
                              onChange={(e) =>
                                updateQuestion(q.id, {
                                  required: e.target.checked,
                                })
                              }
                            />
                            Required
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={closeModal}
                className="px-3 py-2 rounded-xl border text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveTemplate}
                className="px-3 py-2 rounded-xl bg-purple-700 text-white text-sm font-medium hover:bg-purple-800"
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