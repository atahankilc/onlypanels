// The planner's review of a request: fixed rules over the engine, no language model (casework.py). It says what follows
// from the homeowner's answers, which unsure answers would move the design (so they are worth asking), and one change
// that fits the customer, usable in one click. It runs again whenever the request changes, in about a second.
// Below it, the planner can still ask Claude a question; Claude answers by running the engine (agent.py).
import { useEffect, useRef, useState } from "react";
import { Design, Overrides, Request, Spot, designBody } from "./plan";
import { Button, Input } from "./ui";

type Result = { modules: number; kwp: number; battery_kwh: number; heatpump_kw: number; wallbox: boolean; production_mwh: number; own_power_pct: number; saving_eur_year: number; need_mwh?: number };
type WhatIf = { demand_kwh?: number; ev?: boolean; ev_km?: number; heat_kwh?: number; heat_dist?: string; home_day?: string };
type Step = { tool: "try_design" | "battery_sizes"; fixed: Partial<Overrides>; what_if: WhatIf; why?: string; result: Partial<Result> & { sizes?: number } };
type Fact = { id: string; title: string; text: string; from: string[]; changes: string | null; level: "note" | "warn" };
type Ask = { fact: string; question: string; why: string; low: Result; high: Result };
type ReviewMoney = { pays_eur: number; gross_eur: number; payback_years: number | null; gain_eur: number; draft_2027_payback_years: number | null; grant: { eur: number; rate_pct: number; path: string } | null;
  counted: { title: string; effect: string; status: string }[]; todo: { title: string; action: string; status: string }[] };
type Review = { headline: string; change: Overrides | null; after: Result | null; reasons: string[]; asks: Ask[]; steady: { fact: string; text: string }[]; conditions: { id: string; title: string; text: string }[]; facts: Fact[]; draft: Result; steps: Step[]; money?: ReviewMoney };
const euro = (v: number) => `€${Math.round(v).toLocaleString("en")}`;
type Answer = { headline: string; answer: string | null; change: Overrides | null; after: Result | null; steps: Step[]; source: string };
type Turn = { asked: string; steps: Step[]; answer: Answer | null; failed?: boolean };

// Questions stay with the request while the desk is open, so switching tabs or requests never asks twice.
const kept = new Map<string, Turn[]>();

const eur = (v: number) => `€${Math.round(v).toLocaleString("en")}`;
const n = (v: number) => Math.round(v).toLocaleString("en");
function stepLine(s: Step) {
  const w = s.what_if;
  const what = [w.ev === true ? "with a car" : w.ev === false ? "without a car" : "", w.ev_km ? `${n(w.ev_km)} km` : "", w.demand_kwh ? `${n(w.demand_kwh)} kWh use` : "",
    w.heat_kwh ? `${n(w.heat_kwh)} kWh heat` : "", w.heat_dist ? (w.heat_dist === "floor" ? "underfloor heating" : "radiators") : "", w.home_day ? (w.home_day === "most" ? "someone home in the day" : "nobody home in the day") : ""].filter(Boolean).join(", ");
  if (s.tool === "battery_sizes") return `Every battery size${s.fixed.modules ? ` at ${s.fixed.modules} modules` : ""}`;
  const r = s.result, f = s.fixed;
  const tried = [f.modules != null ? `${f.modules} modules` : "", f.battery_kwh != null ? (f.battery_kwh ? `${f.battery_kwh} kWh` : "no battery") : "", f.heatpump != null ? (f.heatpump ? "heat pump" : "no heat pump") : "", f.wallbox != null ? (f.wallbox ? "wallbox" : "no wallbox") : ""].filter(Boolean).join(" · ") || (what ? "" : "the draft");
  return `${what ? `If ${what}${tried ? `, ${tried}` : ""}` : tried} → ${r.modules} modules, ${r.battery_kwh ? `${r.battery_kwh} kWh` : "no battery"}${r.heatpump_kw ? `, ${r.heatpump_kw} kW heat pump` : ""}, ${r.own_power_pct}% own power`;
}
const changeWords = (c: Overrides) => [c.modules != null ? `${c.modules} modules` : "", c.battery_kwh != null ? (c.battery_kwh ? `${c.battery_kwh} kWh battery` : "no battery") : "", c.heatpump != null ? (c.heatpump ? "add the heat pump" : "no heat pump") : "", c.wallbox != null ? (c.wallbox ? "add the wallbox" : "no wallbox") : ""].filter(Boolean).join(", ");
const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function ask(body: unknown, onStep: (s: Step) => void): Promise<Answer> {
  const res = await post("/api/agent/stream", body);
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

export function AgentPanel({ r, roof, use }: { r: Request; d: Design; roof: Spot[]; use: (o: Overrides, label: string) => void }) {
  const [review, setReview] = useState<Review | null>(null), [failed, setFailed] = useState(false);
  const [turns, setTurns] = useState<Turn[]>(() => (kept.get(r.id) ?? []).filter((t) => t.answer || t.failed));
  const [busy, setBusy] = useState(false), [text, setText] = useState(""), [showSteps, setShowSteps] = useState(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { kept.set(r.id, turns); }, [turns, r.id]);
  const ready = roof.length > 0 || !r.buildings.length;

  // The review follows the request: every change of a fact or a choice reviews it again.
  useEffect(() => {
    if (!ready) return;
    let on = true;
    const t = setTimeout(() => post("/api/review", designBody(r.inputs, r.overrides, roof, r.off, r.existing, r.strict).body)
      .then((x) => { if (!x.ok) throw new Error(); return x.json(); }).then((x: Review) => { if (on) { setReview(x); setFailed(false); } })
      .catch(() => on && setFailed(true)), 200);
    return () => { on = false; clearTimeout(t); };
  }, [r.inputs, r.overrides, r.off, r.existing, r.strict, roof, ready]);

  const question = (asked: string) => {
    if (busy || !ready) return;
    const history = turns.flatMap((t) => [{ role: "planner", text: t.asked }, ...(t.answer ? [{ role: "agent", text: [t.answer.headline, t.answer.answer].filter(Boolean).join("\n") }] : [])]);
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

  const applied = (c: Overrides) => Object.entries(c).every(([k, v]) => (r.overrides as Record<string, unknown>)[k] === v);
  const fromAnswers = review?.facts.filter((f) => f.level !== "warn" && f.id !== "demand_edges") ?? [];
  return <section className="agent" aria-label="Review">
    <div className="agent-head"><b>Review</b><span className="agent-tag">{!review && !failed ? "working" : "rules over the engine, no AI"}</span></div>
    {failed && <p className="small muted">The review could not run. The design is unchanged.</p>}
    {!review && !failed && <p className="small muted agent-wait"><span className="spinner" aria-hidden="true" />Trying the answers that were guessed…</p>}
    {review && <div className="agent-turn">
      <p className="agent-headline">{review.headline}</p>
      {review.reasons.length > 0 && <ul>{review.reasons.map((s) => <li key={s}>{s}</li>)}</ul>}
      {review.change && review.after && <div className="agent-change">
        <div><b>{changeWords(review.change)}</b><small>{review.after.kwp.toFixed(1)} kWp · {review.after.battery_kwh ? `${review.after.battery_kwh} kWh` : "no battery"} · {review.after.own_power_pct}% own power · {eur(review.after.saving_eur_year)} a year</small></div>
        {applied(review.change) ? <span className="agent-tag">In use</span> : <Button onClick={() => use(review.change!, `Review: ${changeWords(review.change!)}`)}>Use this</Button>}
      </div>}
      {review.asks.length > 0 && <><h4>Ask the customer: these move the design</h4><ol>{review.asks.map((a) => <li key={a.fact}><b>{a.question}</b><br /><small className="muted">{a.why}</small></li>)}</ol></>}
      {review.money && <><h4>Money and rules</h4>
        <p className="small">The homeowner pays {euro(review.money.pays_eur)}{review.money.grant ? ` after ${euro(review.money.grant.eur)} in heat pump grants (${review.money.grant.path === "fkg" ? "KfW and Munich" : "KfW"})` : ""}; {review.money.payback_years != null ? `it pays back in about ${review.money.payback_years} years` : "it does not pay back within 20 years"} and leaves them {euro(Math.abs(review.money.gain_eur))} {review.money.gain_eur >= 0 ? "ahead" : "behind"} after 20 years.
          {review.money.draft_2027_payback_years != null && review.money.draft_2027_payback_years !== review.money.payback_years ? ` Switched on in 2027 under the draft EEG: about ${review.money.draft_2027_payback_years} years.` : ""}</p>
        {review.money.counted.length > 0 && <ul className="small muted">{review.money.counted.map((c) => <li key={c.title}>{c.title}: {c.effect}{c.status === "draft" ? " (draft law)" : ""}</li>)}</ul>}
        {review.money.todo.length > 0 && <><h4>To do before the order</h4><ul>{review.money.todo.map((t) => <li key={t.title}><b>{t.title}.</b> {t.action}</li>)}</ul></>}</>}
      {review.conditions.length > 0 && <><h4>Before the offer</h4><ul>{review.conditions.map((c) => <li key={c.id}><b>{c.title}.</b> {c.text}</li>)}</ul></>}
      {fromAnswers.length > 0 && <><h4>Read from the answers</h4><ul>{fromAnswers.map((f) => <li key={f.id}><b>{f.title}.</b> {f.text}</li>)}</ul></>}
      {review.steady.length > 0 && <><h4>Fine as given</h4><ul className="small muted">{review.steady.map((s) => <li key={s.fact}>{s.text}</li>)}</ul></>}
      <Button variant="plain" onClick={() => setShowSteps(!showSteps)}>{showSteps ? "Hide" : "Show"} the {review.steps.length} engine runs</Button>
      {showSteps && <ol className="agent-steps">{review.steps.map((s, k) => <li key={k}>{stepLine(s)}</li>)}</ol>}
    </div>}
    {turns.map((t, i) => <div key={i} className="agent-turn">
      <p className="agent-asked">{t.asked}</p>
      {t.steps.length > 0 && <ol className="agent-steps">{t.steps.map((s, k) => <li key={k}>{stepLine(s)}</li>)}</ol>}
      {!t.answer && !t.failed && <p className="small muted agent-wait"><span className="spinner" aria-hidden="true" />{t.steps.length ? "Trying the next option in the engine…" : "Reading your question…"}</p>}
      {t.failed && <p className="small muted">Claude could not be reached. The design is unchanged.</p>}
      {t.answer && <>
        {t.answer.answer && <p className="agent-answer">{t.answer.answer}</p>}
        {t.answer.change && t.answer.after && <div className="agent-change">
          <div><b>{changeWords(t.answer.change)}</b><small>{t.answer.after.kwp.toFixed(1)} kWp · {t.answer.after.battery_kwh ? `${t.answer.after.battery_kwh} kWh` : "no battery"} · {t.answer.after.own_power_pct}% own power · {eur(t.answer.after.saving_eur_year)} a year</small></div>
          {applied(t.answer.change) ? <span className="agent-tag">In use</span> : <Button onClick={() => use(t.answer!.change!, `Claude: ${changeWords(t.answer!.change!)}`)}>Use this</Button>}
        </div>}
        <small className="muted">{t.answer.source === "claude" ? "Written by Claude, numbers from the engine" : "Claude unavailable: engine notes"}</small>
      </>}
    </div>)}
    <form className="askbox" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { question(text.trim()); setText(""); } }}>
      <Input aria-label="Ask Claude" placeholder="Ask Claude, e.g. what if they skip the battery?" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
      <Button type="submit" disabled={busy || !text.trim()}>Ask</Button>
    </form>
  </section>;
}
