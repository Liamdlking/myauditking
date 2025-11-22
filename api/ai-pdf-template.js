// api/ai-pdf-template.js
// Pure OpenAI JSON conversion, CommonJS for Vercel Node runtime

const OpenAI = require("openai");

/**
 * Vercel serverless function to turn extracted PDF text
 * into an AuditKing template using OpenAI only.
 *
 * It expects a POST with JSON:
 * {
 *   text: string;
 *   maxSections?: number;
 *   maxQuestionsPerSection?: number;
 * }
 */
async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Body can arrive as string or object depending on config
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
  }

  const {
    text,
    maxSections = 12,
    maxQuestionsPerSection = 30,
  } = body || {};

  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "Missing 'text' in request body" });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res
      .status(500)
      .json({ error: "OPENAI_API_KEY is not set in environment" });
    return;
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const systemPrompt = `
You convert checklist PDFs into JSON templates for an inspections app called AuditKing.

Return ONLY a JSON object with this exact structure (no extra properties):

{
  "name": string,                     // short template name
  "description": string,              // short description
  "sections": [
    {
      "title": string,
      "questions": [
        {
          "label": string,            // the question text
          "type": "yes_no_na" | "good_fair_poor" | "multiple_choice" | "text",
          "options": string[],        // for multiple_choice only, otherwise []
          "allowNotes": boolean,
          "allowPhoto": boolean,
          "required": boolean
        }
      ]
    }
  ]
}

Rules:
- Use at most ${maxSections} sections.
- Use at most ${maxQuestionsPerSection} questions per section.
- Prefer "yes_no_na" for simple pass/fail items.
- Use "good_fair_poor" for quality / condition checks.
- Use "multiple_choice" only when the text clearly lists discrete options.
- Otherwise use "text".
- Make clear, short question labels.
- Do NOT include any commentary; just the JSON object.
`;

    // If you later increase what the frontend sends, you can also
    // truncate here defensively (for now it's already limited in the UI).
    const truncatedText = text; // or text.slice(0, 50000);

    const userPrompt = {
      text: truncatedText,
      maxSections,
      maxQuestionsPerSection,
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify(userPrompt),
        },
      ],
      // Force pure JSON output
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("JSON parse error from OpenAI:", e, content);
      res.status(500).json({
        error: "Model returned invalid JSON",
      });
      return;
    }

    if (!Array.isArray(parsed.sections)) {
      parsed.sections = [];
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error("ai-pdf-template error:", err);
    res.status(500).json({
      error: err?.message || "Unexpected server error",
    });
  }
}

module.exports = handler;