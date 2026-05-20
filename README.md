# 🧭 Guida Turistica AI

## Deploy su Vercel (5 minuti, gratis)

### 1. Prepara la chiave API
Vai su https://console.anthropic.com → API Keys → crea una chiave (`sk-ant-...`)

### 2. Carica su GitHub
- Vai su https://github.com → **New repository** (es. `tourist-guide-ai`)
- Carica tutti i file di questa cartella (inclusa la sottocartella `api/`)
- `.gitignore` è già configurato per escludere `.env` e `node_modules`

### 3. Deploy su Vercel
- Vai su https://vercel.com → **New Project** → importa il repo GitHub
- In **Environment Variables** aggiungi:
  - Nome: `ANTHROPIC_API_KEY`
  - Valore: la tua chiave Anthropic (es. `sk-ant-...`)
- Clicca **Deploy** → URL pronto in ~2 minuti

> ⚠️ Non usare `VITE_ANTHROPIC_API_KEY` su Vercel: la chiave resterà protetta
> nel backend grazie alla funzione serverless in `api/claude.js`.

### 4. Struttura progetto
```
tourist-guide/
├── api/
│   └── claude.js        ← proxy serverless (chiave API protetta)
├── src/
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── vite.config.js
├── package.json
├── .env.example
└── .gitignore
```

### Sviluppo locale
```bash
cp .env.example .env
# Inserisci la tua chiave in .env: ANTHROPIC_API_KEY=sk-ant-...
npm install
npm run dev
```

> In locale Vite non esegue le function di `api/`, quindi per testare il proxy
> usa Vercel CLI: `npx vercel dev` (installa con `npm i -g vercel`).
> Oppure testa direttamente su Vercel con Preview Deployments dopo ogni push.
