// Vercel Serverless Function — proxy sicuro per Google Gemini API
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const { messages = [], system = "", model = "gemini-2.0-flash", max_tokens = 5000 } = req.body;

  // Converti formato Anthropic → Gemini
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = {
    contents,
    generationConfig: { maxOutputTokens: max_tokens },
  };
  if (system) {
    body.system_instruction = { parts: [{ text: system }] };
  }

  // v1beta supporta system_instruction (v1 no)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    if (!response.ok) {
      const msg = data?.error?.message || JSON.stringify(data);
      // Quota esaurita: messaggio user-friendly
      if (msg.includes("quota") || msg.includes("limit")) {
        return res.status(429).json({ error: { message: "Quota Gemini esaurita. Usa Haiku o Sonnet." } });
      }
      return res.status(response.status).json({ error: { message: msg } });
    }

    // Normalizza risposta → formato compatibile con Anthropic client
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return res.status(200).json({ content: [{ text }] });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
}
