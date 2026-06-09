# Deploy Log — Guida Turistica AI
**Data:** 20 maggio 2026  
**URL produzione:** https://tourist-guide-ai.vercel.app  
**Repo GitHub:** https://github.com/filippuccipietro/tourist-guide-ai

---

## Cosa è stato fatto

### 1. Revisione e fix del codice

**Problema sicurezza (VITE_ prefix):**  
L'originale `App.jsx` chiamava Anthropic direttamente dal browser usando `VITE_ANTHROPIC_API_KEY`, esponendo la chiave nella bundle pubblica.

**Fix applicato:**
- Creato `api/claude.js` — serverless function Vercel che fa da proxy sicuro
- Modificato `App.jsx`: la funzione `callClaude()` ora chiama `/api/claude` invece di Anthropic direttamente
- Modificato `.env.example`: da `VITE_ANTHROPIC_API_KEY` a `ANTHROPIC_API_KEY`
- Aggiornato `README.md` con istruzioni deploy corrette

### 2. Chiave API Anthropic

- Creata su https://console.anthropic.com → API Keys
- Nome: `tourist-guide-ai`
- Valore: `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`

### 3. GitHub

- Repo creato: `filippuccipietro/tourist-guide-ai` (pubblico)
- Commit iniziale: `4bbdbca` — "Initial commit — tourist-guide-ai" (10 file pushati)
- Fix null bytes: `e6560b6` — "fix: remove null bytes from App.jsx"
- PAT usati per push e poi cancellati immediatamente dopo ogni uso

**Problema riscontrato e risolto:**  
Il file `src/App.jsx` aveva null bytes (`\x00`) alla riga 604 in poi, introdotti durante la scrittura via bash. Il build Vercel falliva con `esbuild: Unexpected "\x00"`. Risolto con `tr -d '\0'` e re-push.

### 4. Vercel

**Account:** `filippuccipietro-8561` (Hobby plan)  
**Progetto ID:** `prj_MWx6ymcWYj0DrSoh2O5SszgbAp17`  
**Team ID:** `team_UivCdkoDSKJoAam0JS1jskEY`

**Passi completati:**
1. Installata la Vercel GitHub App su GitHub (installation ID: `134120542`) navigando direttamente a `https://github.com/apps/vercel/installations/new`
2. Creato progetto Vercel via API (`POST /api/v9/projects`) con `gitRepository` collegato al repo GitHub
3. Aggiunta env var `ANTHROPIC_API_KEY` via API (`POST /api/v9/projects/{id}/env`)
4. Triggerato deploy via API (`POST /api/v13/deployments`) con `gitSource.ref: "main"`
5. Deploy finale riuscito dopo fix null bytes — stato **Ready** ✅

**Token Vercel creato (per uso CLI futuro):**  
Nome: `tourist-guide-deploy` — scope: `filippuccipietro-8561's projects` — No expiration  
⚠️ Token ancora attivo, da revocare se non serve più: https://vercel.com/account/settings/tokens

### 5. Dominio e CI/CD

- URL produzione: `https://tourist-guide-ai.vercel.app`
- URL deployment specifico: `tourist-guide-n0r9wlxaa-filippuccipietro-8561s-projects.vercel.app`
- **Auto-deploy attivo:** ogni push su `main` del repo GitHub trigghera automaticamente un nuovo deploy su Vercel

---

## Struttura file finale

```
tourist-guide/
├── api/
│   └── claude.js        ← proxy serverless (chiave API protetta server-side)
├── src/
│   ├── App.jsx          ← chiama /api/claude (NON Anthropic direttamente)
│   └── main.jsx
├── index.html
├── vite.config.js
├── package.json
├── .env.example         ← ANTHROPIC_API_KEY=sk-ant-xxxxx (senza VITE_)
└── .gitignore
```

---

---

## Fix applicati dopo il deploy iniziale

### Fix #1 — Modello non valido (20 maggio 2026)

**Errore:** "Errore nella generazione. Riprova." — l'API restituiva `{"type":"not_found_error","message":"model: claude-sonnet-4-20250514"}`

**Causa:** Il nome del modello in `App.jsx` era `"claude-sonnet-4-20250514"` (non valido).

**Fix:** Cambiato in `"claude-sonnet-4-5"` (riga 42 di `src/App.jsx`).

**Commit:** `a723fc0` — "fix: use valid model name claude-sonnet-4-5"  
**Deploy Vercel:** Ready ✅ — auto-deploy triggerato dal push su `main`

---

## Fix #2 — Redesign completo + 4 nuove funzionalità (20 maggio 2026)

**Commit:** `14479b7` — "feat: redesign UI, tono intimo, spostamenti tra tappe, guida osservazione"
**Deploy Vercel:** Ready ✅ — auto-deploy triggerato dal push su `main`

### Modifiche apportate a `src/App.jsx`:

1. **Redesign UI** — da dark gold/black a palette ambra + navy + cielo (ispirato a lene.it)
   - Nuovi design token in `const C = {...}`
   - Bottoni pill `AccentBtn` e `OutlineBtn`
   - Card bianche, sfondo neutro `#F7F6F3`, tipografia system-ui

2. **Tono intimo** — prompt riscritta per generare guide in prima persona, non enciclopediche
   - Campo `intro` poetico e personale
   - Campo `story` narrato al presente

3. **Spostamenti tra tappe** — nuovo componente `<TravelSegment/>`
   - JSON schema esteso con `travel_from_prev` per ogni tappa
   - Mostra modalità (🚶🚕🚌), minuti, nota sul percorso, aneddoto del quartiere

4. **Guida all'osservazione** — array `observation_guide` per ogni luogo
   - Istruzioni posizionali specifiche ("nota la statua in alto a destra…")
   - Visualizzate con numerazione navy su sfondo cielo alternato

---

---

## Fix #3 — ElevenLabs TTS: voce italiana naturale (20 maggio 2026)

**Commit:** `d7b6a9b` — "feat: integra ElevenLabs TTS per voce italiana naturale"
**Deploy Vercel:** Ready ✅ — auto-deploy triggerato dal push su `main`

### Motivazione
La voce sintetica del browser (Web Speech API) suonava robotica e dipendeva dall'OS. Integrato ElevenLabs per una voce italiana maschile naturale (Luca, `pqHfZKP75CvOlQylNhV4`).

### Modifiche apportate:

1. **`api/tts.js`** (NUOVO FILE) — proxy serverless Vercel per ElevenLabs
   - `GET /api/tts?voices=1` → lista voci account
   - `POST /api/tts` con `{ text, voice_id?, model_id? }` → restituisce `audio/mpeg`
   - Chiave `ELEVENLABS_API_KEY` rimane server-side, mai esposta al browser
   - Modello: `eleven_multilingual_v2`, voice settings ottimizzati per italiano

2. **`src/App.jsx`** — hook `useTTS` riscritto
   - Eliminata dipendenza da `window.speechSynthesis`
   - Nuova implementazione: `fetch("/api/tts")` + `HTMLAudioElement` + Blob URL
   - Gestione stati: `idle` → `loading` → `speaking` → `paused` → `idle`
   - Cleanup automatico Blob URL alla fine della riproduzione

### Env var aggiunta su Vercel:

| Nome | Target |
|------|--------|
| `ELEVENLABS_API_KEY` | Production, Preview, Development |

---

## Come aggiornare l'app in futuro

1. Modifica i file in locale
2. Push su GitHub: `git push origin main`
3. Vercel fa il deploy automatico in ~2 minuti
4. Oppure: re-deploy manuale dalla dashboard https://vercel.com/filippuccipietro-8561s-projects/tourist-guide-ai

## Env var da configurare se si ricrea il progetto

| Nome | Valore | Target |
|------|--------|--------|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | Production, Preview, Development |
