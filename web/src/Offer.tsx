// The offer as it would leave the installer: one page, printable. Numbers are the engine's; the planner's choices are marked.
import { Design, Request, Spot, facing } from "./plan";
import { Button, Check } from "./ui";
import { Costs, eur } from "./money";

export const CHOICES: [string, string][] = [
  ["no_battery", "Leave out the battery"], ["battery_size", "Pick another battery size from the catalog"],
  ["wallbox", "Add or leave out the wallbox"], ["fewer_modules", "Use fewer modules"],
];

const FEED = 7.7; // ct, as in the engine: EEG for systems up to 10 kWp switched on by 31 December 2026
const kwh = (v: number) => `${v.toLocaleString("en")} kWh`;
const row = (a: Design) => ({
  Solar: `${a.pv.modules} modules, ${a.pv.kwp.toFixed(1)} kWp`, Battery: a.battery.kwh ? `${a.battery.kwh} kWh` : "none",
  Wallbox: a.wallbox.included ? "included" : "none", "Heat pump": a.heatpump.included ? `${a.heatpump.kw} kW` : "none",
});

type Props = {
  r: Request; d: Design; costs?: Costs | null; first: Design | null; roof: Spot[]; panels: Record<string, number>;
  facts: [string, string, string][]; conditions: string[]; toConfirm: number;
  allowed: string[]; setAllowed: (a: string[]) => void; send: () => void;
};

export default function Offer({ r, d, costs, first, roof, panels, facts, conditions, toConfirm, allowed, setAllowed, send }: Props) {
  const now = row(d), was = first ? row(first) : now;
  const who = { Solar: d.pv.locked, Battery: d.battery.locked, Wallbox: d.wallbox.locked, "Heat pump": d.heatpump.locked } as Record<string, boolean>;
  const placed = roof.filter((x) => (panels[x.key] ?? 0) > 0);
  const e = d.energy, sent = r.status === "sent";
  return <>
    <div className="offer-actions">
      <Button onClick={() => window.print()}>Print or save as PDF</Button>
      <Button variant="solid" disabled={toConfirm > 0 || sent} onClick={send}>{sent ? "Sent" : "Approve and send"}</Button>
    </div>
    {toConfirm > 0 && <p className="flag">{toConfirm} assumed {toConfirm === 1 ? "fact needs" : "facts need"} your confirmation before this can be sent. See Checks.</p>}

    <article className="offer-sheet">
      <header><small>{sent ? "Offer" : "Offer draft"}{r.ref ? ` · ${r.ref}` : ""} · {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</small><h2>{r.label}</h2></header>

      <section><h4>System</h4>
        <table><tbody>{Object.entries(now).map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td><td>{k === "Heat pump" && who[k] && r.inputs.wants_hp != null && r.overrides.heatpump === r.inputs.wants_hp ? "as the customer asked" : who[k] ? "set by the planner" : sent ? "engine proposal, approved by the planner" : "engine proposal"}</td></tr>)}</tbody></table>
        <p className="fine">Modules counted at about 450 Wp each; the exact product is chosen at order.{d.heatpump.included ? " Heat pump size is preliminary: a room-by-room heat load calculation decides the final model." : ""}</p>
        {placed.length > 0 && <p className="fine">On the roof: {placed.map((x) => `${panels[x.key]} facing ${facing(x.s)} at ${x.s.tilt}°`).join(", ")}.</p>}
      </section>

      <section><h4>What it should do in a year</h4>
        <table><tbody>
          <tr><th scope="row">Electricity made</th><td>about {kwh(Math.round(e.production_mwh * 1000 / 100) * 100)}</td></tr>
          <tr><th scope="row">Your use</th><td>about {kwh(Math.round(e.total_mwh * 1000 / 100) * 100)}{e.ev_mwh && e.hp_mwh ? ", with the car and heat pump" : e.ev_mwh ? ", with the car" : e.hp_mwh ? ", with the heat pump" : ""}</td></tr>
          <tr><th scope="row">Share of your use from your own panels</th><td>about {e.self_sufficiency_pct}%</td></tr>
          <tr><th scope="row">Saving</th><td>about €{e.saving_eur.toLocaleString("en")} at {r.inputs.price_ct_kwh} ct per kWh</td></tr>
        </tbody></table>
        <p className="fine">Estimates, not promises: {r.buildings.length ? "measured sun and shade for this roof" : r.inputs.roof_azimuth != null ? "PVGIS sun for a roof of this direction and slope, without shade, since the home was not shared" : "a typical German yield of 950 kWh per kWp, since the home was not shared"}, assumed hourly use, {FEED} ct for electricity sold to the grid; the rate for systems switched on from 2027 is not settled yet. The home stays connected to the grid. Without a smart meter, the grid feed is limited to 60% of the system's power.{d.heatpump.included ? " The saving counts electricity only, not the gas or oil no longer bought." : ""}</p>
      </section>

      {costs && costs.design.modules === d.pv.modules && costs.design.battery_kwh === d.battery.kwh && <section><h4>Price and payback</h4>
        <table><tbody>
          {Object.entries(costs.by_tech).map(([t, v]) => <tr key={t}><th scope="row">{({ solar: "Solar, installed", battery: "Battery, installed", wallbox: "Wallbox, installed", heatpump: "Heat pump, installed" } as Record<string, string>)[t] ?? t}</th><td>{eur(v)}</td></tr>)}
          <tr><th scope="row">Total</th><td>{eur(costs.gross_eur)}{costs.vat_eur ? ` incl. ${eur(costs.vat_eur)} VAT` : ", no VAT on solar and battery"}</td></tr>
          {costs.grant && <tr><th scope="row">KfW heat pump grant</th><td>−{eur(costs.grant.eur)} ({costs.grant.rate_pct}%), applied for before ordering</td></tr>}
          <tr><th scope="row">You pay</th><td><b>{eur(costs.pays_eur)}</b></td></tr>
          <tr><th scope="row">Your costs a year</th><td>{eur(costs.bills.before.total_eur)} today, about {eur(costs.bills.after.total_eur)} with the system</td></tr>
          <tr><th scope="row">Pays back</th><td>{costs.payback_years != null ? `after about ${costs.payback_years.toLocaleString("en", { maximumFractionDigits: 1 })} years` : `not within ${costs.assumptions.years} years`}; about {eur(costs.gain_eur)} ahead after {costs.assumptions.years} years</td></tr>
        </tbody></table>
        <p className="fine">Prices are typical and become binding with the order after a site visit. Payback assumes electricity {costs.assumptions.electricity_rise_pct}% dearer each year{costs.fuel ? `, ${costs.fuel.kind} ${costs.assumptions.fuel_rise_pct}% dearer` : ""}, panels losing {costs.assumptions.degradation_pct}% a year, one new inverter, upkeep and insurance included.{costs.grant ? " The grant needs an application at KfW before the order is signed." : ""}</p>
      </section>}

      <section><h4>Based on</h4>
        <table><tbody>{facts.map(([label, value, source]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td><td>{source}</td></tr>)}</tbody></table>
      </section>

      {conditions.length > 0 && <section><h4>To check before installation</h4><ul>{conditions.map((c) => <li key={c}>{c}</li>)}</ul></section>}

      <section className="no-print"><h4>The homeowner may change</h4>
        <p className="fine">Only what you tick. The home's facts stay fixed.</p>
        {CHOICES.map(([k, label]) => <Check key={k} checked={allowed.includes(k)} onChange={(v) => setAllowed(v ? [...allowed, k] : allowed.filter((x) => x !== k))}>{label}</Check>)}
      </section>
      {allowed.length > 0 && <section className="print-only"><h4>You may change</h4><ul>{CHOICES.filter(([k]) => allowed.includes(k)).map(([k, l]) => <li key={k}>{l}</li>)}</ul></section>}

      <section className="no-print"><h4>Changes from the AI draft</h4>
        {Object.keys(now).some((k) => now[k as keyof typeof now] !== was[k as keyof typeof was])
          ? <table><tbody>{Object.keys(now).filter((k) => now[k as keyof typeof now] !== was[k as keyof typeof was]).map((k) => <tr key={k}><th scope="row">{k}</th><td>{was[k as keyof typeof was]}</td><td>→ {now[k as keyof typeof now]}</td></tr>)}</tbody></table>
          : <p className="fine">None: the AI draft goes out as proposed, approved by you.</p>}
      </section>
    </article>
  </>;
}
