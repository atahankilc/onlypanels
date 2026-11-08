// The draft's chain: the steps that made a request's draft, each with when it finished after the request reached the desk.
// Live while it runs: the step now working turns, the ones still to come wait in grey. Under each request in the list, and as a
// list of its own on a request opened before its draft is in.
import { Spot } from "./plan";
import { Shade } from "./treeShade";
import { Done, STEPS, StepKey, useDraftLog } from "./draftLog";

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const euro = (v: number) => `€${Math.round(v).toLocaleString("en")}`;

/** What each step found, in a few words. From the step's own answer, never made up. */
export const chainText = {
  roof: (home: boolean, roof: Spot[]) => {
    if (!home) return "No home shared: the roof comes from the answers";
    const fits = roof.reduce((a, x) => a + x.fits, 0);
    return `${roof.length} roof ${roof.length === 1 ? "side" : "sides"} · room for ${fits} modules`;
  },
  trees: (home: boolean, s: Shade) => {
    if (!home) return "No home shared: no trees to check";
    if (s.status === "unknown") return "The tree map could not be read";
    if (s.status === "none" || !s.surfaces.length) return s.trees ? `${s.trees} trees near, none takes sun` : "No tree takes sun";
    const worst = s.surfaces.reduce((a, x) => (x.lost > a.lost ? x : a));
    return `${s.trees} ${s.trees === 1 ? "tree" : "trees"} · up to −${Math.round(worst.lost * 100)}% sun on the ${worst.name}`;
  },
  review: (v: unknown) => {
    const r = v as { asks?: unknown[]; conditions?: unknown[] };
    const a = r.asks?.length ?? 0, c = r.conditions?.length ?? 0;
    return [`${a} ${a === 1 ? "question" : "questions"} for the customer`, c ? `${c} ${c === 1 ? "condition" : "conditions"}` : ""].filter(Boolean).join(" · ");
  },
  costs: (v: unknown) => {
    const c = v as { pays_eur?: number; payback_years?: number | null; assumptions?: { years: number } };
    if (c.pays_eur == null) return "Priced";
    return `${euro(c.pays_eur)} · ${c.payback_years != null ? `pays back in ${c.payback_years.toLocaleString("en", { maximumFractionDigits: 1 })} years` : `does not pay back in ${c.assumptions?.years ?? 20} years`}`;
  },
};

/** Steps done in the order they finished, then the one working now, then those still to come. */
const ordered = (done: Partial<Record<StepKey, Done>>) => {
  const finished = STEPS.filter((s) => done[s.key]).sort((a, b) => done[a.key]!.at - done[b.key]!.at);
  const rest = STEPS.filter((s) => !done[s.key]);
  return [...finished.map((s) => ({ ...s, state: "done" as const, d: done[s.key]! })), ...rest.map((s, i) => ({ ...s, state: i === 0 ? ("now" as const) : ("wait" as const), d: null }))];
};

export function DraftChain({ id, full }: { id: string; full?: boolean }) {
  const log = useDraftLog(id);
  if (!log) return null;
  const steps = ordered(log.done);
  const total = Math.max(...Object.values(log.done).map((d) => d!.at));
  const all = steps.every((s) => s.state === "done");
  return <ol className={`chain${full ? " full" : ""}`} aria-label={all ? `Draft made in ${secs(total)}` : "Making the draft"}>
    {steps.map((s) => <li key={s.key} className={s.state} title={s.d?.detail}>
      <i aria-hidden="true" />
      <span className="chain-label">{s.label}</span>
      {s.d && <time>{s.key === "arrived" ? "0 s" : secs(s.d.at)}</time>}
      {s.state === "now" && <span className="chain-now">working…</span>}
      {full && s.d && <small>{s.d.detail}</small>}
    </li>)}
  </ol>;
}
