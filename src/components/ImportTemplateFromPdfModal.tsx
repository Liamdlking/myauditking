import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import * as pdfjsLib from "pdfjs-dist";

type ImportTemplateFromPdfModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

type SiteRow = {
  id: string;
  name: string;
};

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

// Simple ID helper
function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// Configure pdf.js worker from CDN (works nicely with Vite)
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${
  (pdfjsLib as any).version
}/pdf.worker.min.js`;

// Extract raw text from a PDF file in the browser
async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await (pdfjsLib as any).getDocument({ data: arrayBuffer }).promise;

  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = (content.items || []).map((item: any) => item.str || "");
    fullText += strings.join(" ") + "\n\n";
  }
  return fullText;
}

const ImportTemplateFromPdfModal: React.FC<ImportTemplateFromPdfModalProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState<string>("");
  const [extracting, setExtracting] = useState(false);

  const [aiGenerating, setAiGenerating] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [definition, setDefinition] = useState<TemplateDefinition | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load sites so we can assign the template
  useEffect(() => {
    const loadSites = async () => {
      try {
        const { data, error } = await supabase
          .from("sites")
          .select("id, name")
          .order("name", { ascending: true });

        if (error) throw error;
        const mapped: SiteRow[] = (data || []).map((s: any) => ({
          id: s.id,
          name: s.name,
        }));
        setSites(mapped);
        if (mapped.length && !selectedSiteId) {
          setSelectedSiteId(mapped[0].id);
        }
      } catch (e: any) {
        console.error("loadSites error", e);
      }
    };

    if (open) {
      loadSites();
    }
  }, [open, selectedSiteId]);

  // Reset when closing
  useEffect(() => {
    if (!open) {
      setFile(null);
      setRawText("");
      setName("");
      setDescription("");
      setDefinition(null);
      setExtracting(false);
      setAiGenerating(false);
      setSaving(false);
      setError(null);
    }
  }, [open]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setRawText("");
    setDefinition(null);
    setError(null);

    if (!f) return;
    setExtracting(true);
    try {
      const text = await extractTextFromPdf(f);
      setRawText(text);
    } catch (err: any) {
      console.error("PDF extract error", err);
      setError("Could not read PDF. Please try another file.");
    } finally {
      setExtracting(false);
    }
  };

  const handleGenerateWithAI = async () => {
    if (!rawText.trim()) {
      setError("Please upload a PDF first.");
      return;
    }

    setError(null);
    setAiGenerating(true);
    try {
      const res = await fetch("/api/ai-pdf-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: rawText.slice(0, 20000), // limit size
          maxSections: 12,
          maxQuestionsPerSection: 30,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error: ${res.status}`);
      }

      const ai = await res.json();
      // Expected shape from API:
      // {
      //   name: string;
      //   description?: string;
      //   sections: { title: string; questions: { label, type, options?, allowNotes?, allowPhoto?, required? }[] }[]
      // }

      const tplName = ai.name || (file?.name?.replace(/\.pdf$/i, "") ?? "Imported template");
      const tplDesc =
        ai.description ||
        "Template imported from PDF using AI.";

      const sections: TemplateSection[] = (ai.sections || []).map((sec: any) => ({
        id: randomId("sec"),
        title: sec.title || "Section",
        image_data_url: null,
        questions: (sec.questions || []).map((q: any) => ({
          id: randomId("q"),
          label: q.label || "Question",
          type: (q.type ||
            "yes_no_na") as QuestionType,
          options: q.options || [],
          allowNotes:
            typeof q.allowNotes === "boolean" ? q.allowNotes : true,
          allowPhoto:
            typeof q.allowPhoto === "boolean" ? q.allowPhoto : true,
          required:
            typeof q.required === "boolean" ? q.required : true,
        })),
      }));

      setName(tplName);
      setDescription(tplDesc);
      setDefinition({ sections });
    } catch (err: any) {
      console.error("AI generate error", err);
      setError(
        err?.message ||
          "AI could not generate a template. Please try again or simplify the PDF."
      );
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!definition || !name.trim()) {
      setError("Please generate a template with AI first.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const { error } = await supabase.from("templates").insert({
        name: name.trim(),
        description: description.trim() || null,
        site_id: selectedSiteId,
        is_published: false,
        logo_data_url: null,
        definition,
      });

      if (error) throw error;
      onCreated();
    } catch (err: any) {
      console.error("save template error", err);
      setError(err?.message || "Could not save template.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const questionCount =
    definition?.sections.reduce(
      (acc, s) => acc + (s.questions?.length || 0),
      0
    ) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-white shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Import template from PDF (AI)
            </h2>
            <p className="text-xs text-gray-500">
              Upload a checklist PDF and let AI convert it into a reusable
              AuditKing template.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Close
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        {/* File + site selection */}
        <div className="grid md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-gray-600 mb-1">
                PDF file
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="w-full border rounded-xl px-3 py-2 text-xs"
              />
              {extracting && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Reading PDF…
                </p>
              )}
              {rawText && !extracting && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Extracted approximately {rawText.split(/\s+/).length} words
                  from the PDF.
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] text-gray-600 mb-1">
                Assign to site
              </label>
              <select
                value={selectedSiteId ?? ""}
                onChange={(e) =>
                  setSelectedSiteId(e.target.value || null)
                }
                className="w-full border rounded-xl px-3 py-2 text-xs"
              >
                <option value="">No specific site</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleGenerateWithAI}
                disabled={!rawText || extracting || aiGenerating}
                className="w-full px-3 py-2 rounded-xl bg-purple-700 text-white text-xs hover:bg-purple-800 disabled:opacity-50"
              >
                {aiGenerating ? "Generating template with AI…" : "Generate template with AI"}
              </button>
              {definition && (
                <p className="text-[11px] text-gray-500">
                  AI created {definition.sections.length} section(s) and{" "}
                  {questionCount} question(s).
                </p>
              )}
            </div>
          </div>

          {/* Right side – template meta */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-gray-600 mb-1">
                Template name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-xs"
                placeholder="e.g. Weekly Warehouse Safety Inspection"
              />
            </div>

            <div>
              <label className="block text-[11px] text-gray-600 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-xs min-h-[80px]"
                placeholder="Short description of this template…"
              />
            </div>

            {definition && (
              <div className="border rounded-2xl bg-gray-50 p-3 text-[11px] space-y-1">
                <div className="font-semibold text-gray-800">
                  AI structure preview
                </div>
                {definition.sections.map((sec) => (
                  <div key={sec.id} className="text-gray-600">
                    <span className="font-medium">
                      {sec.title || "Section"}
                    </span>{" "}
                    – {sec.questions.length} question(s)
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleSaveTemplate}
              disabled={!definition || saving}
              className="w-full px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Saving template…" : "Save template to AuditKing"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportTemplateFromPdfModal;