// What the past projects support for this home, given what we know: the range of experts' offers for homes like it, where
// the draft sits in it, what is known and what would narrow it. And what the desk has learned from the planner's own
// approved offers. Every number is the API's (evidence.py, learning.py).
import { useEffect, useState } from "react";
import { Design } from "./plan";
import { Button } from "./ui";

type Fact = { id: string; label: string; known: boolean; why: string };
type Learned = { homes: number; changed: number; modules: number; battery_kwh: number; enough: boolean; applied: { modules?: number; battery_kwh?: number } };
export type Evidence = {
  level: "dataset" | "roof" | "narrow"; known: Fact[]; homes: number; offers: number; several: number;
  kwp: { low: number; mid: number; high: number; roof: number | null; high_on_roof: number; modules_low: number; modules_high: number };
  battery: { share_pct: number; low: number | null; high: number | null; common: number[] };
  draft: { kwp: number; position_pct: number | null; inside: boolean }; coverage_pct: number | null; approved?: Learned;
};
export const evidenceOf = (d: Design) => (d as Design & { evidence?: Evidence }).evidence ?? null;

const LEVEL = {
  dataset: ["Range first", "Only what past projects also recorded is known. Offer the range; the draft is one point in it."],
  roof: ["Roof known", "The roof limits the size. The yearly use and the rest still move it within the range."],
  narrow: ["Well known", "The facts that move size most are known: the draft can be offered as it is."],
} as const;

export function EvidenceCard({ d, onForget }: { d: Design; onForget?: () => void }) {
  const e = evidenceOf(d);
  const [total, setTotal] = useState<{ offers: number; changed: number } | null>(null);
  useEffect(() => { fetch("/api/approved").then((r) => r.json()).then(setTotal).catch(() => undefined); }, [d]);
  if (!e) return null;
  const k = e.kwp, lo = Math.min(k.low, d.pv.kwp) * 0.9, hi = Math.max(k.high, k.roof ?? 0, d.pv.kwp) * 1.05;
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const [title, text] = LEVEL[e.level];
  const missing = e.known.filter((f) => !f.known);
  const a = e.approved;
  return <section className={`evidence ${e.level}`} aria-label="What the data supports">
    <header><b>What past projects support</b><span className="evidence-level">{title}</span></header>
    <p className="small muted">{text}</p>
    <div className="evidence-bar" role="img" aria-label={`Experts offered ${k.low} to ${k.high} kWp for ${e.homes} similar homes; the draft is ${d.pv.kwp.toFixed(1)} kWp`}>
      <i className="band" style={{ left: x(k.low), width: `calc(${x(Math.min(k.high, k.roof ?? k.high))} - ${x(k.low)})` }} />
      {k.roof != null && k.roof < k.high && <i className="over" style={{ left: x(k.roof), width: `calc(${x(k.high)} - ${x(k.roof)})` }} />}
      <i className="mid" style={{ left: x(k.mid) }} />
      {k.roof != null && <i className="roof" style={{ left: x(k.roof) }} title={`Roof holds ${k.roof} kWp`} />}
      <b className="draft" style={{ left: x(d.pv.kwp) }} />
    </div>
    <div className="evidence-scale small" aria-hidden="true">
      <span style={{ left: x(k.low) }}>{k.low}</span><span style={{ left: x(k.high) }}>{k.high} kWp</span>
      {k.roof != null && Math.abs(k.roof - k.high) > (hi - lo) * 0.12 && <span className="roof" style={{ left: x(k.roof) }}>roof {k.roof}</span>}
    </div>
    <p className="small muted evidence-key"><i className="dot" /> the draft, {d.pv.kwp.toFixed(1)} kWp · <i className="tick" /> the middle offer{k.roof != null ? <> · <i className="line" /> what the roof holds</> : null}</p>
    <dl className="evidence-rows">
      <div><dt>Solar</dt><dd>{k.modules_low}–{k.modules_high} modules, {k.low}–{k.high_on_roof} kWp<small>8 in 10 of the {e.offers} offers experts made for {e.homes} similar homes{e.several ? `; ${e.several} homes got more than one option` : ""}</small></dd></div>
      <div><dt>Battery</dt><dd>{e.battery.share_pct}% of offers{e.battery.low != null ? `, ${e.battery.low}–${e.battery.high} kWh` : ""}<small>{e.battery.common.length ? `most often ${e.battery.common.map((c) => `${c} kWh`).join(", ")}` : ""}</small></dd></div>
      {e.coverage_pct != null && <div><dt>How sure</dt><dd>{e.coverage_pct}%<small>of unseen past projects at this installer ended inside such a range</small></dd></div>}
    </dl>
    {missing.length > 0 && <><p className="small"><b>To narrow it</b></p><ul className="evidence-missing">{missing.map((f) => <li key={f.id}><b>{f.label}</b><small>{f.why}</small></li>)}</ul></>}
    <div className="evidence-learned small">
      {a?.enough && (a.applied.modules != null || a.applied.battery_kwh != null)
        ? <p>Learned from {a.homes} offers you approved for similar homes (you changed {a.changed}): the draft moved by your usual change: {[a.modules ? `${a.modules > 0 ? "+" : ""}${a.modules} modules` : "", a.battery_kwh ? `${a.battery_kwh > 0 ? "+" : ""}${a.battery_kwh} kWh battery` : ""].filter(Boolean).join(", ")}.</p>
        : a && a.homes > 0 ? <p className="muted">{a.homes} offer{a.homes === 1 ? "" : "s"} you approved {a.homes === 1 ? "is" : "are"} like this home{a.enough ? "; your usual change here is too small to move the draft" : `; from 3 on, the draft follows your usual change`}.</p>
        : <p className="muted">No approved offer like this home yet. Each offer you send teaches the desk your usual changes for homes like it.</p>}
      {total && total.offers > 0 && onForget && <Button variant="plain" onClick={() => fetch("/api/approved", { method: "DELETE" }).then(() => { setTotal({ offers: 0, changed: 0 }); onForget(); })}>Forget {total.offers} approved offers</Button>}
    </div>
  </section>;
}
