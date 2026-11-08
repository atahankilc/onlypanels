// The planner's voice: tap the orb, speak, tap again. ElevenLabs hears it, Claude works the desk through its MCP tools,
// the desk does what was asked as clicks would, and the answer is spoken back. Typing works the same way without a mic.
// Planner only: the homeowner's pages never record or send audio. The orb and the bubble come from the Steward project.
import { useEffect, useRef, useState } from "react";
import { Input } from "./ui";
import { VoiceOrb, VoiceState } from "./VoiceOrb";
import { VoiceAction, runActions, voiceContext } from "./voiceBus";
import "./voice.css";

type Turn = { heard: string; reply: string; actions: VoiceAction[]; audio: string | null; source: string };
const MAX_SECONDS = 25;
const history: { role: "planner" | "desk"; text: string }[] = []; // kept while the page is open, across requests
const WORDS: Record<VoiceAction["type"], string> = { open: "Opened", back: "Back to the list", page: "Page", tab: "Section", set: "Design changed", confirm: "Confirmed", check: "Checks", fact: "Fact changed", send: "Offer sent" };
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

export default function VoiceDock() {
  const [ready, setReady] = useState<{ speech: boolean; agent: boolean } | null>(null);
  const [state, setState] = useState<VoiceState>("off");
  const [last, setLast] = useState<Turn | null>(null);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);
  const [text, setText] = useState("");
  const level = useRef(0); // 0..1, read by the orb every frame
  const rec = useRef<MediaRecorder | null>(null), chunks = useRef<Blob[]>([]), timer = useRef(0), player = useRef<HTMLAudioElement | null>(null);
  const audio = useRef<AudioContext | null>(null), meter = useRef<AnalyserNode | null>(null), frame = useRef(0);
  useEffect(() => { fetch("/api/voice/status").then((r) => r.json()).then(setReady).catch(() => setReady({ speech: false, agent: false })); }, []);
  useEffect(() => () => { rec.current?.stream.getTracks().forEach((t) => t.stop()); player.current?.pause(); cancelAnimationFrame(frame.current); audio.current?.close(); }, []);

  /** Feeds the orb the loudness of whatever is live: the mic while listening, the answer while speaking. */
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
    form.append("context", JSON.stringify(voiceContext()));
    form.append("history", JSON.stringify(history.slice(-8)));
    if (recorded) form.append("audio", recorded, `speech.${recorded.type.includes("mp4") ? "mp4" : "webm"}`);
    if (typed) form.append("text", typed);
    try {
      const res = await fetch("/api/voice/turn", { method: "POST", body: form });
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
      } catch { /* no meter: the orb still speaks */ }
      setState("speaking");
      await el.play().catch(() => { quiet(); setState("off"); });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong"); quiet(); setState("off");
    }
  }

  async function listen() {
    if (state === "listening") { rec.current?.stop(); return; }
    if (state === "speaking") { player.current?.pause(); quiet(); setState("off"); return; } // a tap while it speaks stops it
    setError(""); setHidden(false);
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

  const canHear = !!ready?.speech, busy = state === "thinking";
  const who = state === "listening" ? "Listening · tap to send" : state === "thinking" ? "Working on it" : state === "speaking" ? "Desk · tap to stop" : last ? "Desk" : canHear ? "Tap and speak" : "Voice needs ELEVENLABS_API_KEY";
  return <div className={`voicedock ${state}`}>
    {!hidden && <div className="voicebubble" aria-live="polite">
      <p className={`who${state === "listening" ? " live" : state === "speaking" ? " speaking" : ""}`}>{who}<button type="button" className="voicehide" aria-label="Hide" onClick={() => setHidden(true)}>×</button></p>
      {last?.heard && state !== "listening" && <p className="asked">“{last.heard}”</p>}
      {last && state !== "listening" && <p className="said">{last.reply}</p>}
      {!last && !error && state !== "listening" && <p className="said hint">Ask about this request or tell the desk what to do: “open Watteaustraße”, “what does it cost without a battery?”, “yearly use is 5,000 kWh”, “tick the roof check”.</p>}
      {last && last.actions.length > 0 && state !== "listening" && <ul className="voiceacts">{last.actions.map((a, i) => <li key={i}>{chip(a)}</li>)}</ul>}
      {error && <p className="voiceerr">{error}</p>}
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim() && !busy) { send(null, text.trim()); setText(""); } }}>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Or type to the desk" disabled={busy || ready?.agent === false} aria-label="Type to the desk" />
      </form>
    </div>}
    <VoiceOrb state={state} level={level} size={72} disabled={busy || !canHear} onClick={listen}
      label={state === "listening" ? "Stop and send" : state === "speaking" ? "Stop speaking" : canHear ? "Talk to the desk" : "Voice needs ELEVENLABS_API_KEY"} />
    {hidden && <button type="button" className="voiceshow" onClick={() => setHidden(false)}>Show answer</button>}
  </div>;
}
