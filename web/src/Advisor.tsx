// The advisor's read of the design on the desk: which of the engine's options fits this customer, why, and what to ask first.
// It is asked on demand, so a planner's edit costs no call; a changed design clears the old answer (the parent keys it).
import { useState } from "react";
import { Advice, Design, Overrides } from "./plan";
import { alternativesOf } from "./Options";
import { Button } from "./ui";

export function Advisor({ d, ask, use }: { d: Design; ask: () => Promise<Advice>; use: (o: Overrides, label: string) => void }) {
  const [a, setA] = useState<Advice | null>(null), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const run = () => { setBusy(true); setFailed(false); ask().then(setA).catch(() => setFailed(true)).finally(() => setBusy(false)); };
  if (!a) return <section className="advisor" aria-label="Advisor">
    <div className="advisor-head"><b>Second opinion</b><Button disabled={busy} onClick={run}>{busy ? "Reading the design…" : "Ask the advisor"}</Button></div>
    <small>{failed ? "The advisor could not be reached. The design itself is unchanged." : "Weighs the engine's options against what the customer told us. It picks and explains; every number is the engine's."}</small>
  </section>;
  const alt = alternativesOf(d).find((x) => x.id === a.pick);
  const change: Overrides | null = alt ? { ...alt.overrides, ...(a.battery_kwh != null ? { battery_kwh: a.battery_kwh } : {}) } : a.battery_kwh != null && a.battery_kwh !== d.battery.kwh ? { battery_kwh: a.battery_kwh } : null;
  return <section className="advisor" aria-label="Advisor">
    <div className="advisor-head"><b>{a.headline}</b><span className="advisor-tag">{a.source === "claude" ? "AI advisor" : "Engine notes"}</span></div>
    {a.reasons.length > 0 && <ul>{a.reasons.map((s) => <li key={s}>{s}</li>)}</ul>}
    {a.risk && <p className="flag">{a.risk}</p>}
    {a.questions.length > 0 && <><h4>Ask the customer</h4><ol>{a.questions.map((s) => <li key={s}>{s}</li>)}</ol></>}
    <div className="advisor-actions">
      {change ? <Button onClick={() => use(change, `Advisor: ${alt ? alt.title.toLowerCase() : `${a.battery_kwh} kWh battery`}`)}>Use the advisor's pick</Button> : <small>The advisor keeps the current design.</small>}
      <Button variant="plain" disabled={busy} onClick={run}>Ask again</Button>
    </div>
  </section>;
}
