import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import jsPDF from "jspdf";

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

type InspectionStatus = "in_progress" | "submitted";

type InspectionAnswer = {
  sectionId: string;
  questionId: string;
  value: string | null; // "yes" | "no" | "na" | "good" | "fair" | "poor" | option text | free text
  notes?: string;
  photos?: string[]; // base64 data URLs
};

type InspectionRow = {
  id: string;
  template_id: string;
  template_name: string;
  site: string | null;
  status: InspectionStatus;
  started_at: string | null;
  submitted_at: string | null;
  score: number | null;
  items: InspectionAnswer[] | null;
  owner_user_id: string | null;
  owner_name: string | null;
};

export default function InspectionsPage() {
  const [role, setRole] = useState<Role>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<
    "all" | "in_progress" | "submitted"
  >("all");

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modal state
  const [activeInspection, setActiveInspection] =
    useState<InspectionRow | null>(null);
  const [activeDefinition, setActiveDefinition] =
    useState<TemplateDefinition | null>(null);
  const [answers, setAnswers] = useState<InspectionAnswer[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);

  // ------------------------------
  // Load current user & role
  // ------------------------------
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
  const isInspector = role === "inspector" || !role;

  // ------------------------------
  // Load inspections list
  // ------------------------------
  const loadInspections = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("inspections")
        .select(
          "id, template_id, template_name, site, status, started_at, submitted_at, score, items, owner_user_id, owner_name"
        )
        .order("started_at", { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map((i: any) => ({
        id: i.id,
        template_id: i.template_id,
        template_name: i.template_name,
        site: i.site,
        status: i.status as InspectionStatus,
        started_at: i.started_at,
        submitted_at: i.submitted_at,
        score: i.score,
        items: (i.items || []) as InspectionAnswer[],
        owner_user_id: i.owner_user_id,
        owner_name: i.owner_name,
      })) as InspectionRow[];

      setInspections(mapped);
      setSelectedIds([]); // clear selection whenever list reloads
    } catch (e: any) {
      console.error("loadInspections error", e);
      setError(
        e?.message || "Could not load inspections. Check Supabase settings."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInspections();
  }, []);

  // ------------------------------
  // Filtered list
  // ------------------------------
  const filteredInspections = useMemo(() => {
    return inspections.filter((i) => {
      if (filterStatus !== "all" && i.status !== filterStatus) {
        return false;
      }
      return true;
    });
  }, [inspections, filterStatus]);

  // ------------------------------
  // Selection helpers
  // ------------------------------
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllVisible = () => {
    const visibleIds = filteredInspections.map((i) => i.id);
    setSelectedIds(visibleIds);
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const selectedInspections = useMemo(
    () => inspections.filter((i) => selectedIds.includes(i.id)),
    [inspections, selectedIds]
  );

  // ------------------------------
  // Open inspection modal
  // ------------------------------
  const openInspectionModal = async (insp: InspectionRow) => {
    setModalLoading(true);
    setActiveInspection(insp);
    setActiveDefinition(null);
    setAnswers([]);

    try {
      const { data, error } = await supabase
        .from("templates")
        .select("definition")
        .eq("id", insp.template_id)
        .single();

      if (error) throw error;

      const def: TemplateDefinition =
        (data?.definition as TemplateDefinition) || { sections: [] };

      const sections = def.sections || [];
      const existingAnswers: InspectionAnswer[] = insp.items || [];
      const builtAnswers: InspectionAnswer[] = [];

      for (const sec of sections) {
        for (const q of sec.questions || []) {
          const existing = existingAnswers.find(
            (a) => a.questionId === q.id
          );
          if (existing) {
            builtAnswers.push(existing);
          } else {
            builtAnswers.push({
              sectionId: sec.id,
              questionId: q.id,
              value: null,
              notes: "",
              photos: [],
            });
          }
        }
      }

      setActiveDefinition(def);
      setAnswers(builtAnswers);
    } catch (e: any) {
      console.error("openInspectionModal error", e);
      alert(
        e?.message ||
          "Could not load template definition for this inspection."
      );
      setActiveInspection(null);
    } finally {
      setModalLoading(false);
    }
  };

  const closeInspectionModal = () => {
    setActiveInspection(null);
    setActiveDefinition(null);
    setAnswers([]);
    setModalLoading(false);
    setModalSaving(false);
  };

  // ------------------------------
  // Answer helpers
  // ------------------------------
  const updateAnswer = (
    questionId: string,
    patch: Partial<InspectionAnswer>
  ) => {
    setAnswers((prev) =>
      prev.map((a) =>
        a.questionId === questionId ? { ...a, ...patch } : a
      )
    );
  };

  const addPhotoToAnswer = (questionId: string, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAnswers((prev) =>
        prev.map((a) =>
          a.questionId === questionId
            ? {
                ...a,
                photos: [...(a.photos || []), String(reader.result)],
              }
            : a
        )
      );
    };
    reader.readAsDataURL(file);
  };

  // ------------------------------
  // Score calculation (simple)
  // ------------------------------
  const calculateScore = (
    def: TemplateDefinition | null,
    ans: InspectionAnswer[]
  ): number | null => {
    if (!def) return null;
    let total = 0;
    let positive = 0;

    for (const sec of def.sections || []) {
      for (const q of sec.questions || []) {
        const a = ans.find((x) => x.questionId === q.id);
        if (!a || a.value == null) continue;

        if (q.type === "yes_no_na") {
          total += 1;
          if (a.value === "yes") positive += 1;
        } else if (q.type === "good_fair_poor") {
          total += 1;
          if (a.value === "good") positive += 1;
        }
      }
    }

    if (total === 0) return null;
    return Math.round((positive / total) * 100);
  };

  // ------------------------------
  // Save progress (keep in_progress)
  // ------------------------------
  const saveProgress = async () => {
    if (!activeInspection) return;
    if (!activeDefinition) return;
    setModalSaving(true);
    try {
      const score = calculateScore(activeDefinition, answers);
      const { error } = await supabase
        .from("inspections")
        .update({
          items: answers,
          status: "in_progress",
          submitted_at: null,
          score,
        })
        .eq("id", activeInspection.id);

      if (error) throw error;

      await loadInspections();
      alert("Progress saved.");
    } catch (e: any) {
      console.error("saveProgress error", e);
      alert(e?.message || "Could not save progress.");
    } finally {
      setModalSaving(false);
    }
  };

  // ------------------------------
  // Complete inspection
  // ------------------------------
  const completeInspection = async () => {
    if (!activeInspection) return;
    if (!activeDefinition) return;

    if (
      !confirm(
        "Mark this inspection as complete? You can still view it later but it will move to 'Completed'."
      )
    ) {
      return;
    }

    setModalSaving(true);
    try {
      const score = calculateScore(activeDefinition, answers);
      const { error } = await supabase
        .from("inspections")
        .update({
          items: answers,
          status: "submitted",
          submitted_at: new Date().toISOString(),
          score,
        })
        .eq("id", activeInspection.id);

      if (error) throw error;

      await loadInspections();
      alert("Inspection completed.");
      closeInspectionModal();
    } catch (e: any) {
      console.error("completeInspection error", e);
      alert(e?.message || "Could not complete inspection.");
    } finally {
      setModalSaving(false);
    }
  };

  // ------------------------------
  // Delete inspection (single)
  // ------------------------------
  const canDeleteInspection = (insp: InspectionRow): boolean => {
    if (isAdmin) return true;
    if (!currentUserId) return false;
    return insp.status === "in_progress" && insp.owner_user_id === currentUserId;
  };

  const deleteInspection = async (insp: InspectionRow) => {
    if (!canDeleteInspection(insp)) {
      alert("You are not allowed to delete this inspection.");
      return;
    }

    if (
      !confirm(
        `Delete inspection "${insp.template_name}"? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from("inspections")
        .delete()
        .eq("id", insp.id);

      if (error) throw error;

      await loadInspections();
      if (activeInspection && activeInspection.id === insp.id) {
        closeInspectionModal();
      }
      alert("Inspection deleted.");
    } catch (e: any) {
      console.error("deleteInspection error", e);
      alert(e?.message || "Could not delete inspection.");
    }
  };

  // ------------------------------
  // Bulk delete (admin only)
  // ------------------------------
  const bulkDeleteSelected = async () => {
    if (!selectedIds.length) return;
    if (!isAdmin) {
      alert("Only admins can bulk delete inspections.");
      return;
    }
    if (
      !confirm(
        `Delete ${selectedIds.length} inspections? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      const { error } = await supabase
        .from("inspections")
        .delete()
        .in("id", selectedIds);
      if (error) throw error;

      await loadInspections();
      alert("Selected inspections deleted.");
    } catch (e: any) {
      console.error("bulkDeleteSelected error", e);
      alert(e?.message || "Could not bulk delete inspections.");
    }
  };

  // ------------------------------
  // Bulk download selected as single PDF
  // ------------------------------
  const downloadSelectedAsPdf = async () => {
    if (!selectedIds.length) {
      alert("Select at least one inspection first.");
      return;
    }

    try {
      const selected = inspections.filter((i) =>
        selectedIds.includes(i.id)
      );
      if (!selected.length) {
        alert("No matching inspections found.");
        return;
      }

      // Fetch template definitions for all template_ids involved
      const templateIds = Array.from(
        new Set(selected.map((i) => i.template_id))
      );
      const { data: templatesData, error } = await supabase
        .from("templates")
        .select("id, definition")
        .in("id", templateIds);

      if (error) throw error;

      const defMap = new Map<string, TemplateDefinition>();
      (templatesData || []).forEach((t: any) => {
        const def: TemplateDefinition =
          (t.definition as TemplateDefinition) || { sections: [] };
        defMap.set(t.id, def);
      });

      const doc = new jsPDF();
      doc.setFont("helvetica", "normal");

      selected.forEach((insp, idx) => {
        if (idx > 0) {
          doc.addPage();
        }

        const def = defMap.get(insp.template_id) || { sections: [] };
        const items = (insp.items || []) as InspectionAnswer[];

        let y = 10;
        doc.setFontSize(14);
        doc.text(`Inspection: ${insp.template_name}`, 10, y);
        y += 6;

        doc.setFontSize(10);
        doc.text(`Site: ${insp.site || "—"}`, 10, y);
        y += 5;
        doc.text(
          `Started: ${insp.started_at || "—"}`,
          10,
          y
        );
        y += 5;
        doc.text(
          `Submitted: ${insp.submitted_at || "—"}`,
          10,
          y
        );
        y += 5;
        doc.text(
          `By: ${insp.owner_name || "Unknown"} • Status: ${
            insp.status === "in_progress" ? "In progress" : "Completed"
          }${typeof insp.score === "number" ? ` • Score: ${insp.score}%` : ""}`,
          10,
          y
        );
        y += 8;

        // For each section/question
        for (const sec of def.sections || []) {
          if (y > 270) {
            doc.addPage();
            y = 10;
          }
          doc.setFontSize(11);
          doc.text(`Section: ${sec.title}`, 10, y);
          y += 5;

          for (const q of sec.questions || []) {
            if (y > 270) {
              doc.addPage();
              y = 10;
            }

            const ans = items.find((a) => a.questionId === q.id);

            doc.setFontSize(10);
            const qText = `Q: ${q.label}`;
            doc.text(qText, 10, y);
            y += 4;

            const v = ans?.value || "";
            if (v) {
              doc.text(`Answer: ${v}`, 14, y);
              y += 4;
            }

            if (ans?.notes) {
              const notesLines = doc.splitTextToSize(
                `Notes: ${ans.notes}`,
                180
              );
              doc.text(notesLines, 14, y);
              y += 4 + (notesLines.length - 1) * 4;
            }

            // We won't embed photos (too heavy); just mention count
            if (ans?.photos && ans.photos.length > 0) {
              doc.text(
                `Photos attached: ${ans.photos.length}`,
                14,
                y
              );
              y += 4;
            }

            y += 2;
          }

          y += 3;
        }
      });

      doc.save("auditking-inspections.pdf");
    } catch (e: any) {
      console.error("downloadSelectedAsPdf error", e);
      alert(
        e?.message ||
          "Could not generate PDF. Check that jspdf is installed."
      );
    }
  };

  // ------------------------------
  // Helpers
  // ------------------------------
  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const statusBadge = (status: InspectionStatus) => {
    const base =
      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium";
    if (status === "in_progress") {
      return (
        <span className={`${base} bg-amber-100 text-amber-800`}>
          In progress
        </span>
      );
    }
    return (
      <span className={`${base} bg-emerald-100 text-emerald-800`}>
        Completed
      </span>
    );
  };

  // ------------------------------
  // Render
  // ------------------------------
  return (
    <div className="max-w-6xl mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-purple-700">Inspections</h1>
          {roleLoading ? (
            <p className="text-xs text-gray-500">Checking permissions…</p>
          ) : (
            <p className="text-sm text-gray-600">
              Start, resume and review inspections. Use the popup to answer
              questions and save progress. Use checkboxes to select multiple
              inspections for bulk PDF export or (for admins) bulk delete.
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setFilterStatus("all")}
              className={`px-3 py-1 rounded-xl border ${
                filterStatus === "all"
                  ? "bg-purple-700 text-white border-purple-700"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterStatus("in_progress")}
              className={`px-3 py-1 rounded-xl border ${
                filterStatus === "in_progress"
                  ? "bg-purple-700 text-white border-purple-700"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              In progress
            </button>
            <button
              onClick={() => setFilterStatus("submitted")}
              className={`px-3 py-1 rounded-xl border ${
                filterStatus === "submitted"
                  ? "bg-purple-700 text-white border-purple-700"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Completed
            </button>
          </div>

          {/* Bulk actions summary */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 text-[11px] bg-purple-50 border border-purple-100 rounded-xl px-3 py-1">
              <span className="text-purple-800">
                {selectedIds.length} selected
              </span>
              <button
                onClick={selectAllVisible}
                className="underline text-purple-700"
              >
                Select visible
              </button>
              <button
                onClick={clearSelection}
                className="underline text-gray-500"
              >
                Clear
              </button>
              <span className="mx-1 text-gray-300">|</span>
              <button
                onClick={downloadSelectedAsPdf}
                className="text-purple-700 underline"
              >
                Download PDF
              </button>
              {isAdmin && (
                <button
                  onClick={bulkDeleteSelected}
                  className="text-rose-600 underline"
                >
                  Delete selected
                </button>
              )}
            </div>
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
          Loading inspections…
        </div>
      ) : filteredInspections.length === 0 ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
          No inspections found.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredInspections.map((insp) => (
            <div
              key={insp.id}
              className="border rounded-2xl bg-white p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2 shadow-sm"
            >
              <div className="flex items-start gap-3 flex-1">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedIds.includes(insp.id)}
                  onChange={() => toggleSelected(insp.id)}
                />
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {insp.template_name}
                    </span>
                    {statusBadge(insp.status)}
                  </div>
                  <div className="text-xs text-gray-600">
                    Site: {insp.site || "—"}
                    {" • "}
                    Started: {formatDate(insp.started_at)}
                    {" • "}
                    Completed: {formatDate(insp.submitted_at)}
                  </div>
                  <div className="text-xs text-gray-500">
                    By: {insp.owner_name || "Unknown"}
                    {typeof insp.score === "number" && (
                      <> • Score: {insp.score}%</>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => openInspectionModal(insp)}
                  className="px-3 py-1 rounded-xl border hover:bg-gray-50"
                >
                  {insp.status === "in_progress" ? "Resume" : "View"}
                </button>
                {canDeleteInspection(insp) && (
                  <button
                    onClick={() => deleteInspection(insp)}
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

      {/* Inspection modal */}
      {activeInspection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-xl max-h-[90vh] overflow-auto space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-lg text-gray-900">
                  {activeInspection.template_name}
                </h2>
                <p className="text-xs text-gray-500">
                  Site: {activeInspection.site || "—"} • Started:{" "}
                  {formatDate(activeInspection.started_at)}
                </p>
              </div>
              <button
                onClick={closeInspectionModal}
                className="text-sm text-gray-500 hover:text-gray-800"
              >
                Close
              </button>
            </div>

            {modalLoading || !activeDefinition ? (
              <div className="border rounded-xl p-4 text-sm text-gray-600">
                Loading questions…
              </div>
            ) : (
              <>
                {/* Sections and questions */}
                <div className="space-y-4 text-sm">
                  {activeDefinition.sections.map((sec) => (
                    <div
                      key={sec.id}
                      className="border rounded-2xl p-3 bg-gray-50 space-y-3"
                    >
                      <div className="flex items-center gap-3">
                        {sec.image_data_url && (
                          <img
                            src={sec.image_data_url}
                            alt={sec.title}
                            className="h-10 w-10 object-cover rounded-md border bg-white"
                          />
                        )}
                        <h3 className="font-semibold text-gray-900 text-sm">
                          {sec.title}
                        </h3>
                      </div>

                      <div className="space-y-2">
                        {sec.questions.map((q) => {
                          const ans =
                            answers.find(
                              (a) => a.questionId === q.id
                            ) ||
                            ({
                              sectionId: sec.id,
                              questionId: q.id,
                              value: null,
                              notes: "",
                              photos: [],
                            } as InspectionAnswer);

                          return (
                            <div
                              key={q.id}
                              className="border rounded-xl p-3 bg-white space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-medium text-gray-900 text-sm">
                                    {q.label}
                                  </div>
                                  {q.required && (
                                    <div className="text-[11px] text-rose-600">
                                      Required
                                    </div>
                                  )}
                                </div>
                                {q.type === "yes_no_na" && (
                                  <div className="flex gap-2 text-xs">
                                    <label className="inline-flex items-center gap-1">
                                      <input
                                        type="radio"
                                        name={q.id}
                                        checked={ans.value === "yes"}
                                        onChange={() =>
                                          updateAnswer(q.id, {
                                            value: "yes",
                                          })
                                        }
                                      />
                                      Yes
                                    </label>
                                    <label className="inline-flex items-center gap-1">
                                      <input
                                        type="radio"
                                        name={q.id}
                                        checked={ans.value === "no"}
                                        onChange={() =>
                                          updateAnswer(q.id, {
                                            value: "no",
                                          })
                                        }
                                      />
                                      No
                                    </label>
                                    <label className="inline-flex items-center gap-1">
                                      <input
                                        type="radio"
                                        name={q.id}
                                        checked={ans.value === "na"}
                                        onChange={() =>
                                          updateAnswer(q.id, {
                                            value: "na",
                                          })
                                        }
                                      />
                                      N/A
                                    </label>
                                  </div>
                                )}
                                {q.type === "good_fair_poor" && (
                                  <div className="flex gap-2 text-xs">
                                    <label className="inline-flex items-center gap-1">
                                      <input
                                        type="radio"
                                        name={q.id}
                                        checked={ans.value === "good"}
                                        onChange={() =>
                                          updateAnswer(q.id, {
                                            value: "good",
                                          })
                                        }
                                      />
                                      Good
                                    </label>
                                    <label className="inline-flex items-center gap-1">
                                      <input
                                        type="radio"
                                        name={q.id}
                                        checked={ans.value === "fair"}
                                        onChange={() =>
                                          updateAnswer(q.id, {
                                            value: "fair",
                                          })
                                        }
                                      />
                                      Fair
                                    </label>
                                    <label className="inline-flex items-center gap-1">
                                      <input
                                        type="radio"
                                        name={q.id}
                                        checked={ans.value === "poor"}
                                        onChange={() =>
                                          updateAnswer(q.id, {
                                            value: "poor",
                                          })
                                        }
                                      />
                                      Poor
                                    </label>
                                  </div>
                                )}
                                {q.type === "multiple_choice" && (
                                  <select
                                    value={ans.value || ""}
                                    onChange={(e) =>
                                      updateAnswer(q.id, {
                                        value: e.target.value || null,
                                      })
                                    }
                                    className="border rounded-xl px-3 py-1 text-xs"
                                  >
                                    <option value="">Select…</option>
                                    {(q.options || []).map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                {q.type === "text" && (
                                  <textarea
                                    value={ans.value || ""}
                                    onChange={(e) =>
                                      updateAnswer(q.id, {
                                        value: e.target.value,
                                      })
                                    }
                                    className="border rounded-xl px-3 py-1 text-xs w-48 min-h-[60px]"
                                    placeholder="Enter response…"
                                  />
                                )}
                              </div>

                              {/* Notes & photos */}
                              <div className="grid md:grid-cols-2 gap-2 text-xs">
                                {q.allowNotes && (
                                  <div>
                                    <label className="block text-[11px] text-gray-500 mb-1">
                                      Notes
                                    </label>
                                    <textarea
                                      value={ans.notes || ""}
                                      onChange={(e) =>
                                        updateAnswer(q.id, {
                                          notes: e.target.value,
                                        })
                                      }
                                      className="w-full border rounded-xl px-3 py-1 min-h-[60px]"
                                      placeholder="Add notes…"
                                    />
                                  </div>
                                )}
                                {q.allowPhoto && (
                                  <div>
                                    <label className="block text-[11px] text-gray-500 mb-1">
                                      Photos
                                    </label>
                                    <div className="flex flex-wrap gap-2 items-center">
                                      {(ans.photos || []).map(
                                        (src, idx) => (
                                          <img
                                            key={idx}
                                            src={src}
                                            alt="evidence"
                                            className="h-10 w-10 object-cover rounded-md border"
                                          />
                                        )
                                      )}
                                      <label className="inline-flex items-center gap-2 cursor-pointer">
                                        <span className="px-2 py-1 border rounded-xl hover:bg-gray-50">
                                          Add photo
                                        </span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="hidden"
                                          onChange={(e) =>
                                            addPhotoToAnswer(
                                              q.id,
                                              e.target.files
                                                ? e.target.files[0]
                                                : null
                                            )
                                          }
                                        />
                                      </label>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-gray-500">
                    Status:{" "}
                    {activeInspection.status === "in_progress"
                      ? "In progress"
                      : "Completed"}
                    {typeof activeInspection.score === "number" && (
                      <> • Score: {activeInspection.score}%</>
                    )}
                  </div>
                  <div className="flex gap-2 text-sm">
                    <button
                      onClick={saveProgress}
                      disabled={modalSaving}
                      className="px-3 py-2 rounded-xl border hover:bg-gray-50 disabled:opacity-50"
                    >
                      Save progress
                    </button>
                    {activeInspection.status === "in_progress" && (
                      <button
                        onClick={completeInspection}
                        disabled={modalSaving}
                        className="px-3 py-2 rounded-xl bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-50"
                      >
                        Complete
                      </button>
                    )}
                    {activeInspection &&
                      canDeleteInspection(activeInspection) &&
                      (
                        <button
                          onClick={() => deleteInspection(activeInspection)}
                          disabled={modalSaving}
                          className="px-3 py-2 rounded-xl border text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}