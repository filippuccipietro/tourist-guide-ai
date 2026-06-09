import { useState, useRef, useEffect, useCallback } from "react";

// ─── DESIGN TOKENS (GuidaMe brand) ────────────────────────────────
const C = {
  bg:      "#F5EFE6",  // Sabbia Calda
  surface: "#FFFFFF",
  card:    "#FFFFFF",
  border:  "#E5D8C8",
  accent:  "#C0392B",  // Terracotta
  accentL: "#E8584A",
  accentD: "#8B2419",
  navy:    "#1C2B4A",  // Navy
  navyL:   "#2D4570",
  sky:     "#FDF6EF",
  skyD:    "#DFC5A8",
  text:    "#1C2B4A",
  muted:   "#7A6F65",
  dim:     "#B5A99A",
  red:     "#C0392B",
  gold:    "#D4A017",
  travel:  "#FBF4EC",
  travelB: "#DFC5A8",
};

const FONT         = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
const FONT_HEADING = "'Playfair Display', Georgia, serif";

// ─── DATA ─────────────────────────────────────────────────────────
const INTERESTS = [
  {id:"architettura",label:"Architettura",emoji:"🏛️"},
  {id:"pittura",     label:"Pittura",     emoji:"🎨"},
  {id:"scultura",    label:"Scultura",    emoji:"🗿"},
  {id:"antropologia",label:"Antropologia",emoji:"🏺"},
  {id:"storia",      label:"Storia",      emoji:"📜"},
  {id:"gastronomia", label:"Gastronomia", emoji:"🍷"},
  {id:"natura",      label:"Natura",      emoji:"🌿"},
  {id:"archeologia", label:"Archeologia", emoji:"⛏️"},
  {id:"musica",      label:"Musica & Teatro",emoji:"🎭"},
  {id:"religione",   label:"Arte Sacra",  emoji:"⛪"},
];
const DURATIONS = [
  {id:"2h", label:"2 ore",          desc:"Visita rapida"},
  {id:"4h", label:"Mezza giornata", desc:"4 ore"},
  {id:"1d", label:"1 giorno",       desc:"Giornata intera"},
  {id:"2d", label:"2 giorni",       desc:"Weekend"},
  {id:"3d", label:"3+ giorni",      desc:"Soggiorno esteso"},
];
const PACES = [
  {id:"rilassato", label:"Rilassato",  emoji:"🧘", desc:"Poche tappe, molta profondità"},
  {id:"bilanciato",label:"Bilanciato", emoji:"🚶", desc:"Il meglio senza stress"},
  {id:"intenso",   label:"Intenso",    emoji:"🏃", desc:"Massimizza le visite"},
];

// ─── LOCAL STORAGE ────────────────────────────────────────────────
const LS_KEY = "guidame_v2";

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
async function callClaude(messages, sys, model) {
  const r = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      max_tokens: 5000,
      system: sys,
      messages,
      model: model || "claude-haiku-4-5-20251001",
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(typeof d.error === "string" ? d.error : (d.error?.message || "API error"));
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
  const [ttsState,        setTtsState]        = useState("idle");
  const [ttsStopId,       setTtsStopId]       = useState(null);
  const [ttsError,        setTtsError]        = useState(null);
  const [lastFailedId,    setLastFailedId]     = useState(null);
  const [progress,        setProgress]        = useState({ current: 0, duration: 0 });
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
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
  }, []);

  const seek = useCallback((t) => {
    if (audioEl.current) {
      audioEl.current.currentTime = t;
      setProgress(p => ({ ...p, current: t }));
    }
  }, []);

  const speak = useCallback(async (text, sid) => {
    alive.current = false;
    if (audioEl.current) {
      audioEl.current.pause();
      audioEl.current.src = "";
      audioEl.current = null;
    }
    setProgress({ current: 0, duration: 0 });
    setTtsError(null);
    setLastFailedId(null);

    alive.current = true;
    setTtsState("loading");
    setTtsStopId(sid);

    // ── AudioContext: resume sincrono nel contesto del click utente (prima del fetch) ──
    try {
      if (!audioCtx.current || audioCtx.current.state === "closed") {
        audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.current.state === "suspended") {
        audioCtx.current.resume(); // fire-and-forget: non await, eseguito nel contesto click
      }
    } catch (_) {}

    // Timeout 15 secondi per evitare il blocco della CTA
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`TTS ${res.status}`);
      if (!alive.current) return;

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioEl.current = audio;

      // ── AudioContext: connetti solo se già in running state ──
      try {
        if (audioCtx.current && audioCtx.current.state === "running") {
          const src = audioCtx.current.createMediaElementSource(audio);
          src.connect(audioCtx.current.destination);
        }
      } catch (_) {}

      // ── Media Session API: controlli lockscreen ──
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title:  "GuidaMe",
          artist: "GuidaMe AI",
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
        if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
      };
      audio.onpause = () => {
        if (!alive.current) return;
        setTtsState("paused");
        if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
      };
      audio.onloadedmetadata = () => {
        setProgress(p => ({ ...p, duration: audio.duration || 0 }));
        if ("mediaSession" in navigator) {
          try {
            navigator.mediaSession.setPositionState({
              duration: audio.duration || 0,
              playbackRate: audio.playbackRate,
              position: audio.currentTime,
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
              duration: dur, playbackRate: audio.playbackRate, position: cur,
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
          if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
        }
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        if (alive.current) {
          alive.current = false;
          setTtsState("idle");
          setTtsStopId(null);
          setProgress({ current: 0, duration: 0 });
          setTtsError("Errore nella riproduzione.");
          setLastFailedId(sid);
        }
      };

      await audio.play();
    } catch (e) {
      clearTimeout(timeoutId);
      if (alive.current) {
        alive.current = false;
        setTtsState("idle");
        setTtsStopId(null);
        setProgress({ current: 0, duration: 0 });
        setTtsError(e.name === "AbortError"
          ? "Timeout: audio non disponibile. Riprova."
          : `Audio non disponibile [${e.name}: ${e.message}]. Riprova.`);
        setLastFailedId(sid);
      }
    }
  }, [cancel, seek]);

  const pause  = useCallback(() => { audioEl.current?.pause(); }, []);
  const resume = useCallback(() => { audioEl.current?.play(); }, []);

  useEffect(() => () => {
    alive.current = false;
    audioEl.current?.pause();
  }, []);

  return { ttsState, ttsStopId, ttsError, lastFailedId, speak, pause, resume, stop: cancel, progress, seek };
}

// ─── TTS PLAYER ───────────────────────────────────────────────────
function TTSPlayer({ text, stopId, label, tts }) {
  const { ttsState, ttsStopId, ttsError, lastFailedId, speak, pause, resume, stop, progress, seek } = tts;
  const mine    = ttsStopId === stopId;
  const loading  = mine && ttsState === "loading";
  const speaking = mine && ttsState === "speaking";
  const paused   = mine && ttsState === "paused";
  const active   = mine && ttsState !== "idle";
  const hasSeek  = active && !loading && progress.duration > 0;
  const hasFailed = !active && lastFailedId === stopId && ttsError;

  const onTap = () => {
    if (loading)  return;
    if (!mine)    { speak(text, stopId); return; }
    if (speaking) { pause(); return; }
    if (paused)   { resume(); return; }
    speak(text, stopId);
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        background: active ? `${C.accent}12` : C.sky,
        border: `1.5px solid ${active ? C.accent : C.skyD}`,
        borderRadius: 14, overflow: "hidden",
      }}>
        {/* Riga principale */}
        <div onClick={onTap} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px",
          cursor: loading ? "wait" : "pointer",
          WebkitTapHighlightColor: "transparent", minHeight: 50, userSelect: "none",
        }}>
          <div style={{
            width: 38, height: 38, minWidth: 38, borderRadius: "50%",
            background: active ? C.accent : C.navy, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, flexShrink: 0,
          }}>
            {loading ? "…" : speaking ? "⏸" : "▶"}
          </div>
          <div style={{ fontSize: 13, color: active ? C.accentD : C.navy, fontWeight: "500", flex: 1, lineHeight: 1.4 }}>
            {loading ? "Avvio audio…" : speaking ? label : paused ? label : `Ascolta: ${label}`}
          </div>
          {speaking && (
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              {[1,2,3,4,5].map(n => (
                <div key={n} style={{
                  width: 3, borderRadius: 2, background: C.accent,
                  animation: `wave${n} 0.7s ease-in-out infinite`,
                  animationDelay: `${(n-1)*0.1}s`,
                }}/>
              ))}
            </div>
          )}
          {active && !loading && (
            <div onClick={e => { e.stopPropagation(); stop(); }} style={{
              width: 30, height: 30, minWidth: 30, borderRadius: "50%",
              background: C.navy, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, cursor: "pointer", marginLeft: 4,
            }}>✕</div>
          )}
        </div>

        {/* Seek bar */}
        {hasSeek && (
          <div style={{ padding: "0 14px 12px" }} onClick={e => e.stopPropagation()}>
            <input
              type="range" min={0} max={progress.duration} step={0.5}
              value={progress.current}
              onChange={e => seek(parseFloat(e.target.value))}
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              style={{
                width: "100%", accentColor: C.accent, cursor: "pointer",
                height: 4, WebkitAppearance: "none", appearance: "none",
                background: `linear-gradient(to right, ${C.accent} ${(progress.current/progress.duration)*100}%, ${C.skyD} 0%)`,
                borderRadius: 2, outline: "none",
              }}
            />
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontSize: 11, color: C.accentD, marginTop: 4, fontWeight: "600",
            }}>
              <span>{fmt(progress.current)}</span>
              <span>−{fmt(Math.max(0, progress.duration - progress.current))}</span>
            </div>
          </div>
        )}
      </div>

      {/* Errore con pulsante riprova */}
      {hasFailed && (
        <div style={{
          fontSize: 12, color: C.red, marginTop: 6,
          padding: "8px 12px", background: "#FEF2F2",
          borderRadius: 10, border: `1px solid #FCA5A5`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>{ttsError}</span>
          <button onClick={() => speak(text, stopId)} style={{
            background: C.accent, color: "#fff", border: "none",
            borderRadius: 6, padding: "4px 10px", fontSize: 11,
            fontWeight: "700", cursor: "pointer", fontFamily: FONT,
          }}>Riprova</button>
        </div>
      )}
    </div>
  );
}

// ─── LAYOUT ───────────────────────────────────────────────────────
const rootStyle = {
  minHeight: "100vh", background: C.bg, color: C.text,
  fontFamily: FONT, maxWidth: 480, margin: "0 auto", overflowX: "hidden",
};

function Header({ step, label }) {
  return (
    <div style={{
      padding: "16px 20px 14px", borderBottom: `1px solid ${C.border}`,
      background: C.surface, position: "sticky", top: 0, zIndex: 100,
      boxShadow: "0 1px 8px rgba(28,43,74,0.08)",
    }}>
      {step && (
        <div style={{
          fontSize: 11, letterSpacing: "0.15em", color: C.accent,
          fontWeight: "700", textTransform: "uppercase", marginBottom: 3,
        }}>{step}</div>
      )}
      <div style={{
        fontSize: 20, fontWeight: "800", color: C.navy,
        fontFamily: FONT_HEADING,
      }}>{label}</div>
    </div>
  );
}

function Progress({ step, total = 4 }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
      {Array.from({ length: total }, (_, i) => i + 1).map(i => (
        <div key={i} style={{
          height: 4, flex: 1, borderRadius: 4,
          background: i <= step ? C.accent : C.border,
          transition: "background 0.3s",
        }}/>
      ))}
    </div>
  );
}

function AccentBtn({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: "100%", background: C.accent, color: "#fff",
      border: "none", borderRadius: 50, padding: "16px 20px",
      fontSize: 15, fontWeight: "700", fontFamily: FONT,
      cursor: "pointer", opacity: disabled ? 0.4 : 1, letterSpacing: "0.01em",
    }}>{children}</button>
  );
}

function OutlineBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", background: "transparent", color: C.navy,
      border: `1.5px solid ${C.border}`, borderRadius: 50, padding: "14px 20px",
      fontSize: 14, fontWeight: "600", fontFamily: FONT,
      cursor: "pointer", marginTop: 10, letterSpacing: "0.01em",
    }}>{children}</button>
  );
}

function Spinner({ small }) {
  return (
    <div style={{
      width: small ? 20 : 44, height: small ? 20 : 44,
      border: `${small ? 2 : 3}px solid ${C.border}`,
      borderTop: `${small ? 2 : 3}px solid ${C.accent}`,
      borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0,
    }}/>
  );
}

// ─── TRAVEL SEGMENT ───────────────────────────────────────────────
function TravelSegment({ travel }) {
  if (!travel) return null;
  const modeStr = (travel.mode_suggestion || "").toLowerCase();
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
      margin: "4px 0 4px", padding: "14px 16px",
      background: C.travel, border: `1px dashed ${C.travelB}`, borderRadius: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: (travel.route_note || travel.story_en_route) ? 10 : 0 }}>
        <div style={{
          width: 34, height: 34, borderRadius: "50%",
          background: C.sky, border: `1.5px solid ${C.skyD}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, flexShrink: 0,
        }}>{modeIcon}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: "600", color: C.navy }}>
            {modeLabel}
            {travel.walking_min && <span style={{ color: C.muted, fontWeight: "400" }}> · {travel.walking_min} min</span>}
          </div>
          {travel.alternative && (
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>oppure: {travel.alternative}</div>
          )}
        </div>
      </div>
      {travel.route_note && (
        <div style={{ fontSize: 13, color: C.navyL, lineHeight: 1.65, marginBottom: travel.story_en_route ? 8 : 0, paddingLeft: 44 }}>
          {travel.route_note}
        </div>
      )}
      {travel.story_en_route && (
        <div style={{
          fontSize: 12, color: C.muted, fontStyle: "italic", lineHeight: 1.65,
          paddingLeft: 12, marginLeft: 44, borderLeft: `2px solid ${C.accent}`,
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
    <div style={{ ...rootStyle, display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 20px", minHeight: "100vh" }}>
      <div style={{ textAlign: "center", marginBottom: 44 }}>
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: C.accent, margin: "0 auto 20px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 38, boxShadow: `0 8px 24px ${C.accent}40`,
        }}>🧭</div>
        <div style={{
          fontSize: 11, letterSpacing: "0.3em", color: C.accent,
          fontWeight: "700", textTransform: "uppercase", marginBottom: 10,
        }}>
          La tua guida culturale
        </div>
        <h1 style={{
          fontSize: 38, margin: "0 0 12px", lineHeight: 1.15,
          fontWeight: "700", color: C.navy, fontFamily: FONT_HEADING,
        }}>
          GuidaMe
        </h1>
        <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, margin: "0 0 6px" }}>
          Itinerari su misura · Audioguida AI · Navigazione
        </p>
      </div>
      <label style={{
        fontSize: 12, color: C.navy, fontWeight: "700",
        letterSpacing: "0.05em", textTransform: "uppercase",
        display: "block", marginBottom: 10,
      }}>
        Dove vuoi andare?
      </label>
      <input
        ref={inputRef}
        type="text"
        defaultValue=""
        placeholder="es. Viterbo, Orvieto, Roma…"
        onKeyDown={e => e.key === "Enter" && go()}
        style={{
          width: "100%", background: C.surface, border: `2px solid ${C.border}`,
          borderRadius: 14, padding: "15px 18px", color: C.navy, fontSize: 16,
          fontFamily: FONT, outline: "none", boxSizing: "border-box", marginBottom: 16,
          boxShadow: "0 2px 8px rgba(28,43,74,0.06)",
        }}
      />
      <AccentBtn onClick={go}>Inizia →</AccentBtn>
      {savedCount > 0 && (
        <button onClick={onOpenSaved} style={{
          marginTop: 14, width: "100%", background: "transparent",
          border: `1.5px solid ${C.navy}`, borderRadius: 50, padding: "14px 20px",
          fontSize: 14, fontWeight: "600", fontFamily: FONT,
          cursor: "pointer", color: C.navy, letterSpacing: "0.01em",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
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
      <div style={{ padding: "20px" }}>
        {saved.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📭</div>
            <div style={{ fontSize: 15 }}>Nessun itinerario salvato.</div>
          </div>
        ) : saved.map(entry => (
          <div key={entry.id} style={{
            background: C.surface, border: `1.5px solid ${C.border}`,
            borderRadius: 16, marginBottom: 12, overflow: "hidden",
            boxShadow: "0 2px 8px rgba(28,43,74,0.07)",
          }}>
            <div style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: "800", color: C.navy, marginBottom: 4, fontFamily: FONT_HEADING }}>{entry.city}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
                    {entry.duration} · {entry.pace} · {entry.itinerary?.stops?.length} tappe
                  </div>
                  <div style={{ fontSize: 11, color: C.dim }}>
                    Salvato il {new Date(entry.savedAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
                  </div>
                </div>
                <button onClick={() => onDelete(entry.id)} style={{
                  background: "#FEF2F2", border: "1px solid #FCA5A5",
                  borderRadius: 8, padding: "6px 10px",
                  fontSize: 12, color: C.red, cursor: "pointer",
                  fontFamily: FONT, fontWeight: "600", flexShrink: 0,
                }}>🗑</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {entry.interests?.slice(0, 4).map(id => {
                  const it = INTERESTS.find(i => i.id === id);
                  return it ? (
                    <span key={id} style={{
                      background: C.sky, border: `1px solid ${C.skyD}`,
                      borderRadius: 20, padding: "3px 10px",
                      fontSize: 11, color: C.navy, fontWeight: "600",
                    }}>{it.emoji} {it.label}</span>
                  ) : null;
                })}
              </div>
            </div>
            <div style={{ padding: "0 18px 16px" }}>
              <button onClick={() => onLoad(entry)} style={{
                width: "100%", background: C.navy, color: "#fff",
                border: "none", borderRadius: 50, padding: "13px 16px",
                fontSize: 14, fontWeight: "700", fontFamily: FONT, cursor: "pointer",
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

// ─── START POINT SCREEN ───────────────────────────────────────────
function StartPointScreen({ city, onNext, onBack }) {
  const [selected,     setSelected]     = useState(null); // "gps" | "address" | "arriving"
  const [arrivalMode,  setArrivalMode]  = useState(null); // "aeroporto" | "stazione" | "auto"
  const [manualAddr,   setManualAddr]   = useState("");
  const [gpsLoading,   setGpsLoading]   = useState(false);
  const [gpsCoords,    setGpsCoords]    = useState(null);
  const [gpsError,     setGpsError]     = useState("");

  const handleGPS = () => {
    if (!navigator.geolocation) {
      setGpsError("GPS non supportato. Inserisci l'indirizzo manualmente.");
      setSelected("address");
      return;
    }
    setGpsLoading(true);
    setGpsError("");
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
      },
      () => {
        setGpsError("Posizione non disponibile. Inserisci l'indirizzo manualmente.");
        setGpsLoading(false);
        setSelected("address");
      },
      { timeout: 10000 }
    );
  };

  const canProceed = () => {
    if (selected === "gps") return gpsCoords !== null;
    if (selected === "address") return manualAddr.trim().length > 2;
    if (selected === "arriving") return arrivalMode !== null;
    return false;
  };

  const handleNext = () => {
    if (selected === "skip") { onNext(null); return; }
    const sp = {
      type: selected,
      coords: selected === "gps" ? gpsCoords : null,
      address: selected === "address" ? manualAddr.trim() : "",
      arrivalMode: selected === "arriving" ? arrivalMode : null,
    };
    onNext(sp);
  };

  const optionStyle = (id) => ({
    background: selected === id ? C.sky : C.surface,
    border: `2px solid ${selected === id ? C.accent : C.border}`,
    borderRadius: 16, padding: "16px 18px", cursor: "pointer",
    marginBottom: 12, WebkitTapHighlightColor: "transparent",
    boxShadow: selected === id ? `0 4px 16px ${C.accent}25` : "0 1px 4px rgba(28,43,74,0.06)",
    transition: "all 0.15s",
  });

  return (
    <div style={rootStyle}>
      <Header step="Passo 1 di 4" label={city} />
      <div style={{ padding: "24px 20px" }}>
        <Progress step={1} />
        <h2 style={{ fontSize: 24, fontWeight: "800", marginBottom: 6, color: C.navy, fontFamily: FONT_HEADING }}>
          Da dove parti?
        </h2>
        <p style={{ fontSize: 14, color: C.muted, marginBottom: 24, lineHeight: 1.5 }}>
          Ottimizziamo l'itinerario in base al tuo punto di partenza.
        </p>

        {/* GPS */}
        <div onClick={() => { setSelected("gps"); if (!gpsCoords && !gpsLoading) handleGPS(); }} style={optionStyle("gps")}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 26 }}>📍</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "700", fontSize: 15, color: C.navy }}>Usa la mia posizione GPS</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Rilevamento automatico della posizione attuale</div>
            </div>
            {selected === "gps" && (
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: "bold", color: "#fff" }}>✓</div>
            )}
          </div>
          {selected === "gps" && (
            <div style={{ marginTop: 12, paddingLeft: 40 }}>
              {gpsLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted }}>
                  <Spinner small /> Rilevamento in corso…
                </div>
              )}
              {gpsCoords && !gpsLoading && (
                <div style={{ fontSize: 13, color: C.accent, fontWeight: "600" }}>
                  ✓ Posizione rilevata
                </div>
              )}
              {gpsError && (
                <div style={{ fontSize: 12, color: C.red }}>{gpsError}</div>
              )}
            </div>
          )}
        </div>

        {/* Indirizzo manuale */}
        <div onClick={() => setSelected("address")} style={optionStyle("address")}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 26 }}>🏠</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "700", fontSize: 15, color: C.navy }}>Inserisci un indirizzo</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Hotel, appartamento o qualsiasi punto di partenza</div>
            </div>
            {selected === "address" && (
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: "bold", color: "#fff" }}>✓</div>
            )}
          </div>
          {selected === "address" && (
            <div style={{ marginTop: 12 }} onClick={e => e.stopPropagation()}>
              <input
                type="text"
                placeholder="es. Via Roma 10, Viterbo"
                value={manualAddr}
                onChange={e => setManualAddr(e.target.value)}
                autoFocus
                style={{
                  width: "100%", background: C.surface, border: `1.5px solid ${C.border}`,
                  borderRadius: 10, padding: "11px 14px", color: C.navy, fontSize: 14,
                  fontFamily: FONT, outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          )}
        </div>

        {/* Non ancora arrivato */}
        <div onClick={() => setSelected("arriving")} style={optionStyle("arriving")}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 26 }}>✈️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "700", fontSize: 15, color: C.navy }}>Sto ancora arrivando</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Aeroporto, stazione o in auto — ti aiutiamo a orientarti</div>
            </div>
            {selected === "arriving" && (
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: "bold", color: "#fff" }}>✓</div>
            )}
          </div>
          {selected === "arriving" && (
            <div style={{ marginTop: 14, display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
              {[
                { id: "aeroporto", label: "Aeroporto", emoji: "✈️" },
                { id: "stazione",  label: "Stazione",  emoji: "🚆" },
                { id: "auto",      label: "In auto",   emoji: "🚗" },
              ].map(m => (
                <div key={m.id} onClick={() => setArrivalMode(m.id)} style={{
                  flex: 1, padding: "10px 8px", borderRadius: 12, textAlign: "center",
                  background: arrivalMode === m.id ? C.accent : C.bg,
                  border: `1.5px solid ${arrivalMode === m.id ? C.accent : C.border}`,
                  cursor: "pointer", transition: "all 0.15s",
                }}>
                  <div style={{ fontSize: 20 }}>{m.emoji}</div>
                  <div style={{ fontSize: 11, fontWeight: "600", color: arrivalMode === m.id ? "#fff" : C.navy, marginTop: 4 }}>{m.label}</div>
                </div>
              ))}
            </div>
          )}
          {selected === "arriving" && arrivalMode === "auto" && (
            <div style={{
              marginTop: 12, padding: "10px 14px", background: `${C.gold}18`,
              border: `1px solid ${C.gold}55`, borderRadius: 10, fontSize: 12,
              color: C.navy, lineHeight: 1.5,
            }}>
              🅿️ Includeremo nella guida i parcheggi più comodi vicino alla prima tappa del tuo itinerario.
            </div>
          )}
        </div>

        <div style={{ marginTop: 6 }}>
          <AccentBtn onClick={handleNext} disabled={!canProceed()}>
            Avanti →
          </AccentBtn>
          <OutlineBtn onClick={() => onNext(null)}>Salta questo passaggio</OutlineBtn>
          <OutlineBtn onClick={onBack}>← Indietro</OutlineBtn>
        </div>
      </div>
    </div>
  );
}

// ─── SOCIAL KIT SECTION ───────────────────────────────────────────
function SocialKitSection({ stop, kit, loading, onLoad }) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    if (!open && !kit && !loading) onLoad();
    setOpen(v => !v);
  };

  return (
    <div style={{ marginTop: 18 }}>
      <button onClick={toggle} style={{
        width: "100%", background: open ? `${C.gold}20` : C.sky,
        border: `1.5px solid ${open ? C.gold : C.skyD}`,
        borderRadius: 12, padding: "11px 16px",
        fontSize: 13, fontWeight: "700", color: C.navy,
        fontFamily: FONT, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span>📸 Social Kit</span>
        <span style={{ fontSize: 11, color: C.muted, fontWeight: "400" }}>
          {open ? "Chiudi ▲" : "Instagram · TikTok · Hashtag ▼"}
        </span>
      </button>

      {open && (
        <div style={{
          background: C.surface, border: `1.5px solid ${C.border}`,
          borderRadius: "0 0 14px 14px", padding: "16px 16px",
          borderTop: "none", animation: "fadeIn 0.2s ease both",
        }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
              <Spinner small />
              <span style={{ fontSize: 13, color: C.muted }}>Genero contenuti social…</span>
            </div>
          )}
          {kit && !kit.error && !loading && (
            <>
              {/* Foto spot */}
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 11, letterSpacing: "0.12em", color: C.accent,
                  fontWeight: "700", textTransform: "uppercase", marginBottom: 8,
                }}>📷 Scatto perfetto</div>
                <div style={{
                  fontSize: 13, color: C.text, lineHeight: 1.7,
                  padding: "10px 14px", background: C.sky,
                  borderRadius: 10, border: `1px solid ${C.skyD}`,
                }}>{kit.photoSpot}</div>
              </div>

              {/* Instagram */}
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 11, letterSpacing: "0.12em", color: "#E1306C",
                  fontWeight: "700", textTransform: "uppercase", marginBottom: 8,
                }}>📸 Caption Instagram</div>
                <div style={{
                  fontSize: 13, color: C.text, lineHeight: 1.75,
                  padding: "10px 14px", background: "#FFF0F5",
                  borderRadius: 10, border: "1px solid #F5A8C0",
                  whiteSpace: "pre-line",
                }}>{kit.igCaption}</div>
              </div>

              {/* TikTok */}
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 11, letterSpacing: "0.12em", color: "#010101",
                  fontWeight: "700", textTransform: "uppercase", marginBottom: 8,
                }}>🎵 TikTok</div>
                <div style={{
                  background: "#F8F8F8", borderRadius: 10,
                  border: "1px solid #E0E0E0", overflow: "hidden",
                }}>
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid #E0E0E0" }}>
                    <span style={{ fontSize: 11, fontWeight: "700", color: C.muted, textTransform: "uppercase" }}>Hook (0–3s)</span>
                    <div style={{ fontSize: 13, color: C.text, lineHeight: 1.65, marginTop: 4 }}>{kit.tiktokHook}</div>
                  </div>
                  <div style={{ padding: "10px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: "700", color: C.muted, textTransform: "uppercase" }}>Script 30s</span>
                    <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7, marginTop: 4, whiteSpace: "pre-line" }}>{kit.tiktokScript}</div>
                  </div>
                </div>
              </div>

              {/* Hashtags */}
              {kit.hashtags?.length > 0 && (
                <div>
                  <div style={{
                    fontSize: 11, letterSpacing: "0.12em", color: C.navy,
                    fontWeight: "700", textTransform: "uppercase", marginBottom: 8,
                  }}># Hashtag</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {kit.hashtags.map((h, i) => (
                      <span key={i} style={{
                        background: C.navy, color: "#fff",
                        borderRadius: 20, padding: "4px 12px",
                        fontSize: 12, fontWeight: "500",
                      }}>#{h.replace(/^#/, "")}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {kit?.error && !loading && (
            <div style={{ fontSize: 13, color: C.red }}>Errore nel caricamento. Riprova tra poco.</div>
          )}
          {!kit && !loading && (
            <div style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "8px 0" }}>
              Premi per generare i contenuti social per questa tappa.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────
export default function App() {
  const [screen,       setScreen]       = useState("welcome");
  const [city,         setCity]         = useState("");
  const [startPoint,   setStartPoint]   = useState(null);
  const [interests,    setInterests]    = useState([]);
  const [duration,     setDuration]     = useState("");
  const [pace,         setPace]         = useState("");
  const [socialMode,   setSocialMode]   = useState(false);
  const [modelChoice,  setModelChoice]  = useState("claude-haiku-4-5-20251001");
  const [itinerary,    setItinerary]    = useState(null);
  const [activeStop,   setActiveStop]   = useState(null);
  const [stopDetails,  setStopDetails]  = useState({});
  const [loadingDet,   setLoadingDet]   = useState(null);
  const [socialKits,   setSocialKits]   = useState({});
  const [loadingSocial,setLoadingSocial]= useState(null);
  const [chatMsgs,     setChatMsgs]     = useState({});
  const [chatInput,    setChatInput]    = useState("");
  const [chatLoading,  setChatLoading]  = useState(false);
  const [error,        setError]        = useState("");
  const [saved,        setSaved]        = useState(() => loadSavedItineraries());
  const [saveMsg,      setSaveMsg]      = useState("");
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

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs, activeStop]);

  const toggle = id => setInterests(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  // ── Salva itinerario ─────────────────────────────────────────
  const saveItinerary = () => {
    if (!itinerary) return;
    const entry = {
      id: Date.now(), savedAt: new Date().toISOString(),
      city, duration, pace, interests, itinerary, stopDetails,
    };
    const updated = [entry, ...saved].slice(0, 15);
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
    setSocialKits({});
    setScreen("itinerary");
  };

  // ── Elimina itinerario salvato ────────────────────────────────
  const deleteSaved = (id) => {
    const updated = saved.filter(e => e.id !== id);
    setSaved(updated);
    persistSaved(updated);
  };

  // ── Genera itinerario ─────────────────────────────────────────
  const generate = async () => {
    setScreen("generating"); setError("");
    try {
      const iL = interests.map(id => INTERESTS.find(i => i.id === id)?.label).join(", ");
      const dL = DURATIONS.find(d => d.id === duration)?.label;
      const pL = PACES.find(p => p.id === pace)?.label;
      const n  = { "2h": "3-4", "4h": "4-6", "1d": "6-8", "2d": "10-14", "3d": "14-18" }[duration];

      // Contesto punto di partenza
      let startCtx = "";
      if (startPoint?.type === "gps" && startPoint.coords) {
        startCtx = `Il visitatore parte dalle coordinate GPS: ${startPoint.coords.lat.toFixed(5)}, ${startPoint.coords.lng.toFixed(5)}. Usa queste coordinate come punto 0 per calcolare i percorsi della prima tappa.`;
      } else if (startPoint?.type === "address" && startPoint.address) {
        startCtx = `Il visitatore parte da: "${startPoint.address}". Considera questa come posizione di partenza per calcolare il percorso verso la prima tappa.`;
      } else if (startPoint?.type === "arriving") {
        if (startPoint.arrivalMode === "aeroporto") {
          startCtx = `Il visitatore sta arrivando in aereo. Come prima nota pratica (prima tappa), includi un breve consiglio su come raggiungere il centro città dall'aeroporto più vicino a ${city}.`;
        } else if (startPoint.arrivalMode === "stazione") {
          startCtx = `Il visitatore sta arrivando in treno. Come prima nota pratica, includi un breve consiglio su come raggiungere il centro città dalla stazione.`;
        } else if (startPoint.arrivalMode === "auto") {
          startCtx = `Il visitatore arriva in auto. Nel campo "tips" includi obbligatoriamente un consiglio specifico e pratico su dove parcheggiare a ${city} (nome del parcheggio, costo indicativo, distanza a piedi dalla prima tappa).`;
        }
      }

      const sys = "Sei un esperto di turismo culturale italiano. Rispondi SOLO con JSON valido, zero markdown.";
      const msg = `Crea un itinerario per ${city}. Durata: ${dL}. Ritmo: ${pL}. Interessi: ${iL}.
${startCtx ? "\n" + startCtx : ""}

Restituisci SOLO questo JSON (${n} tappe reali con coordinate precise):
{
  "city": "",
  "tagline": "una frase autentica e memorabile sulla città, concreta non retorica",
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
      "shortDesc": "Una frase concisa che descriva l'essenza del luogo. Diretta, niente aggettivi vuoti.",
      "highlights": ["elemento notevole specifico 1", "elemento notevole specifico 2"],
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
        "route_note": "Descrizione pratica del percorso: via, svolte, punti di riferimento.",
        "story_en_route": "Un fatto o aneddoto specifico sul quartiere attraversato."
      }
    }
  ],
  "tips": "Un consiglio pratico utile e specifico, non generico."
}

REGOLE:
- travel_from_prev è null SOLO per la prima tappa.
- Per tutte le altre tappe includi sempre travel_from_prev con dati reali.
- Calcola walking_min sulla distanza reale (1 min ogni 80 m).
- Se distanza > 1km suggerisci taxi o bus come mode_suggestion.`;

      const raw = await callClaude([{ role: "user", content: msg }], sys, modelChoice);
      setItinerary(JSON.parse(raw.replace(/```json|```/g, "").trim()));
      setScreen("itinerary");
    } catch (e) {
      setError("Errore nella generazione. Riprova.");
      setScreen("pace");
    }
  };

  // ── Carica dettaglio tappa ────────────────────────────────────
  const loadDetail = async (stop) => {
    if (stopDetails[stop.id]) return;
    setLoadingDet(stop.id);
    try {
      const iL  = interests.map(id => INTERESTS.find(i => i.id === id)?.label).join(", ");
      const sys = "Sei una guida turistica italiana esperta e diretta. Parli come un professionista appassionato, non come un poeta. Rispondi SOLO con JSON valido, zero markdown.";
      const msg = `Il visitatore si trova davanti a "${stop.name}" a ${itinerary.city}. Interessi: ${iL}.

Restituisci SOLO questo JSON:
{
  "intro": "Apertura diretta in prima persona (noi o tu), come una guida esperta che parla a un amico. 2-3 frasi essenziali che contestualizzino il luogo senza retorica. Niente 'Benvenuti', niente frasi melense.",
  "story": "La storia in modo diretto e concreto: fatti significativi, date chiave, un aneddoto vero e specifico. 3-4 frasi in presente storico. Informativo ma non arido — niente aggettivi ridondanti.",
  "observation_guide": [
    "Istruzione specifica su cosa guardare con indicazione precisa di posizione (es: 'Alza lo sguardo verso il cornicione nord: noterai...').",
    "Un dettaglio nascosto che quasi nessuno nota, con posizione precisa e motivo per cui è interessante.",
    "Un'esperienza sensoriale o fisica specifica da fare in quel momento (toccare, ascoltare, osservare da un punto preciso)."
  ],
  "curiosity": "Una curiosità autentica, verificabile, poco nota. 2-3 frasi con un dettaglio specifico che sorprenda davvero.",
  "practical": "Orari, prezzo biglietto se applicabile, consiglio specifico su quando visitare per evitare la folla."
}`;
      const raw = await callClaude([{ role: "user", content: msg }], sys, modelChoice);
      setStopDetails(p => ({ ...p, [stop.id]: JSON.parse(raw.replace(/```json|```/g, "").trim()) }));
    } catch { setStopDetails(p => ({ ...p, [stop.id]: { error: true } })); }
    setLoadingDet(null);
  };

  // ── Carica social kit ─────────────────────────────────────────
  const loadSocialKit = async (stop) => {
    if (socialKits[stop.id] || loadingSocial) return;
    setLoadingSocial(stop.id);
    try {
      const sys = "Sei un social media manager esperto in turismo italiano. Rispondi SOLO con JSON valido, zero markdown.";
      const msg = `Crea contenuti social per "${stop.name}" a ${itinerary.city}.

Restituisci SOLO questo JSON:
{
  "photoSpot": "Miglior angolo fotografico: dove posizionarsi esattamente, luce ideale (ora del giorno), composizione consigliata. Specifico e pratico.",
  "igCaption": "Caption Instagram: 2-3 righe evocative con hook forte iniziale. 1-2 emoji pertinenti. Autentica, non promozionale.",
  "tiktokHook": "Primo frame TikTok (primi 3 secondi): azione o frase precisa per catturare l'attenzione immediatamente.",
  "tiktokScript": "Script TikTok 30 secondi: 4-5 momenti con [azione] e dialogo/commento breve per ciascuno.",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6"]
}`;
      const raw = await callClaude([{ role: "user", content: msg }], sys, modelChoice);
      setSocialKits(p => ({ ...p, [stop.id]: JSON.parse(raw.replace(/```json|```/g, "").trim()) }));
    } catch {
      setSocialKits(p => ({ ...p, [stop.id]: { error: true } }));
    }
    setLoadingSocial(null);
  };

  const toggleStop = stop => {
    if (activeStop === stop.id) { setActiveStop(null); return; }
    setActiveStop(stop.id);
    loadDetail(stop);
  };

  const sendChat = async stopId => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    const stop   = itinerary.stops.find(s => s.id === stopId);
    const detail = stopDetails[stopId];
    const prev   = chatMsgs[stopId] || [];
    const msgs   = [...prev, { role: "user", content: msg }];
    setChatMsgs(m => ({ ...m, [stopId]: msgs }));
    setChatLoading(true);
    try {
      const sys = `Sei una guida turistica esperta a ${itinerary.city}, in piedi accanto al visitatore presso "${stop.name}". Parla come un professionista competente e diretto, non come un manuale. Usa il "tu". Contesto: ${detail?.story || stop.shortDesc}. Interessi del visitatore: ${interests.map(id => INTERESTS.find(i => i.id === id)?.label).join(", ")}. Rispondi in italiano, max 120 parole, tono chiaro e personale.`;
      const reply = await callClaude(msgs, sys, modelChoice);
      setChatMsgs(m => ({ ...m, [stopId]: [...msgs, { role: "assistant", content: reply }] }));
    } catch {
      setChatMsgs(m => ({ ...m, [stopId]: [...msgs, { role: "assistant", content: "Errore. Riprova." }] }));
    }
    setChatLoading(false);
  };

  // Bug #1 fix: usa sempre URL di ricerca con nome + indirizzo + città
  const mapsUrl = stop => {
    const parts = [stop.name, stop.address, itinerary?.city].filter(Boolean);
    return `https://maps.google.com/?q=${encodeURIComponent(parts.join(", "))}`;
  };

  const resetAll = () => {
    tts.stop();
    setScreen("welcome"); setCity(""); setStartPoint(null);
    setInterests([]); setDuration(""); setPace("");
    setItinerary(null); setActiveStop(null); setStopDetails({});
    setChatMsgs({}); setSocialKits({}); setSocialMode(false); setModelChoice("claude-haiku-4-5-20251001");
  };

  // ── SCREENS ───────────────────────────────────────────────────

  if (screen === "welcome") return (
    <WelcomeScreen
      onNext={c => { setCity(c); setScreen("startpoint"); }}
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

  if (screen === "startpoint") return (
    <StartPointScreen
      city={city}
      onNext={sp => { setStartPoint(sp); setScreen("interests"); }}
      onBack={() => setScreen("welcome")}
    />
  );

  if (screen === "interests") return (
    <div style={rootStyle}>
      <Header step="Passo 2 di 4" label={city} />
      <div style={{ padding: "24px 20px" }}>
        <Progress step={2} />
        <h2 style={{ fontSize: 24, fontWeight: "800", marginBottom: 6, color: C.navy, fontFamily: FONT_HEADING }}>
          Cosa ti appassiona?
        </h2>
        <p style={{ fontSize: 14, color: C.muted, marginBottom: 28, lineHeight: 1.5 }}>
          Seleziona uno o più interessi.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 28 }}>
          {INTERESTS.map(it => {
            const sel = interests.includes(it.id);
            return (
              <div key={it.id} onClick={() => toggle(it.id)} style={{
                background: sel ? C.accent : C.surface,
                border: `2px solid ${sel ? C.accent : C.border}`,
                borderRadius: 14, padding: "14px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 10,
                color: sel ? "#fff" : C.text,
                WebkitTapHighlightColor: "transparent",
                boxShadow: sel ? `0 4px 12px ${C.accent}35` : "0 1px 4px rgba(28,43,74,0.06)",
                transition: "all 0.15s",
              }}>
                <span style={{ fontSize: 20 }}>{it.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: sel ? "700" : "400" }}>{it.label}</span>
              </div>
            );
          })}
        </div>
        <AccentBtn onClick={() => setScreen("duration")} disabled={!interests.length}>Avanti →</AccentBtn>
        <OutlineBtn onClick={() => setScreen("startpoint")}>← Indietro</OutlineBtn>
      </div>
    </div>
  );

  if (screen === "duration") return (
    <div style={rootStyle}>
      <Header step="Passo 3 di 4" label={city} />
      <div style={{ padding: "24px 20px" }}>
        <Progress step={3} />
        <h2 style={{ fontSize: 24, fontWeight: "800", marginBottom: 6, color: C.navy, fontFamily: FONT_HEADING }}>
          Quanto tempo hai?
        </h2>
        <p style={{ fontSize: 14, color: C.muted, marginBottom: 28, lineHeight: 1.5 }}>
          Ottimizzeremo il numero di tappe.
        </p>
        {DURATIONS.map(d => (
          <div key={d.id} onClick={() => setDuration(d.id)} style={{
            background: duration === d.id ? C.sky : C.surface,
            border: `2px solid ${duration === d.id ? C.accent : C.border}`,
            borderRadius: 14, padding: "16px 18px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 10, WebkitTapHighlightColor: "transparent",
            boxShadow: "0 1px 4px rgba(28,43,74,0.06)", transition: "all 0.15s",
          }}>
            <div>
              <div style={{ fontWeight: "700", fontSize: 15, color: C.navy }}>{d.label}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{d.desc}</div>
            </div>
            {duration === d.id && (
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: "bold", color: "#fff" }}>✓</div>
            )}
          </div>
        ))}
        <div style={{ marginTop: 16 }}/>
        <AccentBtn onClick={() => setScreen("pace")} disabled={!duration}>Avanti →</AccentBtn>
        <OutlineBtn onClick={() => setScreen("interests")}>← Indietro</OutlineBtn>
      </div>
    </div>
  );

  if (screen === "pace") return (
    <div style={rootStyle}>
      <Header step="Passo 4 di 4" label={city} />
      <div style={{ padding: "24px 20px" }}>
        <Progress step={4} />
        <h2 style={{ fontSize: 24, fontWeight: "800", marginBottom: 6, color: C.navy, fontFamily: FONT_HEADING }}>
          Che ritmo preferisci?
        </h2>
        <p style={{ fontSize: 14, color: C.muted, marginBottom: 28, lineHeight: 1.5 }}>
          Quanto vuoi immergerti in ogni luogo?
        </p>
        {PACES.map(p => (
          <div key={p.id} onClick={() => setPace(p.id)} style={{
            background: pace === p.id ? C.sky : C.surface,
            border: `2px solid ${pace === p.id ? C.accent : C.border}`,
            borderRadius: 14, padding: "16px 18px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 10, WebkitTapHighlightColor: "transparent",
            boxShadow: "0 1px 4px rgba(28,43,74,0.06)", transition: "all 0.15s",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 28 }}>{p.emoji}</span>
              <div>
                <div style={{ fontWeight: "700", fontSize: 15, color: C.navy }}>{p.label}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{p.desc}</div>
              </div>
            </div>
            {pace === p.id && (
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: "bold", color: "#fff" }}>✓</div>
            )}
          </div>
        ))}

        {/* Social Kit toggle */}
        <div style={{
          marginTop: 20, marginBottom: 8,
          padding: "14px 16px",
          background: socialMode ? `${C.gold}15` : C.surface,
          border: `1.5px solid ${socialMode ? C.gold : C.border}`,
          borderRadius: 14, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          transition: "all 0.15s",
        }} onClick={() => setSocialMode(v => !v)}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>📸</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: "700", color: C.navy }}>Social Kit</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Caption IG · Script TikTok · Hashtag per ogni tappa</div>
            </div>
          </div>
          <div style={{
            width: 44, height: 24, borderRadius: 12,
            background: socialMode ? C.gold : C.border,
            position: "relative", transition: "background 0.25s", flexShrink: 0,
          }}>
            <div style={{
              position: "absolute", top: 3,
              left: socialMode ? 23 : 3,
              width: 18, height: 18, borderRadius: "50%",
              background: "#fff",
              transition: "left 0.25s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}/>
          </div>
        </div>

        {/* Model selector */}
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: C.muted, fontWeight: "600", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>
            Modello AI
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { id: "claude-haiku-4-5-20251001", label: "Haiku", icon: "⚡", desc: "Veloce" },
              { id: "claude-sonnet-4-6",          label: "Sonnet", icon: "🧠", desc: "Più preciso" },
            ].map(m => (
              <div key={m.id} onClick={() => setModelChoice(m.id)} style={{
                flex: 1, padding: "12px 10px", borderRadius: 12, cursor: "pointer",
                border: `2px solid ${modelChoice === m.id ? C.accent : C.border}`,
                background: modelChoice === m.id ? C.sky : C.surface,
                textAlign: "center", transition: "all 0.15s",
                WebkitTapHighlightColor: "transparent",
              }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{m.icon}</div>
                <div style={{ fontSize: 13, fontWeight: "700", color: C.navy }}>{m.label}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ color: C.red, fontSize: 13, marginBottom: 12, marginTop: 8, padding: "10px 14px", background: "#FEF2F2", borderRadius: 10, border: "1px solid #FCA5A5" }}>
            {error}
          </div>
        )}
        <div style={{ marginTop: 16 }}/>
        <AccentBtn onClick={generate} disabled={!pace}>Genera il mio itinerario ✦</AccentBtn>
        <OutlineBtn onClick={() => setScreen("duration")}>← Indietro</OutlineBtn>
      </div>
    </div>
  );

  if (screen === "generating") return (
    <div style={{ ...rootStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px" }}>
      <Spinner/>
      <div style={{ fontSize: 40, margin: "22px 0 12px" }}>🗺️</div>
      <div style={{ color: C.navy, fontSize: 16, fontWeight: "700", textAlign: "center", lineHeight: 1.7, fontFamily: FONT_HEADING }}>
        Sto studiando {city}…
      </div>
      <div style={{ color: C.muted, fontSize: 14, textAlign: "center", lineHeight: 1.7, marginTop: 6 }}>
        Preparo il tuo itinerario su misura.<br/>
        <span style={{ color: C.accent, fontWeight: "600" }}>Un momento.</span>
      </div>
    </div>
  );

  if (screen === "itinerary" && itinerary) return (
    <div style={rootStyle}>
      <Header label={itinerary.city}/>
      <div style={{ padding: "20px" }}>

        {/* Hero card navy */}
        <div style={{
          background: C.navy, borderRadius: 20, padding: "22px 20px", marginBottom: 24,
          boxShadow: `0 8px 24px rgba(28,43,74,0.2)`,
        }}>
          <div style={{ fontSize: 15, color: C.skyD, fontStyle: "italic", lineHeight: 1.65, marginBottom: 14, fontFamily: FONT_HEADING }}>
            "{itinerary.tagline}"
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {[`⏱ ${itinerary.duration}`, `🚶 ${itinerary.pace}`, `📍 ${itinerary.stops?.length} tappe`].map(b => (
              <span key={b} style={{
                background: `${C.accent}30`, border: `1px solid ${C.accentD}`,
                borderRadius: 20, padding: "5px 14px", fontSize: 12, color: C.skyD, fontWeight: "600",
              }}>{b}</span>
            ))}
          </div>

          <button onClick={saveItinerary} style={{
            width: "100%", background: `${C.accent}25`,
            border: `1.5px solid ${C.accentL}`,
            borderRadius: 50, padding: "11px 16px",
            fontSize: 13, fontWeight: "700", color: "#fff",
            fontFamily: FONT, cursor: "pointer", letterSpacing: "0.01em",
            marginBottom: itinerary.tips ? 14 : 0,
          }}>
            💾 Salva itinerario
          </button>

          {saveMsg && (
            <div style={{
              fontSize: 12, color: "#4ADE80", textAlign: "center",
              marginTop: 6, animation: "saveFlash 2.5s ease forwards", fontWeight: "600",
            }}>
              {saveMsg}
            </div>
          )}

          {itinerary.tips && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 14 }}>
              💡 {itinerary.tips}
            </div>
          )}
        </div>

        {/* Stops */}
        {itinerary.stops?.map((stop, stopIdx) => {
          const isOpen   = activeStop === stop.id;
          const detail   = stopDetails[stop.id];
          const loading  = loadingDet === stop.id;
          const msgs     = chatMsgs[stop.id] || [];
          const obsGuide = detail?.observation_guide || detail?.toSee || [];

          return (
            <div key={stop.id} style={{ animation: `fadeIn 0.3s ease ${stopIdx * 0.05}s both` }}>

              {/* Travel segment */}
              {stop.travel_from_prev && <TravelSegment travel={stop.travel_from_prev}/>}

              {/* Stop card */}
              <div style={{
                background: C.surface,
                border: `2px solid ${isOpen ? C.accent : C.border}`,
                borderRadius: 16, marginBottom: 8, overflow: "hidden",
                boxShadow: isOpen ? `0 4px 18px ${C.accent}28` : "0 2px 8px rgba(28,43,74,0.07)",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}>
                <div onClick={() => toggleStop(stop)} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: isOpen ? C.accent : C.navy,
                    color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: "700", flexShrink: 0,
                  }}>{stopIdx + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: "700", marginBottom: 3, color: C.navy }}>{stop.name}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{stop.type} · {stop.duration_min} min</div>
                  </div>
                  <div style={{
                    color: isOpen ? C.accent : C.dim, fontSize: 22,
                    transition: "transform 0.25s", transform: isOpen ? "rotate(90deg)" : "none",
                  }}>›</div>
                </div>

                {isOpen && (
                  <div style={{ padding: "0 18px 22px", borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.75, marginTop: 14, marginBottom: 16 }}>{stop.shortDesc}</div>

                    {stop.highlights?.length > 0 && (
                      <div style={{ marginBottom: 18 }}>
                        {stop.highlights.map((h, i) => (
                          <div key={i} style={{ fontSize: 13, color: C.text, marginBottom: 7, display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <span style={{ color: C.accent, fontWeight: "bold", flexShrink: 0, marginTop: 2 }}>✦</span>
                            <span style={{ lineHeight: 1.55 }}>{h}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Bug #1 fix: google maps search URL */}
                    <a href={mapsUrl(stop)} target="_blank" rel="noopener noreferrer" style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      background: "#1A73E8", color: "#fff",
                      borderRadius: 50, padding: "13px 16px",
                      fontSize: 14, fontWeight: "700", textDecoration: "none", marginBottom: 20,
                      boxShadow: "0 3px 10px rgba(26,115,232,0.3)",
                    }}>
                      🗺 Apri su Google Maps
                    </a>

                    <div style={{ height: 1, background: C.border, marginBottom: 20 }}/>

                    {loading ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0" }}>
                        <Spinner small/><span style={{ fontSize: 13, color: C.muted }}>Carico la scheda guida…</span>
                      </div>
                    ) : detail && !detail.error ? (
                      <div>
                        <div style={{ fontSize: 11, letterSpacing: "0.15em", color: C.accent, fontWeight: "700", textTransform: "uppercase", marginBottom: 14 }}>
                          📖 GUIDA
                        </div>

                        <TTSPlayer text={`${detail.intro} ${detail.story}`} stopId={`${stop.id}-main`} label="Introduzione e storia" tts={tts}/>

                        <div style={{
                          fontSize: 15, color: C.navy, lineHeight: 1.8, marginBottom: 16,
                          fontStyle: "italic", fontWeight: "500",
                          padding: "16px 18px",
                          background: C.sky, borderRadius: 14,
                          borderLeft: `4px solid ${C.accent}`,
                          fontFamily: FONT_HEADING,
                        }}>{detail.intro}</div>

                        <div style={{ fontSize: 14, color: C.text, lineHeight: 1.85, marginBottom: 22 }}>{detail.story}</div>

                        {obsGuide.length > 0 && (
                          <div style={{ marginBottom: 22 }}>
                            <div style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              background: C.navy, color: "#fff",
                              borderRadius: 8, padding: "5px 12px",
                              fontSize: 11, fontWeight: "700", letterSpacing: "0.12em", textTransform: "uppercase",
                              marginBottom: 14,
                            }}>
                              <span>👁</span><span>Cosa osservare</span>
                            </div>
                            {obsGuide.map((t, i) => (
                              <div key={i} style={{
                                fontSize: 13, color: C.text, marginBottom: 10,
                                display: "flex", gap: 12, alignItems: "flex-start",
                                padding: "12px 14px",
                                background: i % 2 === 0 ? C.sky : C.surface,
                                border: `1px solid ${i % 2 === 0 ? C.skyD : C.border}`,
                                borderRadius: 12, lineHeight: 1.65,
                              }}>
                                <div style={{
                                  background: C.navy, color: "#fff",
                                  borderRadius: "50%", width: 22, height: 22, minWidth: 22,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 11, fontWeight: "700", flexShrink: 0, marginTop: 1,
                                }}>{i + 1}</div>
                                <span>{t}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {detail.curiosity && (
                          <>
                            <div style={{
                              background: `linear-gradient(135deg, ${C.accent}12, ${C.sky})`,
                              border: `1.5px solid ${C.accent}40`,
                              borderRadius: 14, padding: "14px 16px", marginBottom: 10,
                            }}>
                              <div style={{ fontSize: 11, color: C.accentD, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 7 }}>
                                💡 Lo sapevi?
                              </div>
                              <div style={{ fontSize: 13, color: C.navy, lineHeight: 1.7 }}>{detail.curiosity}</div>
                            </div>
                            <TTSPlayer text={`Lo sapevi? ${detail.curiosity}`} stopId={`${stop.id}-curiosity`} label="Curiosità" tts={tts}/>
                          </>
                        )}

                        {detail.practical && (
                          <div style={{
                            fontSize: 12, color: C.muted, lineHeight: 1.65, marginBottom: 20,
                            padding: "10px 14px", background: `${C.border}50`, borderRadius: 10,
                          }}>🕐 {detail.practical}</div>
                        )}

                        {/* Social Kit (solo se attivo) */}
                        {socialMode && (
                          <SocialKitSection
                            stop={stop}
                            kit={socialKits[stop.id]}
                            loading={loadingSocial === stop.id}
                            onLoad={() => loadSocialKit(stop)}
                          />
                        )}

                        {/* Chat */}
                        <div style={{ marginTop: 18, background: C.bg, borderRadius: 16, padding: 16, border: `1.5px solid ${C.border}` }}>
                          <div style={{ fontSize: 11, letterSpacing: "0.15em", color: C.navy, fontWeight: "700", textTransform: "uppercase", marginBottom: 12 }}>
                            💬 CHIEDI ALLA GUIDA
                          </div>
                          {msgs.length > 0 && (
                            <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                              {msgs.map((m, i) => (
                                <div key={i} style={{ display: "flex", flexDirection: "column", alignSelf: m.role === "assistant" ? "flex-start" : "flex-end", maxWidth: "92%" }}>
                                  <div style={{
                                    background: m.role === "assistant" ? C.surface : C.navy,
                                    border: `1.5px solid ${m.role === "assistant" ? C.border : C.navy}`,
                                    borderRadius: 12, padding: "10px 14px",
                                    fontSize: 13, color: m.role === "assistant" ? C.text : "#fff",
                                    lineHeight: 1.6, boxShadow: "0 1px 4px rgba(28,43,74,0.08)",
                                  }}>{m.content}</div>
                                  {m.role === "assistant" && (
                                    <button onClick={() => tts.speak(m.content, `chat-${stop.id}-${i}`)} style={{
                                      fontSize: 11, color: C.accent, background: "none", border: "none",
                                      cursor: "pointer", padding: "4px 4px", textAlign: "left", fontWeight: "600",
                                    }}>
                                      {tts.ttsStopId === `chat-${stop.id}-${i}` && tts.ttsState === "speaking" ? "⏸ In ascolto…" : "▶ Ascolta risposta"}
                                    </button>
                                  )}
                                </div>
                              ))}
                              <div ref={chatEndRef}/>
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              style={{
                                flex: 1, background: C.surface,
                                border: `1.5px solid ${C.border}`,
                                borderRadius: 50, padding: "10px 16px",
                                color: C.navy, fontSize: 13, fontFamily: FONT, outline: "none",
                              }}
                              placeholder="Fai una domanda…"
                              value={chatInput}
                              onChange={e => setChatInput(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && sendChat(stop.id)}
                            />
                            <button onClick={() => sendChat(stop.id)} disabled={chatLoading} style={{
                              background: C.navy, color: "#fff", border: "none",
                              borderRadius: 50, padding: "10px 18px",
                              fontWeight: "700", cursor: "pointer", fontSize: 14,
                              opacity: chatLoading ? 0.5 : 1, minWidth: 46,
                            }}>
                              {chatLoading ? "…" : "→"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : detail?.error ? (
                      <div style={{ fontSize: 13, color: C.red, padding: "10px 14px", background: "#FEF2F2", borderRadius: 10, border: "1px solid #FCA5A5" }}>
                        Errore nel caricamento. Tocca di nuovo la tappa.
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div style={{ marginTop: 28, marginBottom: 52 }}>
          <OutlineBtn onClick={resetAll}>← Nuovo itinerario</OutlineBtn>
        </div>
      </div>
    </div>
  );

  return null;
}
