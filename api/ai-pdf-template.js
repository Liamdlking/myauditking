// api/ai-pdf-template.js
// CommonJS version for Vercel Node runtime

const OpenAI = require("openai");

/**
 * Helper: count total questions in sections
 */
function countQuestions(sections) {
  return sections.reduce(
    (acc, s) => acc + (s.questions ? s.questions.length : 0),
    0
  );
}

/**
 * Rule-based parser for STOMPERS-style checklists:
 * - Uses "Area = X" as sections
 * - Uses "Check ..." lines as questions
 * - Most questions end with "Good Fair Poor N/A" -> good_fair_poor
 */
function parseChecklistFromText(rawText, maxSections = 50, maxQuestionsPerSection = 100) {
  if (!rawText || typeof rawText !== "string") {
    return null;
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const sections = [];
  let currentSection = null;

  const startSection = (title) => {
    if (currentSection && currentSection.questions.length > 0) {
      sections.push(currentSection);
    }
    currentSection = {
      title: title || "Section",
      questions: [],
    };
  };

  for (let line of lines) {
    // Ignore "RESPONSE" and "NEW TITLE - ..." helper lines
    if (/^RESPONSE\b/i.test(line)) continue;
    if (/^NEW TITLE\b/i.test(line)) continue;

    // Area = X -> new section
    const areaMatch = line.match(/^Area\s*=\s*(.+)$/i);
    if (areaMatch) {
      const areaTitle = areaMatch[1].trim();
      startSection(areaTitle);
      continue;
    }

    // "Check ..." lines -> questions
    if (/^(Check|Chcek)/i.test(line)) {
      // Strip common rating tails like "Good Fair Poor N/A"
      line = line.replace(/\bGood\s+Fair\s+Poor\s+N\/A\b.*$/i, "").trim();

      // Sometimes it might still end with "Good Fair Poor N/A" without N/A spacing variations,
      // so defensively remove again.
      line = line.replace(/\bGood\s+Fair\s+Poor\b.*$/i, "").trim();

      if (!line) continue;

      let label = line;

      // Ensure we have a section to put it in
      if (!currentSection) {
        startSection("General checks");
      }

      currentSection.questions.push({
        label,
        type: "good_fair_poor",
        options: [],
        allowNotes: true,
        allowPhoto: true,
        required: true,
      });
    }
  }

  // Flush last section
  if (currentSection && currentSection.questions.length > 0) {
    sections.push(currentSection);
  }

  // Trim by limits
  const trimmedSections = sections.slice(0, maxSections).map((sec) => {
    const qs = (sec.questions || []).slice(0, maxQuestionsPerSection);
    return { ...sec, questions: qs };
  });

  const totalQuestions = countQuestions(trimmedSections);

  // If we didn't find anything meaningful, return null so we can fall back to AI
  if (!trimmedSections.length || totalQuestions === 0) {
    return null;
  }

  // Basic name / description
  const name = "Imported checklist";
  const description =
    "Template imported from PDF checklist using rule-based parser.";

  return {
    name,
    description,
    sections: trimmedSections,
  };
}

/**
 * Main handler – tries rule-based parsing first,
 * then falls back to OpenAI JSON output.
 *
 * Expected POST body:
 * {
 *   text: string;
 *   maxSections?: number;
 *   maxQuestionsPerSection?: number;
 * }
 */
async function handler(req, res) {
  // Method check
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Ensure body is an object
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
    maxSections = 50,
    maxQuestionsPerSection = 100,
  } = body || {};

  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "Missing 'text' in request body" });
    return;
  }

  // 1) Try rule-based parser first (for STOMPERS-style checklists)
  try {
    const ruleResult = parseChecklistFromText(
      text,
      maxSections,
      maxQuestionsPerSection
    );

    if (ruleResult) {
      // If we got a decent number of questions, just return this
      const totalQuestions = countQuestions(ruleResult.sections);
      if (totalQuestions >= 10) {
        res.status(200).json(ruleResult);
        return;
      }
      // If it's tiny, we still fall through to AI below
    }
  } catch (e) {
    console.error("Rule-based parser error:", e);
    // We don't fail here; we just fall back to AI
  }

  // 2) Fallback to OpenAI if rule-based parser not sufficient
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
- Use at most ${maxSections} sections.
- Use at most ${maxQuestionsPerSection} questions per section.
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

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
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