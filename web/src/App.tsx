import { useEffect, useRef, useState } from "react";
import { Lang, makeT } from "./i18n";

type Inputs = {
  installer: string; country: string; demand_kwh: number; price_ct_kwh: number; heating: string | null;
  heat_kwh: number | null; has_solar: boolean; has_storage: boolean; ev: boolean; ev_km: number;
  mount: string; area_m2: number | null;
};
type Overrides = { modules?: number | null; battery_kwh?: number | null; wallbox?: boolean | null; heatpump?: boolean | null };
type Note = { code: string } & Record<string, unknown>;
type Design = {
  pv: { modules: number; kwp: number; max_modules: number | null; locked: boolean; capped: boolean };
  battery: { kwh: number; locked: boolean; choices: number[] };
  wallbox: { included: boolean; locked: boolean };
  heatpump: { included: boolean; kw: number; locked: boolean; blocked: boolean };
  energy: { base_mwh: number; ev_mwh: number; hp_mwh: number; total_mwh: number; production_mwh: number };
  similar: { n: number; kwp_low: number; kwp_high: number; battery_rate: number; battery_common: number[]; wallbox_rate: number };
  reasons: Note[]; warnings: Note[];
};
type T = ReturnType<typeof makeT>;
type Refined = { inputs: Partial<Inputs>; overrides: Overrides; understood: Note[]; source: string };

const START: Inputs = {
  installer: "2a8ba8e2", country: "Germany", demand_kwh: 4500, price_ct_kwh: 32, heating: null, heat_kwh: null,
  has_solar: false, has_storage: false, ev: false, ev_km: 15000, mount: "roof", area_m2: null,
};

const post = (inputs: Inputs, overrides: Overrides): Promise<Design> =>
  fetch("/api/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs, overrides }) })
    .then((r) => { if (!r.ok) throw new Error(); return r.json(); });

const refine = (text: string, mount: string): Promise<Refined> =>
  fetch("/api/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, mount }) })
    .then((r) => { if (!r.ok) throw new Error(); return r.json(); });

const num = (v: string) => (v === "" ? null : Number(v));

const BACK_OFFICE = "http://127.0.0.1:5174";

export default function App() {
  const [lang, setLang] = useState<Lang>("en");
  const [inputs, setInputs] = useState(START);
  const [overrides, setOverrides] = useState<Overrides>({});
  const t = makeT(lang);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get("project");
    if (id) fetch(`/api/projects/${id}`).then((r) => r.json()).then((d) => setInputs(d.inputs)).catch(() => undefined);
  }, []);

  return (
    <div className="app">
      <header>
        <h1>{t("title")}</h1>
        <a className="out" href={BACK_OFFICE}>{t("backOffice")}</a>
        <div className="lang">
          {(["tr", "en"] as const).map((l) => (
            <button key={l} className={lang === l ? "tab on" : "tab"} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
      </header>
      <DesignPage t={t} inputs={inputs} setInputs={setInputs} overrides={overrides} setOverrides={setOverrides} />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function DesignPage({ t, inputs, setInputs, overrides, setOverrides }: {
  t: T; inputs: Inputs; setInputs: (i: Inputs) => void; overrides: Overrides; setOverrides: (o: Overrides) => void;
}) {
  const [design, setDesign] = useState<Design | null>(null);
  const [previous, setPrevious] = useState<Design | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef<Design | null>(null);

  useEffect(() => {
    if (!inputs.demand_kwh) return;
    let live = true;
    const timer = setTimeout(() => {
      post(inputs, overrides)
        .then((d) => { if (!live) return; setPrevious(latest.current); latest.current = d; setDesign(d); setFailed(false); })
        .catch(() => live && setFailed(true));
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [inputs, overrides]);

  const set = <K extends keyof Inputs>(k: K, v: Inputs[K]) => setInputs({ ...inputs, [k]: v });
  const fossil = ["Gas", "Oil", "OtherNonRenewable"].includes(inputs.heating ?? "");

  return (
    <main className="split">
      <form onSubmit={(e) => e.preventDefault()}>
        <h2>{t("home")}</h2>
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
        <Field label={t("demand")}><input type="number" min={500} step={100} value={inputs.demand_kwh || ""} onChange={(e) => set("demand_kwh", Number(e.target.value))} /></Field>
        <Field label={t("price")}><input type="number" min={1} step={0.5} value={inputs.price_ct_kwh} onChange={(e) => set("price_ct_kwh", Number(e.target.value))} /></Field>
        <Field label={t("heating")}>
          <select value={inputs.heating ?? ""} onChange={(e) => set("heating", e.target.value || null)}>
            <option value="">{t("unknown")}</option>
            {["Gas", "Oil", "OtherNonRenewable", "Heatpump"].map((h) => <option key={h} value={h}>{t(h)}</option>)}
          </select>
        </Field>
        {fossil && <Field label={t("heat")}><input type="number" min={0} step={500} value={inputs.heat_kwh ?? ""} onChange={(e) => set("heat_kwh", num(e.target.value))} /></Field>}
        <label className="check"><input type="checkbox" checked={inputs.has_solar} onChange={(e) => set("has_solar", e.target.checked)} />{t("hasSolar")}</label>
        <label className="check"><input type="checkbox" checked={inputs.has_storage} onChange={(e) => set("has_storage", e.target.checked)} />{t("hasStorage")}</label>
        <label className="check"><input type="checkbox" checked={inputs.ev} onChange={(e) => set("ev", e.target.checked)} />{t("ev")}</label>
        {inputs.ev && <Field label={t("evKm")}><input type="number" min={0} step={1000} value={inputs.ev_km} onChange={(e) => set("ev_km", Number(e.target.value))} /></Field>}

        <h2>{t("place")}</h2>
        <Field label={t("where")}>
          <select value={inputs.mount} onChange={(e) => set("mount", e.target.value)}>
            {["roof", "ground", "carport", "facade"].map((m) => <option key={m} value={m}>{t(m)}</option>)}
          </select>
        </Field>
        <Field label={t("area")} hint={t("areaHint")}><input type="number" min={0} step={5} value={inputs.area_m2 ?? ""} onChange={(e) => set("area_m2", num(e.target.value))} /></Field>
      </form>

      <section className="result" aria-live="polite">
        <Ask t={t} mount={inputs.mount} onChange={(r) => { setInputs({ ...inputs, ...r.inputs }); setOverrides({ ...overrides, ...r.overrides }); }} />
        {failed && <p className="error">{t("apiError")}</p>}
        {!design && !failed && <p className="muted">{t("loading")}</p>}
        {design && <Proposal t={t} d={design} prev={previous} overrides={overrides} setOverrides={setOverrides} />}
      </section>
    </main>
  );
}

function Ask({ t, mount, onChange }: { t: T; mount: string; onChange: (r: Refined) => void }) {
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
        <button type="submit" disabled={busy || !text.trim()}>{busy ? t("loading") : t("apply")}</button>
      </div>
      {failed && <p className="error">{t("apiError")}</p>}
      {done && done.understood.length === 0 && <p className="warn-text">{t("notUnderstood")}</p>}
      {done && done.understood.length > 0 && (
        <p className="got"><b>{t("understood")}:</b> {done.understood.map((u) => t(u.code, u)).join(" · ")} <span className="muted">{t(done.source === "claude" ? "byClaude" : "byRules")}</span></p>
      )}
    </form>
  );
}

function Delta({ now, before, unit, t }: { now: number; before?: number; unit: string; t: T }) {
  if (before === undefined || Math.abs(now - before) < 0.01) return null;
  const up = now > before;
  return <span className={up ? "delta up" : "delta down"}>{up ? "+" : ""}{(now - before).toFixed(1)} {unit} {t(up ? "higher" : "lower")}</span>;
}

function Choice({ value, onChange, t, blocked }: { value: boolean | null | undefined; onChange: (v: boolean | null) => void; t: T; blocked?: boolean }) {
  return (
    <select disabled={blocked} value={value === null || value === undefined ? "auto" : value ? "yes" : "no"}
      onChange={(e) => onChange(e.target.value === "auto" ? null : e.target.value === "yes")}>
      <option value="auto">{t("auto")}</option><option value="yes">{t("included")}</option><option value="no">{t("none")}</option>
    </select>
  );
}

function Proposal({ t, d, prev, overrides, setOverrides }: { t: T; d: Design; prev: Design | null; overrides: Overrides; setOverrides: (o: Overrides) => void }) {
  const s = d.similar;
  const any = Object.values(overrides).some((v) => v !== null && v !== undefined);
  return (
    <>
      <div className="row"><h2>{t("proposal")}</h2>{any && <button className="link" onClick={() => setOverrides({})}>{t("resetAll")}</button>}</div>
      <table>
        <thead><tr><th>{t("component")}</th><th>{t("recommended")}</th><th>{t("similar")}</th><th>{t("control")}</th></tr></thead>
        <tbody>
          <tr>
            <th scope="row">{t("pv")}</th>
            <td><b>{d.pv.kwp.toFixed(1)} kWp</b> <span className="muted">{d.pv.modules} {t("modules")}</span><Delta now={d.pv.kwp} before={prev?.pv.kwp} unit="kWp" t={t} />{d.pv.capped && <span className="tag">{t("capped")}</span>}</td>
            <td>{s.kwp_low}–{s.kwp_high} kWp</td>
            <td><input aria-label={t("panels")} type="number" min={1} placeholder={t("auto")} value={overrides.modules ?? ""} onChange={(e) => setOverrides({ ...overrides, modules: num(e.target.value) })} /></td>
          </tr>
          <tr>
            <th scope="row">{t("battery")}</th>
            <td><b>{d.battery.kwh ? `${d.battery.kwh} kWh` : t("none")}</b><Delta now={d.battery.kwh} before={prev?.battery.kwh} unit="kWh" t={t} /></td>
            <td>{t("sold", { rate: s.battery_rate })}{s.battery_common.length > 0 && <small>{t("common")}: {s.battery_common.join(", ")} kWh</small>}</td>
            <td>
              <select aria-label={t("battery")} value={overrides.battery_kwh ?? "auto"} onChange={(e) => setOverrides({ ...overrides, battery_kwh: e.target.value === "auto" ? null : Number(e.target.value) })}>
                <option value="auto">{t("auto")}</option><option value="0">{t("none")}</option>
                {d.battery.choices.map((c) => <option key={c} value={c}>{c} kWh</option>)}
              </select>
            </td>
          </tr>
          <tr>
            <th scope="row">{t("wallbox")}</th>
            <td><b>{t(d.wallbox.included ? "included" : "none")}</b></td>
            <td>{t("sold", { rate: s.wallbox_rate })}</td>
            <td><Choice t={t} value={overrides.wallbox} onChange={(v) => setOverrides({ ...overrides, wallbox: v })} /></td>
          </tr>
          <tr>
            <th scope="row">{t("heatpump")}</th>
            <td><b>{d.heatpump.included ? `${d.heatpump.kw} kW` : t("none")}</b></td>
            <td className="muted">–</td>
            <td><Choice t={t} blocked={d.heatpump.blocked} value={overrides.heatpump} onChange={(v) => setOverrides({ ...overrides, heatpump: v })} /></td>
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
          </dl>
          <small className="muted">{t("assumption")}</small>
        </div>
      </div>
    </>
  );
}
