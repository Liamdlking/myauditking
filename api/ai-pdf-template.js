// api/ai-pdf-template.js
// CommonJS version so Vercel's Node runtime is happy

const OpenAI = require("openai");

/**
 * Vercel serverless function to turn extracted PDF text
 * into an AuditKing template using OpenAI.
 *
 * Expects a POST with JSON:
 * {
 *   text: string;
 *   maxSections?: number;
 *   maxQuestionsPerSection?: number;
 * }
 */
module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  // Check API key
  if (!process.env.OPENAI_API_KEY) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "OPENAI_API_KEY is not set in environment",
      })
    );
    return;
  }

  try {
    // Parse body safely (Vercel may give us an object or a string)
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }
    body = body || {};

    const {
      text,
      maxSections = 20,
      maxQuestionsPerSection = 40,
    } = body;

    if (!text || typeof text !== "string") {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing 'text' in request body" }));
      return;
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // -------- Chunking logic so large PDFs don't get cut off --------
    const MAX_CHARS_PER_CHUNK = 18000; // safe for tokens
    const chunks = [];
    for (let i = 0; i < text.length; i += MAX_CHARS_PER_CHUNK) {
      chunks.push(text.slice(i, i + MAX_CHARS_PER_CHUNK));
    }

    const allSections = [];
    let combinedName = "";
    let combinedDescription = "";

    const baseSystemPrompt = `
You convert checklist PDFs into JSON templates for an inspections app called AuditKing.

You will receive PARTS of a larger checklist text. For each part:

- Extract sections and questions *only from this part*.
- Do NOT worry about other parts; each call is independent.
- Return ONLY sections/questions that clearly exist in the given text.
- Do NOT add made-up questions.

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
- Use at most ${maxSections} sections for THIS part.
- Use at most ${maxQuestionsPerSection} questions per section for THIS part.
- Prefer "yes_no_na" for simple pass/fail items.
- Use "good_fair_poor" for quality / condition checks.
- Use "multiple_choice" only when the text clearly lists discrete options.
- Otherwise use "text".
- Make clear, short question labels.
- Do NOT include any commentary; just the JSON object.
`;

    for (let idx = 0; idx < chunks.length; idx++) {
      const partText = chunks[idx];
      const partNumber = idx + 1;
      const totalParts = chunks.length;

      const userPrompt = {
        partNumber,
        totalParts,
        text: partText,
      };

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              baseSystemPrompt +
              (totalParts > 1
                ? `\nYou are processing part ${partNumber} of ${totalParts}.\n`
                : ""),
          },
          {
            role: "user",
            content: JSON.stringify(userPrompt),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      const content = completion.choices[0]?.message?.content || "{}";

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        console.error(
          "JSON parse error from OpenAI for part",
          partNumber,
          e,
          content
        );
        // Skip this chunk but continue with others instead of failing everything
        continue;
      }

      if (idx === 0) {
        combinedName =
          parsed.name || "Imported template from PDF";
        combinedDescription =
          parsed.description ||
          "Template imported from PDF using AI.";
      }

      if (Array.isArray(parsed.sections)) {
        allSections.push(...parsed.sections);
      }
    }

    if (allSections.length === 0) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error:
            "AI could not extract any sections/questions from the PDF text.",
        })
      );
      return;
    }

    const result = {
      name: combinedName,
      description: combinedDescription,
      sections: allSections,
    };

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error("ai-pdf-template error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: err && err.message ? err.message : "Unexpected server error",
      })
    );
  }
};