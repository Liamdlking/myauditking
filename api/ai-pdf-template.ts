import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY is not configured on the server." });
    }

    const { text, maxSections = 10, maxQuestionsPerSection = 20 } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing 'text' in request body." });
    }

    // Call OpenAI Chat Completions API directly via fetch
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You convert safety / inspection PDF text into structured checklist templates for a web app. " +
              "You must ONLY return valid JSON matching the required schema. No explanations.",
          },
          {
            role: "user",
            content: [
              "Here is the raw text of a PDF checklist. ",
              "Extract a structured inspection template with up to ",
              String(maxSections),
              " sections, each with up to ",
              String(maxQuestionsPerSection),
              " questions.",
              "",
              "Required JSON shape:",
              "",
              "{",
              '  "name": string,',
              '  "description": string,',
              '  "sections": [',
              "    {",
              '      "title": string,',
              '      "questions": [',
              "        {",
              '          "label": string,',
              '          "type": "yes_no_na" | "good_fair_poor" | "multiple_choice" | "text",',
              "          // if type === multiple_choice",
              '          "options": string[],',
              "          // optional flags, default true",
              '          "allowNotes": boolean,',
              '          "allowPhoto": boolean,',
              '          "required": boolean',
              "        }",
              "      ]",
              "    }",
              "  ]",
              "}",
              "",
              "Heuristics:",
              "- Group logically related lines into sections by headings.",
              "- Use yes_no_na for typical compliance checks (Yes/No/N/A).",
              "- Use good_fair_poor for quality-style ratings.",
              "- Use multiple_choice if there are explicit answer options.",
              "- Use text for free-form comments or description fields.",
              "",
              "Return ONLY the JSON. No comments, no markdown.",
              "",
              "PDF text starts here:",
              text,
            ].join("\n"),
          },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const body = await openaiRes.text();
      console.error("OpenAI error:", openaiRes.status, body);
      return res
        .status(500)
        .json({ error: "OpenAI request failed. Check server logs." });
    }

    const data = await openaiRes.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: "No content from OpenAI." });
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("JSON parse error from OpenAI content:", content);
      return res
        .status(500)
        .json({ error: "OpenAI returned invalid JSON. Check logs." });
    }

    return res.status(200).json(parsed);
  } catch (err: any) {
    console.error("ai-pdf-template handler error:", err);
    return res.status(500).json({ error: err?.message || "Unexpected error." });
  }
}