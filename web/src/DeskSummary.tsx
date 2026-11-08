// The top of the planner's desk: the system as four parts, what it makes against what the home needs, and what it costs.
// Every number is the engine's (design) or the API's (costs); a click opens the section that explains it.
import { Costs, eur } from "./money";
import { Design, Request } from "./plan";
import { BatteryIcon, HeatIcon, SolarIcon, WallboxIcon } from "./techIcons";

const one = (v: number) => v.toLocaleString("en", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export function DeskSummary({ r, d, costs, go }: { r: Request; d: Design; costs: Costs | null; go: (tab: "design" | "cost") => void }) {
  const there = !d.battery.kwh && r.inputs.has_storage && r.existing.battery_kwh ? r.existing.battery_kwh : 0;
  const e = d.energy;
  const tiles = [
    { t: "solar", Icon: SolarIcon, label: "Solar", on: d.pv.modules > 0, value: one(d.pv.kwp), unit: "kWp", sub: `${d.pv.modules} modules${d.pv.capped ? ", roof full" : ""}` },
    { t: "battery", Icon: BatteryIcon, label: "Battery", on: !!(d.battery.kwh || there), value: d.battery.kwh || there ? String(d.battery.kwh || there) : "None", unit: d.battery.kwh || there ? "kWh" : "", sub: there ? "already in the home" : d.battery.kwh ? `${e.self_use_pct}% of solar used` : "left out" },
    { t: "wallbox", Icon: WallboxIcon, label: "Wallbox", on: d.wallbox.included, value: d.wallbox.included ? "Yes" : "None", unit: "", sub: d.wallbox.included ? `${one(e.ev_mwh)} MWh for the car` : r.inputs.ev ? "car, no wallbox yet" : "no car" },
    { t: "heatpump", Icon: HeatIcon, label: "Heat pump", on: d.heatpump.included, value: d.heatpump.included ? String(d.heatpump.kw) : d.heatpump.blocked || r.inputs.heating === "Heatpump" ? "There" : "None", unit: d.heatpump.included ? "kW" : "", sub: d.heatpump.included ? `${one(e.hp_mwh)} MWh of power a year` : d.heatpump.blocked || r.inputs.heating === "Heatpump" ? "already heats the home" : "left out" },
  ];
  // Need and output on one scale: the bar is the larger of the two.
  const top = Math.max(e.total_mwh, e.production_mwh, 0.1);
  const priced = costs && costs.design.modules === d.pv.modules && costs.design.battery_kwh === d.battery.kwh ? costs : null;
  return <div className="sysum">
    <div className="sysum-tiles">{tiles.map(({ t, Icon, label, on, value, unit, sub }) =>
      <button key={t} type="button" className={`sysum-tile t-${t}${on ? "" : " off"}`} onClick={() => go("design")} title={`${label}: open the design`}>
        <span className="pb-ico"><Icon size={16} /></span>
        <span className="sysum-label">{label}</span>
        <b>{value}{unit && <small> {unit}</small>}</b>
        <small>{sub}</small>
      </button>)}</div>
    <div className="sysum-energy" role="img" aria-label={`Makes ${one(e.production_mwh)} MWh a year; the home needs ${one(e.total_mwh)} MWh; ${e.self_sufficiency_pct}% of the use comes from its own power`}>
      <div className="sysum-bar">
        <i className="need" style={{ left: `${(e.total_mwh / top) * 100}%` }} />
        <i className="own" style={{ width: `${((e.total_mwh * e.self_sufficiency_pct) / 100 / top) * 100}%` }} />
        <i className="make" style={{ width: `${(e.production_mwh / top) * 100}%` }} />
      </div>
      <p><span><i className="k make" />Makes <b>{one(e.production_mwh)} MWh</b></span><span><i className="k need" />Needs <b>{one(e.total_mwh)} MWh</b></span><span><i className="k own" /><b>{e.self_sufficiency_pct}%</b> own power</span></p>
    </div>
    <button type="button" className="sysum-money" onClick={() => go("cost")} title="Open the cost">
      {priced ? <>
        <span><small>Homeowner pays</small><b>{eur(priced.pays_eur)}</b></span>
        <span><small>Pays back</small><b>{priced.payback_years != null ? `${priced.payback_years.toLocaleString("en", { maximumFractionDigits: 1 })} years` : "Not in time"}</b></span>
        <span><small>First year</small><b className={priced.year1.total_eur >= 0 ? "up" : "down"}>{priced.year1.total_eur >= 0 ? "+" : "−"}{eur(Math.abs(priced.year1.total_eur))}</b></span>
      </> : <span className="muted small">Pricing the design…</span>}
    </button>
  </div>;
}
