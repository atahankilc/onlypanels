// Money: the planner's price book and what a design costs and pays back. Every number comes from the API (costs.py,
// pricebook.py): prices from the book, kWh from the engine's hourly estimate. The page only shows them.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Design, Request, Spot, designBody } from "./plan";
import { askKey, keepAnswer, lastAnswer } from "./answers";

export type Money = { extras?: Record<string, boolean>; qty?: Record<string, number>; income?: string | null; kids?: boolean };
export type Line = { id: string; tech: string; kind: string; name: string; qty: number; unit: string; fixed: number; per_unit: number; vat: number; net: number; gross: number; custom: boolean; edited: boolean; extra: boolean };
export type Extra = { id: string; tech: string; name: string; on: boolean; share: number | null; qty: number; unit: string; net: number };
export type Grant = { rate_pct: number; eligible_eur: number; eur: number; notes: string[]; path: "beg" | "fkg"; beg_eur: number; fkg_eur: number; other_eur: number };
export type Side = { grid_kwh: number; grid_eur: number; feed_eur: number; fuel_eur: number; upkeep_eur: number; meter_eur: number; rebate_eur: number; total_eur: number };
export type Rule = { id: string; title: string; status: "law" | "draft" | "city"; applies: boolean; effect: string | null; text: string; action: string | null; source: string };
export type BatteryMoney = { kwh: number; cost_eur: number; year1_eur: number; payback_years: number | null; gain_eur: number };
export type Variant = { id: string; title: string; overrides: Record<string, unknown>; gross_eur: number; pays_eur: number; payback_years: number | null; gain_eur: number; irr_pct: number | null; year1_eur: number };
export type MoneyNote = { code: string; level: "warn" | "note"; on: string; text: string; change?: Record<string, unknown> };
export type Costs = {
  lines: Line[]; extras: Extra[]; inverter_kw: number; net_eur: number; vat_eur: number; gross_eur: number; by_tech: Record<string, number>;
  grant: Grant | null; pays_eur: number; battery_eur: number;
  year1: { own_eur: number; feed_eur: number; fuel_eur: number; extra_power_eur: number; upkeep_eur: number; meter_eur: number; rebate_eur: number; total_eur: number; feed_ct: number; feed_full_ct: number; unpaid_pct: number };
  neg_loss_eur: number; curtailed_kwh: number; draft_2027: { payback_years: number | null; gain_eur: number; feed_eur: number; curtailed_kwh: number } | null; rules: Rule[];
  fuel: { kwh: number; ct: number; eur: number; kind: string } | null; bills: { before: Side; after: Side };
  solar_ct_kwh: number | null; price_ct_kwh: number;
  rows: { year: number; eur: number; total: number }[]; payback_years: number | null; gain_eur: number; irr_pct: number | null;
  assumptions: { electricity_rise_pct: number; fuel_rise_pct: number; degradation_pct: number; inverter_life: number; years: number };
  battery_options: BatteryMoney[]; heatpump_money: { cost_eur: number; year1_eur: number; payback_years: number | null; gain_eur: number | null; fuel: string } | null;
  variants: Variant[]; notes: MoneyNote[]; design: { kwp: number; modules: number; battery_kwh: number };
};
export type PriceItem = { id: string; tech: string; kind: string; name: string; unit: string; fixed: number; per_unit: number; vat: number; when: string; source: string;
  qty?: number | null; custom: boolean; edited?: boolean; default?: { fixed: number; per_unit: number }; share?: Record<string, number>; on_by_default?: boolean };
export type Rate = { value: number; default: number; label: string; source: string };
export type Book = { items: PriceItem[]; rates: Record<string, Rate>; units: Record<string, string>; techs: Record<string, string>; kinds: Record<string, string>; when: Record<string, string> };

export const moneyOf = (r: Request): Money => (r as Request & { money?: Money }).money ?? {};
export const eur = (v: number) => `${v < 0 ? "−" : ""}€${Math.abs(Math.round(v)).toLocaleString("en")}`;
/** Money after the years looked at, in words: never a negative "ahead". */
export const standing = (v: number) => `${eur(Math.abs(v))} ${v >= 0 ? "ahead" : "behind"}`;
export const years = (v: number | null) => (v == null ? "not within the years looked at" : `${v.toLocaleString("en", { maximumFractionDigits: 1 })} years`);

// A price change anywhere makes every open money view ask again.
let version = 0;
const listeners = new Set<() => void>();
export const pricesChanged = () => { version += 1; listeners.forEach((f) => f()); };
/** Changes whenever a price or running price changes: views that depend on prices ask again. */
export const usePriceVersion = () => useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => version);

// The open request's money, for the parts of the desk that show it beside the design (variants, battery sizes).
let current: Costs | null = null;
const currentListeners = new Set<() => void>();
const setCurrent = (c: Costs | null) => { current = c; currentListeners.forEach((f) => f()); };
/** The open request's money, only while it belongs to this design. */
export const useCurrentCosts = (d?: Design | null) => {
  const c = useSyncExternalStore((f) => { currentListeners.add(f); return () => currentListeners.delete(f); }, () => current);
  return c && d && c.design.modules === d.pv.modules && c.design.battery_kwh === d.battery.kwh ? c : null;
};

const call = <T,>(url: string, method: string, body?: unknown): Promise<T> =>
  fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => {
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.detail ?? "Request failed");
    return r.json();
  });

export const getBook = (installer?: string) => call<Book>(`/api/prices${installer ? `?installer=${installer}` : ""}`, "GET");
export const setItem = (id: string, fields: Partial<PriceItem>) => call<Book>(`/api/prices/${encodeURIComponent(id)}`, "PUT", fields).then((b) => { pricesChanged(); return b; });
export const addItem = (fields: Partial<PriceItem>) => call<Book>("/api/prices", "POST", fields).then((b) => { pricesChanged(); return b; });
export const resetItem = (id: string) => call<Book>(`/api/prices/${encodeURIComponent(id)}`, "DELETE").then((b) => { pricesChanged(); return b; });
export const setRates = (values: Record<string, number>) => call<Book>("/api/prices/rates", "PUT", values).then((b) => { pricesChanged(); return b; });
export const resetRates = () => call<Book>("/api/prices/rates", "DELETE").then((b) => { pricesChanged(); return b; });

/** The money view of the open request, asked again when the design's facts, the planner's ticks or a price change. */
export function useCosts(r: Request, roof: Spot[]) {
  const [out, setOut] = useState<Costs | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0); // a failed call is asked again after a few seconds
  const failedOnce = useRef(false);
  failedOnce.current = failed;
  const v = usePriceVersion();
  const money = moneyOf(r);
  useEffect(() => {
    if (!roof.length && r.buildings.length) return;
    let live = true;
    const { body } = designBody(r.inputs, r.overrides, roof, r.off, r.existing, r.strict);
    const ask = { ...body, money: { extras: money.extras ?? {}, qty: money.qty ?? {}, income: money.income ?? null, kids: !!money.kids } };
    // The last price of the same request shows at once (answers.ts); it is asked again behind it, so a price change arrives.
    const key = askKey("costs", ask), known = lastAnswer<Costs>(key);
    if (known && !out) { setOut(known); setCurrent(known); }
    const t = setTimeout(() => {
      call<Costs>("/api/costs", "POST", ask)
        .then((c) => { keepAnswer(key, c); if (live) { setOut(c); setFailed(false); setCurrent(c); } })
        .catch(() => { if (live) { setFailed(true); setRetry((n) => n + 1); } });
    }, failedOnce.current ? 3000 : 250);
    return () => { live = false; clearTimeout(t); };
  }, [r.inputs, r.overrides, r.off, roof, r.existing, r.strict, JSON.stringify(money), v, retry]);
  useEffect(() => () => setCurrent(null), []);
  return { costs: out, failed };
}
