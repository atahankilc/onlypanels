// The current design and at most two variants, each computed by the engine with one more decision fixed.
import { Design, Overrides } from "./plan";
import { Button } from "./ui";
import { eur, useCurrentCosts } from "./money";

export type Alternative = {
  id: string; title: string; why: string; overrides: Overrides;
  pv: { modules: number; kwp: number }; battery_kwh: number; heatpump_kw: number; wallbox: boolean;
  energy: { production_mwh: number; total_mwh: number; self_sufficiency_pct: number; self_use_pct: number; saving_eur: number };
};
export const alternativesOf = (d: Design) => (d as Design & { alternatives?: Alternative[] }).alternatives ?? [];

type Card = { id: string; title: string; why: string; modules: number; kwp: number; battery: number; hp: number; own: number; saving: number };

export function Options({ d, pick }: { d: Design; pick: (a: Alternative) => void }) {
  const alts = alternativesOf(d);
  const money = useCurrentCosts(d); // price and payback per card, once the money view has priced this design
  if (!alts.length) return null;
  const now: Card = { id: "now", title: "Current design", why: "What the desk shows now.", modules: d.pv.modules, kwp: d.pv.kwp, battery: d.battery.kwh, hp: d.heatpump.included ? d.heatpump.kw : 0, own: d.energy.self_sufficiency_pct, saving: d.energy.saving_eur };
  const cards: (Card & { alt?: Alternative })[] = [now, ...alts.map((a) => ({ id: a.id, title: a.title, why: a.why, modules: a.pv.modules, kwp: a.pv.kwp, battery: a.battery_kwh, hp: a.heatpump_kw, own: a.energy.self_sufficiency_pct, saving: a.energy.saving_eur, alt: a }))];
  const anyHp = cards.some((c) => c.hp > 0);
  const differs = (c: Card, k: keyof Card) => c.id !== "now" && c[k] !== now[k];
  return <section className="options" aria-label="Options">
    {cards.map((c) => <div key={c.id} className={`option${c.id === "now" ? " now" : ""}`}>
      <b>{c.title}</b>
      <dl>
        <div className={differs(c, "modules") ? "moved" : ""}><dt>Solar</dt><dd>{c.modules} · {c.kwp.toFixed(1)} kWp</dd></div>
        <div className={differs(c, "battery") ? "moved" : ""}><dt>Battery</dt><dd>{c.battery ? `${c.battery} kWh` : "none"}</dd></div>
        {anyHp && <div className={differs(c, "hp") ? "moved" : ""}><dt>Heat pump</dt><dd>{c.hp ? `${c.hp} kW` : "none"}</dd></div>}
        <div className={differs(c, "own") ? "moved" : ""}><dt>Own power</dt><dd>~{c.own}%</dd></div>
        {!money && <div className={differs(c, "saving") ? "moved" : ""}><dt>Saving</dt><dd>~€{c.saving.toLocaleString("en")}</dd></div>}
        {/* The same three as the desk's money row: what it costs, when it is back, where the homeowner stands after the years
            looked at. A first year's saving read as every year's. */}
        {money && (() => { const m = c.id === "now" ? { pays_eur: money.pays_eur, payback_years: money.payback_years, gain_eur: money.gain_eur } : money.variants.find((v) => v.id === c.id); return m ? <>
          <div className={c.id !== "now" ? "moved" : ""}><dt>Pays</dt><dd>{eur(m.pays_eur)}</dd></div>
          <div className={c.id !== "now" ? "moved" : ""}><dt>Pays back</dt><dd>{m.payback_years != null ? `${m.payback_years} y` : "–"}</dd></div>
          <div className={c.id !== "now" ? "moved" : ""}><dt>After {money.assumptions.years} y</dt><dd>{m.gain_eur >= 0 ? "+" : "−"}{eur(Math.abs(m.gain_eur))}</dd></div></> : null; })()}
      </dl>
      <small>{c.why}</small>
      {c.alt ? <Button wide onClick={() => pick(c.alt!)}>Use this</Button> : <span className="option-tag">In use</span>}
    </div>)}
  </section>;
}
