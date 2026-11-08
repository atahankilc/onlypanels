// A homeowner's question about a variant of their offer, on its way to the planner. One small store both sides read:
// the demo runs homeowner and planner in one page, so this stands in for a message between them.
import { useEffect, useState } from "react";

/** What the homeowner tried and how it compared, as the engine computed it, and an optional line of their own. */
export type Change = { battery_kwh?: number; wallbox?: boolean; modules?: number };
export type Ask = { id: number; ref: string; at: number; change: Change; own: number; saving: number; offerOwn: number; offerSaving: number; note: string; answered: boolean };

let asks: Ask[] = [], next = 1;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

export function ask(a: Omit<Ask, "id" | "at" | "answered">) { asks = [...asks, { ...a, id: next++, at: Date.now(), answered: false }]; changed(); }
export function answer(ref: string, id?: number) { asks = asks.map((x) => (x.ref === ref && (id === undefined || x.id === id) ? { ...x, answered: true } : x)); changed(); }

/** The asks, kept in step with the store. */
export function useAsks(ref?: string) {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  return ref ? asks.filter((x) => x.ref === ref) : asks;
}

/** The change in plain words: "no battery", "a 14 kWh battery", "no wallbox", "18 modules". */
export const describeChange = (c: Change) => [
  c.battery_kwh !== undefined && (c.battery_kwh ? `a ${c.battery_kwh} kWh battery` : "no battery"),
  c.wallbox !== undefined && (c.wallbox ? "a wallbox" : "no wallbox"),
  c.modules !== undefined && `${c.modules} modules`,
].filter(Boolean).join(" and ");
