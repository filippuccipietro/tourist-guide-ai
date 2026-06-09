# Stato attuale — tourist-guide-ai

## ✅ Cosa è stato fatto
- `src/App.jsx` → chiama `/api/claude` (commit recente su GitHub main)
- `api/claude.js` → usa `process.env.ANTHROPIC_API_KEY`
- `api/gemini.js` → esiste ancora ma non viene usata
- Deploy Vercel → si aggiorna automaticamente da GitHub main

## ⚠️ Unica cosa da fare per far funzionare l'app

Verificare che in Vercel ci sia la chiave Anthropic:

1. Vai su **vercel.com** → progetto **tourist-guide-ai**
2. **Settings → Environments → Production**
3. Cerca `ANTHROPIC_API_KEY`
   - Se **c'è** → l'app funziona già, testa su tourist-guide-ai.vercel.app
   - Se **non c'è** → aggiungila: Edit → incolla la chiave Anthropic → Save → Redeploy

## 🔑 Dove trovare la chiave Anthropic
- Vai su **console.anthropic.com** → API Keys
- Oppure controlla il file `.env` locale del progetto (se esiste)

## 📁 File importanti
- `tourist-guide/src/App.jsx` — linea 68: `fetch("/api/claude", ...)`
- `tourist-guide/api/claude.js` — serverless function Vercel
- GitHub repo: `filippuccipietro/tourist-guide-ai`
- URL app: `tourist-guide-ai.vercel.app`

## 💰 Costo stimato
Claude Sonnet: ~$0.05 per itinerario generato (~$2-5/mese per uso normale)
