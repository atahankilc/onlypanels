import Explore from "./Explore";
import { Mine } from "./plan";
import { Button } from "./ui";

const STEPS = ["Sent", "Being planned", "Offer ready"] as const;
export const stepOf = (m: Mine) => (m.offer ? 2 : m.opened ? 1 : 0);
/** "Sent" and "Offer ready" are done the moment they happen; "Being planned" runs (blue, pulsing) from the moment the request is sent until the offer is in. */
const stepClass = (i: number, at: number) => (i === 0 || at === 2 ? "past" : i === 1 ? "now" : undefined);
export const day = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
/** How long ago something was sent: minutes, hours for two days, then days. The planner's list says it the same way. */
export const ago = (t: number) => {
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : min < 48 * 60 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
};
const When = ({ t }: { t: number }) => <time dateTime={new Date(t).toISOString()} title={new Date(t).toLocaleString("en-GB")}>sent {ago(t)}</time>;
/** The homeowner's order: offers ready to read first, the latest on top; then those still being planned, the latest on top. */
const byTurn = (l: Mine[]) => [...l].sort((a, b) => (b.offer ? 1 : 0) - (a.offer ? 1 : 0) || b.sentAt - a.sentAt);

/** The homeowner's requests on the start page. A click opens the home on the map, with where the request is. */
export default function Requests({ list, loading = 0, onOpen, gone }: { list: Mine[]; loading?: number; onOpen: (m: Mine) => void; gone?: boolean }) {
  return (
    <aside className={gone ? "panel requests gone" : "panel requests"} inert={gone}>
      <h2>Your requests</h2>
      <ul>{byTurn(list).map((m) => {
        const at = stepOf(m);
        return <li key={m.ref}>
          <button type="button" className="req" onClick={() => onOpen(m)}>
            <span className="name">{m.label}</span>
            <span className={`state s${at}`}>{STEPS[at]}</span>
            <small>{m.ref} · <When t={m.sentAt} /></small>
          </button>
        </li>;
      })}
        {Array.from({ length: loading }, (_, i) => <li key={`loading${i}`} className="loading" aria-hidden="true"><span /><span /></li>)}
      </ul>
      {loading > 0 && <p className="small muted loadnote" role="status">{list.length ? `Loading ${loading} more…` : "Loading your requests…"}</p>}
    </aside>
  );
}

/** Without the map: the requests first, as a page of their own, and a way to start a new one. */
export function RequestPage({ list, loading = 0, onOpen, onNew }: { list: Mine[]; loading?: number; onOpen: (m: Mine) => void; onNew: () => void }) {
  const waiting = list.filter((m) => !m.offer).length, ready = list.length - waiting;
  return <aside className="panel tall quiz reqpage" aria-label="Your requests">
    <p className="count">Your requests</p>
    <h1>{ready ? `${ready} ${ready === 1 ? "offer is" : "offers are"} ready` : list.length ? "Your installer is on it" : "Loading your requests"}</h1>
    <p className="muted">{list.length ? `${list.length} sent${waiting ? `, ${waiting} still being planned` : ""}. Open one to see where it is${ready ? " and your offer" : ""}.` : "One moment."}</p>
    <ul className="reqcards">
      {byTurn(list).map((m) => {
        const at = stepOf(m), [street, town] = m.label.split(/, (.+)/);
        return <li key={m.ref}><button type="button" onClick={() => onOpen(m)}>
          <span className="reqcard-top"><b>{street || "Home not shared"}</b><span className={`state s${at}`}>{STEPS[at]}</span></span>
          <small>{[town, m.ref].filter(Boolean).join(" · ")} · <When t={m.sentAt} /></small>
          <span className="reqcard-steps" aria-hidden="true">{STEPS.map((s, i) => <i key={s} className={stepClass(i, at)} />)}</span>
        </button></li>;
      })}
      {Array.from({ length: loading }, (_, i) => <li key={`loading${i}`} className="loading" aria-hidden="true"><span /><span /></li>)}
    </ul>
    <Button variant="solid" size="lg" wide onClick={onNew}>New request</Button>
  </aside>;
}

/** Where one request is, and the offer once the planner sends it. */
export function Status({ m, onPanels }: { m: Mine; onPanels?: (p: Record<string, number> | null) => void }) {
  const at = stepOf(m), o = m.offer;
  return <div className="requests status">
    <ol className="track">{STEPS.map((s, i) => <li key={s} className={stepClass(i, at)}>{s}</li>)}</ol>
    {o && <div className="offer">
      <h3>Your offer</h3>
      <dl>
        <div><dt>Solar</dt><dd>{o.kwp.toFixed(1)} kWp · {o.modules} modules</dd></div>
        <div><dt>Battery</dt><dd>{o.battery_kwh ? `${o.battery_kwh} kWh` : "None"}</dd></div>
        {o.wallbox && <div><dt>Wallbox</dt><dd>Included</dd></div>}
        {o.heatpump_kw > 0 && <div><dt>Heat pump</dt><dd>{o.heatpump_kw} kW</dd></div>}
        <div><dt>Makes</dt><dd>{o.production_mwh.toFixed(1)} MWh a year</dd></div>
        <div><dt>Own power</dt><dd>About {o.self_sufficiency_pct}% of your use</dd></div>
        {o.pays_eur != null && <div><dt>You pay</dt><dd>About €{o.pays_eur.toLocaleString("en")}, grants taken off</dd></div>}
        <div><dt>Saves</dt><dd>About €{o.saving_eur.toLocaleString("en")} {o.pays_eur != null ? "in the first year, after upkeep" : "a year"}</dd></div>
        {o.pays_eur != null && <div><dt>Pays back</dt><dd>{o.payback_years != null ? `After about ${o.payback_years.toLocaleString("en", { maximumFractionDigits: 0 })} years` : "Not within 20 years"}</dd></div>}
      </dl>
      <p className="small muted">Estimates from your planner's design. They go through it with you before anything is ordered.</p>
      {o.basis && <Explore m={m} onPanels={onPanels} />}
    </div>}
  </div>;
}
