// What the planner's voice sees and does. The desk publishes what is on screen; a spoken turn returns actions, which
// the screen that owns them carries out as clicks (Planner for the list, Workspace for an open request).
import { useEffect, useRef } from "react";
import type { Inputs, Overrides } from "./plan";

export type VoiceAction =
  | { type: "open"; id: string }
  | { type: "back" }
  | { type: "page"; page: "requests" | "prices" | "proof" }
  | { type: "tab"; tab: "home" | "design" | "cost" | "checks" | "offer" }
  | { type: "set"; overrides: Overrides }
  | { type: "confirm"; keys: string[] }
  | { type: "check"; ids: string[]; done: boolean }
  | { type: "fact"; inputs: Partial<Inputs> }
  | { type: "send" }
  // the homeowner's helper (guide.py)
  | { type: "start"; way: "map" | "form" }
  | { type: "goto"; page: string }
  | { type: "new" }
  | { type: "answers"; answers: Record<string, unknown> };

export type DeskContext = {
  page: "requests" | "prices" | "proof" | "request";
  requests: { id: string; ref?: string; title: string; status: string }[]; // what to confirm shows only for the open request, worked out from its design
  open: null | {
    id: string; ref?: string; title: string; tab: string; status: string;
    to_confirm: { key: string; label: string; value: string }[]; checks: { id: string; title: string; done: boolean }[];
    money: unknown; // the Cost tab's options for this request (extras, income), so money answers match the tab
    inputs: Inputs; overrides: Overrides; // exactly what /api/design gets for this request
  };
};

let context: DeskContext = { page: "requests", requests: [], open: null };
export const voiceContext = () => context;
export const setDeskContext = (c: Omit<DeskContext, "open">) => { context = { ...context, ...c }; };
export const setOpenContext = (open: DeskContext["open"]) => { context = { ...context, open, page: open ? "request" : context.page === "request" ? "requests" : context.page }; };

/** What the homeowner's helper sees: where they are and their answers. Never the home, the address or the meter photo. */
export type GuideContext = { screen: "start" | "pick" | "questions" | "requests" | "sent"; page: string | null; pages: string[]; answers: Record<string, unknown> };
let guide: GuideContext = { screen: "start", page: null, pages: [], answers: {} };
export const guideContext = () => guide;
export const setGuideContext = (g: GuideContext) => { guide = g; };

const bus = new EventTarget();
/** Several design changes or confirmations in one turn become one each: the screen updates from one request state per
 * render, so two in a row would each start from the same old state and the second would undo the first. */
const merged = (actions: VoiceAction[]) => actions.reduce<VoiceAction[]>((out, a) => {
  const last = out.find((x) => x.type === a.type);
  if (a.type === "set" && last?.type === "set") { last.overrides = { ...last.overrides, ...a.overrides }; return out; }
  if (a.type === "confirm" && last?.type === "confirm") { last.keys = [...new Set([...last.keys, ...a.keys])]; return out; }
  if (a.type === "fact" && last?.type === "fact") { last.inputs = { ...last.inputs, ...a.inputs }; return out; }
  if (a.type === "answers" && last?.type === "answers") { last.answers = { ...last.answers, ...a.answers }; return out; }
  return [...out, { ...a }];
}, []);
export const runActions = (actions: VoiceAction[]) => merged(actions).forEach((a) => bus.dispatchEvent(new CustomEvent("act", { detail: a })));

/** Carries out the actions this screen owns. The handler may change every render; the subscription does not. */
export function useVoiceActions(handle: (a: VoiceAction) => void) {
  const ref = useRef(handle);
  ref.current = handle;
  useEffect(() => {
    const on = (e: Event) => ref.current((e as CustomEvent<VoiceAction>).detail);
    bus.addEventListener("act", on);
    return () => bus.removeEventListener("act", on);
  }, []);
}
