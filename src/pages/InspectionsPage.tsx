import React, { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { supabase } from "@/utils/supabaseClient";

type Role = "admin" | "manager" | "inspector" | string | null;
// IMPORTANT: match DB constraint: 'in_progress' | 'submitted'
type Status = "in_progress" | "submitted";

type QuestionType =
  | "yes_no_na"
  | "good_fair_poor"
  | "multiple_choice"
  | "text";

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

type InspectionItem = {
  section_id: string;
  section_title: string;
  question_id: string;
  question_label: string;
  type: QuestionType;
  value: string | null;
  choice_key: string | null;
  choice_label: string | null;
  notes: string | null;
  photos: string[];
  required: boolean;
  // NEW: who last answered this question
  answered_by_user_id: string | null;
  answered_by_name: string | null;
};

type InspectionRow = {
  id: string;
  template_id: string;
  template_name: string;
  site_id: string | null;
  site: string | null;
  status: Status;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  items: InspectionItem[] | null;
  owner_user_id: string | null;
  owner_name: string | null;
};

type SiteRow = {
  id: string;
  name: string;
};

type ModalAnswer = {
  section_id: string;
  section_title: string;
  question_id: string;
  question_label: string;
  type: QuestionType;
  value: string | null;
  choice_key: string | null;
  choice_label: string | null;
  notes: string | null;
  photos: string[];
  required: boolean;
  // NEW: who last answered this question in the UI
  answered_by_user_id: string | null;
  answered_by_name: string | null;
};

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function InspectionsPage() {
  const [role, setRole] = useState<Role>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);

  const [sites, setSites] = useState<SiteRow[]>([]);
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [activeInspection, setActiveInspection] =
    useState<InspectionRow | null>(null);
  const [activeDefinition, setActiveDefinition] =
    useState<TemplateDefinition | null>(null);
  const [templateLogo, setTemplateLogo] = useState<string | null>(null);
  const [answers, setAnswers] = useState<ModalAnswer[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);

  // --------------------------
  // Load user + role + display name
  // --------------------------
  useEffect(() => {
    const loadUserRole = async () => {
      setRoleLoading(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) {
          setCurrentUserId(null);
          setCurrentUserName(null);
          setRole(null);
          return;
        }
        setCurrentUserId(user.id);

        const { data, error } = await supabase
          .from("profiles")
          .select("role, name")
          .eq("user_id", user.id)
          .single();

        const fallbackName = user.email || "Inspector";

        if (!error && data) {
          setRole((data.role as Role) || "inspector");
          setCurrentUserName(data.name || fallbackName);
        } else {
          setRole("inspector");
          setCurrentUserName(fallbackName);
        }
      } catch {
        setRole("inspector");
        setCurrentUserName(null);
      } finally {
        setRoleLoading(false);
      }
    };

    loadUserRole();
  }, []);

  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const canSeeAll = isAdmin || isManager;

  // --------------------------
  // Load sites
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

  // --------------------------
  // Load inspections
  // --------------------------
  const loadInspections = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("inspections")
        .select(
          "id, template_id, template_name, site_id, site, status, started_at, submitted_at, score, items, owner_user_id, owner_name"
        )
        .order("started_at", { ascending: false });

      if (error) throw error;

      const mapped: InspectionRow[] = (data || []).map((i: any) => ({
        id: i.id,
        template_id: i.template_id,
        template_name: i.template_name,
        site_id: i.site_id || null,
        site: i.site || null,
        status: (i.status as Status) || "in_progress",
        started_at: i.started_at,
        submitted_at: i.submitted_at || null,
        score: i.score === null ? null : Number(i.score),
        items: (i.items as InspectionItem[]) || null,
        owner_user_id: i.owner_user_id || null,
        owner_name: i.owner_name || null,
      }));

      setInspections(mapped);
    } catch (e: any) {
      console.error("loadInspections error", e);
      setError(
        e?.message ||
          "Could not load inspections. Check the inspections table schema."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSites();
    loadInspections();
  }, []);

  // --------------------------
  // Filters
  // --------------------------
  const filteredInspections = useMemo(() => {
    return inspections.filter((insp) => {
      if (!canSeeAll && currentUserId && insp.owner_user_id !== currentUserId) {
        return false;
      }
      if (selectedSiteId !== "all" && insp.site_id !== selectedSiteId) {
        return false;
      }
      if (statusFilter !== "all" && insp.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [inspections, canSeeAll, currentUserId, selectedSiteId, statusFilter]);

  const inProgress = filteredInspections.filter(
    (i) => i.status === "in_progress"
  );
  const submitted = filteredInspections.filter(
    (i) => i.status === "submitted"
  );

  const siteNameFor = (site_id: string | null) => {
    if (!site_id) return "All sites";
    const s = sites.find((x) => x.id === site_id);
    return s ? s.name : "Unknown site";
  };

  // --------------------------
  // Selection for bulk actions
  // --------------------------
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const clearSelection = () => setSelectedIds([]);

  const allVisibleIds = filteredInspections.map((i) => i.id);
  const allSelected =
    allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selectedIds.includes(id));

  const toggleSelectAllVisible = () => {
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allVisibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...allVisibleIds])));
    }
  };

  // --------------------------
  // Open inspection modal
  // --------------------------
  const openInspectionModal = async (insp: InspectionRow) => {
    setModalOpen(true);
    setActiveInspection(insp);
    setActiveDefinition(null);
    setTemplateLogo(null);
    setAnswers([]);
    setModalLoading(true);
    setModalSaving(false);

    try {
      // Load template definition + logo
      const { data, error } = await supabase
        .from("templates")
        .select("definition, logo_data_url")
        .eq("id", insp.template_id)
        .single();

      if (error) throw error;

      const definition: TemplateDefinition =
        (data?.definition as TemplateDefinition) || { sections: [] };
      const logo = (data as any)?.logo_data_url as string | null | undefined;

      setActiveDefinition(definition);
      setTemplateLogo(logo || null);

      // Build answers from definition OR from existing items
      const existingItems: InspectionItem[] = insp.items || [];

      const built: ModalAnswer[] = [];
      for (const section of definition.sections || []) {
        for (const q of section.questions || []) {
          const existing = existingItems.find(
            (it) =>
              it.section_id === section.id && it.question_id === q.id
          );
          built.push({
            section_id: section.id,
            section_title: section.title,
            question_id: q.id,
            question_label: q.label,
            type: q.type,
            value: existing ? existing.value : null,
            choice_key: existing ? existing.choice_key : null,
            choice_label: existing ? existing.choice_label : null,
            notes: existing ? existing.notes : null,
            photos: existing ? existing.photos || [] : [],
            required: q.required,
            answered_by_user_id: existing
              ? existing.answered_by_user_id || null
              : null,
            answered_by_name: existing
              ? existing.answered_by_name || null
              : null,
          });
        }
      }

      setAnswers(built);
    } catch (e: any) {
      console.error("openInspectionModal error", e);
      alert(
        e?.message ||
          "Could not load template definition. Check the templates table schema."
      );
      setModalOpen(false);
      setActiveInspection(null);
    } finally {
      setModalLoading(false);
    }
  };

  const closeInspectionModal = () => {
    setModalOpen(false);
    setActiveInspection(null);
    setActiveDefinition(null);
    setTemplateLogo(null);
    setAnswers([]);
    setModalLoading(false);
    setModalSaving(false);
  };

  // --------------------------
  // Update answers state
  // --------------------------
  const updateAnswer = (index: number, patch: Partial<ModalAnswer>) => {
    setAnswers((prev) =>
      prev.map((a, i) =>
        i === index
          ? {
              ...a,
              ...patch,
              // on any change, stamp who answered it
              answered_by_user_id: currentUserId || a.answered_by_user_id,
              answered_by_name: currentUserName || a.answered_by_name,
            }
          : a
      )
    );
  };

  const handlePhotoChange = (index: number, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setAnswers((prev) =>
        prev.map((a, i) =>
          i === index
            ? {
                ...a,
                photos: [...a.photos, url],
                answered_by_user_id: currentUserId || a.answered_by_user_id,
                answered_by_name: currentUserName || a.answered_by_name,
              }
            : a
        )
      );
    };
    reader.readAsDataURL(file);
  };

  // --------------------------
  // Save (in_progress) or submitted (Completed)
  // --------------------------
  const computeScore = (items: InspectionItem[]): number | null => {
    const scored = items.filter(
      (it) => it.type === "yes_no_na" || it.type === "good_fair_poor"
    );
    if (!scored.length) return null;

    let total = 0;
    let max = 0;

    for (const it of scored) {
      if (it.type === "yes_no_na") {
        max += 1;
        if (it.choice_key === "yes") total += 1;
        if (it.choice_key === "na") {
          max -= 1; // exclude N/A from denominator
        }
      } else if (it.type === "good_fair_poor") {
        max += 2;
        if (it.choice_key === "good") total += 2;
        if (it.choice_key === "fair") total += 1;
      }
    }

    if (max <= 0) return null;
    return Math.round((total / max) * 100);
  };

  const buildItemsFromAnswers = (): InspectionItem[] => {
    return answers.map((a) => ({
      section_id: a.section_id,
      section_title: a.section_title,
      question_id: a.question_id,
      question_label: a.question_label,
      type: a.type,
      value: a.value,
      choice_key: a.choice_key,
      choice_label: a.choice_label,
      notes: a.notes,
      photos: a.photos,
      required: a.required,
      answered_by_user_id: a.answered_by_user_id,
      answered_by_name: a.answered_by_name,
    }));
  };

  const saveInspection = async (markComplete: boolean) => {
    if (!activeInspection) return;
    setModalSaving(true);
    try {
      const items = buildItemsFromAnswers();

      if (markComplete) {
        // validate required
        const missingRequired = items.some((it) => {
          if (!it.required) return false;
          if (it.type === "text") {
            return !it.value || it.value.trim() === "";
          }
          // choice-based
          return !it.choice_key;
        });
        if (missingRequired) {
          alert("Please complete all required questions before completing.");
          setModalSaving(false);
          return;
        }
      }

      const score = computeScore(items);
      const nowIso = new Date().toISOString();
      const newStatus: Status = markComplete
        ? "submitted" // store as 'submitted' in DB
        : "in_progress";

      const { error } = await supabase
        .from("inspections")
        .update({
          items,
          score,
          status: newStatus,
          submitted_at: markComplete
            ? nowIso
            : activeInspection.submitted_at,
        })
        .eq("id", activeInspection.id);

      if (error) throw error;

      await loadInspections();
      if (markComplete) {
        alert("Inspection completed.");
        closeInspectionModal();
      } else {
        alert("Inspection saved.");
      }
    } catch (e: any) {
      console.error("saveInspection error", e);
      alert(e?.message || "Could not save inspection.");
    } finally {
      setModalSaving(false);
    }
  };

  // --------------------------
  // Single export to PDF (from modal) with logo & answered-by
  // --------------------------
  const exportCurrentToPdf = () => {
    if (!activeInspection || !activeDefinition) return;

    const doc = new jsPDF("p", "mm", "a4");
    let y = 15;

    // Logo
    if (templateLogo) {
      try {
        doc.addImage(templateLogo, "PNG", 15, y - 5, 20, 20);
        y += 20;
      } catch (e) {
        console.warn("Failed to add logo to PDF", e);
      }
    }

    // Header text
    doc.setFontSize(14);
    doc.text(activeInspection.template_name, 15, y);
    y += 7;

    doc.setFontSize(10);
    doc.text(`Site: ${activeInspection.site || "—"}`, 15, y);
    y += 5;
    doc.text(`Started: ${formatDateTime(activeInspection.started_at)}`, 15, y);
    y += 5;
    if (activeInspection.submitted_at) {
      doc.text(
        `Submitted: ${formatDateTime(activeInspection.submitted_at)}`,
        15,
        y
      );
      y += 5;
    }
    if (activeInspection.owner_name) {
      doc.text(`Inspector: ${activeInspection.owner_name}`, 15, y);
      y += 5;
    }
    if (activeInspection.score !== null) {
      doc.text(`Score: ${activeInspection.score}%`, 15, y);
      y += 7;
    }

    y += 2;
    doc.setLineWidth(0.2);
    doc.line(15, y, 195, y);
    y += 5;

    const pageHeight = doc.internal.pageSize.getHeight();

    const addTextWrapped = (text: string, x: number, yPos: number) => {
      const maxWidth = 180; // mm
      const lines = doc.splitTextToSize(text, maxWidth);
      for (const line of lines) {
        if (yPos > pageHeight - 15) {
          doc.addPage();
          yPos = 15;
        }
        doc.text(line, x, yPos);
        yPos += 4;
      }
      return yPos;
    };

    // Build a lookup from answers
    const answerByKey = new Map<string, ModalAnswer>();
    for (const a of answers) {
      answerByKey.set(`${a.section_id}:${a.question_id}`, a);
    }

    for (const section of activeDefinition.sections || []) {
      if (y > pageHeight - 20) {
        doc.addPage();
        y = 15;
      }
      doc.setFontSize(11);
      doc.setFont(undefined, "bold");
      y = addTextWrapped(section.title || "Untitled section", 15, y);
      doc.setFont(undefined, "normal");
      y += 1;

      for (const q of section.questions || []) {
        const a =
          answerByKey.get(`${section.id}:${q.id}`) ||
          ({
            value: null,
            choice_label: null,
            notes: null,
            photos: [],
            answered_by_name: null,
          } as ModalAnswer);

        if (y > pageHeight - 20) {
          doc.addPage();
          y = 15;
        }

        doc.setFontSize(10);
        y = addTextWrapped(`• ${q.label}`, 17, y);

        let ansLabel = "";
        if (q.type === "text") {
          ansLabel = a.value || "";
        } else {
          ansLabel = a.choice_label || "";
        }
        if (ansLabel) {
          y = addTextWrapped(`Answer: ${ansLabel}`, 20, y);
        }

        if (a.notes) {
          y = addTextWrapped(`Notes: ${a.notes}`, 20, y);
        }

        if (a.photos && a.photos.length > 0) {
          y = addTextWrapped(
            `Photos attached: ${a.photos.length}`,
            20,
            y
          );
        }

        if (a.answered_by_name) {
          y = addTextWrapped(
            `Answered by: ${a.answered_by_name}`,
            20,
            y
          );
        }

        y += 3;
      }

      y += 2;
    }

    doc.save(
      `inspection-${activeInspection.template_name
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase()}-${activeInspection.id}.pdf`
    );
  };

  // --------------------------
  // Bulk delete (admin)
  // --------------------------
  const bulkDeleteSelected = async () => {
    if (!isAdmin) {
      alert("Only admins can delete inspections.");
      return;
    }
    if (!selectedIds.length) return;

    if (
      !confirm(
        `Delete ${selectedIds.length} inspection(s)? This cannot be undone.`
      )
    ) {
      return;
    }

    setBulkBusy(true);
    try {
      const { error } = await supabase
        .from("inspections")
        .delete()
        .in("id", selectedIds);
      if (error) throw error;
      await loadInspections();
      clearSelection();
      alert("Selected inspections deleted.");
    } catch (e: any) {
      console.error("bulkDeleteSelected error", e);
      alert(e?.message || "Could not delete inspections.");
    } finally {
      setBulkBusy(false);
    }
  };

  // --------------------------
  // Bulk PDF export (with answered-by info)
  // --------------------------
  const bulkDownloadSelected = async () => {
    if (!selectedIds.length) {
      alert("Select some inspections first.");
      return;
    }

    setBulkBusy(true);
    try {
      const targets = inspections.filter((i) =>
        selectedIds.includes(i.id)
      );

      for (const insp of targets) {
        // fetch template + logo + definition
        const { data: tpl, error: tplErr } = await supabase
          .from("templates")
          .select("definition, logo_data_url")
          .eq("id", insp.template_id)
          .single();
        if (tplErr) {
          console.error("Template fetch error for bulk PDF", tplErr);
          continue;
        }

        const def: TemplateDefinition =
          (tpl?.definition as TemplateDefinition) || { sections: [] };
        const logo = (tpl as any)?.logo_data_url as
          | string
          | null
          | undefined;

        const items: InspectionItem[] = insp.items || [];

        const doc = new jsPDF("p", "mm", "a4");
        let y = 15;

        if (logo) {
          try {
            doc.addImage(logo, "PNG", 15, y - 5, 20, 20);
            y += 20;
          } catch (e) {
            console.warn("Failed to add logo to bulk PDF", e);
          }
        }

        doc.setFontSize(14);
        doc.text(insp.template_name, 15, y);
        y += 7;

        doc.setFontSize(10);
        doc.text(`Site: ${insp.site || "—"}`, 15, y);
        y += 5;
        doc.text(
          `Started: ${formatDateTime(insp.started_at)}`,
          15,
          y
        );
        y += 5;
        if (insp.submitted_at) {
          doc.text(
            `Submitted: ${formatDateTime(insp.submitted_at)}`,
            15,
            y
          );
          y += 5;
        }
        if (insp.owner_name) {
          doc.text(`Inspector: ${insp.owner_name}`, 15, y);
          y += 5;
        }
        if (insp.score !== null) {
          doc.text(`Score: ${insp.score}%`, 15, y);
          y += 7;
        }

        y += 2;
        doc.setLineWidth(0.2);
        doc.line(15, y, 195, y);
        y += 5;

        const pageHeight = doc.internal.pageSize.getHeight();

        const addTextWrapped = (text: string, x: number, yPos: number) => {
          const maxWidth = 180;
          const lines = doc.splitTextToSize(text, maxWidth);
          for (const line of lines) {
            if (yPos > pageHeight - 15) {
              doc.addPage();
              yPos = 15;
            }
            doc.text(line, x, yPos);
            yPos += 4;
          }
          return yPos;
        };

        // Build quick lookup
        const itemsByKey = new Map<string, InspectionItem>();
        for (const it of items) {
          itemsByKey.set(`${it.section_id}:${it.question_id}`, it);
        }

        for (const section of def.sections || []) {
          if (y > pageHeight - 20) {
            doc.addPage();
            y = 15;
          }
          doc.setFontSize(11);
          doc.setFont(undefined, "bold");
          y = addTextWrapped(section.title || "Untitled section", 15, y);
          doc.setFont(undefined, "normal");
          y += 1;

          for (const q of section.questions || []) {
            const it =
              itemsByKey.get(`${section.id}:${q.id}`) ||
              ({
                value: null,
                choice_label: null,
                notes: null,
                photos: [],
                answered_by_name: null,
              } as InspectionItem);

            if (y > pageHeight - 20) {
              doc.addPage();
              y = 15;
            }

            doc.setFontSize(10);
            y = addTextWrapped(`• ${q.label}`, 17, y);

            let ansLabel = "";
            if (q.type === "text") {
              ansLabel = it.value || "";
            } else {
              ansLabel = it.choice_label || "";
            }
            if (ansLabel) {
              y = addTextWrapped(`Answer: ${ansLabel}`, 20, y);
            }

            if (it.notes) {
              y = addTextWrapped(`Notes: ${it.notes}`, 20, y);
            }
            if (it.photos && it.photos.length > 0) {
              y = addTextWrapped(
                `Photos attached: ${it.photos.length}`,
                20,
                y
              );
            }
            if (it.answered_by_name) {
              y = addTextWrapped(
                `Answered by: ${it.answered_by_name}`,
                20,
                y
              );
            }
            y += 3;
          }

          y += 2;
        }

        doc.save(
          `inspection-${insp.template_name
            .replace(/[^a-z0-9]+/gi, "-")
            .toLowerCase()}-${insp.id}.pdf`
        );
      }
    } catch (e: any) {
      console.error("bulkDownloadSelected error", e);
      alert(e?.message || "Could not download PDFs.");
    } finally {
      setBulkBusy(false);
    }
  };

  // --------------------------
  // Render
  // --------------------------
  return (
    <div className="max-w-6xl mx-auto py-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-purple-700">
            Inspections
          </h1>
          <p className="text-sm text-gray-600">
            Start, continue and complete inspections. Save in progress and
            export branded PDF reports.
          </p>
          {!roleLoading && !canSeeAll && (
            <p className="text-[11px] text-gray-400 mt-1">
              You are an inspector – you’ll only see inspections you own.
            </p>
          )}
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-gray-500">Filter by site:</span>
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

            <span className="text-gray-500 ml-2">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | Status)
              }
              className="border rounded-xl px-3 py-1"
            >
              <option value="all">All</option>
              <option value="in_progress">In progress</option>
              {/* DB value 'submitted', label 'Completed' */}
              <option value="submitted">Completed</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAllVisible}
              />
              <span>Select all visible</span>
            </label>
            <span className="text-gray-400">
              Selected: {selectedIds.length}
            </span>
            <button
              onClick={bulkDownloadSelected}
              disabled={!selectedIds.length || bulkBusy}
              className="px-3 py-1 rounded-xl border text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              Download PDFs
            </button>
            {isAdmin && (
              <button
                onClick={bulkDeleteSelected}
                disabled={!selectedIds.length || bulkBusy}
                className="px-3 py-1 rounded-xl border text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                Delete selected
              </button>
            )}
          </div>
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
        <div className="space-y-4">
          {/* In progress */}
          {inProgress.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-700">
                In progress
              </h2>
              <div className="space-y-2">
                {inProgress.map((insp) => (
                  <InspectionRowCard
                    key={insp.id}
                    insp={insp}
                    siteName={siteNameFor(insp.site_id)}
                    selected={selectedIds.includes(insp.id)}
                    onToggleSelected={() => toggleSelected(insp.id)}
                    onOpen={() => openInspectionModal(insp)}
                    onDeleted={loadInspections}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed (status = submitted) */}
          {submitted.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-700">
                Completed
              </h2>
              <div className="space-y-2">
                {submitted.map((insp) => (
                  <InspectionRowCard
                    key={insp.id}
                    insp={insp}
                    siteName={siteNameFor(insp.site_id)}
                    selected={selectedIds.includes(insp.id)}
                    onToggleSelected={() => toggleSelected(insp.id)}
                    onOpen={() => openInspectionModal(insp)}
                    onDeleted={loadInspections}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modalOpen && activeInspection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-5xl max