// api/ai-pdf-template.js
// Hybrid PDF → template converter:
// 1) Rule-based for "Area = ... / Check ..." style PDFs
// 2) Fallback to OpenAI for everything else (if OPENAI_API_KEY is set)

let OpenAI = null;
try {
  // Only require OpenAI if available
  OpenAI = require("openai");
} catch (e) {
  // It's okay if it's not installed in some environments
  console.warn("openai package not found, AI fallback will be disabled.");
}

// --------- Rule-based converter for "Area = ... / Check ..." style ---------

function buildSectionsFromText(rawText) {
  const lines = (rawText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const sections = [];
  let currentSection = null;

  const isNoiseLine = (line) => {
    const upper = line.toUpperCase();
    if (upper === "GOOD FAIR POOR N/A") return true;
    if (upper === "RESPONSE") return true;
    if (upper.startsWith("NEW TITLE -")) return true;
    return false;
  };

  for (const line of lines) {
    // Start of a new area
    if (/^AREA\s*=/i.test(line)) {
      const title = line.replace(/^AREA\s*=/i, "").trim() || "Area";
      currentSection = {
        title,
        questions: [],
      };
      sections.push(currentSection);
      continue;
    }

    // Skip obvious scoring / layout noise
    if (isNoiseLine(line)) {
      continue;
    }

    // Everything else within an Area becomes a question
    if (currentSection) {
      currentSection.questions.push({
        label: line,
        type: "good_fair_poor", // matches the Good / Fair / Poor / N/A style
        options: [],
        allowNotes: true,
        allowPhoto: true,
        required: true,
      });
    }
  }

  // Remove any sections with no questions
  return sections.filter((sec) => sec.questions.length > 0);
}

function countAreaMarkers(text) {
  if (!text) return 0;
  const matches = text.match(/Area\s*=/gi);
  return matches ? matches.length : 0;
}

// --------- OpenAI fallback ---------

async function generateWithOpenAI(text, maxSections, maxQuestionsPerSection) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set in environment and rule-based parser did not match."
    );
  }
  if (!OpenAI) {
    throw new Error(
      "openai package is not installed but OPENAI_API_KEY is set."
    );
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

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
`;

  const userPrompt = {
    text,
    maxSections,
    maxQuestionsPerSection,
  };

  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userPrompt) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const content = completion.choices[0]?.message?.content || "{}";
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    console.error("JSON parse error from OpenAI:", e, content);
    throw new Error("Model returned invalid JSON");
  }

  if (!Array.isArray(parsed.sections)) {
    parsed.sections = [];
  }

  return parsed;
}

// --------- Main handler ---------

async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = req.body || {};
    const {
      text,
      maxSections = 12,
      maxQuestionsPerSection = 30,
    } = body;

    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Missing 'text' in request body" });
      return;
    }

    // 1) Try rule-based STOMPERS-style converter first
    const areaCount = countAreaMarkers(text);
    let sections = [];

    if (areaCount >= 3) {
      sections = buildSectionsFromText(text);
    }

    const totalQuestions =
      sections.reduce((acc, s) => acc + (s.questions?.length || 0), 0) || 0;

    if (sections.length > 0 && totalQuestions >= 5) {
      // Looks like a good rule-based result – return it
      const result = {
        name: "Imported checklist",
        description:
          "Template imported from PDF using rule-based converter (Area = ... / Check ...).",
        sections,
      };
      res.status(200).json(result);
      return;
    }

    // 2) Fallback to OpenAI for anything else / non-matching PDFs
    const aiResult = await generateWithOpenAI(
      text,
      maxSections,
      maxQuestionsPerSection
    );
    res.status(200).json(aiResult);
  } catch (err) {
    console.error("ai-pdf-template hybrid error:", err);
    res.status(500).json({
      error: err && err.message ? err.message : "Unexpected server error",
    });
  }
}

// CommonJS export for Vercel
module.exports = handler;