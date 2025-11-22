import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Basic safety checks
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error:
        "OPENAI_API_KEY is not set. Please configure it in your Vercel environment.",
    });
  }

  try {
    const body = req.body || {};
    const text = typeof body.text === "string" ? body.text : "";

    if (!text.trim()) {
      return res.status(400).json({
        error: "Missing 'text' in request body. The client must send extracted PDF text.",
      });
    }

    // Call OpenAI to turn raw PDF text into a structured template definition
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helper that converts safety inspection PDFs into a JSON template format for the AuditKing app.",
        },
        {
          role: "user",
          content: `
You will be given raw text extracted from a PDF inspection form.

Return a JSON object with this shape, and **only** that JSON (no extra text):

{
  "name": "Short template name",
  "description": "1-2 sentence description",
  "sections": [
    {
      "id": "section-1",
      "title": "Section title",
      "image_data_url": null,
      "questions": [
        {
          "id": "q-1",
          "label": "Question text",
          "type": "yes_no_na" | "good_fair_poor" | "multiple_choice" | "text",
          "options": ["Option 1","Option 2"],
          "allowNotes": true,
          "allowPhoto": true,
          "required": true
        }
      ]
    }
  ]
}

Rules:
- Use "yes_no_na" for yes/no/N/A style questions.
- Use "good_fair_poor" for rating-style questions.
- Use "multiple_choice" if there are 3+ fixed options.
- Use "text" for free-text fields or comments.
- id fields can be simple like "section-1", "q-1", etc.
- Do not invent more than ~30 questions even if the text is long.
- If you're unsure, err on the side of fewer, clearer questions.

Here is the raw PDF text:

${text}
`,
        },
      ],
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content || "";

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (jsonErr) {
      console.error("Failed to parse OpenAI JSON:", raw);
      return res.status(500).json({
        error: "OpenAI returned invalid JSON. Check server logs for details.",
      });
    }

    if (!parsed || !parsed.sections || !Array.isArray(parsed.sections)) {
      return res.status(500).json({
        error:
          "OpenAI response did not contain a valid 'sections' array. Please adjust the PDF or prompt.",
      });
    }

    // This is the structure your front-end expects for a new template
    return res.status(200).json({
      template: {
        name: parsed.name || "Imported template",
        description: parsed.description || "",
        definition: {
          sections: parsed.sections,
        },
      },
    });
  } catch (err: any) {
    console.error("import-template-from-pdf error", err);
    return res.status(500).json({
      error: "Unexpected server error in import-template-from-pdf",
      detail: err?.message || String(err),
    });
  }
}