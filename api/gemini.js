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
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    const d = await r.json();
    if (d.error) {
      const msg = typeof d.error === 'string' ? d.error : (d.error.message || JSON.stringify(d.error));
      console.error('Gemini API error:', msg);
      return res.status(500).json({ error: msg });
    }
    if (!d.candidates?.[0]?.content?.parts?.[0]?.text) {
      const reason = d.candidates?.[0]?.finishReason || 'no candidates';
      console.error('Empty Gemini response:', JSON.stringify(d).substring(0, 300));
      return res.status(500).json({ error: `Gemini returned no text (finishReason: ${reason})` });
    }
    const text = d.candidates[0].content.parts[0].text;
    res.json({ content: [{ text }] });
  } catch (err) {
    console.error('Gemini handler error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
