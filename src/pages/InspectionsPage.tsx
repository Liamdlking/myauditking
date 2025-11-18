import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import jsPDF from "jspdf";

type InspectionRow = {
  id: string;
  template_id: string | null;
  template_name: string;
  site: string | null;
  status: string;
  started_at: string | null;
  submitted_at: string | null;
  score: number | null;
  items: any; // JSONB from Supabase
  owner_name?: string | null;
};

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [downloading, setDownloading] = useState<boolean>(false);

  // ----------------------
  // Load inspections
  // ----------------------
  const loadInspections = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("inspections")
        .select(
          "id, template_id, template_name, site, status, started_at, submitted_at, score, items, owner_name"
        )
        .order("started_at", { ascending: false });

      if (err) throw err;

      setInspections((data || []) as InspectionRow[]);
      setSelectedIds([]); // reset selection each load
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

  // ----------------------
  // Selection logic
  // ----------------------
  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id)
    );
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(inspections.map((i) => i.id));
    } else {
      setSelectedIds([]);
    }
  };

  const allSelected =
    inspections.length > 0 && selectedIds.length === inspections.length;

  // ----------------------
  // PDF generation
  // ----------------------
  const downloadSelectedAsPdf = async () => {
    if (selectedIds.length === 0) {
      alert("Select at least one inspection first.");
      return;
    }

    setDownloading(true);
    try {
      const selected = inspections.filter((i) => selectedIds.includes(i.id));
      if (selected.length === 0) {
        alert("No inspections matched selection.");
        return;
      }

      const doc = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: "a4",
      });

      selected.forEach((insp, index) => {
        if (index > 0) {
          doc.addPage();
        }

        let y = 15;

        // Header
        doc.setFontSize(16);
        doc.text("Audit King - Inspection Report", 10, y);
        y += 8;

        doc.setFontSize(12);
        doc.text(`Template: ${insp.template_name || "-"}`, 10, y);
        y += 6;

        doc.text(`Site: ${insp.site || "-"}`, 10, y);
        y += 6;

        const started =
          insp.started_at?.replace("T", " ").slice(0, 16) || "—";
        const submitted =
          insp.submitted_at?.replace("T", " ").slice(0, 16) || "—";

        doc.text(`Started: ${started}`, 10, y);
        y += 6;

        doc.text(`Submitted: ${submitted}`, 10, y);
        y += 6;

        doc.text(
          `Score: ${insp.score !== null && insp.score !== undefined ? `${insp.score}%` : "--"}`,
          10,
          y
        );
        y += 6;

        if (insp.owner_name) {
          doc.text(`Inspector: ${insp.owner_name}`, 10, y);
          y += 8;
        } else {
          y += 4;
        }

        // Divider
        doc.line(10, y, 200, y);
        y += 8;

        // Items
        doc.setFontSize(11);
        const items = (insp.items || []) as any[];

        if (!items || items.length === 0) {
          doc.text("No item details recorded.", 10, y);
          return;
        }

        items.forEach((item: any, idx: number) => {
          // New page if we're near the bottom
          if (y > 270) {
            doc.addPage();
            y = 15;
          }

          const label = item.label || `Item ${idx + 1}`;
          const type = item.type || "";
          const pass = item.pass;
          const value = item.value;
          const note = item.note || item.notes;

          // Main line
          let statusText = "";
          if (type === "yesno") {
            if (pass === true) statusText = "Pass";
            else if (pass === false) statusText = "Fail";
            else statusText = "N/A";
          } else if (
            type === "choice" ||
            type === "multi" ||
            type === "multiple"
          ) {
            statusText = value ? String(value) : "";
          } else if (
            type === "text" ||
            type === "number" ||
            type === "date"
          ) {
            statusText = value ? String(value) : "";
          }

          doc.setFont(undefined, "bold");
          doc.text(`${idx + 1}. ${label}`, 10, y);
          y += 5;

          doc.setFont(undefined, "normal");
          if (statusText) {
            doc.text(`Answer: ${statusText}`, 12, y);
            y += 5;
          }

          if (note) {
            const noteLines = doc.splitTextToSize(
              `Notes: ${String(note)}`,
              180
            );
            noteLines.forEach((line: string) => {
              if (y > 270) {
                doc.addPage();
                y = 15;
              }
              doc.text(line, 12, y);
              y += 4;
            });
          }

          // Small gap before next item
          y += 3;
        });
      });

      const filename =
        selected.length === 1
          ? `inspection-${selected[0].id}.pdf`
          : `inspections-${new Date().toISOString().slice(0, 10)}.pdf`;

      doc.save(filename);
    } catch (e: any) {
      console.error("downloadSelectedAsPdf error", e);
      alert(
        e?.message ||
          "Could not generate PDF. Try with fewer inspections selected."
      );
    } finally {
      setDownloading(false);
    }
  };

  // ----------------------
  // Render
  // ----------------------
  return (
    <div className="max-w-6xl mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-purple-700">Inspections</h1>
          <p className="text-sm text-gray-600">
            View completed and in-progress inspections. Select multiple rows to
            download a combined PDF.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadInspections}
            className="px-3 py-2 rounded-xl border text-xs hover:bg-gray-50"
          >
            Refresh
          </button>
          <button
            onClick={downloadSelectedAsPdf}
            disabled={selectedIds.length === 0 || downloading}
            className={`px-3 py-2 rounded-xl text-xs font-medium ${
              selectedIds.length === 0 || downloading
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : "bg-purple-700 text-white hover:bg-purple-800"
            }`}
          >
            {downloading
              ? "Generating PDF…"
              : `Download selected (${selectedIds.length})`}
          </button>
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
      ) : inspections.length === 0 ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
          No inspections yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                <th className="px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                </th>
                <th className="px-3 py-2 text-left">Template</th>
                <th className="px-3 py-2 text-left">Site</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Started</th>
                <th className="px-3 py-2 text-left">Submitted</th>
                <th className="px-3 py-2 text-left">Score</th>
                <th className="px-3 py-2 text-left">Inspector</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((insp) => {
                const started =
                  insp.started_at?.replace("T", " ").slice(0, 16) || "—";
                const submitted =
                  insp.submitted_at?.replace("T", " ").slice(0, 16) || "—";
                const selected = selectedIds.includes(insp.id);

                return (
                  <tr
                    key={insp.id}
                    className={selected ? "bg-purple-50" : "hover:bg-gray-50"}
                  >
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) =>
                          toggleSelectOne(insp.id, e.target.checked)
                        }
                      />
                    </td>
                    <td className="px-3 py-2 align-middle font-medium text-gray-900">
                      {insp.template_name}
                    </td>
                    <td className="px-3 py-2 align-middle text-gray-700">
                      {insp.site || "—"}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          insp.status === "submitted"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {insp.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle text-gray-700">
                      {started}
                    </td>
                    <td className="px-3 py-2 align-middle text-gray-700">
                      {submitted}
                    </td>
                    <td className="px-3 py-2 align-middle text-gray-900">
                      {insp.score !== null && insp.score !== undefined
                        ? `${insp.score}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 align-middle text-gray-700">
                      {insp.owner_name || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}