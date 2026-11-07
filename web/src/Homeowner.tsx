import { useEffect, useState } from "react";
import { Design, Inputs, Overrides, Request, START, designFor } from "./api";
import { t } from "./i18n";

type Props = { request: Request | null; add: (r: Request) => void; update: (id: string, p: Partial<Request>) => void };

export default function Homeowner({ request, add, update }: Props) {
  if (!request) return <RequestForm add={add} />;
  if (!request.offer) return <Waiting />;
  return <Offer key={JSON.stringify(request.offer)} request={request} update={update} />;
}

function RequestForm({ add }: { add: (r: Request) => void }) {
  const [i, setI] = useState<Inputs>(START);
  const set = <K extends keyof Inputs>(k: K, v: Inputs[K]) => setI({ ...i, [k]: v });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    add({ id: crypto.randomUUID(), title: "New homeowner request", from: "homeowner", status: "draft", inputs: i, overrides: {} });
  };
  const fossil = i.heating === "Gas" || i.heating === "Oil";
  return (
    <main className="home">
      <h2 className="big">Request a solar system for your home</h2>
      <p className="lead">Tell us a little about your home. Your installer will send you an offer. A rough answer is fine.</p>
      <form className="request" onSubmit={submit}>
        <label className="field"><span>How much electricity do you use in a year? (kWh)</span>
          <input type="number" min={500} step={100} required value={i.demand_kwh || ""} onChange={(e) => set("demand_kwh", Number(e.target.value))} />
          <small>You can find this on your electricity bill. A typical family uses around 4,500 kWh.</small></label>
        <label className="field"><span>How do you heat your home?</span>
          <select value={i.heating ?? ""} onChange={(e) => set("heating", e.target.value || null)}>
            <option value="">Not sure</option><option value="Gas">Gas</option><option value="Oil">Oil</option><option value="Heatpump">Heat pump</option>
          </select></label>
        {fossil && <label className="field"><span>How much heat do you use in a year? (kWh, optional)</span>
          <input type="number" min={0} step={500} value={i.heat_kwh ?? ""} onChange={(e) => set("heat_kwh", e.target.value === "" ? null : Number(e.target.value))} />
          <small>This helps us check whether a heat pump makes sense.</small></label>}
        <label className="check"><input type="checkbox" checked={i.ev} onChange={(e) => set("ev", e.target.checked)} />We have, or plan to buy, an electric car</label>
        <label className="field"><span>Where could the panels go?</span>
          <select value={i.mount} onChange={(e) => set("mount", e.target.value)}>
            <option value="roof">On the roof</option><option value="ground">In the garden</option><option value="carport">On a carport</option><option value="facade">On the facade</option>
          </select></label>
        <label className="field"><span>How much space is there? (m², optional)</span>
          <input type="number" min={0} step={5} value={i.area_m2 ?? ""} onChange={(e) => set("area_m2", e.target.value === "" ? null : Number(e.target.value))} /></label>
        <label className="field"><span>Country</span>
          <select value={i.country} onChange={(e) => set("country", e.target.value)}>
            {["Germany", "Austria", "Switzerland", "Netherlands", "Other"].map((c) => <option key={c} value={c}>{t(c)}</option>)}
          </select></label>
        <button type="submit" className="primary wide">Send my request</button>
      </form>
    </main>
  );
}

function Waiting() {
  return (
    <main className="home">
      <h2 className="big">We have your request</h2>
      <p className="lead">Your installer is checking the design for your home. You will see your offer here as soon as it is ready.</p>
      <p className="muted">For this demo, switch to Planner to review the request and send the offer.</p>
    </main>
  );
}

function included(d: Design) {
  const items = [`${d.pv.modules} solar panels that make about ${d.energy.production_mwh} MWh of electricity a year`];
  items.push(d.battery.kwh ? `A ${d.battery.kwh} kWh battery that stores daytime sun for the evening` : "No battery");
  if (d.wallbox.included) items.push("A wallbox to charge your car at home");
  if (d.heatpump.included) items.push(`A ${d.heatpump.kw} kW heat pump for your heating`);
  return items;
}

function meaning(a: Design, b: Design) {
  const own = b.energy.self_sufficiency_pct - a.energy.self_sufficiency_pct;
  const eur = b.energy.saving_eur - a.energy.saving_eur;
  if (own === 0 && eur === 0) return "This change makes little difference to your own electricity share or your yearly saving.";
  const first = own === 0 ? "Your own electricity share stays about the same" : `The electricity you make and use yourself would go from ${a.energy.self_sufficiency_pct}% to ${b.energy.self_sufficiency_pct}%`;
  const second = eur === 0 ? "your saving stays about the same" : `you would save about €${Math.abs(eur)} ${eur > 0 ? "more" : "less"} a year`;
  return `${first}, and ${second}. The price would change too, so ask your installer.`;
}

function typical(d: Design) {
  const s = d.similar;
  const pv = d.pv.kwp < s.kwp_low ? "smaller than" : d.pv.kwp > s.kwp_high ? "larger than" : "in the usual range for";
  const top = Math.max(...s.battery_common, 0);
  const battery = !d.battery.kwh
    ? `${s.battery_rate}% of similar homes chose a battery, and yours has none.`
    : d.battery.kwh > top * 1.2 ? "Your battery is larger than most in similar homes." : "Your battery size is common in similar homes.";
  return `Your panels are ${pv} similar homes. ${battery}`;
}

function Offer({ request, update }: { request: Request; update: (id: string, p: Partial<Request>) => void }) {
  const offer = request.offer as Overrides;
  const allowed = request.allowed ?? { battery: false, panels: false, wallbox: false, heatpump: false };
  const [base, setBase] = useState<Design | null>(null);
  const [mine, setMine] = useState<Overrides>(offer);
  const [variant, setVariant] = useState<Design | null>(null);
  const [failed, setFailed] = useState(false);
  const changed = JSON.stringify(mine) !== JSON.stringify(offer);

  useEffect(() => { designFor(request.inputs, offer).then(setBase).catch(() => setFailed(true)); }, []);
  useEffect(() => { designFor(request.inputs, mine).then(setVariant).catch(() => setFailed(true)); }, [mine]);

  if (failed) return <main className="home"><p className="error">{t("apiError")}</p></main>;
  if (!base || !variant) return <main className="home"><p className="muted">{t("loading")}</p></main>;
  const max = base.pv.max_modules ?? (offer.modules as number) + 8;
  const asked = request.status === "change";
  const none = !allowed.battery && !allowed.panels && !allowed.wallbox && !allowed.heatpump;

  return (
    <main className="home">
      <h2 className="big">Your home energy offer</h2>
      <p className="lead">From your installer. Here is what they propose and what it means for you.</p>

      <h3>What you get</h3>
      <ul className="plainlist">{included(base).map((x) => <li key={x}>{x}</li>)}</ul>

      <h3>What it means for you</h3>
      <dl className="mean">
        <dt>Electricity you make and use yourself</dt><dd>about {base.energy.self_sufficiency_pct}%</dd>
        <dt>Saved on your electricity each year</dt><dd>about €{base.energy.saving_eur}</dd>
      </dl>

      <h3>Is this right for a home like mine?</h3>
      <p>{typical(base)}</p>

      {!none && <>
        <h3>Try a change</h3>
        <p className="muted">Your installer lets you try these. Nothing changes until you ask.</p>
        <div className="variants">
          {allowed.battery && <label className="field"><span>Battery</span>
            <select value={mine.battery_kwh ?? 0} onChange={(e) => setMine({ ...mine, battery_kwh: Number(e.target.value) })}>
              <option value={0}>No battery</option>
              {[...new Set([...base.battery.choices, offer.battery_kwh as number])].filter(Boolean).sort((a, b) => a - b).map((c) => <option key={c} value={c}>{c} kWh</option>)}
            </select></label>}
          {allowed.panels && <label className="field"><span>Panels: {mine.modules}</span>
            <input type="range" min={Math.max(6, (offer.modules as number) - 8)} max={max} value={mine.modules ?? 0} onChange={(e) => setMine({ ...mine, modules: Number(e.target.value) })} /></label>}
          {allowed.wallbox && <label className="check"><input type="checkbox" checked={!!mine.wallbox} onChange={(e) => setMine({ ...mine, wallbox: e.target.checked })} />Wallbox</label>}
          {allowed.heatpump && !base.heatpump.blocked && <label className="check"><input type="checkbox" checked={!!mine.heatpump} onChange={(e) => setMine({ ...mine, heatpump: e.target.checked })} />Heat pump</label>}
        </div>
        {changed && <div className="what">
          <p><b>What this change means:</b> {meaning(base, variant)}</p>
          <div className="actions">
            <button className="primary" disabled={asked} onClick={() => update(request.id, { status: "change", change: mine })}>{asked ? "Sent to your installer" : "Ask my installer for this"}</button>
            <button className="link" onClick={() => setMine(offer)}>Back to my offer</button>
          </div>
        </div>}
      </>}
      <p className="small muted">All figures are estimates based on typical homes. The offer does not include prices in this demo.</p>
    </main>
  );
}
