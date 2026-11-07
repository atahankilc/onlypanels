import { useEffect, useRef, useState } from "react";
import { Allowed, Design, Inputs, Overrides, Refined, Request, START, designFor, refine } from "./api";
import HomeMap from "./HomeMap";
import { Back } from "./icons";
import { t } from "./i18n";

const num = (v: string) => (v === "" ? null : Number(v));
const STATUS: Record<string, string> = { draft: "AI draft ready", sent: "Offer sent", change: "Change requested" };
const short = (d: Design) => `${d.pv.kwp.toFixed(1)} kWp · ${d.battery.kwh ? `${d.battery.kwh} kWh` : "no battery"}${d.wallbox.included ? " · wallbox" : ""}${d.heatpump.included ? ` · ${d.heatpump.kw} kW heat pump` : ""}`;

type Props = {
  requests: Request[]; openId: string | null; setOpenId: (id: string | null) => void;
  add: (r: Request) => void; update: (id: string, patch: Partial<Request>) => void;
};

export default function Planner({ requests, openId, setOpenId, add, update }: Props) {
  const open = requests.find((r) => r.id === openId);
  if (open) return <Workspace key={open.id} request={open} update={update} back={() => setOpenId(null)} />;
  return <Inbox requests={requests} open={setOpenId} add={add} />;
}

function Inbox({ requests, open, add }: { requests: Request[]; open: (id: string) => void; add: (r: Request) => void }) {
  const create = () => {
    const id = crypto.randomUUID();
    add({ id, title: "Phone request", from: "planner", status: "draft", inputs: START, overrides: {} });
    open(id);
  };
  return (
    <main className="page">
      <div className="row">
        <div>
          <h2 className="big">Requests</h2>
          <p className="muted">AI has prepared a draft for each request. Open one to do the engineering.</p>
        </div>
        <button className="primary" onClick={create}>New request</button>
      </div>
      <table className="inbox">
        <thead><tr><th>Request</th><th>From</th><th>AI draft</th><th>Status</th></tr></thead>
        <tbody>
          {requests.map((r) => <Line key={r.id} r={r} open={() => open(r.id)} />)}
        </tbody>
      </table>
    </main>
  );
}

function Line({ r, open }: { r: Request; open: () => void }) {
  const [d, setD] = useState<Design | null>(null);
  useEffect(() => { designFor(r.inputs, r.overrides).then(setD).catch(() => undefined); }, [r.inputs, r.overrides]);
  return (
    <tr className="pick" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === "Enter" && open()}>
      <th scope="row">{r.title}</th>
      <td>{r.from === "homeowner" ? "Homeowner" : "Planner"}</td>
      <td>{d ? short(d) : "…"}</td>
      <td><span className={`state ${r.status}`}>{STATUS[r.status]}</span></td>
    </tr>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Workspace({ request, update, back }: { request: Request; update: (id: string, p: Partial<Request>) => void; back: () => void }) {
  const { inputs, overrides } = request;
  const [design, setDesign] = useState<Design | null>(null);
  const [previous, setPrevious] = useState<Design | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef<Design | null>(null);
  const setInputs = (i: Inputs) => update(request.id, { inputs: i });
  const setOverrides = (o: Overrides) => update(request.id, { overrides: o });
  const set = <K extends keyof Inputs>(k: K, v: Inputs[K]) => setInputs({ ...inputs, [k]: v });

  useEffect(() => {
    if (!inputs.demand_kwh) return;
    let live = true;
    const timer = setTimeout(() => {
      designFor(inputs, overrides)
        .then((d) => { if (!live) return; setPrevious(latest.current); latest.current = d; setDesign(d); setFailed(false); })
        .catch(() => live && setFailed(true));
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [inputs, overrides]);

  const fossil = ["Gas", "Oil", "OtherNonRenewable"].includes(inputs.heating ?? "");
  return (
    <main className="split">
      <form onSubmit={(e) => e.preventDefault()}>
        <button type="button" className="ghost" onClick={back}><Back size={14} />Back to requests</button>
        <h2>{request.title}</h2>
        <Field label={t("demand")}><input type="number" min={500} step={100} value={inputs.demand_kwh || ""} onChange={(e) => set("demand_kwh", Number(e.target.value))} /></Field>
        <Field label={t("heating")}>
          <select value={inputs.heating ?? ""} onChange={(e) => set("heating", e.target.value || null)}>
            <option value="">{t("unknown")}</option>
            {["Gas", "Oil", "OtherNonRenewable", "Heatpump"].map((h) => <option key={h} value={h}>{t(h)}</option>)}
          </select>
        </Field>
        {fossil && <Field label={t("heat")}><input type="number" min={0} step={500} value={inputs.heat_kwh ?? ""} onChange={(e) => set("heat_kwh", num(e.target.value))} /></Field>}
        <label className="check"><input type="checkbox" checked={inputs.ev} onChange={(e) => set("ev", e.target.checked)} />{t("ev")}</label>
        {inputs.ev && <Field label={t("evKm")}><input type="number" min={0} step={1000} value={inputs.ev_km} onChange={(e) => set("ev_km", Number(e.target.value))} /></Field>}
        {!request.site && <>
        <Field label={t("where")}>
          <select value={inputs.mount} onChange={(e) => set("mount", e.target.value)}>
            {["roof", "ground", "carport", "facade"].map((m) => <option key={m} value={m}>{t(m)}</option>)}
          </select>
        </Field>
        <Field label={t("area")} hint={t("areaHint")}><input type="number" min={0} step={5} value={inputs.area_m2 ?? ""} onChange={(e) => set("area_m2", num(e.target.value))} /></Field>
        </>}
        <details>
          <summary>More details</summary>
          <Field label={t("installer")}>
            <select value={inputs.installer} onChange={(e) => { setOverrides({ ...overrides, battery_kwh: null }); set("installer", e.target.value); }}>
              <option value="2a8ba8e2">{t("installerA")}</option><option value="23c108b7">{t("installerB")}</option>
            </select>
          </Field>
          <Field label={t("country")}>
            <select value={inputs.country} onChange={(e) => set("country", e.target.value)}>
              {["Germany", "Austria", "Switzerland", "Netherlands", "Other"].map((c) => <option key={c} value={c}>{t(c)}</option>)}
            </select>
          </Field>
          <Field label={t("price")}><input type="number" min={1} step={0.5} value={inputs.price_ct_kwh} onChange={(e) => set("price_ct_kwh", Number(e.target.value))} /></Field>
          <label className="check"><input type="checkbox" checked={inputs.has_solar} onChange={(e) => set("has_solar", e.target.checked)} />{t("hasSolar")}</label>
          <label className="check"><input type="checkbox" checked={inputs.has_storage} onChange={(e) => set("has_storage", e.target.checked)} />{t("hasStorage")}</label>
        </details>
      </form>

      <section className="result" aria-live="polite">
        {request.status === "change" && request.change && (
          <div className="banner">
            <p><b>The homeowner asked for a change:</b> {describe(request.change)}</p>
            <button className="primary" onClick={() => update(request.id, { overrides: { ...overrides, ...request.change }, status: "draft", change: undefined })}>Apply change</button>
          </div>
        )}
        <p className="intro">AI prepared this draft before you opened it. Check it, change anything, then send the offer.</p>
        <Ask mount={inputs.mount} onChange={(r) => update(request.id, { inputs: { ...inputs, ...r.inputs }, overrides: { ...overrides, ...r.overrides } })} />
        {failed && <p className="error">{t("apiError")}</p>}
        {!design && !failed && <p className="muted">{t("loading")}</p>}
        {request.site && <SiteView request={request} placed={design?.pv.placed ?? null} />}
        {design && <Proposal d={design} prev={previous} overrides={overrides} setOverrides={setOverrides} />}
        {design && <Send d={design} request={request} update={update} />}
      </section>
    </main>
  );
}

function SiteView({ request, placed }: { request: Request; placed: number[] | null }) {
  const site = request.site as NonNullable<Request["site"]>;
  return (
    <div className="plannermap">
      <div className="offermap"><HomeMap site={site} placed={placed} /></div>
      <div>
        <h3>Homeowner's site wishes</h3>
        <p className="small muted">{site.place.label}</p>
        <ol className="plainlist">{site.surfaces.filter((s) => s.wanted).map((s) => <li key={s.id}>{s.name}: {s.panels.length} panels fit, {s.tilt}°{s.sun ? `, ${s.sun.kwh_per_kwp} kWh per kWp` : ""}</li>)}</ol>
        {site.surfaces.some((s) => !s.wanted) && <p>Not here: {site.surfaces.filter((s) => !s.wanted).map((s) => s.name).join(", ")}</p>}
        {site.noGarden && <p>No panels in the garden.</p>}
        <p className="small warn-text">{site.buildings.some((b) => b.real) ? "Roof from measured state data. Panel fit is an estimate. Check on site." : "Roof shape and fit are estimates from the map. Check on site."}</p>
      </div>
    </div>
  );
}

const describe = (o: Overrides) => [
  o.modules != null && `${o.modules} panels`,
  o.battery_kwh != null && (o.battery_kwh ? `${o.battery_kwh} kWh battery` : "no battery"),
  o.wallbox != null && (o.wallbox ? "with wallbox" : "no wallbox"),
  o.heatpump != null && (o.heatpump ? "with heat pump" : "no heat pump"),
].filter(Boolean).join(", ");

function Ask({ mount, onChange }: { mount: string; onChange: (r: Refined) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Refined | null>(null);
  const [failed, setFailed] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setFailed(false);
    refine(text, mount)
      .then((r) => { setDone(r); if (r.understood.length) { onChange(r); setText(""); } })
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };
  return (
    <form className="ask" onSubmit={submit}>
      <label htmlFor="ask">{t("ask")}</label>
      <div>
        <input id="ask" value={text} placeholder={t("askHint")} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="primary" disabled={busy || !text.trim()}>{busy ? t("loading") : t("apply")}</button>
      </div>
      {failed && <p className="error">{t("apiError")}</p>}
      {done && done.understood.length === 0 && <p className="warn-text">{t("notUnderstood")}</p>}
      {done && done.understood.length > 0 && (
        <p className="got"><b>{t("understood")}:</b> {done.understood.map((u) => t(u.code, u)).join(" · ")} <span className="muted">{t(done.source === "claude" ? "byClaude" : "byRules")}</span></p>
      )}
    </form>
  );
}

function Delta({ now, before, unit }: { now: number; before?: number; unit: string }) {
  if (before === undefined || Math.abs(now - before) < 0.01) return null;
  const up = now > before;
  return <span className={up ? "delta up" : "delta down"}>{up ? "+" : ""}{(now - before).toFixed(1)} {unit} {t(up ? "higher" : "lower")}</span>;
}

function Choice({ value, onChange, blocked, label }: { value: boolean | null | undefined; onChange: (v: boolean | null) => void; blocked?: boolean; label: string }) {
  return (
    <select aria-label={label} disabled={blocked} value={value === null || value === undefined ? "auto" : value ? "yes" : "no"}
      onChange={(e) => onChange(e.target.value === "auto" ? null : e.target.value === "yes")}>
      <option value="auto">{t("auto")}</option><option value="yes">{t("included")}</option><option value="no">{t("none")}</option>
    </select>
  );
}

function Proposal({ d, prev, overrides, setOverrides }: { d: Design; prev: Design | null; overrides: Overrides; setOverrides: (o: Overrides) => void }) {
  const s = d.similar;
  const any = Object.values(overrides).some((v) => v !== null && v !== undefined);
  return (
    <>
      <div className="row"><h2>{t("proposal")}</h2>{any && <button className="ghost" onClick={() => setOverrides({})}>{t("resetAll")}</button>}</div>
      <table>
        <thead><tr><th>{t("component")}</th><th>{t("recommended")}</th><th>{t("similar")}</th><th>{t("control")}</th></tr></thead>
        <tbody>
          <tr>
            <th scope="row">{t("pv")}</th>
            <td><b>{d.pv.kwp.toFixed(1)} kWp</b> <span className="muted">{d.pv.modules} {t("modules")}</span><Delta now={d.pv.kwp} before={prev?.pv.kwp} unit="kWp" />{d.pv.capped && <span className="tag">{t("capped")}</span>}</td>
            <td>{s.kwp_low}–{s.kwp_high} kWp</td>
            <td><input aria-label={t("panels")} type="number" min={1} placeholder={t("auto")} value={overrides.modules ?? ""} onChange={(e) => setOverrides({ ...overrides, modules: num(e.target.value) })} /></td>
          </tr>
          <tr>
            <th scope="row">{t("battery")}</th>
            <td><b>{d.battery.kwh ? `${d.battery.kwh} kWh` : t("none")}</b><Delta now={d.battery.kwh} before={prev?.battery.kwh} unit="kWh" />{d.battery.unsure && <span className="tag">Open decision</span>}</td>
            <td>{t("sold", { rate: s.battery_rate })}{s.battery_common.length > 0 && <small>{t("common")}: {s.battery_common.join(", ")} kWh</small>}</td>
            <td>
              <select aria-label={t("battery")} value={overrides.battery_kwh ?? "auto"} onChange={(e) => setOverrides({ ...overrides, battery_kwh: e.target.value === "auto" ? null : Number(e.target.value) })}>
                <option value="auto">{t("auto")}</option><option value="0">{t("none")}</option>
                {d.battery.choices.map((c) => <option key={c} value={c}>{c} kWh</option>)}
              </select>
            </td>
          </tr>
          <tr>
            <th scope="row">{t("wallbox")}</th><td><b>{t(d.wallbox.included ? "included" : "none")}</b></td><td>{t("sold", { rate: s.wallbox_rate })}</td>
            <td><Choice label={t("wallbox")} value={overrides.wallbox} onChange={(v) => setOverrides({ ...overrides, wallbox: v })} /></td>
          </tr>
          <tr>
            <th scope="row">{t("heatpump")}</th><td><b>{d.heatpump.included ? `${d.heatpump.kw} kW` : t("none")}</b></td><td className="muted">–</td>
            <td><Choice label={t("heatpump")} blocked={d.heatpump.blocked} value={overrides.heatpump} onChange={(v) => setOverrides({ ...overrides, heatpump: v })} /></td>
          </tr>
        </tbody>
      </table>
      <div className="cols">
        <div>
          <h3>{t("why")}</h3>
          <ul>{d.reasons.map((r) => <li key={r.code}>{t(`r_${r.code}`, r)}</li>)}</ul>
          {d.warnings.length > 0 && <><h3>{t("notes")}</h3><ul className="warn">{d.warnings.map((w) => <li key={w.code}>{t(`w_${w.code}`, w)}</li>)}</ul></>}
        </div>
        <div>
          <h3>{t("energy")}</h3>
          <dl>
            <dt>{t("base")}</dt><dd>{d.energy.base_mwh.toFixed(1)} MWh</dd>
            {d.energy.ev_mwh > 0 && <><dt>{t("evLoad")}</dt><dd>+{d.energy.ev_mwh.toFixed(1)} MWh</dd></>}
            {d.energy.hp_mwh > 0 && <><dt>{t("hpLoad")}</dt><dd>+{d.energy.hp_mwh.toFixed(1)} MWh</dd></>}
            <dt className="strong">{t("total")}</dt><dd className="strong">{d.energy.total_mwh.toFixed(1)} MWh</dd>
            <dt>{t("production")}</dt><dd>{d.energy.production_mwh.toFixed(1)} MWh</dd>
            <dt>Own electricity share</dt><dd>{d.energy.self_sufficiency_pct}%</dd>
            <dt>Yearly saving</dt><dd>about €{d.energy.saving_eur}</dd>
          </dl>
          <small className="muted">Estimates from assumed profiles, not learned from past data.</small>
        </div>
      </div>
    </>
  );
}

function Send({ d, request, update }: { d: Design; request: Request; update: (id: string, p: Partial<Request>) => void }) {
  const [allowed, setAllowed] = useState<Allowed>(request.allowed ?? { battery: true, panels: true, wallbox: false, heatpump: d.heatpump.included });
  const box = (k: keyof Allowed, label: string) => (
    <label className="check"><input type="checkbox" checked={allowed[k]} onChange={(e) => setAllowed({ ...allowed, [k]: e.target.checked })} />{label}</label>
  );
  const send = () => update(request.id, {
    status: "sent", allowed,
    offer: { modules: d.pv.modules, battery_kwh: d.battery.kwh, wallbox: d.wallbox.included, heatpump: d.heatpump.included },
  });
  return (
    <section className="send">
      <h3>Send the offer</h3>
      <p className="muted">The homeowner can only try what you allow. The home's data stays fixed.</p>
      <div className="boxes">{box("battery", "Change the battery")}{box("panels", "Change the panels")}{box("wallbox", "Add or remove the wallbox")}{box("heatpump", "Add or remove the heat pump")}</div>
      <button className="primary" onClick={send}>{request.status === "sent" ? "Send updated offer" : "Send offer to homeowner"}</button>
      {request.status === "sent" && <span className="got"> Offer sent. Switch to Homeowner to see it.</span>}
    </section>
  );
}
