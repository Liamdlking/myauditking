// api/ai-pdf-template.ts

// Tiny diagnostic function – no OpenAI, no fetch.
// Just checks that the function runs and whether the env var exists.

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      // When you visit /api/ai-pdf-template in the browser (GET),
      // you should see this JSON.
      res.status(200).json({
        ok: true,
        method: req.method,
        note: "Function is alive. For real calls use POST from the app.",
        hasOpenAiKey: !!process.env.OPENAI_API_KEY,
      });
      return;
    }

    // For POST requests, just echo back some info.
    res.status(200).json({
      ok: true,
      message: "POST reached the serverless function.",
      hasOpenAiKey: !!process.env.OPENAI_API_KEY,
    });
  } catch (err: any) {
    // If something still blows up, we return the error message
    res.status(500).json({
      error: err?.message || "Unexpected error in test handler",
    });
  }
}