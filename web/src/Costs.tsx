// The desk's Cost tab and the price book. What the homeowner pays, the KfW grant, the year's money before and after,
// when it pays back and how. Every number is the API's (costs.py); the planner edits prices and ticks extras here.
import { useEffect, useMemo, useState } from "react";
import { Book, Costs, Money, PriceItem, addItem, eur, getBook, resetItem, resetRates, setItem, setRates, years } from "./money";
import { Button, Check, Field, Input, Select } from "./ui";
import "./money.css";

const TECH: Record<string, string> = { solar: "Solar", battery: "Battery", wallbox: "Wallbox", heatpump: "Heat pump" };
const UNIT_SHORT: Record<string, string> = { job: "", module: "modules", kwp: "kWp", kwh: "kWh", kw_inverter: "kW", kw_heatpump: "kW", metre: "m", piece: "pcs" };
const INCOME: [string, string][] = [["", "Not given"], ["le30", "Up to €30,000"], ["le40", "€30,001 – 40,000"], ["le50", "€40,001 – 50,000"], ["le60", "€50,001 – 60,000"], ["above", "Above €60,000"]];
const qtyText = (l: { qty: number; unit: string }) => (l.unit === "job" ? "1" : `${l.qty.toLocaleString("en")} ${UNIT_SHORT[l.unit] ?? ""}`.trim());
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${eur(Math.abs(v))}`;

type TabProps = { c: Costs | null; failed: boolean; money: Money; setMoney: (m: Money) => void; use: (change: Record<string, unknown>, label: string) => void; prices: () => void; sent: boolean };

export function CostTab({ c, failed, money, setMoney, use, prices, sent }: TabProps) {
  if (failed && !c) return <p className="flag">The money view could not be worked out. Is the API running the latest version?</p>;
  if (!c) return <p className="muted">Pricing the design…</p>;
  const y = c.year1, b = c.bills, n = c.assumptions.years;
  const groups = Object.keys(TECH).filter((t) => c.lines.some((l) => l.tech === t));
  const fuelName = c.fuel?.kind === "oil" ? "Heating oil" : "Gas";
  return <>
    <dl className="money-head">
      <div className="lead"><dt>The homeowner pays</dt><dd>{eur(c.pays_eur)}</dd><small>{c.grant ? `${eur(c.gross_eur)} less ${eur(c.grant.eur)} ${c.grant.path === "fkg" ? "KfW and city" : "KfW"} grant` : c.vat_eur ? `${eur(c.net_eur)} + ${eur(c.vat_eur)} VAT` : "No VAT on solar and battery"}</small></div>
      <div><dt>Pays back in</dt><dd>{c.payback_years != null ? <>{c.payback_years.toLocaleString("en", { maximumFractionDigits: 1 })}<small> years</small></> : "–"}</dd><small>{c.payback_years == null ? `not within ${n} years` : c.draft_2027 ? `${c.draft_2027.payback_years != null ? `${c.draft_2027.payback_years} years` : "not"} if switched on in 2027 (draft law)` : "prices rising, panels ageing"}</small></div>
      <div><dt>Gain over {n} years</dt><dd>{eur(c.gain_eur)}</dd><small>{c.irr_pct != null ? `${c.irr_pct}% a year return` : "after paying it off"}</small></div>
    </dl>
    {c.notes.map((x) => <div key={x.code} className={x.level === "warn" ? "money-note warn" : "money-note"}><p>{x.text}</p>{x.change && !sent && <Button onClick={() => use(x.change!, x.code === "money_battery" ? "Battery left out for the money" : "Battery size by money")}>Use</Button>}</div>)}

    <h3>How the homeowner gains</h3>
    <p className="small muted">The first year, before and after. Electricity at {c.price_ct_kwh} ct per kWh, feed-in at {y.feed_full_ct} ct but none in negative-price hours ({y.unpaid_pct}% of the year's output in 2025){c.fuel ? `, ${fuelName.toLowerCase()} at ${c.fuel.ct} ct` : ""}.</p>
    <table className="grid money-bill"><thead><tr><th /><th>Today</th><th>With the system</th></tr></thead><tbody>
      <tr><th scope="row">Electricity from the grid<small>{b.before.grid_kwh.toLocaleString("en")} → {b.after.grid_kwh.toLocaleString("en")} kWh</small></th><td>{eur(b.before.grid_eur)}</td><td>{eur(b.after.grid_eur)}</td></tr>
      <tr><th scope="row">Sold to the grid</th><td>{b.before.feed_eur ? `−${eur(b.before.feed_eur)}` : "–"}</td><td>−{eur(b.after.feed_eur)}</td></tr>
      {(b.before.fuel_eur > 0 || b.after.fuel_eur > 0) && <tr><th scope="row">{fuelName}<small>{c.fuel?.kwh.toLocaleString("en")} kWh a year</small></th><td>{eur(b.before.fuel_eur)}</td><td>{eur(b.after.fuel_eur)}</td></tr>}
      <tr><th scope="row">Upkeep<small>{[b.before.upkeep_eur && "boiler service, chimney sweep", "solar insurance and checks", c.lines.some((l) => l.tech === "heatpump") && "heat pump service"].filter(Boolean).join("; ")}</small></th><td>{b.before.upkeep_eur ? eur(b.before.upkeep_eur) : "–"}</td><td>{eur(b.after.upkeep_eur)}</td></tr>
      {b.after.meter_eur > 0 && <tr><th scope="row">Smart meter and control box<small>required above 7 kWp</small></th><td>–</td><td>{eur(b.after.meter_eur)}</td></tr>}
      {b.after.rebate_eur > 0 && <tr><th scope="row">Grid fee rebate<small>§14a, heat pump or wallbox controllable</small></th><td>–</td><td>−{eur(b.after.rebate_eur)}</td></tr>}
      <tr className="total"><th scope="row">A year</th><td>{eur(b.before.total_eur)}</td><td>{eur(b.after.total_eur)}</td></tr>
    </tbody></table>
    <ul className="money-why">
      <li><b>{signed(y.own_eur)}</b> own solar power used instead of bought</li>
      <li><b>{signed(y.feed_eur)}</b> for power sold to the grid</li>
      {y.fuel_eur > 0 && <li><b>{signed(y.fuel_eur)}</b> {fuelName.toLowerCase()} no longer bought</li>}
      {y.extra_power_eur !== 0 && <li><b>{signed(-y.extra_power_eur)}</b> {y.extra_power_eur > 0 ? "more electricity used (heat pump, car)" : "less electricity used"}</li>}
      {y.upkeep_eur !== 0 && <li><b>{signed(y.upkeep_eur)}</b> upkeep</li>}
      {y.meter_eur > 0 && <li><b>{signed(-y.meter_eur)}</b> smart meter and control box</li>}
      {y.rebate_eur > 0 && <li><b>{signed(y.rebate_eur)}</b> lower grid fee (§14a)</li>}
      <li className="sum"><b>{signed(y.total_eur)}</b> in the first year{c.battery_eur ? `, of which the battery ${eur(c.battery_eur)}` : ""}</li>
    </ul>
    {c.solar_ct_kwh != null && <p className="small muted">Each kWh from the panels costs about {c.solar_ct_kwh} ct over {n} years, against {c.price_ct_kwh} ct from the grid.</p>}
    <Payback c={c} />

    <h3>What it costs</h3>
    <table className="grid money-lines"><thead><tr><th>Part</th><th>Qty</th><th>Price</th></tr></thead><tbody>
      {groups.map((t) => [
        <tr key={`g-${t}`} className="group"><th colSpan={2} scope="rowgroup">{TECH[t]}</th><td>{eur(c.by_tech[t] ?? 0)}</td></tr>,
        ...c.lines.filter((l) => l.tech === t).map((l) => <tr key={l.id}><th scope="row">{l.name}{(l.edited || l.custom) && <small>{l.custom ? "your part" : "your price"}</small>}</th><td>{qtyText(l)}</td><td>{eur(l.gross)}{l.vat ? <small>{eur(l.net)} + {l.vat}% VAT</small> : null}</td></tr>),
      ])}
      <tr className="total"><th scope="row" colSpan={2}>Total{c.vat_eur ? <small>{eur(c.net_eur)} net + {eur(c.vat_eur)} VAT</small> : <small>0% VAT on solar and battery (UStG §12(3))</small>}</th><td>{eur(c.gross_eur)}</td></tr>
      {c.grant && <tr><th scope="row" colSpan={2}>{c.grant.path === "fkg" ? "KfW and Munich heat pump grants" : "KfW heat pump grant"}<small>{c.grant.rate_pct}% of {eur(c.grant.eligible_eur)}</small></th><td>−{eur(c.grant.eur)}</td></tr>}
      {c.grant && <tr className="total"><th scope="row" colSpan={2}>The homeowner pays</th><td>{eur(c.pays_eur)}</td></tr>}
    </tbody></table>
    <div className="money-actions"><Button onClick={prices}>Edit prices or add a part</Button></div>

    {c.extras.length > 0 && <><h3>Extras for this home</h3>
      <p className="small muted">Site work experts add when the home needs it. Ticked by default when this installer adds it to at least half of its offers.</p>
      <ul className="tasks">{c.extras.map((x) => <li key={x.id}><Check checked={x.on} onChange={(v) => setMoney({ ...money, extras: { ...(money.extras ?? {}), [x.id]: v } })}>
        <b>{x.name} · {eur(x.net)}</b><small>{TECH[x.tech]}{x.share != null ? ` · in ${Math.round(x.share * 100)}% of this installer's offers` : ""}{x.unit !== "job" ? ` · ${qtyText(x)}` : ""}</small></Check></li>)}</ul></>}

    <Rules rules={c.rules} />

    {c.grant && <><h3>Heat pump grant</h3>
      <ul className="small muted money-grant">{c.grant.notes.map((x) => <li key={x}>{x}</li>)}</ul>
      <div className="facts"><Field label="Taxable household income"><Select value={money.income ?? ""} onChange={(e) => setMoney({ ...money, income: e.target.value || null })}>{INCOME.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <div className="fact"><span>&nbsp;</span><Check checked={!!money.kids} onChange={(v) => setMoney({ ...money, kids: v })}>Child under 18 at home</Check></div></div></>}

    {c.battery_options.length > 0 && <><h3>Battery sizes in money</h3>
      <p className="small muted">What each size from the catalog costs and adds a year over no battery, over its 15-year life. Click to use it.</p>
      <table className="grid money-batt"><thead><tr><th>Size</th><th>Costs</th><th>Adds a year</th><th>Pays back</th><th>Gain</th></tr></thead><tbody>
        {c.battery_options.map((o) => <tr key={o.kwh} className={o.kwh === c.design.battery_kwh ? "on" : ""} onClick={() => !sent && use({ battery_kwh: o.kwh }, `Battery set to ${o.kwh} kWh`)}>
          <th scope="row">{o.kwh} kWh</th><td>{eur(o.cost_eur)}</td><td>{eur(o.year1_eur)}</td><td>{o.payback_years != null ? `${o.payback_years} y` : "no"}</td><td>{eur(o.gain_eur)}</td></tr>)}
      </tbody></table></>}

    {c.heatpump_money && <p className="small muted">Heat pump on its own (against the same home keeping its {c.heatpump_money.fuel}, solar re-sized): {eur(c.heatpump_money.cost_eur)} after the grant, {signed(c.heatpump_money.year1_eur)} a year, {c.heatpump_money.payback_years ? `pays back in about ${c.heatpump_money.payback_years} years` : "does not pay back on money alone"}.</p>}

    <p className="small muted trust">Typical German prices for autumn 2026, not a quote: each has its source on the price page, and you can set your own. Electricity +{c.assumptions.electricity_rise_pct}% a year, gas and oil +{c.assumptions.fuel_rise_pct}%, panels lose {c.assumptions.degradation_pct}% a year, the inverter is replaced after {c.assumptions.inverter_life} years, the battery counts for 15 years. Feed-in fixed for 20 years.</p>
  </>;
}

const STATUS: Record<string, string> = { law: "Law", draft: "Draft law", city: "Munich" };
/** The rules and grants that touch this home, with what each does and what to do. */
function Rules({ rules }: { rules: Costs["rules"] }) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = rules.filter((r) => r.applies);
  if (!shown.length) return null;
  return <><h3>Rules and grants for this home</h3>
    <p className="small muted">What German law, KfW and Munich mean for this system as of November 2026. Their money is already in the numbers above. Click one for what to do.</p>
    <ul className="rules">{shown.map((r) => <li key={r.id} className={r.status}>
      <button type="button" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
        <em>{STATUS[r.status]}</em><b>{r.title}</b>{r.effect && <span>{r.effect}</span>}
      </button>
      {open === r.id && <div><p>{r.text}</p>{r.action && <p><b>To do:</b> {r.action}</p>}<small>{r.source}</small></div>}
    </li>)}</ul></>;
}

/** Money over the years, one bar a year: below the line while the system is being paid off, above once it has paid back. */
function Payback({ c }: { c: Costs }) {
  const [hot, setHot] = useState<number | null>(null);
  const rows = c.rows, W = 480, H = 150, pad = 18;
  const lo = Math.min(-c.pays_eur, ...rows.map((r) => r.total)), hi = Math.max(0, ...rows.map((r) => r.total));
  const y = (v: number) => pad + ((hi - v) / Math.max(hi - lo, 1)) * (H - pad * 2);
  const bw = W / rows.length;
  const shown = hot != null ? rows[hot] : null;
  return <figure className="payback">
    <figcaption><b>Money over {rows.length} years</b><small>{shown ? `Year ${shown.year}: ${shown.total < 0 ? `${eur(-shown.total)} still to pay back` : `${eur(shown.total)} ahead`}, ${eur(shown.eur)} that year` : "After paying for the system, what the homeowner is ahead or behind at the end of each year."}</small></figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pays back after ${years(c.payback_years)}; ${eur(c.gain_eur)} ahead after ${rows.length} years`} onMouseLeave={() => setHot(null)}>
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="zero" />
      {rows.map((r, k) => {
        const top = Math.min(y(0), y(r.total)), h = Math.max(1, Math.abs(y(r.total) - y(0)));
        return <g key={r.year} onMouseEnter={() => setHot(k)}>
          <rect x={k * bw} y={0} width={bw} height={H} fill="transparent" />
          <rect x={k * bw + 1} y={top} width={bw - 2} height={h} rx={3} className={r.total < 0 ? "neg" : "pos"} opacity={hot == null || hot === k ? 1 : 0.55} />
        </g>;
      })}
      <text x={2} y={H - 2} className="axis">year 1</text><text x={W - 2} y={H - 2} className="axis" textAnchor="end">year {rows.length}</text>
    </svg>
  </figure>;
}

/** The price book: every part an offer can hold, with its default, source and the planner's own price. */
export function PriceBook({ installer, close }: { installer?: string; close?: () => void }) {
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { getBook(installer).then(setBook).catch(() => setError("The price book could not be loaded. Is the API running the latest version?")); }, [installer]);
  const run = (p: Promise<Book>) => p.then((b) => { setBook(b); setError(""); }).catch((e: Error) => setError(e.message));
  if (!book) return <p className={error ? "flag" : "muted"}>{error || "Loading prices…"}</p>;
  return <div className="pricebook">
    {close && <div className="money-actions"><Button onClick={close}>Back to the cost</Button></div>}
    <p className="small muted">Net prices to the customer, as in autumn 2026, each with where it came from. Set your own and every offer uses it at once. VAT: 0% for solar and battery up to 30 kWp (UStG §12(3)), 19% for wallbox and heat pump.</p>
    {error && <p className="flag">{error}</p>}
    {Object.entries(book.techs).map(([t, label]) => <section key={t}>
      <h3>{label}</h3>
      <table className="grid prices"><thead><tr><th>Part</th><th>Fixed</th><th>Per unit</th><th>VAT</th><th /></tr></thead><tbody>
        {book.items.filter((i) => i.tech === t).map((i) => <PriceRow key={i.id} i={i} book={book} save={(f) => run(setItem(i.id, f))} reset={() => run(resetItem(i.id))} />)}
      </tbody></table>
    </section>)}
    <AddPart book={book} add={(f) => run(addItem(f))} />
    <h3>Running prices</h3>
    <div className="facts">{Object.entries(book.rates).map(([k, r]) => <Field key={k} label={r.label} hint={r.source}>
      <Input type="number" step="any" defaultValue={r.value} key={`${k}${r.value}`} onBlur={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && v !== r.value) run(setRates({ [k]: v })); }} /></Field>)}</div>
    <div className="money-actions"><Button variant="plain" onClick={() => run(resetRates())}>Running prices back to defaults</Button></div>
  </div>;
}

function PriceRow({ i, book, save, reset }: { i: PriceItem; book: Book; save: (f: Partial<PriceItem>) => void; reset: () => void }) {
  const num = (k: "fixed" | "per_unit" | "vat", v: number) => <Input type="number" step="any" aria-label={`${i.name}: ${k}`} defaultValue={v} key={`${i.id}${k}${v}`}
    onBlur={(e) => { const x = Number(e.target.value); if (e.target.value !== "" && x !== v) save({ [k]: x }); }} />;
  const share = i.share ? Object.values(i.share) : [];
  return <tr className={i.edited || i.custom ? "edited" : ""}>
    <th scope="row">{i.name}<small>{book.when[i.when]}{i.unit !== "job" ? ` · ${book.units[i.unit]}` : ""}{share.length ? ` · in ${share.map((s) => `${Math.round(s * 100)}%`).join(" / ")} of offers (A / B)` : ""}</small><small className="src">{i.source}</small></th>
    <td>{num("fixed", i.fixed)}</td><td>{i.unit === "job" ? <span className="muted">–</span> : num("per_unit", i.per_unit)}</td><td>{num("vat", i.vat)}</td>
    <td>{i.custom ? <Button variant="plain" onClick={reset}>Remove</Button> : i.edited ? <Button variant="plain" onClick={reset} title={`Default: fixed €${i.default?.fixed}, per unit €${i.default?.per_unit}`}>Default</Button> : null}</td>
  </tr>;
}

function AddPart({ book, add }: { book: Book; add: (f: Partial<PriceItem>) => void }) {
  const blank = { name: "", tech: "solar", kind: "product", unit: "job", when: "always", fixed: "", per_unit: "" };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof blank, v: string) => setF((x) => ({ ...x, [k]: v }));
  const opts = (m: Record<string, string>) => Object.entries(m).map(([k, l]) => <option key={k} value={k}>{l}</option>);
  const when = useMemo(() => Object.fromEntries(Object.entries(book.when).filter(([k]) => ["always", "extra"].includes(k) || (f.tech === "solar" && ["pitched", "flat"].includes(k)) || (f.tech === "battery" && k === "backup") || (f.tech === "heatpump" && ["replace", "oil"].includes(k)))), [book, f.tech]);
  return <section>
    <h3>Add a part</h3>
    <p className="small muted">It joins every offer with its technology, or shows as an extra to tick. A negative price works for a discount or a local grant.</p>
    <form className="facts" onSubmit={(e) => { e.preventDefault(); if (!f.name.trim()) return; add({ name: f.name.trim(), tech: f.tech, kind: f.kind, unit: f.unit, when: f.when, fixed: Number(f.fixed || 0), per_unit: Number(f.per_unit || 0) }); setF(blank); }}>
      <Field label="Name"><Input value={f.name} placeholder="e.g. Bird protection" onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="Goes with"><Select value={f.tech} onChange={(e) => set("tech", e.target.value)}>{opts(book.techs)}</Select></Field>
      <Field label="Kind"><Select value={f.kind} onChange={(e) => set("kind", e.target.value)}>{opts(book.kinds)}</Select></Field>
      <Field label="Counted"><Select value={f.unit} onChange={(e) => set("unit", e.target.value)}>{opts(book.units)}</Select></Field>
      <Field label="In the offer"><Select value={f.when} onChange={(e) => set("when", e.target.value)}>{opts(when)}</Select></Field>
      <Field label="Fixed price, net (€)"><Input type="number" step="any" value={f.fixed} onChange={(e) => set("fixed", e.target.value)} /></Field>
      {f.unit !== "job" && <Field label={`Price ${book.units[f.unit]}, net (€)`}><Input type="number" step="any" value={f.per_unit} onChange={(e) => set("per_unit", e.target.value)} /></Field>}
      <div className="span money-actions"><Button type="submit" variant="solid" disabled={!f.name.trim()}>Add part</Button></div>
    </form>
  </section>;
}
