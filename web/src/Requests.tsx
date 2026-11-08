import { Mine } from "./plan";

const STEPS = ["Sent", "Being planned", "Offer ready"] as const;
export const stepOf = (m: Mine) => (m.offer ? 2 : m.opened ? 1 : 0);
export const day = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

/** The homeowner's requests on the start page. A click opens the home on the map, with where the request is. */
export default function Requests({ list, loading = 0, onOpen, gone }: { list: Mine[]; loading?: number; onOpen: (m: Mine) => void; gone?: boolean }) {
  return (
    <aside className={gone ? "panel requests gone" : "panel requests"} inert={gone}>
      <h2>Your requests</h2>
      <ul>{list.map((m) => {
        const at = stepOf(m);
        return <li key={m.ref}>
          <button type="button" className="req" onClick={() => onOpen(m)}>
            <span className="name">{m.label}</span>
            <span className={`state s${at}`}>{STEPS[at]}</span>
            <small>{m.ref} · sent {day(m.sentAt)}</small>
          </button>
        </li>;
      })}
        {Array.from({ length: loading }, (_, i) => <li key={`loading${i}`} className="loading" aria-hidden="true"><span /><span /></li>)}
      </ul>
      {loading > 0 && <p className="small muted loadnote" role="status">{list.length ? `Loading ${loading} more…` : "Loading your requests…"}</p>}
    </aside>
  );
}

/** Where one request is, and the offer once the planner sends it. */
export function Status({ m }: { m: Mine }) {
  const at = stepOf(m), o = m.offer;
  return <div className="requests status">
    <ol className="track">{STEPS.map((s, i) => <li key={s} className={i < at ? "past" : i === at ? "now" : undefined}>{s}</li>)}</ol>
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
  </div>;
}
