// Vercel Serverless Function — proxy per Nominatim (OpenStreetMap)
// Converte un nome di località in coordinate lat/lon. Nessuna API key richiesta.
// Rispetta la Nominatim Usage Policy: User-Agent identificativo, 1 richiesta per volta.

export default async function handler(req, res) {
  const q = (req.query.q || "").trim();
  if (!q) {
    return res.status(400).json({ error: "Parametro 'q' mancante" });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(q)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "GuidaMeAI/1.0 (guida turistica app, contatto: filippucci.pietro@gmail.com)",
        "Accept-Language": "it",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "Errore Nominatim" });
    }

    const data = await response.json();
    if (!data || data.length === 0) {
      return res.status(404).json({ error: "Località non trovata" });
    }

    const best = data[0];
    return res.status(200).json({
      lat: parseFloat(best.lat),
      lon: parseFloat(best.lon),
      displayName: best.display_name,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
