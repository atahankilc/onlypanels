// The desk's Cost tab and the price book. What the homeowner pays, the KfW grant, the year's money before and after,
// when it pays back and how. Every number is the API's (costs.py); the planner edits prices and ticks extras here.
import { useEffect, useMemo, useRef, useState } from "react";
import { Book, Costs, Money, PriceItem, addItem, eur, getBook, standing, resetItem, resetRates, setItem, setRates, years } from "./money";
import { Amount, Button, Check, Field, Fold, IconButton, Input, Modal, Select } from "./ui";
import { Back, Info, Plus } from "./icons";
import { RatesIcon, TECH_ICON } from "./techIcons";
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
    {/* Price, payback and the 20 years are in the desk's money row above every tab; here only what that row does not say. */}
    {(c.draft_2027 || c.irr_pct != null || c.payback_years == null) && <p className="money-lede">{[
      c.payback_years == null ? `Does not pay back within ${n} years` : c.draft_2027 && `Pays back in ${c.draft_2027.payback_years != null ? `${c.draft_2027.payback_years} years` : `more than ${n} years`} if switched on in 2027 (draft law)`,
      c.irr_pct != null && `${c.irr_pct}% a year return`].filter(Boolean).join(" · ")}</p>}
    {c.notes.map((x) => <div key={x.code} className={x.level === "warn" ? "money-note warn" : "money-note"}><p>{x.text}</p>{x.change && !sent && <Button onClick={() => use(x.change!, x.code === "money_battery" ? "Battery left out for the money" : "Battery size by money")}>Use</Button>}</div>)}

    <Fold open title="What it costs" summary={`${eur(c.gross_eur)} for ${c.lines.length} parts: ${groups.map((t) => `${TECH[t].toLowerCase()} ${eur(c.by_tech[t] ?? 0)}`).join(", ")}${c.grant ? `, less ${eur(c.grant.eur)} grant` : ""}`}>
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
    </Fold>

    {c.extras.length > 0 && <Fold title="Extras for this home" summary={(() => { const on = c.extras.filter((x) => x.on); return on.length ? `${on.length} of ${c.extras.length} ticked, ${eur(on.reduce((a, x) => a + x.net, 0))} net` : `None of ${c.extras.length} ticked`; })()}>
      <p className="small muted">Site work added when the home needs it. Ticked by default when we add it to at least half of our offers.</p>
      <ul className="tasks">{c.extras.map((x) => <li key={x.id}><Check checked={x.on} onChange={(v) => setMoney({ ...money, extras: { ...(money.extras ?? {}), [x.id]: v } })}>
        <b>{x.name} · {eur(x.net)}</b><small>{TECH[x.tech]}{x.share != null ? ` · in ${Math.round(x.share * 100)}% of past offers` : ""}{x.unit !== "job" ? ` · ${qtyText(x)}` : ""}</small></Check></li>)}</ul></Fold>}

    <h3>The first year, before and after</h3>
    <p className="small muted">Electricity at {c.price_ct_kwh} ct per kWh, feed-in at {y.feed_full_ct} ct but none in negative-price hours ({y.unpaid_pct}% of the year's output in 2025){c.fuel ? `, ${fuelName.toLowerCase()} at ${c.fuel.ct} ct` : ""}.</p>
    <table className="grid money-bill"><thead><tr><th /><th>Today</th><th>With the system</th></tr></thead><tbody>
      <tr><th scope="row">Electricity from the grid<small>{b.before.grid_kwh.toLocaleString("en")} → {b.after.grid_kwh.toLocaleString("en")} kWh</small></th><td>{eur(b.before.grid_eur)}</td><td>{eur(b.after.grid_eur)}</td></tr>
      <tr><th scope="row">Sold to the grid</th><td>{b.before.feed_eur ? `−${eur(b.before.feed_eur)}` : "–"}</td><td>−{eur(b.after.feed_eur)}</td></tr>
      {(b.before.fuel_eur > 0 || b.after.fuel_eur > 0) && <tr><th scope="row">{fuelName}<small>{c.fuel?.kwh.toLocaleString("en")} kWh a year</small></th><td>{eur(b.before.fuel_eur)}</td><td>{eur(b.after.fuel_eur)}</td></tr>}
      <tr><th scope="row">Upkeep<small>{[b.before.upkeep_eur && "boiler service, chimney sweep", "solar insurance and checks", c.lines.some((l) => l.tech === "heatpump") && "heat pump service"].filter(Boolean).join("; ")}</small></th><td>{b.before.upkeep_eur ? eur(b.before.upkeep_eur) : "–"}</td><td>{eur(b.after.upkeep_eur)}</td></tr>
      {b.after.meter_eur > 0 && <tr><th scope="row">Smart meter and control box<small>required above 7 kWp</small></th><td>–</td><td>{eur(b.after.meter_eur)}</td></tr>}
      {b.after.rebate_eur > 0 && <tr><th scope="row">Grid fee rebate<small>§14a, heat pump or wallbox controllable</small></th><td>–</td><td>−{eur(b.after.rebate_eur)}</td></tr>}
      <tr className="total"><th scope="row">A year</th><td>{eur(b.before.total_eur)}</td><td>{eur(b.after.total_eur)}</td></tr>
    </tbody></table>
    <p className="money-sum"><b>{signed(y.total_eur)}</b> in the first year{c.battery_eur ? `, of which the battery ${eur(c.battery_eur)}` : ""}; later years follow prices, which rise, and the panels, which age.</p>
    {c.solar_ct_kwh != null && <p className="small muted">Each kWh from the panels costs about {c.solar_ct_kwh} ct over {n} years, against {c.price_ct_kwh} ct from the grid.</p>}

    <Rules rules={c.rules} />

    {c.grant && <><h3>Heat pump grant</h3>
      <ul className="small muted money-grant">{c.grant.notes.map((x) => <li key={x}>{x}</li>)}</ul>
      <div className="facts"><Field label="Taxable household income"><Select value={money.income ?? ""} onChange={(e) => setMoney({ ...money, income: e.target.value || null })}>{INCOME.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <div className="fact"><span>&nbsp;</span><Check checked={!!money.kids} onChange={(v) => setMoney({ ...money, kids: v })}>Child under 18 at home</Check></div></div></>}

    {c.battery_options.length > 0 && <Fold title="Battery sizes in money" summary={(() => { const best = [...c.battery_options].sort((a, b) => b.gain_eur - a.gain_eur)[0]; return `${c.battery_options.length} sizes; by money alone ${best.kwh} kWh gains most, ${standing(best.gain_eur)}`; })()}>
      <p className="small muted">What each size from the catalog costs and adds a year over no battery, over its 15-year life. Click to use it.</p>
      <table className="grid money-batt"><thead><tr><th>Size</th><th>Costs</th><th>Adds a year</th><th>Pays back</th><th>Gain</th></tr></thead><tbody>
        {c.battery_options.map((o) => <tr key={o.kwh} className={o.kwh === c.design.battery_kwh ? "on" : ""} onClick={() => !sent && use({ battery_kwh: o.kwh }, `Battery set to ${o.kwh} kWh`)}>
          <th scope="row">{o.kwh} kWh</th><td>{eur(o.cost_eur)}</td><td>{eur(o.year1_eur)}</td><td>{o.payback_years != null ? `${o.payback_years} y` : "no"}</td><td>{eur(o.gain_eur)}</td></tr>)}
      </tbody></table></Fold>}

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
  const draft = shown.filter((r) => r.status === "draft").length;
  return <Fold title="Rules and grants for this home" summary={`${shown.length} apply${draft ? `, ${draft} of them draft law` : ""}; their money is already in the numbers`}>
    <p className="small muted">What German law, KfW and Munich mean for this system as of November 2026. Click one for what to do.</p>
    <ul className="rules">{shown.map((r) => <li key={r.id} className={r.status}>
      <button type="button" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
        <em>{STATUS[r.status]}</em><b>{r.title}</b>{r.effect && <span>{r.effect}</span>}
      </button>
      {open === r.id && <div><p>{r.text}</p>{r.action && <p><b>To do:</b> {r.action}</p>}<small>{r.source}</small></div>}
    </li>)}</ul></Fold>;
}

/** The price book: every part an offer can hold, by technology, with its default, its source and the planner's own price. */
export function PriceBook({ installer, close }: { installer?: string; close?: () => void }) {
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState("");
  const [find, setFind] = useState("");
  const [adding, setAdding] = useState(false);
  const [at, setAt] = useState("solar");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { getBook(installer).then(setBook).catch(() => setError("The price book could not be loaded. Is the API running the latest version?")); }, [installer]);
  const run = (p: Promise<Book>) => p.then((b) => { setBook(b); setError(""); }).catch((e: Error) => setError(e.message));
  // The group in view is the one lit on the left.
  useEffect(() => {
    if (!book || !root.current) return;
    const io = new IntersectionObserver((es) => { const e = es.filter((x) => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (e) setAt(e.target.id.slice(3)); }, { rootMargin: "-90px 0px -60% 0px" });
    root.current.querySelectorAll(".pb-sec").forEach((x) => io.observe(x));
    return () => io.disconnect();
  }, [book, find]);
  if (!book) return <p className={error ? "flag" : "muted"}>{error || "Loading prices…"}</p>;
  const q = find.trim().toLowerCase();
  const items = book.items.filter((i) => !q || `${i.name} ${book.techs[i.tech]} ${book.kinds[i.kind]}`.toLowerCase().includes(q));
  const rates = Object.entries(book.rates).filter(([, r]) => !q || r.label.toLowerCase().includes(q));
  const yours = book.items.filter((i) => i.edited || i.custom).length + Object.values(book.rates).filter((r) => r.value !== r.default).length;
  const sections = [...Object.keys(book.techs), "rates"];
  const jump = (id: string) => { setAt(id); root.current?.querySelector(`#pb-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  return <div className="pb-wrap"><div className={`pb${close ? " in-desk" : ""}`} ref={root}>
    <nav className="pb-nav" aria-label="Price groups">
      {close && <Button onClick={close}><Back /> Back to the cost</Button>}
      <Input type="search" placeholder="Find a part or price" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Find a part or price" />
      <ul>{sections.map((t) => {
        const Icon = TECH_ICON[t], n = t === "rates" ? rates.length : items.filter((i) => i.tech === t).length;
        const mine = t === "rates" ? Object.values(book.rates).some((r) => r.value !== r.default) : book.items.some((i) => i.tech === t && (i.edited || i.custom));
        return <li key={t}><button type="button" className={at === t ? "on" : undefined} onClick={() => jump(t)} disabled={!n}>
          <span className={`pb-ico t-${t}`}><Icon size={16} /></span><span>{t === "rates" ? "Running prices" : book.techs[t]}</span>{mine && <i className="pb-mine" title="Has your prices" />}<em>{n}</em></button></li>;
      })}</ul>
      <div className="pb-legend small">
        <p><b>Net</b> to the customer, autumn 2026.</p>
        <p><b>0% VAT</b> solar and battery up to 30 kWp (UStG §12(3)). <b>19%</b> wallbox and heat pump.</p>
        <p>{yours ? <><b className="yours">{yours} {yours === 1 ? "price is" : "prices are"} yours.</b> Every offer uses them at once.</> : "Change a price and every offer uses it at once."}</p>
      </div>
      <Button variant="solid" onClick={() => setAdding(true)}><Plus /> Add a part</Button>
    </nav>
    <AddPart book={book} open={adding} close={() => setAdding(false)} add={(f) => { run(addItem(f)).then(() => jump(String(f.tech))); setAdding(false); }} />
    <div className="pb-main">
      {error && <p className="flag">{error}</p>}
      {Object.entries(book.techs).map(([t, label]) => {
        const mine = items.filter((i) => i.tech === t);
        if (!mine.length) return null;
        const base = mine.filter((i) => i.when !== "extra"), extra = mine.filter((i) => i.when === "extra");
        const Icon = TECH_ICON[t];
        return <section key={t} id={`pb-${t}`} className="pb-sec">
          <header><span className={`pb-ico t-${t}`}><Icon /></span><h2>{label}</h2><small>{base.length} in every offer{extra.length ? ` · ${extra.length} extras` : ""}</small></header>
          {base.length > 0 && <ul className="pb-list">{base.map((i) => <PartRow key={i.id} i={i} book={book} save={(f) => run(setItem(i.id, f))} reset={() => run(resetItem(i.id))} />)}</ul>}
          {extra.length > 0 && <><h3 className="pb-sub">Extras, ticked per home<small>Only in the offers of homes that need them</small></h3>
            <ul className="pb-list">{extra.map((i) => <PartRow key={i.id} i={i} book={book} save={(f) => run(setItem(i.id, f))} reset={() => run(resetItem(i.id))} />)}</ul></>}
        </section>;
      })}
      {rates.length > 0 && <section id="pb-rates" className="pb-sec">
        <header><span className="pb-ico t-rates"><RatesIcon /></span><h2>Running prices</h2><small>What the years after the sale cost and pay</small></header>
        <div className="pb-rates">{RATE_GROUPS.map(([title, keys]) => {
          const here = rates.filter(([k]) => keys.includes(k));
          return here.length ? <div key={title} className="pb-card"><h3>{title}</h3>{here.map(([k, r]) => <RateRow key={k} k={k} r={r} save={(v) => run(setRates({ [k]: v }))} />)}</div> : null;
        })}{(() => { const rest = rates.filter(([k]) => !RATE_GROUPS.some(([, keys]) => keys.includes(k))); return rest.length ? <div className="pb-card"><h3>Other</h3>{rest.map(([k, r]) => <RateRow key={k} k={k} r={r} save={(v) => run(setRates({ [k]: v }))} />)}</div> : null; })()}</div>
        {Object.values(book.rates).some((r) => r.value !== r.default) && <div className="money-actions"><Button variant="plain" onClick={() => run(resetRates())}>Running prices back to defaults</Button></div>}
      </section>}
      {!items.length && !rates.length && <p className="muted">Nothing matches “{find}”.</p>}
    </div>
  </div></div>;
}

const RATE_GROUPS: [string, string[]][] = [
  ["Energy prices", ["feed_in_ct", "feed_in_above_ct", "draft_feed_ct", "gas_ct", "oil_ct"]],
  ["Over the years", ["electricity_rise_pct", "fuel_rise_pct", "degradation_pct", "inverter_life", "years"]],
  ["Every year", ["pv_upkeep_eur", "hp_upkeep_eur", "boiler_upkeep_eur", "smart_meter_eur", "grid_rebate_eur"]],
  ["Grid rules", ["neg_price_share_pct"]],
];
const UNIT_TAIL: Record<string, string> = { job: "", module: "/ module", kwp: "/ kWp", kwh: "/ kWh", kw_inverter: "/ kW", kw_heatpump: "/ kW", metre: "/ m", piece: "/ piece" };
const WHEN_CHIP: Record<string, string> = { pitched: "Pitched roof only", flat: "Flat roof only", backup: "With backup power", replace: "Replaces old heating", oil: "Old oil heating" };

/** One part: name, what kind and when it is in, its price in place, and on demand where the price came from. */
function PartRow({ i, book, save, reset }: { i: PriceItem; book: Book; save: (f: Partial<PriceItem>) => void; reset: () => void }) {
  const [open, setOpen] = useState(false);
  const mine = i.edited || i.custom;
  const amount = (k: "fixed" | "per_unit" | "vat", v: number, prefix: string, suffix: string, label: string) => <Amount prefix={prefix} suffix={suffix} aria-label={`${i.name}: ${label}`} defaultValue={v} key={`${i.id}${k}${v}`}
    onBlur={(e) => { const x = Number(e.target.value); if (e.target.value !== "" && x !== v) save({ [k]: x }); }} />;
  const perUnit = i.unit !== "job", showFixed = !perUnit || i.fixed !== 0;
  return <li className={`pb-row${mine ? " mine" : ""}${open ? " open" : ""}`}>
    <div className="pb-name">
      <b>{i.name}</b>
      <span className="pb-chips"><em>{book.kinds[i.kind] ?? i.kind}</em>{WHEN_CHIP[i.when] && <em className="cond">{WHEN_CHIP[i.when]}</em>}{i.vat > 0 && <em>{i.vat}% VAT</em>}{mine && <em className="yours">{i.custom ? "Your part" : "Your price"}</em>}</span>
    </div>
    <div className="pb-price">
      {showFixed && amount("fixed", i.fixed, "€", perUnit ? "fixed" : "", "fixed price")}
      {showFixed && perUnit && <span className="plus">+</span>}
      {perUnit && amount("per_unit", i.per_unit, "€", UNIT_TAIL[i.unit] ?? "", "price per unit")}
    </div>
    <IconButton variant="plain" label={open ? "Hide details" : "Source and VAT"} aria-expanded={open} onClick={() => setOpen(!open)}><Info /></IconButton>
    {open && <div className="pb-more">
      <p><b>Source</b> {i.source}</p>
      <div className="pb-more-edit">
        {!showFixed && <label>Fixed {amount("fixed", i.fixed, "€", "", "fixed price")}</label>}
        <label>VAT {amount("vat", i.vat, "", "%", "VAT")}</label>
        {i.edited && i.default && <span className="small muted">Default: €{i.default.fixed.toLocaleString("en")}{perUnit ? ` + €${i.default.per_unit.toLocaleString("en")} ${UNIT_TAIL[i.unit]}` : ""}</span>}
        {i.custom ? <Button variant="plain" onClick={reset}>Remove part</Button> : i.edited ? <Button variant="plain" onClick={reset}>Back to default</Button> : null}
      </div>
    </div>}
  </li>;
}

/** A running price: its label without the unit, which moves into the field, and the default when it was changed. */
function RateRow({ k, r, save }: { k: string; r: Book["rates"][string]; save: (v: number) => void }) {
  const m = r.label.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const label = m ? m[1] : r.label, unit = m ? m[2] : "";
  const [prefix, suffix] = unit.startsWith("€/") ? ["€", unit.slice(1)] : unit === "years" ? ["", "years"] : ["", unit];
  const changed = r.value !== r.default;
  return <div className={`pb-rate${changed ? " mine" : ""}`}>
    <div><b>{label}</b><small>{r.source}</small>{changed && <small className="yours">Default {r.default}{suffix && suffix !== "%" ? ` ${suffix}` : suffix}</small>}</div>
    <Amount prefix={prefix} suffix={suffix} aria-label={r.label} defaultValue={r.value} key={`${k}${r.value}`} onBlur={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && v !== r.value) save(v); }} />
  </div>;
}

function AddPart({ book, open, close, add }: { book: Book; open: boolean; close: () => void; add: (f: Partial<PriceItem>) => void }) {
  const blank = { name: "", tech: "solar", kind: "product", unit: "job", when: "always", fixed: "", per_unit: "" };
  const [f, setF] = useState(blank);
  useEffect(() => { if (open) setF(blank); }, [open]);
  const set = (k: keyof typeof blank, v: string) => setF((x) => ({ ...x, [k]: v }));
  const opts = (m: Record<string, string>) => Object.entries(m).map(([k, l]) => <option key={k} value={k}>{l}</option>);
  const when = useMemo(() => Object.fromEntries(Object.entries(book.when).filter(([k]) => ["always", "extra"].includes(k) || (f.tech === "solar" && ["pitched", "flat"].includes(k)) || (f.tech === "battery" && k === "backup") || (f.tech === "heatpump" && ["replace", "oil"].includes(k)))), [book, f.tech]);
  return <Modal open={open} title="Add a part" onClose={close}
    actions={<><Button variant="plain" onClick={close}>Cancel</Button><Button type="submit" form="add-part" variant="solid" disabled={!f.name.trim()}>Add part</Button></>}>
    <p className="small muted pb-add-note">It joins every offer with its technology, or shows as an extra to tick. A negative price works for a discount or a local grant.</p>
    <form id="add-part" className="facts" onSubmit={(e) => { e.preventDefault(); if (!f.name.trim()) return; add({ name: f.name.trim(), tech: f.tech, kind: f.kind, unit: f.unit, when: f.when, fixed: Number(f.fixed || 0), per_unit: Number(f.per_unit || 0) }); }}>
      <div className="span"><Field label="Name"><Input value={f.name} placeholder="e.g. Bird protection" onChange={(e) => set("name", e.target.value)} autoFocus /></Field></div>
      <Field label="Goes with"><Select value={f.tech} onChange={(e) => set("tech", e.target.value)}>{opts(book.techs)}</Select></Field>
      <Field label="Kind"><Select value={f.kind} onChange={(e) => set("kind", e.target.value)}>{opts(book.kinds)}</Select></Field>
      <Field label="In the offer"><Select value={f.when} onChange={(e) => set("when", e.target.value)}>{opts(when)}</Select></Field>
      <Field label="Counted"><Select value={f.unit} onChange={(e) => set("unit", e.target.value)}>{opts(book.units)}</Select></Field>
      <Field label="Fixed price, net (€)"><Input type="number" step="any" value={f.fixed} onChange={(e) => set("fixed", e.target.value)} /></Field>
      {f.unit !== "job" && <Field label={`Price ${book.units[f.unit]}, net (€)`}><Input type="number" step="any" value={f.per_unit} onChange={(e) => set("per_unit", e.target.value)} /></Field>}
    </form>
  </Modal>;
}
