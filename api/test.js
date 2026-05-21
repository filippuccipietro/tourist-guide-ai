export default async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY;
  const hasKey = !!key;
  const keyPreview = key ? key.substring(0, 8) + '...' : 'NOT SET';

  // Also try a live Gemini call if key is present
  let geminiStatus = 'not tested';
  if (key) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'say ok' }] }], generationConfig: { maxOutputTokens: 5 } })
        }
      );
      const d = await r.json();
      if (d.error) geminiStatus = 'API error: ' + (d.error.message || JSON.stringify(d.error));
      else if (d.candidates?.[0]?.content?.parts?.[0]?.text) geminiStatus = 'OK: ' + d.candidates[0].content.parts[0].text;
      else geminiStatus = 'unexpected response: ' + JSON.stringify(d).substring(0, 200);
    } catch(e) {
      geminiStatus = 'fetch error: ' + e.message;
    }
  }

  res.json({ hasKey, keyPreview, geminiStatus });
}
