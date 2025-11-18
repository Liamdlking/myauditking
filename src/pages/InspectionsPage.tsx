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
  // LOAD TEMPLATES
  // ---------------------------
  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from("templates")
      .select("id, name, site");

    if (!error && data) setTemplates(data);
  };

  useEffect(() => {
    loadSites();
    loadTemplates();
    loadInspections();
  }, []);

  // ---------------------------
  // START INSPECTION
  // ---------------------------
  const startInspection = async (template: any) => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) return alert("You must be logged in.");

    const payload = {
      template_id: template.id,
      template_name: template.name,
      site: template.site,
      status: "in_progress",
      started_at: new Date().toISOString(),
      owner_user_id: user.id,
      owner_name: user.email ?? "Unknown",
      items: [], // blank until updated
    };

    const { error } = await supabase.from("inspections").insert([payload]);

    if (error) {
      console.error(error);
      alert("Could not start inspection.");
    } else {
      loadInspections();
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
                  `<p><b>${item.label}</b>: ${item.answer} <i>${item.notes || ""}</i></p>`
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
          <div
            key={t.id}
            className="p-4 border rounded-xl bg-white shadow"
          >
            <h3 className="font-semibold">{t.name}</h3>
            <p className="text-sm text-gray-600">Site: {t.site}</p>
            <button
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
            <div
              key={insp.id}
              className="p-4 border rounded-xl bg-white shadow"
            >
              <h3 className="font-semibold">{insp.template_name}</h3>
              <p className="text-sm">Site: {insp.site}</p>
              <p className="text-sm">Status: {insp.status}</p>

              <div className="mt-3 flex space-x-2">
                <button
                  onClick={() => downloadSinglePdf(insp)}
                  className="border rounded-xl px-3 py-1"
                >
                  PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}