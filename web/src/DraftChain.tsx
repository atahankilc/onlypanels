// The draft's chain: the steps that made a request's draft, each with what it found. No times: the steps take a second or less
// in all, so their length says nothing to a planner. Live while it runs:
// the step now working turns, the ones still to come wait in grey. Under each request in the list, and one step a line on a
// request opened before its draft is in.
import { Spot } from "./plan";
import { Shade } from "./treeShade";
import { Done, STEPS, StepKey, useDraftLog } from "./draftLog";

const euro = (v: number) => `€${Math.round(v).toLocaleString("en")}`;
type Said = [short: string, detail: string];

/** What each step found: a few words for the chain, a sentence for the hover. From the step's own answer, never made up. */
export const chainText = {
  home: (buildings: number, sides: number): string => `${buildings > 1 ? `${buildings} buildings, ` : ""}${sides} roof ${sides === 1 ? "side" : "sides"}`,
  roof: (home: boolean, roof: Spot[]): Said => {
    if (!home) return ["no home shared", "No home was shared: the roof comes from the answers."];
    const fits = roof.reduce((a, x) => a + x.fits, 0);
    return [`${fits} panels fit`, `Room for ${fits} panels on ${roof.length} roof ${roof.length === 1 ? "side" : "sides"}.`];
  },
  trees: (home: boolean, s: Shade): Said => {
    if (!home) return ["no home shared", "No home was shared, so there are no trees to check."];
    if (s.status === "unknown") return ["not read", "The tree map could not be read."];
    if (s.status === "none" || !s.surfaces.length) return ["no shade", s.trees ? `${s.trees} trees nearby, none takes sun from the roof.` : "No tree takes sun from the roof."];
    const worst = s.surfaces.reduce((a, x) => (x.lost > a.lost ? x : a)), pct = Math.round(worst.lost * 100);
    return [`−${pct}% sun`, `${s.trees} ${s.trees === 1 ? "tree takes" : "trees take"} sun: up to ${pct}% of a year's sun on the ${worst.name}.`];
  },
  engine: (system: string, own: number): Said => [`${own}% own power`, `${system}, with ${own}% of the home's use from its own power.`], // the system itself is in the row above
  review: (v: unknown): Said => {
    const r = v as { asks?: unknown[]; conditions?: unknown[] };
    const a = r.asks?.length ?? 0, c = r.conditions?.length ?? 0;
    const q = a ? `${a} ${a === 1 ? "question" : "questions"}` : "no questions";
    return [q, `${a ? `${q} for the customer` : "Nothing to ask the customer"}${c ? `; ${c} ${c === 1 ? "condition" : "conditions"} for the offer` : ""}.`];
  },
  costs: (v: unknown): Said => {
    const c = v as { pays_eur?: number; payback_years?: number | null; assumptions?: { years: number } };
    if (c.pays_eur == null) return ["priced", "Priced."];
    const back = c.payback_years != null ? `pays back in ${c.payback_years.toLocaleString("en", { maximumFractionDigits: 1 })} years` : `does not pay back in ${c.assumptions?.years ?? 20} years`;
    return [euro(c.pays_eur), `The homeowner pays ${euro(c.pays_eur)} and it ${back}.`];
  },
};

/** The steps in their fixed order, so every request's chain lines up with the one above it. A step is working from the moment it
 *  began: the trees and the roof as the request arrives, the engine once the roof is in, the rules and the price once the engine
 *  is, so steps that run side by side work side by side. A demo request's home was loaded before it arrived; a homeowner's page
 *  loads it while they pick, so it has no home step. */
const stepsOf = (log: { starts: Partial<Record<StepKey, number>>; done: Partial<Record<StepKey, Done>> }) =>
  STEPS.filter((s) => s.key !== "home" || log.done.home).map((s) => {
    const d = log.done[s.key] ?? null;
    const begun = s.key === "trees" || s.key === "roof" || log.starts[s.key] != null;
    return { ...s, d, state: d ? ("done" as const) : begun ? ("now" as const) : ("wait" as const) };
  });

export function DraftChain({ id, full }: { id: string; full?: boolean }) {
  const log = useDraftLog(id);
  if (!log) return null;
  const steps = stepsOf(log);
  const all = steps.every((s) => s.state === "done");
  return <ol className={`chain${full ? " full" : ""}`} style={{ "--steps": steps.length } as React.CSSProperties} aria-label={all ? "How the draft was made" : "Making the draft"}>
    {steps.map((s) => <li key={s.key} className={s.state} title={s.d ? `${s.label}: ${s.d.detail}` : `${s.label}: ${s.what}.`}>
      <i aria-hidden="true" />
      <span className="chain-label">{s.label}</span>
      {full
        ? <small>{s.d ? s.d.detail : `${s.what[0].toUpperCase()}${s.what.slice(1)}.`}</small>
        : <span className="chain-found">{s.d ? s.d.short : s.state === "now" ? "working…" : "waiting"}</span>}
    </li>)}
  </ol>;
}
