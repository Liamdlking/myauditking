// api/ai-pdf-template.ts

// Vercel Node.js Serverless Function (TypeScript)
// Calls OpenAI via fetch instead of the SDK, to avoid import/runtime issues.

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // This should now show clearly if the env var is missing
    res.status(500).json({ error: 'OPENAI_API_KEY is not set in environment' });
    return;
  }

  try {
    const body: any = req.body || {};
    const {
      text,
      maxSections = 12,
      maxQuestionsPerSection = 30,
    } = body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: "Missing 'text' in request body" });
      return;
    }

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

    // Call OpenAI via HTTP
    const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPrompt) },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!openAiRes.ok) {
      const text = await openAiRes.text().catch(() => '');
      console.error('OpenAI API error', openAiRes.status, text);
      res.status(500).json({
        error: 'OpenAI API error',
        status: openAiRes.status,
      });
      return;
    }

    const completion: any = await openAiRes.json();
    const content =
      completion.choices?.[0]?.message?.content ?? '{}';

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('JSON parse error from OpenAI:', e, content);
      res.status(500).json({ error: 'Model returned invalid JSON' });
      return;
    }

    if (!Array.isArray(parsed.sections)) {
      parsed.sections = [];
    }

    res.status(200).json(parsed);
  } catch (err: any) {
    console.error('ai-pdf-template error:', err);
    res.status(500).json({
      error: err?.message || 'Unexpected server error',
    });
  }
}