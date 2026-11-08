// The voice, ported from Steward's Guide (frontend/src/building/Guide.tsx): no chat thread and no panel that opens by
// itself. A glass bubble says what is happening only when there is something to say (you, live, while you speak; the
// work while it works; the answer, with the question and its steps folded above it), and the dock sits below it at the
// bottom left: the other way to ask on the left (keyboard), the main way in the middle (the ball), the options on the
// right (ask by voice or text, tap or hold to talk, spoken replies on or off, start over), remembered on this device.
// Before the first question only a few things you can say show, as chips.
// What happens behind: ElevenLabs hears, Claude works the app through an MCP server, the page does what was asked as
// taps would, ElevenLabs speaks the answer. Planner: the desk (desk.py). Homeowner: a helper through the questions
// (guide.py), off until they allow it, since what they say leaves the browser before Send; it never gets the home, the
// address or the meter photo, and shows no result.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Back, ChevronDown, ChevronRight, Keyboard, Restart, Sliders, Tick } from "./icons";
import { Core, VoiceState } from "./VoiceCore";
import { VoiceAction, guideContext, runActions, usePlace, voiceContext } from "./voiceBus";
import "./voice.css";

type Who = "planner" | "homeowner";
type Step = { key: number; label: string };
type Message = { role: "user"; text: string } | { role: "guide"; text: string; steps: Step[]; actions: VoiceAction[] } | { role: "note"; text: string };
type Turn = { heard: string; reply: string; actions: VoiceAction[]; steps: { tool: string; said?: string }[]; audio: string | null; source: string };
type Way = "talk" | "type";

const MAX_SECONDS = 25;
const threads: Record<Who, Message[]> = { planner: [], homeowner: [] }; // kept while the page is open, across screens
const STEP: Record<string, string> = { try_design: "Ran the engine on a variant", battery_sizes: "Every battery size", money: "Worked out the money" };
const stepOf = (s: Turn["steps"][number], key: number): Step => ({ key, label: s.said ?? STEP[s.tool] ?? s.tool.replace(/_/g, " ") });
const SIDE = {
  planner: { url: "/api/voice/turn", context: voiceContext, placeholder: "Ask the desk", name: "Desk" },
  homeowner: { url: "/api/guide/turn", context: guideContext, placeholder: "Ask the helper", name: "Helper" },
};
/** A few things worth saying where the person is now. */
function suggestions(who: Who): string[] {
  if (who === "planner") {
    const c = voiceContext();
    if (c.open) return c.open.to_confirm.length ? ["What is left to confirm?", "What does it cost?", "Without a battery?"] : ["What does it cost?", "Without a battery?", "Show the offer"];
    return ["Open the newest request", "Which are waiting?", "Show the prices"];
  }
  const g = guideContext();
  if (g.screen === "start") return ["Help me start", "Without the map", "What happens with my data?"];
  if (g.screen === "pick") return ["How do I pick my home?", "Without the map"];
  if (g.screen === "requests") return ["Start a new request", "What happens next?"];
  if (g.screen === "sent") return ["What happens now?"];
  return ["What is this question for?", "I don't know this", "Next question"];
}
const CONSENT_KEY = "voice-helper-allowed";
const read = (key: string, fallback: string) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* not remembered */ } };
// Inputs that carry no voice (Steward's mic.ts): Chrome may record from one of these and only silence arrives.
const VIRTUAL = /virtual|background music|blackhole|soundflower|loopback|teams audio|zoomaudio|aggregate/i;
const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
async function microphone(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
  if (!VIRTUAL.test(stream.getAudioTracks()[0]?.label ?? "")) return stream;
  const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
  const real = inputs.find((d) => d.deviceId === "default" && !VIRTUAL.test(d.label)) ?? inputs.find((d) => d.label && !VIRTUAL.test(d.label));
  if (!real) return stream;
  stream.getTracks().forEach((t) => t.stop());
  return navigator.mediaDevices.getUserMedia({ audio: { ...AUDIO, deviceId: { exact: real.deviceId } } });
}

export default function VoiceDock({ who = "planner" }: { who?: Who }) {
  usePlace();
  const side = SIDE[who];
  const [ready, setReady] = useState<{ speech: boolean; agent: boolean } | null>(null);
  const [state, setState] = useState<VoiceState>("off");
  const [messages, setMessages] = useState<Message[]>(threads[who]);
  const say = (m: Message) => setMessages((list) => (threads[who] = [...list, m]));
  const [error, setError] = useState("");
  // which way of asking sits in the middle of the dock, how the ball listens, and whether answers are spoken
  const [first, setFirst] = useState<Way>(() => (read(`voice-first-${who}`, "talk") === "type" ? "type" : "talk"));
  const [typingNow, setTypingNow] = useState(false);
  const center: Way = ready && !ready.speech ? "type" : first === "type" || typingNow ? "type" : "talk";
  const chooseFirst = (way: Way) => { setFirst(way); setTypingNow(false); write(`voice-first-${who}`, way); };
  const [hold, setHold] = useState(() => read("voice-hold", "no") === "yes");
  const [speaks, setSpeaks] = useState(() => read("voice-speaks", "yes") === "yes");
  const [options, setOptions] = useState(false);
  const [draft, setDraft] = useState("");
  // A homeowner allows the helper once in this browser: what they say and their answers then go to ElevenLabs and Anthropic.
  const [allowed, setAllowed] = useState(() => who === "planner" || read(CONSENT_KEY, "") === "yes");
  const [asking, setAsking] = useState<null | (() => void)>(null); // what to do once allowed
  const gate = (then: () => void) => (allowed ? then() : setAsking(() => then));
  const allow = () => { write(CONSENT_KEY, "yes"); setAllowed(true); const then = asking; setAsking(null); then?.(); };

  const level = useRef(0); // 0..1, read by the ball every frame
  const rec = useRef<MediaRecorder | null>(null), chunks = useRef<Blob[]>([]), timer = useRef(0), player = useRef<HTMLAudioElement | null>(null);
  const letGo = useRef(false); // released before the microphone opened (hold to talk)
  const audio = useRef<AudioContext | null>(null), meter = useRef<AnalyserNode | null>(null), frame = useRef(0);
  useEffect(() => { fetch("/api/voice/status").then((r) => r.json()).then(setReady).catch(() => setReady({ speech: false, agent: false })); }, []);
  useEffect(() => () => { rec.current?.stream.getTracks().forEach((t) => t.stop()); player.current?.pause(); cancelAnimationFrame(frame.current); audio.current?.close(); }, []);

  /** Feeds the ball the loudness of whatever is live: the mic while listening, the answer while speaking. */
  function measure(node: AudioNode) {
    audio.current ??= new AudioContext();
    const a = audio.current.createAnalyser();
    a.fftSize = 512;
    node.connect(a);
    meter.current = a;
    const data = new Uint8Array(a.fftSize);
    cancelAnimationFrame(frame.current);
    const tick = () => {
      if (meter.current !== a) return;
      a.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      level.current = Math.min(1, Math.sqrt(sum / data.length) * 4);
      frame.current = requestAnimationFrame(tick);
    };
    tick();
  }
  const quiet = () => { meter.current = null; level.current = 0; };

  async function send(recorded: Blob | null, typed?: string) {
    setState("thinking"); setError("");
    if (typed) say({ role: "user", text: typed });
    const form = new FormData();
    form.append("context", JSON.stringify(side.context()));
    form.append("history", JSON.stringify(threads[who].filter((m) => m.role !== "note").slice(-8).map((m) => ({ role: m.role === "user" ? "planner" : "desk", text: m.text }))));
    form.append("speak", String(speaks));
    if (recorded) form.append("audio", recorded, `speech.${recorded.type.includes("mp4") ? "mp4" : "webm"}`);
    if (typed) form.append("text", typed);
    try {
      const res = await fetch(side.url, { method: "POST", body: form });
      if (!res.ok) throw new Error(`No answer (${res.status})`);
      const t: Turn = await res.json();
      if (recorded && t.heard) say({ role: "user", text: t.heard });
      if (!t.heard && recorded) { say({ role: "note", text: t.reply }); setState("off"); return; }
      say({ role: "guide", text: t.reply, steps: t.steps.map(stepOf), actions: t.actions });
      runActions(t.actions);
      if (!t.audio) { setState("off"); return; }
      player.current?.pause();
      const el = new Audio(`data:audio/mpeg;base64,${t.audio}`);
      player.current = el;
      el.onended = el.onerror = () => { quiet(); setState("off"); };
      try {
        audio.current ??= new AudioContext();
        const source = audio.current.createMediaElementSource(el);
        source.connect(audio.current.destination);
        measure(source);
      } catch { /* no meter: the ball still speaks */ }
      setState("speaking");
      await el.play().catch(() => { quiet(); setState("off"); });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong"); quiet(); setState("off");
    }
  }

  const finish = () => { if (rec.current?.state === "recording") rec.current.stop(); else letGo.current = true; };
  const stop = () => { player.current?.pause(); quiet(); setState("off"); }; // a tap while it speaks stops it
  const listen = () => gate(async () => {
    setTypingNow(false); setError(""); letGo.current = false;
    if (!ready?.speech) { setError("Voice needs ELEVENLABS_API_KEY in .env and a restarted API. Typing works."); return; }
    try {
      const stream = await microphone();
      audio.current ??= new AudioContext();
      await audio.current.resume();
      measure(audio.current.createMediaStreamSource(stream));
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => {
        clearTimeout(timer.current); quiet();
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        if (blob.size > 1200) send(blob); else setState("off");
      };
      rec.current = r;
      r.start();
      setState("listening");
      timer.current = window.setTimeout(() => r.state === "recording" && r.stop(), MAX_SECONDS * 1000);
      if (letGo.current) r.stop(); // let go while the microphone was opening
    } catch {
      setError("The microphone is not available. Allow it in the browser, or type."); quiet(); setState("off");
    }
  });
  const submit = (text: string) => { const v = text.trim(); if (!v || state === "thinking") return; gate(() => { send(null, v); setDraft(""); }); };
  const clear = () => { threads[who] = []; setMessages([]); setError(""); };

  // the exchange shown: the latest, or an earlier one through the arrows beside the question
  const turns = messages.flatMap((m, i) => (m.role === "user" ? [i] : []));
  const [viewing, setViewing] = useState({ at: -1, turn: 0 });
  const latest = turns.length - 1, turn = viewing.at === messages.length ? viewing.turn : latest, past = turn < latest;
  const viewTurn = (next: number) => setViewing({ at: messages.length, turn: Math.max(0, Math.min(latest, next)) });
  const asked = turns[turn] ?? -1;
  const question = asked >= 0 ? (messages[asked] as { text: string }).text : null;
  const answer = asked >= 0 ? messages.slice(asked + 1, turns[turn + 1] ?? messages.length).at(-1) : messages.at(-1);
  const fresh = messages.length === 0;
  const [openAt, setOpenAt] = useState("");
  const expanded = openAt === `${messages.length}:${turn}`;
  const reply = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => { const b = reply.current; setClipped(!!b && b.scrollHeight > b.clientHeight + 1); }, [messages, expanded, turn]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (typingNow) input.current?.focus(); }, [typingNow]);
  const optionsBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!options) return;
    const close = (e: PointerEvent) => !optionsBox.current?.contains(e.target as Node) && setOptions(false);
    addEventListener("pointerdown", close);
    return () => removeEventListener("pointerdown", close);
  }, [options]);

  let caption: React.ReactNode = null;
  if (asking) {
    caption = <div className="caption">
      <p className="who">Voice helper</p>
      <p className="said">I can walk you through, explain each question and fill in what you tell me.</p>
      <p className="fine">What you say or type to me and your answers then go to ElevenLabs (speech) and Anthropic (Claude), both in the USA, before you send. Your home, the address and photos never do. I show no prices or sizes: those come from your installer.</p>
      <div className="consent"><button type="button" className="solid" onClick={allow}>Turn on</button><button type="button" onClick={() => setAsking(null)}>Not now</button></div>
    </div>;
  } else if (state === "listening") {
    caption = <div className="caption big"><p className="who live">You · live</p><p className="said"><em>{hold ? "Listening… let go to send" : "Listening… tap the ball to send"}</em></p></div>;
  } else if (state === "thinking") {
    caption = <div className="caption">{question && !past && <p className="asked">{question}</p>}<Thinking /></div>;
  } else if (!fresh) {
    caption = <div className="caption">
      {question && <Exchange key={turn} question={question} steps={answer?.role === "guide" ? answer.steps : []} history={turns.length > 1 ? { turn, count: turns.length, go: viewTurn } : undefined} />}
      {answer?.role === "note" && <p className="said warn">{answer.text}</p>}
      {answer?.role === "guide" && <>
        {state === "speaking" && !past && <p className="who speaking">Speaking · tap the ball to stop</p>}
        <div ref={reply} className={`said reply${expanded ? " open" : ""}${clipped ? " clipped" : ""}`} role="button" tabIndex={0} aria-expanded={expanded}
          onClick={() => setOpenAt(expanded ? "" : `${messages.length}:${turn}`)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpenAt(expanded ? "" : `${messages.length}:${turn}`)}>
          {answer.text.split(/\n+/).filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}
        </div>
      </>}
    </div>;
  }

  const ball = <Core state={state} level={level} busy={state === "thinking"} hold={hold} onHold={listen} onListen={listen} onFinish={finish} onStop={stop} />;
  return <section className={`guide ${who} ${center}`} aria-label={side.name}>
    {error && state !== "listening" && <p className="voice-error">{error}</p>}
    {caption && <div className={`guide-bubble${past && state === "off" ? " past" : ""}`}>{caption}</div>}
    {fresh && !asking && state === "off" && <ul className="intents" aria-label="Things you can ask">
      {suggestions(who).map((s) => <li key={s}><button type="button" onClick={() => submit(s)}>{s}</button></li>)}
    </ul>}
    <div className="dock">
      <div className="dock-side">
        {center === "talk" ? <button type="button" className="hud-side" onClick={() => gate(() => setTypingNow(true))} aria-label="Type instead" title="Type instead"><Keyboard size={20} /></button>
          : ready?.speech ? ball : null}
      </div>
      <div className="dock-center">
        {center === "talk" ? ball : <form className="type-bar" onSubmit={(e) => { e.preventDefault(); submit(draft); }}>
          <input ref={input} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setTypingNow(false)}
            onBlur={(e) => !draft.trim() && !e.currentTarget.closest(".dock")?.contains(e.relatedTarget) && setTypingNow(false)}
            placeholder={side.placeholder} aria-label={side.placeholder} enterKeyHint="send" />
          <button type="submit" className="send" disabled={state === "thinking" || !draft.trim()} aria-label="Send"><ArrowUp size={18} /></button>
        </form>}
      </div>
      <div className="dock-side dock-options" ref={optionsBox}>
        <button type="button" className="hud-side" aria-expanded={options} aria-haspopup="true" onClick={() => setOptions((o) => !o)} aria-label="Options" title="Options"><Sliders size={19} /></button>
        {options && <div className="hud-pop dock-pop" role="group" aria-label="Options">
          {ready?.speech && <div className="dock-row"><span>Ask by</span>
            <div className="dock-seg" role="radiogroup" aria-label="Ask by">{(["talk", "type"] as const).map((w) => <button key={w} type="button" role="radio" aria-checked={first === w} onClick={() => chooseFirst(w)}>{w === "talk" ? "Voice" : "Text"}</button>)}</div></div>}
          {ready?.speech && <div className="dock-row"><span>Talk by<small>{hold ? "While you hold the ball" : "Tap, then tap again"}</small></span>
            <div className="dock-seg" role="radiogroup" aria-label="Talk by">{([true, false] as const).map((on) => <button key={String(on)} type="button" role="radio" aria-checked={hold === on} onClick={() => { setHold(on); write("voice-hold", on ? "yes" : "no"); }}>{on ? "Hold" : "Tap"}</button>)}</div></div>}
          {ready?.speech && <button type="button" role="switch" aria-checked={speaks} className="dock-toggle" onClick={() => { setSpeaks(!speaks); write("voice-speaks", speaks ? "no" : "yes"); }}>
            <span>Spoken replies<small>Answers are read aloud</small></span><i className={speaks ? "on" : ""} aria-hidden="true" /></button>}
          <button type="button" className="dock-clear" disabled={fresh || state === "thinking"} onClick={() => { setOptions(false); clear(); }}><Restart size={16} />Start over</button>
        </div>}
      </div>
    </div>
  </section>;
}

/** While it works: one shimmering line and the seconds from the third on, so a slow answer reads as progress. */
function Thinking() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const t = setInterval(() => setSeconds((s) => s + 1), 1000); return () => clearInterval(t); }, []);
  return <div className="work" aria-live="polite"><p className="work-now"><span>Working on it</span></p><div className="work-meta"><small className="elapsed">{seconds >= 3 ? `${seconds}s` : ""}</small></div></div>;
}

type History = { turn: number; count: number; go: (turn: number) => void };
/** The question, a quiet "3 steps" that opens what was done, and the arrows through earlier exchanges. */
function Exchange({ question, steps, history }: { question: string; steps: Step[]; history?: History }) {
  const [open, setOpen] = useState(false);
  return <>
    <div className="exchange">
      <p className="asked">{question}</p>
      {steps.length > 0 && <button type="button" className="steps-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{steps.length} {steps.length === 1 ? "step" : "steps"}<span className={open ? "open" : ""}><ChevronDown size={13} /></span></button>}
      {history && <span className="history">
        <button type="button" disabled={history.turn === 0} onClick={() => history.go(history.turn - 1)} aria-label="Earlier answer" title="Earlier answer"><Back size={15} /></button>
        <span aria-live="polite">{history.turn + 1}/{history.count}</span>
        <button type="button" disabled={history.turn === history.count - 1} onClick={() => history.go(history.turn + 1)} aria-label="Later answer" title="Later answer"><ChevronRight size={15} /></button>
      </span>}
    </div>
    {open && <ol className="trail">{steps.map((s) => <li key={s.key} className="done"><span className="mark" aria-hidden="true"><Tick size={9} /></span><span>{s.label}</span></li>)}</ol>}
  </>;
}
