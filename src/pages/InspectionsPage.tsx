import React, { useEffect, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "@/utils/supabaseClient";

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>("all");
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // active inspection being edited
  const [activeInspection, setActiveInspection] = useState<any | null>(null);
  const [activeTemplateDef, setActiveTemplateDef] = useState<any | null>(null);
  const [savingInspection, setSavingInspection] = useState(false);

  // ---------------------------
  // LOAD SITES
  // ---------------------------
  const loadSites = async () => {
    const { data, error } = await supabase
      .from("sites")
      .select("id, name")
      .order("name");

    if (!error && data) setSites(data);
  };

  // ---------------------------
  // LOAD INSPECTIONS
  // ---------------------------
  const loadInspections = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("inspections")
      .select(
        "id, template_id, template_name, site, status, started_at, submitted_at, score, items, owner_name"
      )
      .order("started_at", { ascending: false });

    if (!error && data) setInspections(data);

    setLoading(false);
  };

  // ---------------------------
  // LOAD TEMPLATES (with definition)
  // ---------------------------
  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from("templates")
      .select("id, name, site, definition");

    if (!error && data) setTemplates(data);
  };

  useEffect(() => {
    loadSites();
    loadTemplates();
    loadInspections();
  }, []);

  // ---------------------------
  // Helpers
  // ---------------------------
  const buildItemsFromTemplate = (definition: any): any[] => {
    if (!definition || !Array.isArray(definition.sections)) return [];
    const items: any[] = [];
    definition.sections.forEach((section: any) => {
      (section.questions || []).forEach((q: any) => {
        items.push({
          sectionId: section.id,
          sectionTitle: section.title,
          questionId: q.id,
          label: q.label,
          type: q.type,
          answer: null,
          notes: "",
        });
      });
    });
    return items;
  };

  const findTemplateDefinition = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    return tpl?.definition || null;
  };

  const updateActiveInspectionItem = (
    section: any,
    question: any,
    patch: any
  ) => {
    setActiveInspection((prev) => {
      if (!prev) return prev;
      const items = Array.isArray(prev.items) ? [...prev.items] : [];
      const idx = items.findIndex(
        (it: any) => it.questionId === question.id
      );
      if (idx === -1) {
        items.push({
          sectionId: section.id,
          sectionTitle: section.title,
          questionId: question.id,
          label: question.label,
          type: question.type,
          answer: null,
          notes: "",
          ...patch,
        });
      } else {
        items[idx] = { ...items[idx], ...patch };
      }
      return { ...prev, items };
    });
  };

  // ---------------------------
  // START INSPECTION
  // ---------------------------
  const startInspection = async (template: any) => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) return alert("You must be logged in.");

    const definition = template.definition || findTemplateDefinition(template.id);
    const items = buildItemsFromTemplate(definition);

    const payload = {
      template_id: template.id,
      template_name: template.name,
      site: template.site,
      status: "in_progress",
      started_at: new Date().toISOString(),
      owner_user_id: user.id,
      owner_name: user.email ?? "Unknown",
      items,
    };

    const { data, error } = await supabase
      .from("inspections")
      .insert([payload])
      .select(
        "id, template_id, template_name, site, status, started_at, submitted_at, score, items, owner_name"
      )
      .single();

    if (error) {
      console.error(error);
      alert("Could not start inspection.");
    } else {
      // prepend new inspection to list
      setInspections((prev) => [data, ...prev]);
      setActiveInspection(data);
      setActiveTemplateDef(definition);
      // scroll to the form
      const el = document.getElementById("active-inspection-form");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  };

  // ---------------------------
  // OPEN EXISTING INSPECTION
  // ---------------------------
  const openInspection = (insp: any) => {
    const definition = findTemplateDefinition(insp.template_id);
    let items = insp.items;

    if ((!items || items.length === 0) && definition) {
      // if items not initialized, build from template
      items = buildItemsFromTemplate(definition);
      setActiveInspection({ ...insp, items });
    } else {
      setActiveInspection(insp);
    }

    setActiveTemplateDef(definition);

    const el = document.getElementById("active-inspection-form");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  // ---------------------------
  // SAVE ACTIVE INSPECTION (answers only)
  // ---------------------------
  const saveActiveInspection = async () => {
    if (!activeInspection) return;
    setSavingInspection(true);
    try {
      const { error } = await supabase
        .from("inspections")
        .update({
          items: activeInspection.items || [],
        })
        .eq("id", activeInspection.id);

      if (error) {
        console.error("saveActiveInspection error", error);
        alert(error.message || "Could not save inspection.");
        return;
      }

      // update local list
      setInspections((prev) =>
        prev.map((i) => (i.id === activeInspection.id ? activeInspection : i))
      );
      alert("Inspection saved.");
    } catch (e: any) {
      console.error("saveActiveInspection exception", e);
      alert(e?.message || "Unknown error saving inspection.");
    } finally {
      setSavingInspection(false);
    }
  };

  // ---------------------------
  // COMPLETE INSPECTION
  // ---------------------------
  const completeInspection = async (inspId: string) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        alert("You must be logged in to complete an inspection.");
        return;
      }

      // if this is the active one, send its latest items too
      const matchingActive =
        activeInspection && activeInspection.id === inspId
          ? activeInspection.items || []
          : undefined;

      const payload: any = {
        status: "completed",
        submitted_at: new Date().toISOString(),
      };
      if (matchingActive) {
        payload.items = matchingActive;
      }

      const { data, error } = await supabase
        .from("inspections")
        .update(payload)
        .eq("id", inspId)
        .select(
          "id, template_id, template_name, site, status, started_at, submitted_at, score, items, owner_name"
        )
        .single();

      if (error) {
        console.error("completeInspection error", error);
        alert(error.message || "Could not complete inspection.");
        return;
      }

      setInspections((prev) =>
        prev.map((i) => (i.id === data.id ? data : i))
      );
      if (activeInspection && activeInspection.id === data.id) {
        setActiveInspection(data);
      }
      alert("Inspection marked as completed.");
    } catch (e: any) {
      console.error("completeInspection exception", e);
      alert(e?.message || "Unknown error completing inspection.");
    }
  };

  // ---------------------------
  // FILTER LOGIC
  // ---------------------------
  const filteredInspections =
    selectedSite === "all"
      ? inspections
      : inspections.filter((i) => i.site === selectedSite);

  // ---------------------------
  // PDF EXPORT
  // ---------------------------
  const downloadSinglePdf = async (insp: any) => {
    const container = document.createElement("div");
    container.style.width = "800px";
    container.style.padding = "20px";
    container.innerHTML = `
      <h1>Inspection: ${insp.template_name}</h1>
      <p><b>Site:</b> ${insp.site}</p>
      <p><b>Started:</b> ${new Date(insp.started_at).toLocaleString()}</p>
      <p><b>Completed:</b> ${
        insp.submitted_at ? new Date(insp.submitted_at).toLocaleString() : "—"
      }</p>
      <p><b>Inspector:</b> ${insp.owner_name}</p>
      <hr>
      <h2>Items</h2>
      ${
        insp.items && insp.items.length > 0
          ? insp.items
              .map(
                (item: any) =>
                  `<p><b>${item.label}</b>: ${item.answer ?? ""} <i>${
                    item.notes || ""
                  }</i></p>`
              )
              .join("")
          : "<p>No item details recorded.</p>"
      }
    `;

    document.body.appendChild(container);

    const canvas = await html2canvas(container);
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "pt", "a4");
    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, width, height);
    pdf.save(`inspection-${insp.id}.pdf`);

    document.body.removeChild(container);
  };

  // ---------------------------
  // PAGE UI
  // ---------------------------
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold text-purple-700">Inspections</h1>

      {/* FILTER DROPDOWN */}
      <div className="flex space-x-3 items-center">
        <label className="text-sm text-gray-600">Filter by Site:</label>
        <select
          value={selectedSite}
          onChange={(e) => setSelectedSite(e.target.value)}
          className="border rounded-xl px-3 py-2"
        >
          <option value="all">All Sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* TEMPLATE LIST */}
      <h2 className="text-xl font-semibold text-purple-700">Start Inspection</h2>
      <div className="grid md:grid-cols-3 gap-4">
        {templates.map((t) => (
          <div key={t.id} className="p-4 border rounded-xl bg-white shadow">
            <h3 className="font-semibold">{t.name}</h3>
            <p className="text-sm text-gray-600">Site: {t.site}</p>
            <button
              type="button"
              onClick={() => startInspection(t)}
              className="mt-3 bg-purple-700 text-white rounded-xl px-3 py-2 w-full"
            >
              Start
            </button>
          </div>
        ))}
      </div>

      {/* INSPECTION LIST */}
      <h2 className="text-xl font-semibold text-purple-700">Your Inspections</h2>

      {loading ? (
        <p>Loading…</p>
      ) : filteredInspections.length === 0 ? (
        <p>No inspections found.</p>
      ) : (
        <div className="space-y-4">
          {filteredInspections.map((insp) => (
            <div key={insp.id} className="p-4 border rounded-xl bg-white shadow">
              <h3 className="font-semibold">{insp.template_name}</h3>
              <p className="text-sm">Site: {insp.site}</p>
              <p className="text-sm">
                Status:{" "}
                <span
                  className={
                    insp.status === "completed"
                      ? "text-green-600 font-semibold"
                      : "text-orange-600 font-semibold"
                  }
                >
                  {insp.status}
                </span>
              </p>
              <p className="text-xs text-gray-500">
                Started: {new Date(insp.started_at).toLocaleString()}
              </p>
              {insp.submitted_at && (
                <p className="text-xs text-gray-500">
                  Completed: {new Date(insp.submitted_at).toLocaleString()}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadSinglePdf(insp)}
                  className="border rounded-xl px-3 py-1"
                >
                  PDF
                </button>

                <button
                  type="button"
                  onClick={() => openInspection(insp)}
                  className="border border-blue-600 text-blue-700 rounded-xl px-3 py-1"
                >
                  {insp.status === "completed" ? "View" : "Open / Continue"}
                </button>

                {insp.status !== "completed" && (
                  <button
                    type="button"
                    onClick={() => completeInspection(insp.id)}
                    className="border border-green-600 text-green-700 rounded-xl px-3 py-1"
                  >
                    Complete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ACTIVE INSPECTION FORM */}
      {activeInspection && activeTemplateDef && (
        <div
          id="active-inspection-form"
          className="mt-8 p-6 border rounded-2xl bg-white shadow space-y-4"
        >
          <h2 className="text-2xl font-semibold text-purple-700">
            Inspection: {activeInspection.template_name}
          </h2>
          <p className="text-sm text-gray-600">
            Site: {activeInspection.site} • Inspector: {activeInspection.owner_name}
          </p>
          <p className="text-xs text-gray-500">
            Status:{" "}
            <span
              className={
                activeInspection.status === "completed"
                  ? "text-green-600 font-semibold"
                  : "text-orange-600 font-semibold"
              }
            >
              {activeInspection.status}
            </span>
          </p>

          {activeTemplateDef.sections && activeTemplateDef.sections.length > 0 ? (
            <div className="space-y-6">
              {activeTemplateDef.sections.map((section: any, sIndex: number) => (
                <div key={section.id || sIndex} className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-800">
                    {sIndex + 1}. {section.title}
                  </h3>

                  {(section.questions || []).map((q: any, qIndex: number) => {
                    const item =
                      activeInspection.items?.find(
                        (it: any) => it.questionId === q.id
                      ) || null;
                    const answer = item?.answer ?? "";
                    const notes = item?.notes ?? "";

                    return (
                      <div
                        key={q.id || qIndex}
                        className="border rounded-xl p-3 bg-gray-50 space-y-2"
                      >
                        <p className="font-medium">
                          {sIndex + 1}.{qIndex + 1} {q.label}
                          {q.required && (
                            <span className="text-red-600 text-xs ml-1">
                              *
                            </span>
                          )}
                        </p>

                        {/* Answer control by type */}
                        {q.type === "yes_no_na" && (
                          <select
                            className="border rounded-xl px-3 py-2 w-full"
                            value={answer}
                            onChange={(e) =>
                              updateActiveInspectionItem(section, q, {
                                answer: e.target.value,
                              })
                            }
                          >
                            <option value="">Select…</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                            <option value="na">N/A</option>
                          </select>
                        )}

                        {q.type === "good_fair_poor" && (
                          <select
                            className="border rounded-xl px-3 py-2 w-full"
                            value={answer}
                            onChange={(e) =>
                              updateActiveInspectionItem(section, q, {
                                answer: e.target.value,
                              })
                            }
                          >
                            <option value="">Select…</option>
                            <option value="good">Good</option>
                            <option value="fair">Fair</option>
                            <option value="poor">Poor</option>
                          </select>
                        )}

                        {q.type === "multiple_choice" && (
                          <select
                            className="border rounded-xl px-3 py-2 w-full"
                            value={answer}
                            onChange={(e) =>
                              updateActiveInspectionItem(section, q, {
                                answer: e.target.value,
                              })
                            }
                          >
                            <option value="">Select…</option>
                            {(q.options || []).map((opt: string, idx: number) => (
                              <option key={idx} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        )}

                        {q.type === "text" && (
                          <textarea
                            className="border rounded-xl px-3 py-2 w-full"
                            value={answer}
                            onChange={(e) =>
                              updateActiveInspectionItem(section, q, {
                                answer: e.target.value,
                              })
                            }
                            placeholder="Enter answer"
                          />
                        )}

                        {/* Notes */}
                        {q.allowNotes && (
                          <div>
                            <label className="text-xs text-gray-600">
                              Notes
                            </label>
                            <textarea
                              className="border rounded-xl px-3 py-2 w-full mt-1"
                              value={notes}
                              onChange={(e) =>
                                updateActiveInspectionItem(section, q, {
                                  notes: e.target.value,
                                })
                              }
                              placeholder="Optional notes"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <p>No template definition found for this inspection.</p>
          )}

          <div className="flex flex-wrap gap-2 pt-4">
            <button
              type="button"
              onClick={saveActiveInspection}
              disabled={savingInspection}
              className="bg-blue-600 text-white rounded-xl px-4 py-2"
            >
              {savingInspection ? "Saving…" : "Save"}
            </button>

            {activeInspection.status !== "completed" && (
              <button
                type="button"
                onClick={() => completeInspection(activeInspection.id)}
                className="bg-green-600 text-white rounded-xl px-4 py-2"
              >
                Complete Inspection
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}