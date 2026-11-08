// The voice: tap the ball, speak, tap again. ElevenLabs hears it, Claude works the app through an MCP server, the page
// does what was asked as taps would, and the answer is spoken back. Typing works the same way without a mic.
// Planner: the desk (desk.py). Homeowner: a helper through the questions (guide.py), off until they allow it, since what
// they say leaves the browser before Send; it never gets the home, the address or the meter photo, and shows no result.
// The ball (Core) and the bubble come from Steward.
import { useEffect, useRef, useState } from "react";
import { Button, Input } from "./ui";
import { Core, VoiceState } from "./VoiceCore";
import { VoiceAction, guideContext, runActions, voiceContext } from "./voiceBus";
import "./voice.css";

type Turn = { heard: string; reply: string; actions: VoiceAction[]; audio: string | null; source: string };
const MAX_SECONDS = 25;
type Who = "planner" | "homeowner";
const histories: Record<Who, { role: "planner" | "desk"; text: string }[]> = { planner: [], homeowner: [] }; // kept while the page is open
const WORDS: Record<VoiceAction["type"], string> = { open: "Opened", back: "Back to the list", page: "Page", tab: "Section", set: "Design changed", confirm: "Confirmed", check: "Checks", fact: "Fact changed", send: "Offer sent", start: "Started", goto: "Page", new: "New request", answers: "Noted" };
const SIDE = {
  planner: { url: "/api/voice/turn", context: voiceContext, hint: "Ask about this request or tell the desk what to do: “open Watteaustraße”, “what does it cost without a battery?”, “yearly use is 5,000 kWh”, “tick the roof check”.", placeholder: "Or type to the desk" },
  homeowner: { url: "/api/guide/turn", context: guideContext, hint: "I can walk you through, explain any question and fill in what you tell me: “what is this question for?”, “we use about 4,000 kWh and heat with gas”, “next page”.", placeholder: "Or type to the helper" },
};
const CONSENT_KEY = "voice-helper-allowed";
const chip = (a: VoiceAction) => WORDS[a.type] + (a.type === "tab" ? `: ${a.tab}` : a.type === "page" ? `: ${a.page}` : a.type === "check" ? (a.done ? ": ticked" : ": unticked") : "");
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
  const side = SIDE[who], history = histories[who];
  // A homeowner allows the helper once in this browser: what they say and their answers then go to ElevenLabs and Anthropic.
  const [allowed, setAllowed] = useState(() => who === "planner" || localStorage.getItem(CONSENT_KEY) === "yes");
  const [asking, setAsking] = useState(false);
  const allow = () => { localStorage.setItem(CONSENT_KEY, "yes"); setAllowed(true); setAsking(false); };
  const [ready, setReady] = useState<{ speech: boolean; agent: boolean } | null>(null);
  const [state, setState] = useState<VoiceState>("off");
  const [last, setLast] = useState<Turn | null>(null);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(who === "homeowner");
  const [text, setText] = useState("");
  const level = useRef(0); // 0..1, read by the ball every frame
  const rec = useRef<MediaRecorder | null>(null), chunks = useRef<Blob[]>([]), timer = useRef(0), player = useRef<HTMLAudioElement | null>(null);
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
    setState("thinking"); setError(""); setHidden(false);
    const form = new FormData();
    form.append("context", JSON.stringify(side.context()));
    form.append("history", JSON.stringify(history.slice(-8)));
    if (recorded) form.append("audio", recorded, `speech.${recorded.type.includes("mp4") ? "mp4" : "webm"}`);
    if (typed) form.append("text", typed);
    try {
      const res = await fetch(side.url, { method: "POST", body: form });
      if (!res.ok) throw new Error(`The desk did not answer (${res.status})`);
      const t: Turn = await res.json();
      setLast(t);
      if (t.heard) history.push({ role: "planner", text: t.heard }, { role: "desk", text: t.reply });
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

  const finish = () => { if (rec.current?.state === "recording") rec.current.stop(); };
  const stop = () => { player.current?.pause(); quiet(); setState("off"); }; // a tap while it speaks stops it
  async function listen() {
    setError(""); setHidden(false);
    if (!allowed) { setAsking(true); return; }
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
    } catch {
      setError("The microphone is not available. Allow it in the browser, or type below."); quiet(); setState("off");
    }
  }

  const busy = state === "thinking", name = who === "planner" ? "Desk" : "Helper";
  const label = state === "listening" ? "Listening · tap the ball to send" : state === "thinking" ? "Working on it" : state === "speaking" ? `${name} · tap the ball to stop` : last ? name : who === "planner" ? "Tap the ball and speak" : "Voice helper";
  const typed = (e: React.FormEvent) => { e.preventDefault(); if (!allowed) { setAsking(true); return; } if (text.trim() && !busy) { send(null, text.trim()); setText(""); } };
  return <div className={`voicedock ${who} ${state}`}>
    {!hidden && (asking ? <div className="voicebubble" role="dialog" aria-label="Turn on the voice helper">
      <p className="who">Voice helper<button type="button" className="voicehide" aria-label="Not now" onClick={() => { setAsking(false); setHidden(true); }}>×</button></p>
      <p className="said">The helper walks you through, explains each question and fills in what you tell it.</p>
      <p className="asked">To do that, what you say or type to it and your answers go to ElevenLabs (speech) and Anthropic (Claude), both in the USA, before you send. Your home, the address and photos never do. It shows no prices or sizes: those come from your installer.</p>
      <div className="voicechoice"><Button variant="solid" onClick={allow}>Turn on</Button><Button variant="plain" onClick={() => { setAsking(false); setHidden(true); }}>Not now</Button></div>
    </div> : <div className="voicebubble" aria-live="polite">
      <p className={`who${state === "listening" ? " live" : state === "speaking" ? " speaking" : ""}`}>{label}<button type="button" className="voicehide" aria-label="Hide" onClick={() => setHidden(true)}>×</button></p>
      {last?.heard && state !== "listening" && <p className="asked">“{last.heard}”</p>}
      {last && state !== "listening" && <p className="said">{last.reply}</p>}
      {!last && !error && state !== "listening" && <p className="said hint">{side.hint}</p>}
      {last && last.actions.length > 0 && state !== "listening" && <ul className="voiceacts">{last.actions.map((a, i) => <li key={i}>{chip(a)}</li>)}</ul>}
      {error && <p className="voiceerr">{error}</p>}
      <form onSubmit={typed}>
        <Input value={text} onChange={(e) => setText(e.target.value)} onFocus={() => !allowed && setAsking(true)} placeholder={side.placeholder} disabled={busy || ready?.agent === false} aria-label={side.placeholder} />
      </form>
    </div>)}
    <Core state={state} level={level} busy={busy} onListen={listen} onFinish={finish} onStop={stop} />
    {hidden && <button type="button" className="voiceshow" onClick={() => (allowed ? setHidden(false) : (setHidden(false), setAsking(true)))}>{allowed ? (last ? "Show answer" : "Show helper") : "Voice helper"}</button>}
  </div>;
}
