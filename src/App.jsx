import { useState, useRef, useEffect, useCallback } from "react";

// ─── COLORS ─────────────────────────────────────────────────────
const C = {
  bg:"#0F0E0C", surface:"#1A1916", card:"#231F1B", border:"#2E2A25",
  accent:"#C8922A", accentL:"#E8B458", accentD:"#7A5518",
  text:"#F0EBE3", muted:"#8C8278", dim:"#5A5450", red:"#E05C5C",
};

// ─── DATA ────────────────────────────────────────────────────────
const INTERESTS = [
  {id:"architettura",label:"Architettura",emoji:"🏛️"},
  {id:"pittura",label:"Pittura",emoji:"🎨"},
  {id:"scultura",label:"Scultura",emoji:"🗿"},
  {id:"antropologia",label:"Antropologia",emoji:"🏺"},
  {id:"storia",label:"Storia",emoji:"📜"},
  {id:"gastronomia",label:"Gastronomia",emoji:"🍷"},
  {id:"natura",label:"Natura",emoji:"🌿"},
  {id:"archeologia",label:"Archeologia",emoji:"⛏️"},
  {id:"musica",label:"Musica & Teatro",emoji:"🎭"},
  {id:"religione",label:"Arte Sacra",emoji:"⛪"},
];
const DURATIONS = [
  {id:"2h",label:"2 ore",desc:"Visita rapida"},
  {id:"4h",label:"Mezza giornata",desc:"4 ore"},
  {id:"1d",label:"1 giorno",desc:"Giornata intera"},
  {id:"2d",label:"2 giorni",desc:"Weekend"},
  {id:"3d",label:"3+ giorni",desc:"Soggiorno esteso"},
];
const PACES = [
  {id:"rilassato",label:"Rilassato",emoji:"🧘",desc:"Poche tappe, molta profondità"},
  {id:"bilanciato",label:"Bilanciato",emoji:"🚶",desc:"Il meglio senza stress"},
  {id:"intenso",label:"Intenso",emoji:"🏃",desc:"Massimizza le visite"},
];

// ─── CLAUDE API ──────────────────────────────────────────────────
// Chiama il proxy serverless /api/claude (la chiave API resta sul server Vercel)
async function callClaude(messages, sys) {
  const r = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 4000, system: sys, messages }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content[0].text;
}

// ─── TTS — Web Speech API (funziona nel browser reale) ───────────
function chunkText(text, max = 160) {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]*/g) || [clean];
  const out = [];
  let cur = "";
  for (const s of sentences) {
    const t = s.trim();
    if (!t) continue;
    if ((cur + " " + t).trim().length > max) {
      if (cur) out.push(cur.trim());
      cur = t;
    } else {
      cur = cur ? cur + " " + t : t;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

function useTTS() {
  const [ttsState,  setTtsState]  = useState("idle");
  const [ttsStopId, setTtsStopId] = useState(null);
  const alive = useRef(false);
  const idx   = useRef(0);
  const list  = useRef([]);

  const cancel = useCallback(() => {
    alive.current = false;
    window.speechSynthesis.cancel();
    setTtsState("idle");
    setTtsStopId(null);
  }, []);

  const playChunk = useCallback((chunks, i) => {
    if (!alive.current || i >= chunks.length) {
      if (alive.current) { alive.current = false; setTtsState("idle"); setTtsStopId(null); }
      return;
    }
    idx.current = i;
    const utt = new SpeechSynthesisUtterance(chunks[i]);
    utt.lang  = "it-IT";
    utt.rate  = 0.9;
    utt.pitch = 1;
    // Seleziona la voce italiana migliore disponibile
    const voices = window.speechSynthesis.getVoices();
    const itVoice = voices.find(v => v.lang === "it-IT" && v.localService)
                 || voices.find(v => v.lang === "it-IT")
                 || voices.find(v => v.lang.startsWith("it"))
                 || null;
    if (itVoice) utt.voice = itVoice;

    utt.onstart = () => { if (alive.current) setTtsState("speaking"); };
    utt.onend   = () => { if (alive.current) playChunk(chunks, i + 1); };
    utt.onerror = e  => { if (e.error !== "interrupted" && alive.current) playChunk(chunks, i + 1); };
    window.speechSynthesis.speak(utt);
  }, []);

  const speak = useCallback((text, sid) => {
    alive.current = false;
    window.speechSynthesis.cancel();
    alive.current = true;
    setTtsState("loading");
    setTtsStopId(sid);
    const chunks = chunkText(text);
    list.current = chunks;

    const go = () => { setTtsState("speaking"); playChunk(chunks, 0); };
    if (window.speechSynthesis.getVoices().length > 0) {
      go();
    } else {
      window.speechSynthesis.addEventListener("voiceschanged", function h() {
        window.speechSynthesis.removeEventListener("voiceschanged", h);
        if (alive.current) go();
      });
    }
  }, [playChunk]);

  const pause  = useCallback(() => { window.speechSynthesis.pause();  setTtsState("paused");   }, []);
  const resume = useCallback(() => { window.speechSynthesis.resume(); setTtsState("speaking"); }, []);

  useEffect(() => () => { alive.current = false; window.speechSynthesis.cancel(); }, []);

  return { ttsState, ttsStopId, speak, pause, resume, stop: cancel };
}

// ─── TTS PLAYER ──────────────────────────────────────────────────
function TTSPlayer({ text, stopId, label, tts }) {
  const { ttsState, ttsStopId, speak, pause, resume, stop } = tts;
  const mine     = ttsStopId === stopId;
  const loading  = mine && ttsState === "loading";
  const speaking = mine && ttsState === "speaking";
  const paused   = mine && ttsState === "paused";
  const active   = mine && ttsState !== "idle";

  const onTap = () => {
    if (loading)  return;
    if (!mine)    { speak(text, stopId); return; }
    if (speaking) { pause(); return; }
    if (paused)   { resume(); return; }
    speak(text, stopId);
  };

  return (
    <div onClick={onTap} style={{
      display:"flex", alignItems:"center", gap:10,
      background: active ? `${C.accent}20` : C.surface,
      border:`1px solid ${active ? C.accentD : C.border}`,
      borderRadius:10, padding:"13px 14px", marginBottom:14,
      cursor: loading ? "wait" : "pointer",
      WebkitTapHighlightColor:"transparent", minHeight:54, userSelect:"none",
    }}>
      <div style={{
        width:40, height:40, minWidth:40, borderRadius:"50%",
        background: active ? C.accent : C.card,
        border:`1.5px solid ${active ? C.accent : C.border}`,
        color: active ? "#000" : C.text,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:17, flexShrink:0,
      }}>
        {loading ? "…" : speaking ? "⏸" : "▶"}
      </div>

      <div style={{fontSize:13, color: active ? C.accentL : C.muted, fontStyle:"italic", flex:1, lineHeight:1.4}}>
        {loading ? "Avvio audio…" : speaking ? `▶ ${label}` : paused ? `⏸ ${label}` : `Ascolta: ${label}`}
      </div>

      {speaking && (
        <div style={{display:"flex",alignItems:"center",gap:3}}>
          {[1,2,3,4,5].map(n=>(
            <div key={n} style={{
              width:3, borderRadius:2, background:C.accent,
              animation:`wave${n} 0.7s ease-in-out infinite`,
              animationDelay:`${(n-1)*0.1}s`,
            }}/>
          ))}
        </div>
      )}

      {active && !loading && (
        <div onClick={e=>{e.stopPropagation();stop();}} style={{
          width:32, height:32, minWidth:32, borderRadius:"50%",
          background:C.card, border:`1px solid ${C.border}`,
          color:C.text, display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:12, cursor:"pointer", marginLeft:4,
        }}>■</div>
      )}
    </div>
  );
}

// ─── LAYOUT ──────────────────────────────────────────────────────
const rootStyle = {
  minHeight:"100vh", background:C.bg, color:C.text,
  fontFamily:"'Georgia','Times New Roman',serif",
  maxWidth:480, margin:"0 auto", overflowX:"hidden",
};

function Header({step, label}) {
  return (
    <div style={{padding:"18px 20px 14px", borderBottom:`1px solid ${C.border}`, background:C.surface, position:"sticky", top:0, zIndex:100}}>
      {step && <div style={{fontSize:10, letterSpacing:"0.25em", color:C.accent, fontStyle:"italic", textTransform:"uppercase", marginBottom:3}}>{step}</div>}
      <div style={{fontSize:21, fontWeight:"bold"}}>{label}</div>
    </div>
  );
}

function Progress({step}) {
  return (
    <div style={{display:"flex", gap:6, marginBottom:28}}>
      {[1,2,3].map(i => <div key={i} style={{height:3, flex:1, borderRadius:2, background:i<=step?C.accent:C.border}}/>)}
    </div>
  );
}

function Btn({children, onClick, disabled, outline}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width:"100%", background:outline?"transparent":C.accent, color:outline?C.accent:"#000",
      border:outline?`1.5px solid ${C.accent}`:"none", borderRadius:12, padding:"15px",
      fontSize:14, fontWeight:"bold", fontFamily:"inherit", cursor:"pointer",
      marginTop:outline?10:0, opacity:disabled?0.4:1, letterSpacing:"0.04em",
    }}>{children}</button>
  );
}

function Spinner({small}) {
  return <div style={{
    width:small?20:44, height:small?20:44,
    border:`${small?2:3}px solid ${C.border}`,
    borderTop:`${small?2:3}px solid ${C.accent}`,
    borderRadius:"50%", animation:"spin 0.8s linear infinite", flexShrink:0,
  }}/>;
}

// ─── WELCOME ─────────────────────────────────────────────────────
// Input non controllato (useRef) → zero re-render → tastiera sempre aperta
function WelcomeScreen({ onNext }) {
  const inputRef = useRef(null);
  const go = useCallback(() => {
    const v = inputRef.current?.value?.trim();
    if (v) onNext(v);
  }, [onNext]);

  return (
    <div style={{...rootStyle, display:"flex", flexDirection:"column", justifyContent:"center", padding:"24px 20px", minHeight:"100vh"}}>
      <div style={{textAlign:"center", marginBottom:44}}>
        <div style={{fontSize:52, marginBottom:14}}>🧭</div>
        <div style={{fontSize:10, letterSpacing:"0.3em", color:C.accent, textTransform:"uppercase", fontStyle:"italic", marginBottom:10}}>La tua guida culturale</div>
        <h1 style={{fontSize:30, margin:"0 0 10px", lineHeight:1.2}}>Scopri l'Italia<br/>come mai prima</h1>
        <p style={{color:C.muted, fontSize:14, lineHeight:1.6, fontStyle:"italic", margin:0}}>Itinerario su misura · Guida AI · Navigazione</p>
      </div>
      <label style={{fontSize:11, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", display:"block", marginBottom:8}}>
        Dove vuoi andare?
      </label>
      <input
        ref={inputRef}
        type="text"
        defaultValue=""
        placeholder="es. Viterbo, Orvieto, Roma…"
        onKeyDown={e => e.key === "Enter" && go()}
        style={{
          width:"100%", background:C.card, border:`1px solid ${C.border}`,
          borderRadius:12, padding:"14px 16px", color:C.text, fontSize:16,
          fontFamily:"inherit", outline:"none", boxSizing:"border-box", marginBottom:20,
        }}
      />
      <Btn onClick={go}>Inizia il viaggio →</Btn>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────
export default function App() {
  const [screen,      setScreen]      = useState("welcome");
  const [city,        setCity]        = useState("");
  const [interests,   setInterests]   = useState([]);
  const [duration,    setDuration]    = useState("");
  const [pace,        setPace]        = useState("");
  const [itinerary,   setItinerary]   = useState(null);
  const [activeStop,  setActiveStop]  = useState(null);
  const [stopDetails, setStopDetails] = useState({});
  const [loadingDet,  setLoadingDet]  = useState(null);
  const [chatMsgs,    setChatMsgs]    = useState({});
  const [chatInput,   setChatInput]   = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [error,       setError]       = useState("");
  const chatEndRef = useRef(null);
  const tts = useTTS();

  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = `
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      @keyframes wave1{0%,100%{height:4px}50%{height:18px}}
      @keyframes wave2{0%,100%{height:8px}50%{height:22px}}
      @keyframes wave3{0%,100%{height:14px}50%{height:6px}}
      @keyframes wave4{0%,100%{height:6px}50%{height:20px}}
      @keyframes wave5{0%,100%{height:10px}50%{height:4px}}
      *{box-sizing:border-box} body{margin:0;background:#0F0E0C}
      input:focus{border-color:#C8922A!important;outline:none}
      ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#2E2A25;border-radius:2px}
    `;
    document.head.appendChild(s);
    return () => document.head.removeChild(s);
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [chatMsgs, activeStop]);

  const toggle = id => setInterests(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);

  const generate = async () => {
    setScreen("generating"); setError("");
    try {
      const iL = interests.map(id=>INTERESTS.find(i=>i.id===id)?.label).join(", ");
      const dL = DURATIONS.find(d=>d.id===duration)?.label;
      const pL = PACES.find(p=>p.id===pace)?.label;
      const n  = {["2h"]:"3-4",["4h"]:"4-6",["1d"]:"6-8",["2d"]:"10-14",["3d"]:"14-18"}[duration];
      const sys = "Sei un esperto di turismo culturale italiano. Rispondi SOLO con JSON valido, zero markdown.";
      const msg = `Itinerario per ${city}. Durata: ${dL}. Ritmo: ${pL}. Interessi: ${iL}.
Restituisci SOLO questo JSON (${n} tappe reali con coordinate precise):
{"city":"","tagline":"","duration":"${dL}","pace":"${pL}","interests":[],"stops":[{"id":1,"name":"","type":"","address":"","coords":{"lat":0,"lng":0},"duration_min":45,"shortDesc":"","highlights":[]}],"tips":""}`;
      const raw = await callClaude([{role:"user",content:msg}], sys);
      setItinerary(JSON.parse(raw.replace(/```json|```/g,"").trim()));
      setScreen("itinerary");
    } catch(e) { setError("Errore nella generazione. Riprova."); setScreen("pace"); }
  };

  const loadDetail = async (stop) => {
    if (stopDetails[stop.id]) return;
    setLoadingDet(stop.id);
    try {
      const iL  = interests.map(id=>INTERESTS.find(i=>i.id===id)?.label).join(", ");
      const sys = "Sei una guida turistica italiana esperta. Rispondi SOLO con JSON valido, zero markdown.";
      const msg = `Scheda per "${stop.name}" a ${itinerary.city}. Interessi utente: ${iL}.
JSON: {"intro":"","story":"","toSee":["","","",""],"curiosity":"","practical":""}`;
      const raw = await callClaude([{role:"user",content:msg}], sys);
      setStopDetails(p => ({...p, [stop.id]: JSON.parse(raw.replace(/```json|```/g,"").trim())}));
    } catch { setStopDetails(p => ({...p, [stop.id]: {error:true}})); }
    setLoadingDet(null);
  };

  const toggleStop = stop => {
    if (activeStop === stop.id) { setActiveStop(null); return; }
    setActiveStop(stop.id); loadDetail(stop);
  };

  const sendChat = async stopId => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    const stop   = itinerary.stops.find(s=>s.id===stopId);
    const detail = stopDetails[stopId];
    const prev   = chatMsgs[stopId] || [];
    const msgs   = [...prev, {role:"user",content:msg}];
    setChatMsgs(m => ({...m,[stopId]:msgs}));
    setChatLoading(true);
    try {
      const sys = `Sei una guida turistica esperta a ${itinerary.city}, ora presso "${stop.name}". Contesto: ${detail?.story||stop.shortDesc}. Interessi: ${interests.map(id=>INTERESTS.find(i=>i.id===id)?.label).join(", ")}. Rispondi in italiano, max 150 parole.`;
      const reply = await callClaude(msgs, sys);
      setChatMsgs(m => ({...m,[stopId]:[...msgs,{role:"assistant",content:reply}]}));
    } catch { setChatMsgs(m => ({...m,[stopId]:[...msgs,{role:"assistant",content:"Errore. Riprova."}]})); }
    setChatLoading(false);
  };

  const mapsUrl = stop => stop.coords?.lat
    ? `https://www.google.com/maps/dir/?api=1&destination=${stop.coords.lat},${stop.coords.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.name+" "+itinerary.city)}`;

  const resetAll = () => {
    tts.stop();
    setScreen("welcome"); setCity(""); setInterests([]); setDuration(""); setPace("");
    setItinerary(null); setActiveStop(null); setStopDetails({}); setChatMsgs({});
  };

  // ── SCREENS ──────────────────────────────────────────────────────

  if (screen === "welcome") return (
    <WelcomeScreen onNext={c => { setCity(c); setScreen("interests"); }} />
  );

  if (screen === "interests") return (
    <div style={rootStyle}>
      <Header step="Passo 1 di 3" label={city}/>
      <div style={{padding:"24px 20px"}}>
        <Progress step={1}/>
        <h2 style={{fontSize:24,fontWeight:"bold",marginBottom:8}}>Cosa ti appassiona?</h2>
        <p style={{fontSize:14,color:C.muted,marginBottom:28,lineHeight:1.5,fontStyle:"italic"}}>Seleziona uno o più interessi.</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:28}}>
          {INTERESTS.map(it => {
            const sel = interests.includes(it.id);
            return (
              <div key={it.id} onClick={()=>toggle(it.id)} style={{background:sel?C.accent:C.card,border:`1px solid ${sel?C.accent:C.border}`,borderRadius:10,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,color:sel?"#000":C.text,WebkitTapHighlightColor:"transparent"}}>
                <span style={{fontSize:18}}>{it.emoji}</span>
                <span style={{fontSize:13,fontWeight:sel?"bold":"normal"}}>{it.label}</span>
              </div>
            );
          })}
        </div>
        <Btn onClick={()=>setScreen("duration")} disabled={!interests.length}>Avanti →</Btn>
        <Btn outline onClick={()=>setScreen("welcome")}>← Indietro</Btn>
      </div>
    </div>
  );

  if (screen === "duration") return (
    <div style={rootStyle}>
      <Header step="Passo 2 di 3" label={city}/>
      <div style={{padding:"24px 20px"}}>
        <Progress step={2}/>
        <h2 style={{fontSize:24,fontWeight:"bold",marginBottom:8}}>Quanto tempo hai?</h2>
        <p style={{fontSize:14,color:C.muted,marginBottom:28,lineHeight:1.5,fontStyle:"italic"}}>Ottimizzeremo il numero di tappe.</p>
        {DURATIONS.map(d => (
          <div key={d.id} onClick={()=>setDuration(d.id)} style={{background:duration===d.id?`${C.accent}22`:C.card,border:`1.5px solid ${duration===d.id?C.accent:C.border}`,borderRadius:12,padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,WebkitTapHighlightColor:"transparent"}}>
            <div><div style={{fontWeight:"bold",fontSize:15}}>{d.label}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{d.desc}</div></div>
            {duration===d.id && <span style={{color:C.accent,fontSize:18}}>✓</span>}
          </div>
        ))}
        <Btn onClick={()=>setScreen("pace")} disabled={!duration} style={{marginTop:8}}>Avanti →</Btn>
        <Btn outline onClick={()=>setScreen("interests")}>← Indietro</Btn>
      </div>
    </div>
  );

  if (screen === "pace") return (
    <div style={rootStyle}>
      <Header step="Passo 3 di 3" label={city}/>
      <div style={{padding:"24px 20px"}}>
        <Progress step={3}/>
        <h2 style={{fontSize:24,fontWeight:"bold",marginBottom:8}}>Che ritmo preferisci?</h2>
        <p style={{fontSize:14,color:C.muted,marginBottom:28,lineHeight:1.5,fontStyle:"italic"}}>Quanto vuoi immergerti in ogni luogo?</p>
        {PACES.map(p => (
          <div key={p.id} onClick={()=>setPace(p.id)} style={{background:pace===p.id?`${C.accent}22`:C.card,border:`1.5px solid ${pace===p.id?C.accent:C.border}`,borderRadius:12,padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,WebkitTapHighlightColor:"transparent"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:24}}>{p.emoji}</span>
              <div><div style={{fontWeight:"bold",fontSize:15}}>{p.label}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{p.desc}</div></div>
            </div>
            {pace===p.id && <span style={{color:C.accent,fontSize:18}}>✓</span>}
          </div>
        ))}
        {error && <div style={{color:C.red,fontSize:13,marginBottom:12,fontStyle:"italic"}}>{error}</div>}
        <Btn onClick={generate} disabled={!pace} style={{marginTop:8}}>Genera il mio itinerario ✦</Btn>
        <Btn outline onClick={()=>setScreen("duration")}>← Indietro</Btn>
      </div>
    </div>
  );

  if (screen === "generating") return (
    <div style={{...rootStyle,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
      <Spinner/>
      <div style={{fontSize:36,margin:"20px 0 10px"}}>🗺️</div>
      <div style={{color:C.muted,fontSize:14,fontStyle:"italic",textAlign:"center",lineHeight:1.7}}>
        Sto studiando {city}…<br/>Preparo il tuo itinerario.<br/>
        <span style={{color:C.accentD}}>Un momento.</span>
      </div>
    </div>
  );

  if (screen === "itinerary" && itinerary) return (
    <div style={rootStyle}>
      <Header label={itinerary.city}/>
      <div style={{padding:"20px"}}>

        <div style={{background:C.card,borderRadius:16,padding:20,marginBottom:20,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:14,color:C.muted,fontStyle:"italic",lineHeight:1.5}}>"{itinerary.tagline}"</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
            {[`⏱ ${itinerary.duration}`,`🚶 ${itinerary.pace}`,`📍 ${itinerary.stops?.length} tappe`].map(b=>(
              <span key={b} style={{background:`${C.accent}22`,border:`1px solid ${C.accentD}`,borderRadius:20,padding:"4px 12px",fontSize:12,color:C.accentL}}>{b}</span>
            ))}
          </div>
          {itinerary.tips && <div style={{marginTop:12,fontSize:13,color:C.muted,lineHeight:1.6,borderTop:`1px solid ${C.border}`,paddingTop:12}}>💡 {itinerary.tips}</div>}
        </div>

        {itinerary.stops?.map((stop, idx) => {
          const isOpen  = activeStop === stop.id;
          const detail  = stopDetails[stop.id];
          const loading = loadingDet === stop.id;
          const msgs    = chatMsgs[stop.id] || [];

          return (
            <div key={stop.id} style={{background:isOpen?C.card:C.surface,border:`1.5px solid ${isOpen?C.accent:C.border}`,borderRadius:14,marginBottom:12,overflow:"hidden",animation:`fadeIn 0.3s ease ${idx*0.04}s both`}}>

              <div onClick={()=>toggleStop(stop)} style={{padding:"16px 18px",display:"flex",alignItems:"center",gap:14,cursor:"pointer",WebkitTapHighlightColor:"transparent"}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:isOpen?C.accent:C.border,color:isOpen?"#000":C.muted,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:"bold",flexShrink:0}}>{idx+1}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:"bold",marginBottom:2}}>{stop.name}</div>
                  <div style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>{stop.type} · {stop.duration_min} min</div>
                </div>
                <div style={{color:isOpen?C.accent:C.dim,fontSize:20,transition:"transform 0.2s",transform:isOpen?"rotate(90deg)":"none"}}>›</div>
              </div>

              {isOpen && (
                <div style={{padding:"0 18px 20px",borderTop:`1px solid ${C.border}`}}>
                  <div style={{fontSize:14,color:C.muted,lineHeight:1.7,marginTop:14,marginBottom:14,fontStyle:"italic"}}>{stop.shortDesc}</div>

                  {stop.highlights?.length > 0 && (
                    <div style={{marginBottom:16}}>
                      {stop.highlights.map((h,i)=>(
                        <div key={i} style={{fontSize:13,color:C.text,marginBottom:6,display:"flex",gap:8}}>
                          <span style={{color:C.accent}}>✦</span>{h}
                        </div>
                      ))}
                    </div>
                  )}

                  <a href={mapsUrl(stop)} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"#1A73E8",color:"#fff",borderRadius:10,padding:"13px 16px",fontSize:13,fontWeight:"bold",textDecoration:"none",marginBottom:18}}>
                    🗺 Naviga con Google Maps
                  </a>

                  <div style={{height:1,background:C.border,marginBottom:18}}/>

                  {loading ? (
                    <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0"}}>
                      <Spinner small/><span style={{fontSize:13,color:C.muted,fontStyle:"italic"}}>Carico la scheda guida…</span>
                    </div>
                  ) : detail && !detail.error ? (
                    <div>
                      <div style={{fontSize:10,letterSpacing:"0.2em",color:C.accentD,textTransform:"uppercase",marginBottom:12}}>📖 GUIDA</div>

                      <TTSPlayer text={`${detail.intro} ${detail.story}`} stopId={`${stop.id}-main`} label="Introduzione e storia" tts={tts}/>

                      <div style={{fontSize:14,color:C.accentL,lineHeight:1.7,marginBottom:12,fontStyle:"italic"}}>{detail.intro}</div>
                      <div style={{fontSize:14,color:C.text,lineHeight:1.75,marginBottom:16}}>{detail.story}</div>

                      {detail.toSee?.length > 0 && (
                        <div style={{marginBottom:16}}>
                          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Cosa osservare</div>
                          {detail.toSee.map((t,i)=>(
                            <div key={i} style={{fontSize:13,color:C.text,marginBottom:6,display:"flex",gap:8}}>
                              <span style={{color:C.accent}}>→</span>{t}
                            </div>
                          ))}
                        </div>
                      )}

                      {detail.curiosity && (<>
                        <div style={{background:`${C.accent}11`,border:`1px solid ${C.accentD}`,borderRadius:8,padding:"10px 14px",marginBottom:8}}>
                          <div style={{fontSize:10,color:C.accent,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>💡 Lo sapevi?</div>
                          <div style={{fontSize:13,color:C.text,lineHeight:1.6}}>{detail.curiosity}</div>
                        </div>
                        <TTSPlayer text={`Lo sapevi? ${detail.curiosity}`} stopId={`${stop.id}-curiosity`} label="Curiosità" tts={tts}/>
                      </>)}

                      {detail.practical && <div style={{fontSize:12,color:C.muted,lineHeight:1.6,marginBottom:16}}>🕐 {detail.practical}</div>}

                      <div style={{marginTop:16,background:C.bg,borderRadius:10,padding:14,border:`1px solid ${C.border}`}}>
                        <div style={{fontSize:10,letterSpacing:"0.2em",color:C.accentD,textTransform:"uppercase",marginBottom:10}}>💬 CHIEDI ALLA GUIDA</div>
                        {msgs.length > 0 && (
                          <div style={{maxHeight:220,overflowY:"auto",marginBottom:10,display:"flex",flexDirection:"column",gap:8}}>
                            {msgs.map((m,i)=>(
                              <div key={i} style={{display:"flex",flexDirection:"column",alignSelf:m.role==="assistant"?"flex-start":"flex-end",maxWidth:"90%"}}>
                                <div style={{background:m.role==="assistant"?C.card:`${C.accent}22`,border:`1px solid ${m.role==="assistant"?C.border:C.accentD}`,borderRadius:8,padding:"8px 12px",fontSize:13,color:m.role==="assistant"?C.text:C.accentL,lineHeight:1.6}}>{m.content}</div>
                                {m.role==="assistant" && (
                                  <button onClick={()=>tts.speak(m.content,`chat-${stop.id}-${i}`)} style={{fontSize:11,color:C.accentD,background:"none",border:"none",cursor:"pointer",padding:"3px 4px",textAlign:"left",fontStyle:"italic"}}>
                                    {tts.ttsStopId===`chat-${stop.id}-${i}`&&tts.ttsState==="speaking"?"⏸ In ascolto…":"▶ Ascolta risposta"}
                                  </button>
                                )}
                              </div>
                            ))}
                            <div ref={chatEndRef}/>
                          </div>
                        )}
                        <div style={{display:"flex",gap:8}}>
                          <input
                            style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:13,fontFamily:"inherit",outline:"none"}}
                            placeholder="Fai una domanda…"
                            value={chatInput}
                            onChange={e=>setChatInput(e.target.value)}
                            onKeyDown={e=>e.key==="Enter"&&sendChat(stop.id)}
                          />
                          <button onClick={()=>sendChat(stop.id)} disabled={chatLoading} style={{background:C.accent,color:"#000",border:"none",borderRadius:8,padding:"10px 14px",fontWeight:"bold",cursor:"pointer",fontSize:13,opacity:chatLoading?0.5:1}}>
                            {chatLoading?"…":"→"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : detail?.error ? (
                    <div style={{fontSize:13,color:C.red,fontStyle:"italic"}}>Errore nel caricamento. Tocca di nuovo la tappa.</div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}

        <div style={{marginTop:24,marginBottom:48}}>
          <Btn outline onClick={resetAll}>← Nuovo itinerario</Btn>
        </div>
      </div>
    </div>
  );

  return null;
}
