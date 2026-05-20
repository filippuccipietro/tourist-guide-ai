// Vercel Serverless Function — proxy ElevenLabs TTS
// La chiave API rimane sul server, mai esposta al browser.

export default async function handler(req, res) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });

  // GET /api/tts?voices=1 → lista voci disponibili sull'account
  if (req.method === "GET" && req.query.voices) {
    try {
      const r = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": apiKey },
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== "POST") return res.status(405).end();

  const {
    text,
    voice_id = "pqHfZKP75CvOlQylNhV4", // Luca — voce italiana maschile
    model_id = "eleven_multilingual_v2",
  } = req.body;

  if (!text) return res.status(400).json({ error: "text required" });

  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.80,
            style: 0.25,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }));
      return res.status(r.status).json(err);
    }

    const buf = await r.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(Buffer.from(buf));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
