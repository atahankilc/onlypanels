// The planner's agent: when a request opens it reviews the draft by running the engine on the variants that matter,
// shows each run as it happens, and ends with a proposal the planner can use in one click. The planner can ask it
// anything; it answers by running the engine again. Every number on this card comes from the engine (agent.py).
import { useEffect, useRef, useState } from "react";
import { Design, Overrides, Request, Spot, designBody } from "./plan";
import { Button, Input } from "./ui";

type Result = { modules: number; kwp: number; battery_kwh: number; heatpump_kw: number; wallbox: boolean; production_mwh: number; own_power_pct: number; saving_eur_year: number };
type Step = { tool: "try_design" | "battery_sizes"; fixed: Partial<Overrides>; what_if: { demand_kwh?: number; ev?: boolean; ev_km?: number }; result: Partial<Result> & { sizes?: number } };
type Answer = { headline: string; reasons: string[]; questions: string[]; risk: string | null; answer: string | null; change: Overrides | null; after: (Result & { need_mwh: number }) | null; steps: Step[]; source: string };
type Turn = { asked: string | null; steps: Step[]; answer: Answer | null; failed?: boolean };

// Runs stay with the request while the desk is open, so switching tabs or requests never asks twice.
const kept = new Map<string, Turn[]>();
const started = new Set<string>(); // the first review starts once per request, even when React mounts the card twice

const eur = (v: number) => `€${Math.round(v).toLocaleString("en")}`;
function stepLine(s: Step) {
  const what = [s.what_if.ev === true ? "with a car" : s.what_if.ev === false ? "without a car" : "", s.what_if.ev_km ? `${Math.round(s.what_if.ev_km).toLocaleString("en")} km` : "", s.what_if.demand_kwh ? `${Math.round(s.what_if.demand_kwh).toLocaleString("en")} kWh use` : ""].filter(Boolean).join(", ");
  if (s.tool === "battery_sizes") return `Every battery size${s.fixed.modules ? ` at ${s.fixed.modules} modules` : ""}`;
  const r = s.result, f = s.fixed;
  const tried = [f.modules != null ? `${f.modules} modules` : "", f.battery_kwh != null ? (f.battery_kwh ? `${f.battery_kwh} kWh` : "no battery") : "", f.heatpump != null ? (f.heatpump ? "heat pump" : "no heat pump") : "", f.wallbox != null ? (f.wallbox ? "wallbox" : "no wallbox") : ""].filter(Boolean).join(" · ") || "the draft";
  return `${what ? `What if ${what}: ` : ""}${tried} → ${r.kwp?.toFixed(1)} kWp, ${r.battery_kwh ? `${r.battery_kwh} kWh` : "no battery"}, ${r.own_power_pct}% own power, ${eur(r.saving_eur_year ?? 0)} a year`;
}
const changeWords = (c: Overrides) => [c.modules != null ? `${c.modules} modules` : "", c.battery_kwh != null ? (c.battery_kwh ? `${c.battery_kwh} kWh battery` : "no battery") : "", c.heatpump != null ? (c.heatpump ? "add the heat pump" : "no heat pump") : "", c.wallbox != null ? (c.wallbox ? "add the wallbox" : "no wallbox") : ""].filter(Boolean).join(", ");

async function ask(body: unknown, onStep: (s: Step) => void): Promise<Answer> {
  const res = await fetch("/api/agent/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error("agent");
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", done: Answer | null = null;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let cut;
    while ((cut = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, cut); buf = buf.slice(cut + 2);
      const kind = /^event: (\w+)/m.exec(chunk)?.[1], data = /^data: (.*)$/m.exec(chunk)?.[1];
      if (!data) continue;
      if (kind === "step") onStep(JSON.parse(data));
      if (kind === "done") done = JSON.parse(data);
    }
    if (end) break;
  }
  if (!done) throw new Error("agent");
  return done;
}

export function AgentPanel({ r, d, roof, use }: { r: Request; d: Design; roof: Spot[]; use: (o: Overrides, label: string) => void }) {
  // A run cut off by leaving the request is dropped on return, so it can start again rather than wait forever.
  const [turns, setTurns] = useState<Turn[]>(() => { const l = (kept.get(r.id) ?? []).filter((t) => t.answer || t.failed); if (!l.length) started.delete(r.id); return l; });
  const [busy, setBusy] = useState(false), [text, setText] = useState("");
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { kept.set(r.id, turns); }, [turns, r.id]);

  const run = (asked: string | null) => {
    if (busy || !roof.length && r.buildings.length) return;
    const history = turns.flatMap((t) => [...(t.asked ? [{ role: "planner", text: t.asked }] : []), ...(t.answer ? [{ role: "agent", text: [t.answer.headline, t.answer.answer].filter(Boolean).join("\n") }] : [])]);
    const { body } = designBody(r.inputs, r.overrides, roof, r.off, r.existing, r.strict);
    const at = turns.length;
    setBusy(true);
    setTurns((l) => [...l, { asked, steps: [], answer: null }]);
    const patch = (f: (t: Turn) => Turn) => setTurns((l) => l.map((t, i) => (i === at ? f(t) : t)));
    ask({ ...(body as object), message: asked, history }, (s) => live.current && patch((t) => ({ ...t, steps: [...t.steps, s] })))
      .then((a) => live.current && patch((t) => ({ ...t, answer: a })))
      .catch(() => live.current && patch((t) => ({ ...t, failed: true })))
      .finally(() => live.current && setBusy(false));
  };
  // The first review starts by itself when the request opens.
  useEffect(() => { if (!turns.length && !started.has(r.id) && (roof.length || !r.buildings.length)) { started.add(r.id); run(null); } }, [r.id, roof.length]);

  const applied = (c: Overrides) => Object.entries(c).every(([k, v]) => (r.overrides as Record<string, unknown>)[k] === v);
  return <section className="agent" aria-label="Planning agent">
    <div className="agent-head"><b>Planning agent</b><span className="agent-tag">{busy ? "working" : turns.at(-1)?.answer?.source === "claude" ? "AI · numbers from the engine" : turns.length ? "engine notes" : ""}</span></div>
    {turns.map((t, i) => <div key={i} className="agent-turn">
      {t.asked && <p className="agent-asked">{t.asked}</p>}
      {t.steps.length > 0 && <ol className="agent-steps">{t.steps.map((s, k) => <li key={k}>{stepLine(s)}</li>)}</ol>}
      {!t.answer && !t.failed && <p className="small muted agent-wait"><span className="spinner" aria-hidden="true" />{t.steps.length ? "Trying the next option in the engine…" : t.asked ? "Reading your question…" : "Reading the request and choosing what to test…"}</p>}
      {t.failed && <p className="small muted">The agent could not be reached. The design is unchanged.</p>}
      {t.answer && <>
        {t.answer.answer && <p className="agent-answer">{t.answer.answer}</p>}
        {(!t.asked || t.answer.change) && <p className="agent-headline">{t.answer.headline}</p>}
        {!t.asked && t.answer.reasons.length > 0 && <ul>{t.answer.reasons.map((s) => <li key={s}>{s}</li>)}</ul>}
        {!t.asked && t.answer.risk && <p className="flag">{t.answer.risk}</p>}
        {t.answer.change && t.answer.after && <div className="agent-change">
          <div><b>{changeWords(t.answer.change)}</b><small>{t.answer.after.kwp.toFixed(1)} kWp · {t.answer.after.battery_kwh ? `${t.answer.after.battery_kwh} kWh` : "no battery"} · {t.answer.after.own_power_pct}% own power · {eur(t.answer.after.saving_eur_year)} a year</small></div>
          {applied(t.answer.change) ? <span className="agent-tag">In use</span> : <Button onClick={() => use(t.answer!.change!, `Agent: ${changeWords(t.answer!.change!)}`)}>Use this</Button>}
        </div>}
        {!t.asked && t.answer.questions.length > 0 && <><h4>Ask the customer</h4><ol>{t.answer.questions.map((s) => <li key={s}>{s}</li>)}</ol></>}
      </>}
    </div>)}
    <form className="askbox" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { run(text.trim()); setText(""); } }}>
      <Input aria-label="Ask the agent" placeholder="Ask the agent, e.g. what if they skip the battery?" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
      <Button type="submit" disabled={busy || !text.trim()}>Ask</Button>
    </form>
    {turns.length > 0 && !busy && <Button variant="plain" onClick={() => run(null)}>Review the current design again</Button>}
  </section>;
}
