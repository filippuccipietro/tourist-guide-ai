import { useState, useRef, useEffect, useCallback } from "react";

// ─── DESIGN TOKENS (stile lene.it: ambra + navy + cielo) ─────────
const C = {
  bg:      "#F7F6F3",
  surface: "#FFFFFF",
  card:    "#FFFFFF",
  border:  "#E8E4DB",
  accent:  "#F5A623",
  accentL: "#FFD166",
  accentD: "#C47F00",
  navy:    "#1B2A4A",
  navyL:   "#2D4A7A",
  sky:     "#EBF5FF",
  skyD:    "#C3DCF5",
  text:    "#1B2A4A",
  muted:   "#707A8A",
  dim:     "#B0B8C4",
  red:     "#EF4444",
  travel:  "#F0F7FF",
  travelB: "#BDD5F0",
};

const FONT = "system-ui,-apple-system,'Segoe UI','Helvetica Neue',Arial,sans-serif";

// ─── DATA ─────────────────────────────────────────────────────────
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
  {id:"2h",  label:"2 ore",         desc:"Visita rapida"},
  {id:"4h",  label:"Mezza giornata",desc:"4 ore"},
  {id:"1d",  label:"1 giorno",      desc:"Giornata intera"},
  {id:"2d",  label:"2 giorni",      desc:"Weekend"},
  {id:"3d",  label:"3+ giorni",     desc:"Soggiorno esteso"},
];
const PACES = [
  {id:"rilassato", label:"Rilassato",  emoji:"🧘", desc:"Poche tappe, molta profondità"},
  {id:"bilanciato",label:"Bilanciato", emoji:"🚶", desc:"Il meglio senza stress"},
  {id:"intenso",   label:"Intenso",    emoji:"🏃", desc:"Massimizza le visite"},
];

// ─── LOCAL STORAGE ────────────────────────────────────────────────
const LS_KEY = "tg_saved_v1";

function loadSavedItineraries() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistSaved(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch {}
}

// ─── CLAUDE API ───────────────────────────────────────────────────
async function callClaude(messages, sys) {
  const r = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 5000, system: sys, messages }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content[0].text;
}

// ─── TTS ──────────────────────────────────────────────────────────
function fmt(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function useTTS() {
  const [ttsState,  setTtsState]  = useState("idle");
  const [ttsStopId, setTtsStopId] = useState(null);
  const [progress,  setProgress]  = useState({ current: 0, duration: 0 });
  const alive    = useRef(false);
  const audioEl  = useRef(null);
  const audioCtx = useRef(null);

  const cancel = useCallback(() => {
    alive.current = false;
    if (audioEl.current) {
      audioEl.current.pause();
      audioEl.current.src = "";
      audioEl.current = null;
    }
    setTtsState("idle");
    setTtsStopId(null);
    setProgress({ current: 0, duration: 0 });
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "none";
    }
  }, []);

  const seek = useCallback((t) => {
    if (audioEl.current) {
      audioEl.current.currentTime = t;
      setProgress(p => ({ ...p, current: t }));
    }
  }, []);

  const speak = useCallback(async (text, sid) => {
    // Ferma qualsiasi riproduzione in corso
    alive.current = false;
    if (audioEl.current) {
      audioEl.current.pause();
      audioEl.current.src = "";
      audioEl.current = null;
    }
    setProgress({ current: 0, duration: 0 });

    alive.current = true;
    setTtsState("loading");
    setTtsStopId(sid);

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error(`TTS error ${res.status}`);
      if (!alive.current) return;

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audioEl.current = audio;

      // ── AudioContext: mantiene audio attivo con schermo bloccato (iOS) ──
      try {
        if (!audioCtx.current || audioCtx.current.state === "closed") {
          audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.current.state === "suspended") {
          await audioCtx.current.resume();
        }
        const src = audioCtx.current.createMediaElementSource(audio);
        src.connect(audioCtx.current.destination);
      } catch (_) {
        // fallback silenzioso se AudioContext non supportato
      }

      // ── Media Session API: controlli lockscreen (iOS/Android) ──
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title:  "Guida Turistica AI",
          artist: "Tourist Guide AI",
          album:  "Itinerario in corso",
        });
        navigator.mediaSession.setActionHandler("play",  () => audio.play());
        navigator.mediaSession.setActionHandler("pause", () => audio.pause());
        navigator.mediaSession.setActionHandler("stop",  () => cancel());
        try {
          navigator.mediaSession.setActionHandler("seekto", (d) => {
            if (d.seekTime != null) seek(d.seekTime);
          });
        } catch (_) {}
      }

      audio.onplay = () => {
        if (!alive.current) return;
        setTtsState("speaking");
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "playing";
        }
      };

      audio.onpause = () => {
        if (!alive.current) return;
        setTtsState("paused");
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "paused";
        }
      };

      audio.onloadedmetadata = () => {
        setProgress(p => ({ ...p, duration: audio.duration || 0 }));
        if ("mediaSession" in navigator) {
          try {
            navigator.mediaSession.setPositionState({
              duration:     audio.duration || 0,
              playbackRate: audio.playbackRate,
              position:     audio.currentTime,
            });
          } catch (_) {}
        }
      };

      audio.ontimeupdate = () => {
        if (!alive.current) return;
        const cur = audio.currentTime;
        const dur = audio.duration || 0;
        setProgress({ current: cur, duration: dur });
        if ("mediaSession" in navigator && dur > 0) {
          try {
            navigator.mediaSession.setPositionState({
              duration:     dur,
              playbackRate: audio.playbackRate,
              position:     cur,
            });
          } catch (_) {}
        }
      };

      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (alive.current) {
          alive.current = false;
          setTtsState("idle");
          setTtsStopId(null);
          setProgress({ current: 0, duration: 0 });
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "none";
          }
        }
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        if (alive.current) {
          alive.current = false;
          setTtsState("idle");
          setTtsStopId(null);
          setProgress({ current: 0, duration: 0 });
        }
      };

      await audio.play();
    } catch (e) {
      if (alive.current) {
        alive.current = false;
        setTtsState("idle");
        setTtsStopId(null);
        setProgress({ current: 0, duration: 0 });
      }
    }
  }, [cancel, seek]);

  const pause  = useCallback(() => { audioEl.current?.pause(); }, []);
  const resume = useCallback(() => { audioEl.current?.play(); }, []);

  useEffect(() => () => {
    alive.current = false;
    audioEl.current?.pause();
  }, []);

  return { ttsState, ttsStopId, speak, pause, resume, stop: cancel, progress, seek };
}

function TTSPlayer({ text, stopId, label, tts }) {
  const { ttsState, ttsStopId, speak, pause, resume, stop, progress, seek } = tts;
  const mine    = ttsStopId === stopId;
  const loading  = mine && ttsState === "loading";
  const speaking = mine && ttsState === "speaking";
  const paused   = mine && ttsState === "paused";
  const active   = mine && ttsState !== "idle";
  const hasSeek  = active && !loading && progress.duration > 0;

  const onTap = () => {
    if (loading)  return;
    if (!mine)    { speak(text, stopId); return; }
    if (speaking) { pause(); return; }
    if (paused)   { resume(); return; }
    speak(text, stopId);
  };

  return (
    <div style={{
      background: active ? `${C.accent}18` : C.sky,
      border:`1.5px solid ${active ? C.accent : C.skyD}`,
      borderRadius:14, marginBottom:14, overflow:"hidden",
    }}>
      {/* Riga principale */}
      <div onClick={onTap} style={{
        display:"flex", alignItems:"center", gap:10,
        padding:"12px 14px",
        cursor: loading ? "wait" : "pointer",
        WebkitTapHighlightColor:"transparent", minHeight:50, userSelect:"none",
      }}>
        <div style={{
          width:38, height:38, minWidth:38, borderRadius:"50%",
          background: active ? C.accent : C.navy, color:"#fff",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:15, flexShrink:0,
        }}>
          {loading ? "…" : speaking ? "⏸" : "▶"}
        </div>
        <div style={{fontSize:13, color: active ? C.accentD : C.navy, fontWeight:"500", flex:1, lineHeight:1.4}}>
          {loading ? "Avvio audio…" : speaking ? `▶ ${label}` : paused ? `⏸ ${label}` : `Ascolta: ${label}`}
        </div>
        {speaking && (
          <div style={{display:"flex",alignItems:"center",gap:3}}>
            {[1,2,3,4,5].map(n=>(
              <div key={n} style={{width:3,borderRadius:2,background:C.accent,animation:`wave${n} 0.7s ease-in-out infinite`,animationDelay:`${(n-1)*0.1}s`}}/>
            ))}
          </div>
        )}
        {active && !loading && (
          <div onClick={e=>{e.stopPropagation();stop();}} style={{
            width:30,height:30,minWidth:30,borderRadius:"50%",
            background:C.navy,color:"#fff",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:11,cursor:"pointer",marginLeft:4,
          }}>■</div>
        )}
      </div>

      {/* Seek bar */}
      {hasSeek && (
        <div
          style={{padding:"0 14px 12px"}}
          onClick={e => e.stopPropagation()}
        >
          <input
            type="range"
            min={0}
            max={progress.duration}
            step={0.5}
            value={progress.current}
            onChange={e => seek(parseFloat(e.target.value))}
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            style={{
              width:"100%",
              accentColor: C.accent,
              cursor:"pointer",
              height:4,
              WebkitAppearance:"none",
              appearance:"none",
              background:`linear-gradient(to right, ${C.accent} ${(progress.current/progress.duration)*100}%, ${C.skyD} 0%)`,
              borderRadius:2,
              outline:"none",
            }}
          />
          <div style={{
            display:"flex", justifyContent:"space-between",
            fontSize:11, color:C.accentD, marginTop:4, fontWeight:"600",
          }}>
            <span>{fmt(progress.current)}</span>
            <span>−{fmt(Math.max(0, progress.duration - progress.current))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LAYOUT ───────────────────────────────────────────────────────
const rootStyle = {
  minHeight:"100vh", background:C.bg, color:C.text,
  fontFamily:FONT, maxWidth:480, margin:"0 auto", overflowX:"hidden",
};

function Header({step, label}) {
  return (
    <div style={{
      padding:"16px 20px 14px", borderBottom:`1px solid ${C.border}`,
      background:C.surface, position:"sticky", top:0, zIndex:100,
      boxShadow:"0 1px 8px rgba(27,42,74,0.07)",
    }}>
      {step && <div style={{fontSize:11,letterSpacing:"0.15em",color:C.accent,fontWeight:"700",textTransform:"uppercase",marginBottom:3}}>{step}</div>}
      <div style={{fontSize:20,fontWeight:"800",color:C.navy}}>{label}</div>
    </div>
  );
}

function Progress({step}) {
  return (
    <div style={{display:"flex",gap:6,marginBottom:28}}>
      {[1,2,3].map(i=>(
        <div key={i} style={{height:4,flex:1,borderRadius:4,background:i<=step?C.accent:C.border,transition:"background 0.3s"}}/>
      ))}
    </div>
  );
}

function AccentBtn({children, onClick, disabled}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width:"100%", background:C.accent, color:C.navy,
      border:"none", borderRadius:50, padding:"16px 20px",
      fontSize:15, fontWeight:"700", fontFamily:FONT,
      cursor:"pointer", opacity:disabled?0.4:1, letterSpacing:"0.01em",
    }}>{children}</button>
  );
}

function OutlineBtn({children, onClick}) {
  return (
    <button onClick={onClick} style={{
      width:"100%", background:"transparent", color:C.navy,
      border:`1.5px solid ${C.border}`, borderRadius:50, padding:"14px 20px",
      fontSize:14, fontWeight:"600", fontFamily:FONT,
      cursor:"pointer", marginTop:10, letterSpacing:"0.01em",
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

// ─── TRAVEL SEGMENT ───────────────────────────────────────────────
function TravelSegment({ travel }) {
  if (!travel) return null;
  const modeStr = (travel.mode_suggestion||"").toLowerCase();
  const modeIcon = modeStr.includes("piedi") ? "🚶"
    : modeStr.includes("bus") || modeStr.includes("autobus") ? "🚌"
    : modeStr.includes("taxi") ? "🚕"
    : modeStr.includes("bici") ? "🚲"
    : "🚶";
  const modeLabel = modeStr.includes("piedi") ? "A piedi"
    : modeStr.includes("bus") || modeStr.includes("autobus") ? "In autobus"
    : modeStr.includes("taxi") ? "In taxi"
    : modeStr.includes("bici") ? "In bici"
    : travel.mode_suggestion || "A piedi";

  return (
    <div style={{
      margin:"4px 0 4px",
      padding:"14px 16px",
      background:C.travel,
      border:`1px dashed ${C.travelB}`,
      borderRadius:14,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:(travel.route_note||travel.story_en_route)?10:0}}>
        <div style={{
          width:34,height:34,borderRadius:"50%",
          background:C.sky,border:`1.5px solid ${C.skyD}`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:16,flexShrink:0,
        }}>{modeIcon}</div>
        <div>
          <div style={{fontSize:13,fontWeight:"600",color:C.navy}}>
            {modeLabel}
            {travel.walking_min ? <span style={{color:C.muted,fontWeight:"400"}}> · {travel.walking_min} min</span> : null}
          </div>
          {travel.alternative && (
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>oppure: {travel.alternative}</div>
          )}
        </div>
      </div>
      {travel.route_note && (
        <div style={{fontSize:13,color:C.navyL,lineHeight:1.65,marginBottom:travel.story_en_route?8:0,paddingLeft:44}}>
          {travel.route_note}
        </div>
      )}
      {travel.story_en_route && (
        <div style={{
          fontSize:12,color:C.muted,fontStyle:"italic",lineHeight:1.65,
          paddingLeft:12,marginLeft:44,
          borderLeft:`2px solid ${C.accent}`,
        }}>
          {travel.story_en_route}
        </div>
      )}
    </div>
  );
}

// ─── WELCOME ──────────────────────────────────────────────────────
function WelcomeScreen({ onNext, savedCount, onOpenSaved }) {
  const inputRef = useRef(null);
  const go = useCallback(() => {
    const v = inputRef.current?.value?.trim();
    if (v) onNext(v);
  }, [onNext]);

  return (
    <div style={{...rootStyle,display:"flex",flexDirection:"column",justifyContent:"center",padding:"24px 20px",minHeight:"100vh"}}>
      <div style={{textAlign:"center",marginBottom:48}}>
        <div style={{
          width:80,height:80,borderRadius:"50%",
          background:C.accent,margin:"0 auto 20px",
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:38,boxShadow:`0 8px 24px ${C.accent}40`,
        }}>🧭</div>
        <div style={{fontSize:12,letterSpacing:"0.25em",color:C.accent,fontWeight:"700",textTransform:"uppercase",marginBottom:12}}>
          La tua guida culturale
        </div>
        <h1 style={{fontSize:32,margin:"0 0 12px",lineHeight:1.2,fontWeight:"800",color:C.navy}}>
          Scopri l'Italia<br/>come mai prima
        </h1>
        <p style={{color:C.muted,fontSize:14,lineHeight:1.6,margin:0}}>
          Itinerario su misura · Guida AI · Navigazione
        </p>
      </div>
      <label style={{fontSize:12,color:C.navy,fontWeight:"700",letterSpacing:"0.05em",textTransform:"uppercase",display:"block",marginBottom:10}}>
        Dove vuoi andare?
      </label>
      <input
        ref={inputRef}
        type="text"
        defaultValue=""
        placeholder="es. Viterbo, Orvieto, Roma…"
        onKeyDown={e => e.key === "Enter" && go()}
        style={{
          width:"100%",background:C.surface,border:`2px solid ${C.border}`,
          borderRadius:14,padding:"15px 18px",color:C.navy,fontSize:16,
          fontFamily:FONT,outline:"none",boxSizing:"border-box",marginBottom:16,
          boxShadow:"0 2px 8px rgba(27,42,74,0.06)",
        }}
      />
      <AccentBtn onClick={go}>Inizia il viaggio →</AccentBtn>
      {savedCount > 0 && (
        <button onClick={onOpenSaved} style={{
          marginTop:14, width:"100%", background:"transparent",
          border:`1.5px solid ${C.navy}`, borderRadius:50, padding:"14px 20px",
          fontSize:14, fontWeight:"600", fontFamily:FONT,
          cursor:"pointer", color:C.navy, letterSpacing:"0.01em",
          display:"flex", alignItems:"center", justifyContent:"center", gap:8,
        }}>
          <span>📂</span>
          <span>Itinerari salvati ({savedCount})</span>
        </button>
      )}
    </div>
  );
}

// ─── SAVED SCREEN ─────────────────────────────────────────────────
function SavedScreen({ saved, onLoad, onDelete, onBack }) {
  return (
    <div style={rootStyle}>
      <Header label="Itinerari salvati" />
      <div style={{padding:"20px"}}>
        {saved.length === 0 ? (
          <div style={{textAlign:"center",padding:"48px 20px",color:C.muted}}>
            <div style={{fontSize:40,marginBottom:16}}>📭</div>
            <div style={{fontSize:15}}>Nessun itinerario salvato.</div>
          </div>
        ) : saved.map(entry => (
          <div key={entry.id} style={{
            background:C.surface,
            border:`1.5px solid ${C.border}`,
            borderRadius:16, marginBottom:12, overflow:"hidden",
            boxShadow:"0 2px 8px rgba(27,42,74,0.07)",
          }}>
            <div style={{padding:"16px 18px"}}>
              <div style={{
                display:"flex", alignItems:"flex-start",
                justifyContent:"space-between", gap:12,
              }}>
                <div style={{flex:1}}>
                  <div style={{fontSize:17,fontWeight:"800",color:C.navy,marginBottom:4}}>
                    {entry.city}
                  </div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:8}}>
                    {entry.duration} · {entry.pace} · {entry.itinerary?.stops?.length} tappe
                  </div>
                  <div style={{fontSize:11,color:C.dim}}>
                    Salvato il {new Date(entry.savedAt).toLocaleDateString("it-IT",{day:"numeric",month:"long",year:"numeric"})}
                  </div>
                </div>
                <button
                  onClick={() => onDelete(entry.id)}
                  style={{
                    background:"#FEF2F2", border:"1px solid #FCA5A5",
                    borderRadius:8, padding:"6px 10px",
                    fontSize:12, color:C.red, cursor:"pointer",
                    fontFamily:FONT, fontWeight:"600", flexShrink:0,
                  }}
                >
                  🗑
                </button>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10}}>
                {entry.interests?.slice(0,4).map(id => {
                  const it = INTERESTS.find(i=>i.id===id);
                  return it ? (
                    <span key={id} style={{
                      background:C.sky,border:`1px solid ${C.skyD}`,
                      borderRadius:20,padding:"3px 10px",
                      fontSize:11,color:C.navy,fontWeight:"600",
                    }}>{it.emoji} {it.label}</span>
                  ) : null;
                })}
              </div>
            </div>
            <div style={{padding:"0 18px 16px"}}>
              <button onClick={() => onLoad(entry)} style={{
                width:"100%", background:C.navy, color:"#fff",
                border:"none", borderRadius:50, padding:"13px 16px",
                fontSize:14, fontWeight:"700", fontFamily:FONT,
                cursor:"pointer",
              }}>
                Apri itinerario →
              </button>
            </div>
          </div>
        ))}
        <OutlineBtn onClick={onBack}>← Torna alla home</OutlineBtn>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────
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
  const [saved,       setSaved]       = useState(() => loadSavedItineraries());
  const [saveMsg,     setSaveMsg]     = useState("");
  const chatEndRef = useRef(null);
  const tts = useTTS();

  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = `
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      @keyframes wave1{0%,100%{height:4px}50%{height:18px}}
      @keyframes wave2{0%,100%{height:8px}50%{height:22px}}
      @keyframes wave3{0%,100%{height:14px}50%{height:6px}}
      @keyframes wave4{0%,100%{height:6px}50%{height:20px}}
      @keyframes wave5{0%,100%{height:10px}50%{height:4px}}
      @keyframes saveFlash{0%{opacity:0;transform:translateY(6px)}20%{opacity:1;transform:translateY(0)}80%{opacity:1}100%{opacity:0}}
      *{box-sizing:border-box} body{margin:0;background:${C.bg}}
      input:focus{border-color:${C.accent}!important;outline:none;box-shadow:0 0 0 3px ${C.accent}22!important}
      ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
      input[type=range]{-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;outline:none;cursor:pointer;}
      input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:${C.accent};cursor:pointer;margin-top:-7px;}
      input[type=range]::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:${C.accent};cursor:pointer;border:none;}
    `;
    document.head.appendChild(s);
    return () => document.head.removeChild(s);
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [chatMsgs, activeStop]);

  const toggle = id => setInterests(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);

  // ── Salva itinerario corrente ─────────────────────────────────
  const saveItinerary = () => {
    if (!itinerary) return;
    const entry = {
      id:         Date.now(),
      savedAt:    new Date().toISOString(),
      city,
      duration,
      pace,
      interests,
      itinerary,
      stopDetails,
    };
    const updated = [entry, ...saved].slice(0, 15); // max 15 salvati
    setSaved(updated);
    persistSaved(updated);
    setSaveMsg("✓ Itinerario salvato!");
    setTimeout(() => setSaveMsg(""), 2500);
  };

  // ── Carica itinerario salvato ─────────────────────────────────
  const loadSaved = (entry) => {
    tts.stop();
    setCity(entry.city);
    setDuration(entry.duration);
    setPace(entry.pace);
    setInterests(entry.interests || []);
    setItinerary(entry.itinerary);
    setStopDetails(entry.stopDetails || {});
    setActiveStop(null);
    setChatMsgs({});
    setScreen("itinerary");
  };

  // ── Elimina itinerario salvato ────────────────────────────────
  const deleteSaved = (id) => {
    const updated = saved.filter(e => e.id !== id);
    setSaved(updated);
    persistSaved(updated);
  };

  const generate = async () => {
    setScreen("generating"); setError("");
    try {
      const iL = interests.map(id=>INTERESTS.find(i=>i.id===id)?.label).join(", ");
      const dL = DURATIONS.find(d=>d.id===duration)?.label;
      const pL = PACES.find(p=>p.id===pace)?.label;
      const n  = {["2h"]:"3-4",["4h"]:"4-6",["1d"]:"6-8",["2d"]:"10-14",["3d"]:"14-18"}[duration];
      const sys = "Sei un esperto di turismo culturale italiano. Rispondi SOLO con JSON valido, zero markdown.";
      const msg = `Crea un itinerario per ${city}. Durata: ${dL}. Ritmo: ${pL}. Interessi: ${iL}.

Restituisci SOLO questo JSON (${n} tappe reali con coordinate precise):
{
  "city": "",
  "tagline": "una frase poetica e coinvolgente sulla città, non banale",
  "duration": "${dL}",
  "pace": "${pL}",
  "interests": [],
  "stops": [
    {
      "id": 1,
      "name": "",
      "type": "attraction|museum|restaurant|church|piazza",
      "address": "",
      "coords": {"lat": 0.0, "lng": 0.0},
      "duration_min": 45,
      "shortDesc": "Una frase evocativa, non descrittiva, che faccia venir voglia di andare lì.",
      "highlights": ["elemento notevole 1", "elemento notevole 2"],
      "travel_from_prev": null
    },
    {
      "id": 2,
      "name": "",
      "type": "",
      "address": "",
      "coords": {"lat": 0.0, "lng": 0.0},
      "duration_min": 60,
      "shortDesc": "",
      "highlights": [],
      "travel_from_prev": {
        "walking_min": 8,
        "mode_suggestion": "piedi",
        "alternative": "taxi (3 min, ~5€)",
        "route_note": "Descrizione vivida del percorso a piedi: cosa si vede, un'indicazione specifica (es: 'Gira a sinistra su via X, passando sotto l'arco medievale').",
        "story_en_route": "Un aneddoto o fatto curioso sul quartiere che si attraversa durante il tragitto."
      }
    }
  ],
  "tips": "Un consiglio pratico utile e non scontato."
}

REGOLE IMPORTANTI:
- travel_from_prev deve essere null SOLO per la prima tappa.
- Per tutte le altre tappe includi sempre travel_from_prev con dati reali.
- Calcola walking_min in base alla distanza reale tra le coordinate delle due tappe (1 minuto ogni 80 metri a piedi circa).
- Se la distanza è > 1km suggerisci taxi o bus come mode_suggestion alternativo.`;

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
      const sys = "Sei una guida turistica italiana esperta, appassionata e poetica. Rispondi SOLO con JSON valido, zero markdown.";
      const msg = `Il visitatore si trova davanti a "${stop.name}" a ${itinerary.city}. Interessi: ${iL}.

Restituisci SOLO questo JSON:
{
  "intro": "Apertura intima e poetica in prima persona plurale (noi), come se stessi parlando a un amico speciale. 2-3 frasi che facciano sentire il visitatore privilegiato di trovarsi qui. Inizia con qualcosa di diverso da 'Benvenuti'. Es: 'Eccoci qui, uno di quei rari momenti in cui...'",
  "story": "La storia narrata come un racconto vivido, non come un'enciclopedia. 3-4 frasi in presente storico che rivelino qualcosa di inaspettato o commovente. Rendi tutto vivo e personale.",
  "observation_guide": [
    "Prima istruzione specifica su cosa guardare con indicazione precisa di posizione: es. 'Fermati qui, sulla soglia, e prima ancora di entrare alza lo sguardo: nota in alto a destra la statua di...' oppure 'Avvicinati alla colonna di sinistra: se guardi da vicino, vedrai...'",
    "Seconda istruzione: un dettaglio nascosto o meno ovvio che quasi nessuno nota, con posizione precisa: 'Nel dipinto centrale, nell'angolo in basso a sinistra, c'è una figura misteriosa che...'",
    "Terza istruzione sensoriale: invita a fare un'esperienza fisica specifica: 'Siediti su quella panchina al centro e chiudi gli occhi per un momento...' oppure 'Tocca questa pietra: senti come...'"
  ],
  "curiosity": "Una curiosità sorprendente, quasi un segreto che pochissimi conoscono. 2-3 frasi che lascino a bocca aperta.",
  "practical": "Informazioni pratiche essenziali: orari, prezzo biglietto, consiglio su quando visitare per evitare la folla."
}`;
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
      const sys = `Sei una guida turistica esperta a ${itinerary.city}, ora accanto al visitatore presso "${stop.name}". Parla come un amico colto e appassionato, non come un manuale. Usa il "tu". Contesto: ${detail?.story||stop.shortDesc}. Interessi: ${interests.map(id=>INTERESTS.find(i=>i.id===id)?.label).join(", ")}. Rispondi in italiano, max 120 parole, tono caldo e personale.`;
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

  // ── SCREENS ────────────────────────────────────────────────────

  if (screen === "welcome") return (
    <WelcomeScreen
      onNext={c => { setCity(c); setScreen("interests"); }}
      savedCount={saved.length}
      onOpenSaved={() => setScreen("saved")}
    />
  );

  if (screen === "saved") return (
    <SavedScreen
      saved={saved}
      onLoad={loadSaved}
      onDelete={deleteSaved}
      onBack={() => setScreen("welcome")}
    />
  );

  if (screen === "interests") return (
    <div style={rootStyle}>
      <Header step="Passo 1 di 3" label={city}/>
      <div style={{padding:"24px 20px"}}>
        <Progress step={1}/>
        <h2 style={{fontSize:26,fontWeight:"800",marginBottom:6,color:C.navy}}>Cosa ti appassiona?</h2>
        <p style={{fontSize:14,color:C.muted,marginBottom:28,lineHeight:1.5}}>Seleziona uno o più interessi.</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:28}}>
          {INTERESTS.map(it => {
            const sel = interests.includes(it.id);
            return (
              <div key={it.id} onClick={()=>toggle(it.id)} style={{
                background: sel ? C.accent : C.surface,
                border:`2px solid ${sel ? C.accent : C.border}`,
                borderRadius:14, padding:"14px", cursor:"pointer",
                display:"flex", alignItems:"center", gap:10,
                color: sel ? C.navy : C.text,
                WebkitTapHighlightColor:"transparent",
                boxShadow: sel ? `0 4px 12px ${C.accent}35` : "0 1px 4px rgba(27,42,74,0.06)",
                transition:"all 0.15s",
              }}>
                <span style={{fontSize:20}}>{it.emoji}</span>
                <span style={{fontSize:13,fontWeight:sel?"700":"400"}}>{it.label}</span>
              </div>
            );
          })}
        </div>
        <AccentBtn onClick={()=>setScreen("duration")} disabled={!interests.length}>Avanti →</AccentBtn>
        <OutlineBtn onClick={()=>setScreen("welcome")}>← Indietro</OutlineBtn>
      </div>
    </div>
  );

  if (screen === "duration") return (
    <div style={rootStyle}>
      <Header step="Passo 2 di 3" label={city}/>
      <div style={{padding:"24px 20px"}}>
        <Progress step={2}/>
        <h2 style={{fontSize:26,fontWeight:"800",marginBottom:6,color:C.navy}}>Quanto tempo hai?</h2>
        <p style={{fontSize:14,color:C.muted,marginBottom:28,lineHeight:1.5}}>Ottimizzeremo il numero di tappe.</p>
        {DURATIONS.map(d => (
          <div key={d.id} onClick={()=>setDuration(d.id)} style={{
            background: duration===d.id ? C.sky : C.surface,
            border:`2px solid ${duration===d.id ? C.accent : C.border}`,
            borderRadius:14, padding:"16px 18px", cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"space-between",
            marginBottom:10, WebkitTapHighlightColor:"transparent",
            boxShadow:"0 1px 4px rgba(27,42,74,0.06)", transition:"all 0.15s",
          }}>
            <div>
              <div style={{fontWeight:"700",fontSize:15,color:C.navy}}>{d.label}</div>
              <div style={{fontSize:12,color:C.muted,marginTop:3}}>{d.desc}</div>
            </div>
            {duration===d.id && (
              <div style={{width:24,height:24,borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:"bold",color:C.navy}}>✓</div>
            )}
          </div>
        ))}
        <div style={{marginTop:16}}/>
        <AccentBtn onClick={()=>setScreen("pace")} disabled={!duration}>Avanti →</AccentBtn>
        <OutlineBtn onClick={()=>setScreen("interests")}>← Indietro</OutlineBtn>
      </div>
    </div>
  );

  if (screen === "pace") return (
    <div style={rootStyle}>
      <Header step="Passo 3 di 3" label={city}/>
      <div style={{padding:"24px 20px"}}>
        <Progress step={3}/>
        <h2 style={{fontSize:26,fontWeight:"800",marginBottom:6,color:C.navy}}>Che ritmo preferisci?</h2>
        <p style={{fontSize:14,color:C.muted,marginBottom:28,lineHeight:1.5}}>Quanto vuoi immergerti in ogni luogo?</p>
        {PACES.map(p => (
          <div key={p.id} onClick={()=>setPace(p.id)} style={{
            background: pace===p.id ? C.sky : C.surface,
            border:`2px solid ${pace===p.id ? C.accent : C.border}`,
            borderRadius:14, padding:"16px 18px", cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"space-between",
            marginBottom:10, WebkitTapHighlightColor:"transparent",
            boxShadow:"0 1px 4px rgba(27,42,74,0.06)", transition:"all 0.15s",
          }}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <span style={{fontSize:28}}>{p.emoji}</span>
              <div>
                <div style={{fontWeight:"700",fontSize:15,color:C.navy}}>{p.label}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:3}}>{p.desc}</div>
              </div>
            </div>
            {pace===p.id && (
              <div style={{width:24,height:24,borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:"bold",color:C.navy}}>✓</div>
            )}
          </div>
        ))}
        {error && (
          <div style={{color:C.red,fontSize:13,marginBottom:12,marginTop:8,padding:"10px 14px",background:"#FEF2F2",borderRadius:10,border:`1px solid #FCA5A5`}}>
            {error}
          </div>
        )}
        <div style={{marginTop:16}}/>
        <AccentBtn onClick={generate} disabled={!pace}>Genera il mio itinerario ✦</AccentBtn>
        <OutlineBtn onClick={()=>setScreen("duration")}>← Indietro</OutlineBtn>
      </div>
    </div>
  );

  if (screen === "generating") return (
    <div style={{...rootStyle,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:"24px"}}>
      <Spinner/>
      <div style={{fontSize:40,margin:"22px 0 12px"}}>🗺️</div>
      <div style={{color:C.navy,fontSize:16,fontWeight:"700",textAlign:"center",lineHeight:1.7}}>
        Sto studiando {city}…
      </div>
      <div style={{color:C.muted,fontSize:14,textAlign:"center",lineHeight:1.7,marginTop:6}}>
        Preparo il tuo itinerario su misura.<br/>
        <span style={{color:C.accent,fontWeight:"600"}}>Un momento.</span>
      </div>
    </div>
  );

  if (screen === "itinerary" && itinerary) return (
    <div style={rootStyle}>
      <Header label={itinerary.city}/>
      <div style={{padding:"20px"}}>

        {/* Hero card navy */}
        <div style={{
          background:C.navy, borderRadius:20, padding:"22px 20px", marginBottom:24,
          boxShadow:`0 8px 24px rgba(27,42,74,0.2)`,
        }}>
          <div style={{fontSize:15,color:C.accentL,fontStyle:"italic",lineHeight:1.65,marginBottom:14}}>
            "{itinerary.tagline}"
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
            {[`⏱ ${itinerary.duration}`,`🚶 ${itinerary.pace}`,`📍 ${itinerary.stops?.length} tappe`].map(b=>(
              <span key={b} style={{
                background:`${C.accent}22`,border:`1px solid ${C.accentD}`,
                borderRadius:20,padding:"5px 14px",fontSize:12,color:C.accentL,fontWeight:"600",
              }}>{b}</span>
            ))}
          </div>

          {/* Pulsante salva */}
          <button onClick={saveItinerary} style={{
            width:"100%", background:`${C.accent}22`,
            border:`1.5px solid ${C.accent}`,
            borderRadius:50, padding:"11px 16px",
            fontSize:13, fontWeight:"700", color:C.accentL,
            fontFamily:FONT, cursor:"pointer", letterSpacing:"0.01em",
            marginBottom: itinerary.tips ? 14 : 0,
          }}>
            💾 Salva itinerario
          </button>

          {saveMsg && (
            <div style={{
              fontSize:12, color:"#4ADE80", textAlign:"center",
              marginTop:6, animation:"saveFlash 2.5s ease forwards",
              fontWeight:"600",
            }}>
              {saveMsg}
            </div>
          )}

          {itinerary.tips && (
            <div style={{fontSize:13,color:"rgba(255,255,255,0.65)",lineHeight:1.6,borderTop:`1px solid rgba(255,255,255,0.1)`,paddingTop:14}}>
              💡 {itinerary.tips}
            </div>
          )}
        </div>

        {/* Stops */}
        {itinerary.stops?.map((stop, stopIdx) => {
          const isOpen  = activeStop === stop.id;
          const detail  = stopDetails[stop.id];
          const loading = loadingDet === stop.id;
          const msgs    = chatMsgs[stop.id] || [];
          const obsGuide = detail?.observation_guide || detail?.toSee || [];

          return (
            <div key={stop.id} style={{animation:`fadeIn 0.3s ease ${stopIdx*0.05}s both`}}>

              {/* Travel segment prima di questa tappa */}
              {stop.travel_from_prev && <TravelSegment travel={stop.travel_from_prev}/>}

              {/* Stop card */}
              <div style={{
                background:C.surface,
                border:`2px solid ${isOpen ? C.accent : C.border}`,
                borderRadius:16, marginBottom:8, overflow:"hidden",
                boxShadow: isOpen ? `0 4px 18px ${C.accent}28` : "0 2px 8px rgba(27,42,74,0.07)",
                transition:"border-color 0.2s, box-shadow 0.2s",
              }}>
                <div onClick={()=>toggleStop(stop)} style={{padding:"16px 18px",display:"flex",alignItems:"center",gap:14,cursor:"pointer",WebkitTapHighlightColor:"transparent"}}>
                  <div style={{
                    width:36,height:36,borderRadius:"50%",
                    background: isOpen ? C.accent : C.navy,
                    color: isOpen ? C.navy : "#fff",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:14,fontWeight:"700",flexShrink:0,
                  }}>{stopIdx+1}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:"700",marginBottom:3,color:C.navy}}>{stop.name}</div>
                    <div style={{fontSize:12,color:C.muted}}>{stop.type} · {stop.duration_min} min</div>
                  </div>
                  <div style={{
                    color:isOpen?C.accent:C.dim,fontSize:22,
                    transition:"transform 0.25s",transform:isOpen?"rotate(90deg)":"none",
                  }}>›</div>
                </div>

                {isOpen && (
                  <div style={{padding:"0 18px 22px",borderTop:`1px solid ${C.border}`}}>
                    <div style={{fontSize:14,color:C.muted,lineHeight:1.75,marginTop:14,marginBottom:16}}>{stop.shortDesc}</div>

                    {stop.highlights?.length > 0 && (
                      <div style={{marginBottom:18}}>
                        {stop.highlights.map((h,i)=>(
                          <div key={i} style={{fontSize:13,color:C.text,marginBottom:7,display:"flex",gap:10,alignItems:"flex-start"}}>
                            <span style={{color:C.accent,fontWeight:"bold",flexShrink:0,marginTop:2}}>✦</span>
                            <span style={{lineHeight:1.55}}>{h}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <a href={mapsUrl(stop)} target="_blank" rel="noopener noreferrer" style={{
                      display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                      background:"#1A73E8",color:"#fff",
                      borderRadius:50,padding:"13px 16px",
                      fontSize:14,fontWeight:"700",textDecoration:"none",marginBottom:20,
                      boxShadow:"0 3px 10px rgba(26,115,232,0.3)",
                    }}>
                      🗺 Naviga con Google Maps
                    </a>

                    <div style={{height:1,background:C.border,marginBottom:20}}/>

                    {loading ? (
                      <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0"}}>
                        <Spinner small/><span style={{fontSize:13,color:C.muted}}>Carico la scheda guida…</span>
                      </div>
                    ) : detail && !detail.error ? (
                      <div>
                        <div style={{fontSize:11,letterSpacing:"0.15em",color:C.accent,fontWeight:"700",textTransform:"uppercase",marginBottom:14}}>
                          📖 GUIDA
                        </div>

                        <TTSPlayer text={`${detail.intro} ${detail.story}`} stopId={`${stop.id}-main`} label="Introduzione e storia" tts={tts}/>

                        <div style={{
                          fontSize:15,color:C.navy,lineHeight:1.8,marginBottom:16,
                          fontStyle:"italic",fontWeight:"500",
                          padding:"16px 18px",
                          background:C.sky,borderRadius:14,
                          borderLeft:`4px solid ${C.accent}`,
                        }}>{detail.intro}</div>

                        <div style={{fontSize:14,color:C.text,lineHeight:1.85,marginBottom:22}}>{detail.story}</div>

                        {obsGuide.length > 0 && (
                          <div style={{marginBottom:22}}>
                            <div style={{
                              display:"inline-flex",alignItems:"center",gap:6,
                              background:C.navy,color:"#fff",
                              borderRadius:8,padding:"5px 12px",
                              fontSize:11,fontWeight:"700",letterSpacing:"0.12em",textTransform:"uppercase",
                              marginBottom:14,
                            }}>
                              <span>👁</span><span>Cosa osservare</span>
                            </div>
                            {obsGuide.map((t,i)=>(
                              <div key={i} style={{
                                fontSize:13,color:C.text,marginBottom:10,
                                display:"flex",gap:12,alignItems:"flex-start",
                                padding:"12px 14px",
                                background: i%2===0 ? C.sky : C.surface,
                                border:`1px solid ${i%2===0 ? C.skyD : C.border}`,
                                borderRadius:12,lineHeight:1.65,
                              }}>
                                <div style={{
                                  background:C.navy,color:"#fff",
                                  borderRadius:"50%",width:22,height:22,minWidth:22,
                                  display:"flex",alignItems:"center",justifyContent:"center",
                                  fontSize:11,fontWeight:"700",flexShrink:0,marginTop:1,
                                }}>{i+1}</div>
                                <span>{t}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {detail.curiosity && (
                          <>
                            <div style={{
                              background:`linear-gradient(135deg,${C.accent}15,${C.sky})`,
                              border:`1.5px solid ${C.accent}55`,
                              borderRadius:14,padding:"14px 16px",marginBottom:10,
                            }}>
                              <div style={{fontSize:11,color:C.accentD,fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:7}}>
                                💡 Lo sapevi?
                              </div>
                              <div style={{fontSize:13,color:C.navy,lineHeight:1.7}}>{detail.curiosity}</div>
                            </div>
                            <TTSPlayer text={`Lo sapevi? ${detail.curiosity}`} stopId={`${stop.id}-curiosity`} label="Curiosità" tts={tts}/>
                          </>
                        )}

                        {detail.practical && (
                          <div style={{
                            fontSize:12,color:C.muted,lineHeight:1.65,marginBottom:20,
                            padding:"10px 14px",background:`${C.border}50`,borderRadius:10,
                          }}>🕐 {detail.practical}</div>
                        )}

                        <div style={{marginTop:18,background:C.bg,borderRadius:16,padding:16,border:`1.5px solid ${C.border}`}}>
                          <div style={{fontSize:11,letterSpacing:"0.15em",color:C.navy,fontWeight:"700",textTransform:"uppercase",marginBottom:12}}>
                            💬 CHIEDI ALLA GUIDA
                          </div>
                          {msgs.length > 0 && (
                            <div style={{maxHeight:220,overflowY:"auto",marginBottom:12,display:"flex",flexDirection:"column",gap:8}}>
                              {msgs.map((m,i)=>(
                                <div key={i} style={{display:"flex",flexDirection:"column",alignSelf:m.role==="assistant"?"flex-start":"flex-end",maxWidth:"92%"}}>
                                  <div style={{
                                    background:m.role==="assistant"?C.surface:C.navy,
                                    border:`1.5px solid ${m.role==="assistant"?C.border:C.navy}`,
                                    borderRadius:12,padding:"10px 14px",
                                    fontSize:13,color:m.role==="assistant"?C.text:"#fff",
                                    lineHeight:1.6,
                                    boxShadow:"0 1px 4px rgba(27,42,74,0.08)",
                                  }}>{m.content}</div>
                                  {m.role==="assistant" && (
                                    <button onClick={()=>tts.speak(m.content,`chat-${stop.id}-${i}`)} style={{
                                      fontSize:11,color:C.accent,background:"none",border:"none",
                                      cursor:"pointer",padding:"4px 4px",textAlign:"left",fontWeight:"600",
                                    }}>
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
                              style={{
                                flex:1,background:C.surface,
                                border:`1.5px solid ${C.border}`,
                                borderRadius:50,padding:"10px 16px",
                                color:C.navy,fontSize:13,fontFamily:FONT,outline:"none",
                              }}
                              placeholder="Fai una domanda…"
                              value={chatInput}
                              onChange={e=>setChatInput(e.target.value)}
                              onKeyDown={e=>e.key==="Enter"&&sendChat(stop.id)}
                            />
                            <button onClick={()=>sendChat(stop.id)} disabled={chatLoading} style={{
                              background:C.navy,color:"#fff",border:"none",
                              borderRadius:50,padding:"10px 18px",
                              fontWeight:"700",cursor:"pointer",fontSize:14,
                              opacity:chatLoading?0.5:1,minWidth:46,
                            }}>
                              {chatLoading?"…":"→"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : detail?.error ? (
                      <div style={{fontSize:13,color:C.red,padding:"10px 14px",background:"#FEF2F2",borderRadius:10,border:`1px solid #FCA5A5`}}>
                        Errore nel caricamento. Tocca di nuovo la tappa.
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div style={{marginTop:28,marginBottom:52}}>
          <OutlineBtn onClick={resetAll}>← Nuovo itinerario</OutlineBtn>
        </div>
      </div>
    </div>
  );

  return null;
}
