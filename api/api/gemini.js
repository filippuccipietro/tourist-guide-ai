export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  const { messages, system, max_tokens } = req.body;

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const body = {
    ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
    contents,
    generationConfig: { maxOutputTokens: max_tokens || 5000, temperature: 1.0 }
  };

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    const d = await r.json();
    if (d.error) { console.error('Gemini error:', d.error); return res.status(500).json({ error: d.error }); }
    const text = d.candidates[0].content.parts[0].text;
    res.json({ content: [{ text }] });
  } catch (err) {
    console.error('Gemini handler error:', err);
    res.status(500).json({ error: err.message });
  }
}
