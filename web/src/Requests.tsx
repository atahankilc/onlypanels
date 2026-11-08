import { useState } from "react";
import { Mine } from "./plan";

const STEPS = ["Sent", "Being planned", "Offer ready"] as const;
const stepOf = (m: Mine) => (m.offer ? 2 : m.opened ? 1 : 0);
const day = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

/** The homeowner's requests on the start page: where each one is, and the offer once the planner sends it. */
export default function Requests({ list }: { list: Mine[] }) {
  const [open, setOpen] = useState<string | null>(list[0]?.ref ?? null);
  return (
    <aside className="panel requests">
      <h2>Your requests</h2>
      <ul>{list.map((m) => {
        const at = stepOf(m), o = m.offer;
        return <li key={m.ref} className={open === m.ref ? "on" : undefined}>
          <button type="button" className="req" aria-expanded={open === m.ref} onClick={() => setOpen(open === m.ref ? null : m.ref)}>
            <span className="name">{m.label}</span>
            <span className={`state s${at}`}>{STEPS[at]}</span>
            <small>{m.ref} · sent {day(m.sentAt)}</small>
          </button>
          {open === m.ref && <div className="detail">
            <ol className="track">{STEPS.map((s, i) => <li key={s} className={i < at ? "past" : i === at ? "now" : undefined}>{s}</li>)}</ol>
            {!o && <p className="small muted">{at ? "A planner is working on your system. You see the offer here as soon as it is sent." : "Your request has arrived. A planner picks it up soon."}</p>}
            {o && <div className="offer">
              <h3>Your offer</h3>
              <dl>
                <div><dt>Solar</dt><dd>{o.kwp.toFixed(1)} kWp · {o.modules} modules</dd></div>
                <div><dt>Battery</dt><dd>{o.battery_kwh ? `${o.battery_kwh} kWh` : "None"}</dd></div>
                {o.wallbox && <div><dt>Wallbox</dt><dd>Included</dd></div>}
                {o.heatpump_kw > 0 && <div><dt>Heat pump</dt><dd>{o.heatpump_kw} kW</dd></div>}
                <div><dt>Makes</dt><dd>{o.production_mwh.toFixed(1)} MWh a year</dd></div>
                <div><dt>Own power</dt><dd>About {o.self_sufficiency_pct}% of your use</dd></div>
                <div><dt>Saves</dt><dd>About €{o.saving_eur.toLocaleString("en")} a year</dd></div>
              </dl>
              <p className="small muted">Estimates from your planner's design. They go through it with you before anything is ordered.</p>
            </div>}
          </div>}
        </li>;
      })}</ul>
    </aside>
  );
}
