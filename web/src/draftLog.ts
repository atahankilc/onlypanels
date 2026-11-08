// How each request's draft was made, step by step, and what each step found. Live while it runs. When each step finished is
// kept only to show the steps in the order they happened. Every step is real work the page waited for, not an animation.
import { useSyncExternalStore } from "react";

export type StepKey = "home" | "trees" | "roof" | "engine" | "review" | "costs";
/** In plain words: what each step does. */
export const STEPS: { key: StepKey; label: string; what: string }[] = [
  { key: "home", label: "Home loaded", what: "the 3D roof and walls, and a year of sun on every roof side" },
  { key: "trees", label: "Trees checked", what: "how much sun the trees nearby take from the roof" },
  { key: "roof", label: "Roof space", what: "how many panels fit on the measured roof" },
  { key: "engine", label: "System sized", what: "panels, battery, wallbox and heat pump, chosen as experts did for similar homes, and a year's energy" },
  { key: "review", label: "Rules checked", what: "what to ask the customer and what the offer must say" },
  { key: "costs", label: "Priced", what: "the price from the price book, and when it pays back" },
];
export type Done = { start: number; end: number; short: string; detail: string }; // ms after arrival; short: a few words of what it found
type Log = { t0: number; starts: Partial<Record<StepKey, number>>; done: Partial<Record<StepKey, Done>> };

const logs = new Map<string, Log>();
const homes = new Map<string, number>(); // how long loading the home took, kept until its request reaches the desk
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((f) => f());

/** Loading the home took this long, before the request was sent. Only the demo measures it; a homeowner's page loads the home
 *  while they pick it. */
export const homeLoaded = (id: string, ms: number) => { homes.set(id, ms); };
/** The request reached the desk now. Once per request: coming back to the list keeps the first arrival. */
export const arrived = (id: string, homeShort: string) => {
  if (logs.has(id)) return;
  const ms = homes.get(id);
  // The home step is always there, so every request's chain has the same columns: loaded before arrival when measured (the
  // demo), else already in hand from the homeowner's page or their answers.
  logs.set(id, { t0: performance.now(), starts: {}, done: { home: { start: -(ms ?? 0), end: 0, short: homeShort, detail: homeShort } } });
  tell();
};
/** A step began. Steps not marked begin at arrival. */
export const started = (id: string, key: StepKey) => {
  const log = logs.get(id);
  if (!log || log.starts[key] != null || log.done[key]) return;
  log.starts[key] = performance.now() - log.t0;
};
/** A step finished. Its time is kept from the first time; a later run (the engine again once trees are in) only updates the words. */
export const finished = (id: string, key: StepKey, short: string, detail = short) => {
  const log = logs.get(id);
  if (!log) return;
  const was = log.done[key];
  if (was?.short === short && was.detail === detail) return;
  const end = was?.end ?? performance.now() - log.t0;
  logs.set(id, { ...log, done: { ...log.done, [key]: { start: was?.start ?? Math.min(log.starts[key] ?? 0, end), end, short, detail } } });
  tell();
};

const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export type DraftLog = Log;
export const useDraftLog = (id: string) => useSyncExternalStore(subscribe, () => logs.get(id));
