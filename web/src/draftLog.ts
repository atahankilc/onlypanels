// How each request's draft was made, step by step, with when each step finished: the desk shows it as a chain under the request,
// live while it runs. Times count from the moment the request reached the desk. Every step is real work the page waited for,
// not an animation: the roof measured, trees on its sun, the engine's sizes, the review's rules and the price.
import { useSyncExternalStore } from "react";

export type StepKey = "arrived" | "roof" | "trees" | "engine" | "review" | "costs";
/** The steps in the order they usually finish; a step that finishes earlier is still shown where it belongs. */
export const STEPS: { key: StepKey; label: string }[] = [
  { key: "arrived", label: "Arrived" },
  { key: "roof", label: "Modules fitted" },
  { key: "trees", label: "Tree shade" },
  { key: "engine", label: "Engine sized it" },
  { key: "review", label: "Rules checked" },
  { key: "costs", label: "Priced" },
];
export type Done = { at: number; detail: string }; // at: ms after arrival
type Log = { t0: number; done: Partial<Record<StepKey, Done>> };

const logs = new Map<string, Log>();
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((f) => f());

/** The request reached the desk now. Once per request: coming back to the list keeps the first arrival. */
export const arrived = (id: string, detail: string) => {
  if (logs.has(id)) return;
  logs.set(id, { t0: performance.now(), done: { arrived: { at: 0, detail } } });
  tell();
};
/** A step finished. Its time is kept from the first time; a later run (the engine again once trees are in) only updates the words. */
export const finished = (id: string, key: StepKey, detail: string) => {
  const log = logs.get(id);
  if (!log) return;
  const was = log.done[key];
  if (was?.detail === detail) return;
  logs.set(id, { ...log, done: { ...log.done, [key]: { at: was?.at ?? performance.now() - log.t0, detail } } });
  tell();
};

const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const useDraftLog = (id: string) => useSyncExternalStore(subscribe, () => logs.get(id));
