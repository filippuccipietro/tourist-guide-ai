import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const { messages, system, max_tokens, model } = req.body;
  const modelId = model || "claude-haiku-4-5-20251001";

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: modelId,
      max_tokens: max_tokens || 5000,
      ...(system ? { system } : {}),
      messages,
    });
    res.json({ content: response.content });
  } catch (err) {
    console.error("Claude API error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
