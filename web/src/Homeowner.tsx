import { useEffect, useState } from "react";
import { Design, Inputs, Overrides, Request, START, Site, designFor, siteInputs } from "./api";
import HomeMap from "./HomeMap";
import { t } from "./i18n";
import SitePicker from "./SitePicker";
import { Button, Check, Field, Input, Section, Select, Slider } from "./ui";

type Props = { request: Request | null; add: (r: Request) => void; update: (id: string, p: Partial<Request>) => void };

export default function Homeowner({ request, add, update }: Props) {
  if (!request) return <RequestForm add={add} />;
  if (!request.offer) return <Waiting site={request.site ?? null} />;
  return <Offer key={JSON.stringify(request.offer)} request={request} update={update} />;
}

function RequestForm({ add }: { add: (r: Request) => void }) {
  const [i, setI] = useState<Inputs>(START);
  const [site, setSite] = useState<Site | null>(null);
  const [preview, setPreview] = useState<Design | null>(null);
  const [manual, setManual] = useState(false);
  const full = site ? { ...i, ...siteInputs(site) } : i;
  useEffect(() => {
    if (!site || !i.demand_kwh) { setPreview(null); return; }
    const timer = setTimeout(() => designFor(full).then(setPreview).catch(() => setPreview(null)), 200);
    return () => clearTimeout(timer);
  }, [JSON.stringify(full.surfaces), i.demand_kwh, i.ev, i.heating, i.heat_kwh]);
  const set = <K extends keyof Inputs>(k: K, v: Inputs[K]) => setI({ ...i, [k]: v });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    add({ id: crypto.randomUUID(), title: "New homeowner request", from: "homeowner", status: "draft", inputs: full, overrides: {}, site });
  };
  const fossil = i.heating === "Gas" || i.heating === "Oil";
  return (
    <SitePicker site={site} setSite={setSite} placed={preview?.pv.placed ?? null} note={preview ? <span><b>{preview.pv.modules} panels</b> would suit your home</span>
      : !site && !manual ? <><span>Click your house on the map, or search for it</span><Button onClick={() => setManual(true)}>Continue without the map</Button></> : null}>
      {(site || manual) ? <form className="request" onSubmit={submit}>
        <h2>Your energy use</h2>
        <Field label="How much electricity do you use in a year? (kWh)">
          <Input type="number" min={500} step={100} required value={i.demand_kwh || ""} onChange={(e) => set("demand_kwh", Number(e.target.value))} />
          <small>You can find this on your electricity bill. A typical family uses around 4,500 kWh.</small></Field>
        <Field label="How do you heat your home?">
          <Select value={i.heating ?? ""} onChange={(e) => set("heating", e.target.value || null)}>
            <option value="">Not sure</option><option value="Gas">Gas</option><option value="Oil">Oil</option><option value="Heatpump">Heat pump</option>
          </Select></Field>
        {fossil && <Field label="How much heat do you use in a year? (kWh, optional)">
          <Input type="number" min={0} step={500} value={i.heat_kwh ?? ""} onChange={(e) => set("heat_kwh", e.target.value === "" ? null : Number(e.target.value))} />
          <small>This helps us check whether a heat pump makes sense.</small></Field>}
        <Check checked={i.ev} onChange={(v) => set("ev", v)}>We have, or plan to buy, an electric car</Check>
        {!site && <>
          <Field label="Where could the panels go?">
            <Select value={i.mount} onChange={(e) => set("mount", e.target.value)}>
              <option value="roof">On the roof</option><option value="ground">In the garden</option><option value="carport">On a carport</option><option value="facade">On the facade</option>
            </Select></Field>
          <Field label="How much space is there? (m², optional)">
            <Input type="number" min={0} step={5} value={i.area_m2 ?? ""} onChange={(e) => set("area_m2", e.target.value === "" ? null : Number(e.target.value))} /></Field>
        </>}
        <Button type="submit" variant="solid" size="lg" wide>Send my request</Button>
      </form> : null}
    </SitePicker>
  );
}

function Waiting({ site }: { site: Site | null }) {
  return (
    <main className="stage">
      <HomeMap site={site} placed={null} />
      <div className="dialog" role="status">
        <h2 className="big">We have your request</h2>
        <p>Your installer is checking the design for your home. You will see your offer here as soon as it is ready.</p>
        <p className="small muted">For this demo, switch to Planner to review the request and send the offer.</p>
      </div>
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

  if (failed) return <main className="page"><p className="error">{t("apiError")}</p></main>;
  if (!base || !variant) return <main className="page"><p className="muted">{t("loading")}</p></main>;
  const max = base.pv.max_modules ?? (offer.modules as number) + 8;
  const asked = request.status === "change";
  const none = !allowed.battery && !allowed.panels && !allowed.wallbox && !allowed.heatpump;

  return (
    <main className="stage">
      <HomeMap site={request.site ?? null} placed={(changed ? variant : base).pv.placed} />
      <aside className="panel tall">
      <header className="panelhead">
        <h1>Your home energy offer</h1>
        <p className="muted">From your installer. Here is what they propose and what it means for you.</p>
      </header>

      <Section title="What you get">
      <ul className="plainlist">{included(base).map((x) => <li key={x}>{x}</li>)}</ul>

      </Section>

      <Section title="What it means for you">
      <dl className="mean">
        <dt>Electricity you make and use yourself</dt><dd>about {base.energy.self_sufficiency_pct}%</dd>
        <dt>Saved on your electricity each year</dt><dd>about €{base.energy.saving_eur}</dd>
      </dl>

      </Section>

      <Section title="Is this right for a home like mine?">
      <p>{typical(base)}</p>
      </Section>

      {!none && <Section title="Try a change">
        <p className="muted">Your installer lets you try these. Nothing changes until you ask.</p>
        <div className="variants">
          {allowed.battery && <Field label="Battery">
            <Select value={mine.battery_kwh ?? 0} onChange={(e) => setMine({ ...mine, battery_kwh: Number(e.target.value) })}>
              <option value={0}>No battery</option>
              {[...new Set([...base.battery.choices, offer.battery_kwh as number])].filter(Boolean).sort((a, b) => a - b).map((c) => <option key={c} value={c}>{c} kWh</option>)}
            </Select></Field>}
          {allowed.panels && <Field label="Panels" value={mine.modules}>
            <Slider min={Math.max(6, (offer.modules as number) - 8)} max={max} value={mine.modules ?? 0} onChange={(e) => setMine({ ...mine, modules: Number(e.target.value) })} /></Field>}
          {allowed.wallbox && <Check checked={!!mine.wallbox} onChange={(v) => setMine({ ...mine, wallbox: v })}>Wallbox</Check>}
          {allowed.heatpump && !base.heatpump.blocked && <Check checked={!!mine.heatpump} onChange={(v) => setMine({ ...mine, heatpump: v })}>Heat pump</Check>}
        </div>
        {changed && <div className="what">
          <p><b>What this change means:</b> {meaning(base, variant)}</p>
          <div className="actions">
            <Button variant="solid" size="lg" disabled={asked} onClick={() => update(request.id, { status: "change", change: mine })}>{asked ? "Sent to your installer" : "Ask my installer for this"}</Button>
            <Button onClick={() => setMine(offer)}>Back to my offer</Button>
          </div>
        </div>}
      </Section>}
      <Section><p className="small muted">All figures are estimates based on typical homes. The offer does not include prices in this demo.</p></Section>
      </aside>
    </main>
  );
}
