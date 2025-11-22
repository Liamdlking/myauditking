// api/ai-pdf-template.js

// Simple Node/Vercel serverless function using CommonJS + fetch.
// No ESM, no OpenAI SDK – just a direct HTTPS call to OpenAI.

/**
 * Expected POST body:
 * {
 *   "text": string,
 *   "maxSections"?: number,
 *   "maxQuestionsPerSection"?: number
 * }
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function handler(req, res) {
  try {
    // Vercel gives us req.method and req.body (if JSON)
    if (req.method !== "POST") {
      // Helpful when you open /api/ai-pdf-template in the browser.
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          message: "ai-pdf-template function is alive. Use POST from the app.",
          method: req.method,
          hasOpenAiKey: !!OPENAI_API_KEY,
        })
      );
      return;
    }

    if (!OPENAI_API_KEY) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "OPENAI_API_KEY is not set in the environment.",
        })
      );
      return;
    }

    const body = req.body || {};
    const {
      text,
      maxSections = 12,
      maxQuestionsPerSection = 30,
    } = body;

    if (!text || typeof text !== "string") {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing 'text' in request body." }));
      return;
    }

    const systemPrompt = `
You convert checklist PDFs into JSON templates for an inspections app called AuditKing.

Return ONLY a JSON object with this exact structure (no extra properties):

{
  "name": string,
  "description": string,
  "sections": [
    {
      "title": string,
      "questions": [
        {
          "label": string,
          "type": "yes_no_na" | "good_fair_poor" | "multiple_choice" | "text",
          "options": string[],
          "allowNotes": boolean,
          "allowPhoto": boolean,
          "required": boolean
        }
      ]
    }
  ]
}

Rules:
- Use at most maxSections sections.
- Use at most maxQuestionsPerSection questions per section.
- Prefer "yes_no_na" for simple pass/fail items.
- Use "good_fair_poor" for quality / condition checks.
- Use "multiple_choice" only when the text clearly lists discrete options.
- Otherwise use "text".
- Make clear, short question labels.
- Do NOT include any commentary; just the JSON object.
`.trim();

    const userPrompt = {
      text,
      maxSections,
      maxQuestionsPerSection,
    };

    // Call OpenAI HTTP API directly
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPrompt) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const msg =
        data?.error?.message ||
        `OpenAI error: ${resp.status} ${resp.statusText}`;
      console.error("OpenAI API error:", msg, data);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: msg }));
      return;
    }

    const content = data.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("JSON parse error from OpenAI:", e, content);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Model returned invalid JSON.",
        })
      );
      return;
    }

    if (!Array.isArray(parsed.sections)) {
      parsed.sections = [];
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(parsed));
  } catch (err) {
    console.error("ai-pdf-template handler error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: err && err.message ? err.message : "Unexpected server error",
      })
    );
  }
}

// CommonJS export so Node doesn't choke on "export default"
module.exports = handler;