// The top of the planner's desk: the system as four parts, what it makes against what the home needs, and what it costs.
// Every number is the engine's (design) or the API's (costs); a click opens the section that explains it.
import { useState } from "react";
import { Costs, eur } from "./money";
import { Design, Overrides, Request } from "./plan";
import { BatteryIcon, HeatIcon, SolarIcon, WallboxIcon } from "./techIcons";

// toFixed, as every other kWp on the desk: 10.35 must read 10.3 here too, not 10.4 above a heading that says 10.3.
const one = (v: number) => v.toFixed(1);

/** A battery the home already has and the design keeps: the offer adds none, but the home is not without one. */
export const keptBattery = (r: Request, d: Design) => (!d.battery.kwh && r.inputs.has_storage && r.existing.battery_kwh ? r.existing.battery_kwh : 0);

/** Why the heat pump is in or out, in the customer's or the planner's terms. The engine adds one only when asked (D69). */
export const hpWhy = (r: Request, d: Design, o: Overrides) =>
  d.heatpump.blocked || r.inputs.heating === "Heatpump" ? "already heats the home"
    : d.heatpump.included ? (o.heatpump && r.inputs.wants_hp !== true ? "your choice" : "the customer asked for one")
    : o.heatpump === false && r.inputs.wants_hp !== false ? "your choice"
    : r.inputs.wants_hp === false ? "the customer does not want one"
    : "only when the customer asks";

export function DeskSummary({ r, d, costs, go }: { r: Request; d: Design; costs: Costs | null; go: (tab: "design" | "cost") => void }) {
  const there = keptBattery(r, d);
  // The battery's own yearly gain over none, as the Cost tab counts it: a share of solar used here read as a second "own power" figure.
  const batteryYear = costs?.battery_options.find((x) => x.kwh === d.battery.kwh)?.year1_eur ?? null;
  const e = d.energy;
  const tiles = [
    { t: "solar", Icon: SolarIcon, label: "Solar", on: d.pv.modules > 0, value: one(d.pv.kwp), unit: "kWp", sub: `${d.pv.modules} modules${d.pv.capped ? ", roof full" : ""}` },
    // A kept battery is not part of the offer: the tile says no new one and names the one already there.
    { t: "battery", Icon: BatteryIcon, label: "Battery", on: !!d.battery.kwh, value: d.battery.kwh ? String(d.battery.kwh) : there ? "None new" : "None", unit: d.battery.kwh ? "kWh" : "", sub: there ? `keeps its ${there} kWh` : d.battery.kwh ? (batteryYear != null ? `adds €${batteryYear.toLocaleString("en")} a year` : "") : "left out" },
    { t: "wallbox", Icon: WallboxIcon, label: "Wallbox", on: d.wallbox.included, value: d.wallbox.included ? "Yes" : "None", unit: "", sub: d.wallbox.included ? `${one(e.ev_mwh)} MWh for the car` : r.inputs.ev ? "car, no wallbox yet" : "no car" },
    { t: "heatpump", Icon: HeatIcon, label: "Heat pump", on: d.heatpump.included, value: d.heatpump.included ? String(d.heatpump.kw) : d.heatpump.blocked || r.inputs.heating === "Heatpump" ? "There" : "None", unit: d.heatpump.included ? "kW" : "", sub: d.heatpump.included ? `${one(e.hp_mwh)} MWh of power a year` : hpWhy(r, d, r.overrides) },
  ];
  // The home's yearly need as one bar: the part its own solar covers, the rest from the grid. What the system makes and sells is
  // said in words beside it: three measures on one line (output, need marker, own share) read as nothing at first sight.
  const own = (e.total_mwh * e.self_sufficiency_pct) / 100, grid = Math.max(0, e.total_mwh - own);
  const sold = (e.production_mwh * (100 - e.self_use_pct)) / 100;
  const priced = costs && costs.design.modules === d.pv.modules && costs.design.battery_kwh === d.battery.kwh ? costs : null;
  return <div className="sysum">
    <div className="sysum-tiles">{tiles.map(({ t, Icon, label, on, value, unit, sub }) =>
      <button key={t} type="button" className={`sysum-tile t-${t}${on ? "" : " off"}`} onClick={() => go("design")} title={`${label}: open the design`}>
        <span className="pb-ico"><Icon size={16} /></span>
        <span className="sysum-label">{label}</span>
        <b>{value}{unit && <small> {unit}</small>}</b>
        <small>{sub}</small>
      </button>)}</div>
    <div className="sysum-energy">
      <p className="sysum-energy-head"><span>Home's power, a year</span><b>{e.self_sufficiency_pct}% from own solar</b></p>
      <div className="sysum-bar" role="img" aria-label={`Of the home's ${one(e.total_mwh)} MWh a year, ${one(own)} MWh come from its own solar and ${one(grid)} MWh from the grid. The system makes ${one(e.production_mwh)} MWh and sells ${one(sold)} MWh.`}>
        <i className="own" style={{ width: `${e.self_sufficiency_pct}%` }} />
      </div>
      <p className="sysum-energy-key"><span><i className="k own" />{one(own)} MWh own solar</span><span><i className="k grid" />{one(grid)} MWh from the grid</span><span className="sysum-made">Makes {one(e.production_mwh)} MWh · sells {one(sold)}</span></p>
    </div>
    <div className="sysum-money">
      <button type="button" className="sysum-money-figs" onClick={() => go("cost")} title="Open the cost">
        {priced ? <>
          <span><small>{priced.grant?.eur ? "Homeowner pays, after grants" : "Homeowner pays"}</small><b>{eur(priced.pays_eur)}</b></span>
          <span><small>Pays back</small><b className={priced.payback_years == null ? "warn" : undefined}>{priced.payback_years != null ? `${priced.payback_years.toLocaleString("en", { maximumFractionDigits: 1 })} years` : `Not in ${priced.assumptions.years} years`}</b></span>
          {/* The whole run, not one year: a first year's saving read as if every year saved the same. */}
          <span><small>After {priced.assumptions.years} years</small><b className={priced.gain_eur >= 0 ? "up" : "down"}>{priced.gain_eur >= 0 ? "+" : "−"}{eur(Math.abs(priced.gain_eur))}</b></span>
        </> : <span className="muted small">Pricing the design…</span>}
      </button>
      {priced && priced.rows.length > 1 && <MoneyRun c={priced} />}
    </div>
  </div>;
}

const BATTERY_LIFE = 15; // years the battery is counted: costs.py BATTERY_LIFE

/** The homeowner's money year by year, as a running total from minus the price: under the line it is still being paid back,
 *  over it the home is ahead. Each year is the Cost tab's own row: prices rise, panels age, the inverter is replaced once and the
 *  battery's part ends with its life. A year's column says its figures on hover; no year is said alone, so none reads as every year. */
function MoneyRun({ c }: { c: Costs }) {
  const [at, setAt] = useState<number | null>(null);
  const rows = c.rows, start = -c.pays_eur;
  const top = Math.max(0, ...rows.map((r) => r.total)), low = Math.min(start, ...rows.map((r) => r.total)), span = Math.max(top - low, 1);
  const zero = (top / span) * 100; // the zero line, from the top, in %
  const swap = c.assumptions.inverter_life + 1;
  const why = (t: number) => [t === swap && "inverter replaced", t === BATTERY_LIFE + 1 && `battery counted for ${BATTERY_LIFE} years`].filter(Boolean).join("; ");
  const r = at != null ? rows[at] : null;
  const signed = (v: number) => `${v >= 0 ? "+" : "−"}${eur(Math.abs(v))}`;
  return <figure className="mrun" onMouseLeave={() => setAt(null)}>
    <div className="mrun-plot" role="img" aria-label={`Running total over ${rows.length} years, from ${signed(start)} today to ${signed(rows[rows.length - 1].total)}${c.payback_years != null ? `, paid back after ${c.payback_years} years` : ""}.`}>
      <i className="mrun-zero" style={{ top: `${zero}%` }} />
      {rows.map((x, k) => {
        const h = (Math.abs(x.total) / span) * 100;
        return <span key={x.year} className={`mrun-col${at === k ? " on" : ""}`} onMouseEnter={() => setAt(k)}>
          <b className={x.total >= 0 ? "up" : "down"} style={x.total >= 0 ? { bottom: `${100 - zero}%`, height: `${h}%` } : { top: `${zero}%`, height: `${h}%` }} />
        </span>;
      })}
    </div>
    <figcaption>{r
      ? <><b>Year {r.year}</b> {r.total >= 0 ? `${eur(r.total)} ahead` : `${eur(-r.total)} still to pay back`} · that year {signed(r.eur)}{why(r.year) ? ` (${why(r.year)})` : ""}</>
      : <>Running total from {signed(start)} today · electricity +{c.assumptions.electricity_rise_pct}% a year, panels −{c.assumptions.degradation_pct}% · inverter replaced in year {swap}</>}</figcaption>
  </figure>;
}
