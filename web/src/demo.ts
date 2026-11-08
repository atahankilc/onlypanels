// Three homeowner requests on real Munich buildings, as if sent through the homeowner flow, so both sides open with real work.
// Each is a different case: answers known exactly, as a range or hardly at all. All arrive just sent, before any planner opened them.
import { Answers, Choice, NO_ANSWERS, NO_CHOICE, Selected, SunSurface, areaAt, surfaceKey } from "./api";
import { Handoff, design, fromHomeowner, loadHome, offerOf, roofOf } from "./plan";

type Marks = { cells?: number[]; panels?: number[] };
type Seed = {
  ref: string; hoursAgo: number; homes: [string, string][]; answers: Partial<Answers>; state: "sent" | "opened" | "offer";
  marks: (b: Selected, s: SunSurface) => Marks | null; // what the homeowner drew on each surface
};

const all = (s: SunSurface) => s.year.map((_, n) => n);
const grid = (s: SunSurface) => s.year.map((_, n) => ({ n, i: s.cells[n * 2], j: s.cells[n * 2 + 1] }));
/** Every cell but a small square in the middle: a skylight or chimney the homeowner drew around. */
const withHole = (s: SunSurface, r = 1) => {
  const g = grid(s), ci = Math.round(g.reduce((t, c) => t + c.i, 0) / g.length), cj = Math.round(g.reduce((t, c) => t + c.j, 0) / g.length);
  return g.filter((c) => Math.abs(c.i - ci) > r || Math.abs(c.j - cj) > r).map((c) => c.n);
};
/** The cells along one side of a surface, a share of its width: a roof terrace, or the half that carries old panels. */
const side = (s: SunSurface, share: number, keep: "near" | "far") => {
  const g = grid(s), lo = Math.min(...g.map((c) => c.i)), hi = Math.max(...g.map((c) => c.i)), cut = lo + (hi - lo) * share;
  return g.filter((c) => (keep === "near" ? c.i <= cut : c.i > cut)).map((c) => c.n);
};
const facing = (s: SunSurface, from: number, to: number) => s.azimuth >= from && s.azimuth < to;
const south = (s: SunSurface) => facing(s, 135, 225), north = (s: SunSurface) => s.azimuth >= 315 || s.azimuth < 45;

// Three requests in square 694_5340 in Munich, all just sent by their homeowners: nobody has opened them. Sondermeierstraße 86 is one
// complex of five touching or near parts (two long hip-roofed blocks, a flat-roofed wing, the corridor between the blocks and a small
// annex), sent together as one request, as a homeowner picks a house with its garage.
const SEEDS: Seed[] = [
  {
    // A family on gas who want a heat pump and already drive electric. They know their bill and their car's charging from its app.
    // North roof out. Independence first.
    ref: "R-7MQ2A", hoursAgo: 5, state: "sent", homes: [["694_5340", "DEBY_LOD2_107805333"]], // Sondermeierstraße 74
    answers: {
      use_source: "exact", demand_kwh: 5200, price_ct_kwh: 34, price_known: true, has_solar: false, has_storage: false,
      built: "1991to2000", living_m2: 160, heating: "Gas", heat_kwh: 20000, wants_hp: true,
      ev: true, ev_planned: false, ev_count: 1, ev_kwh_month: 220, ev_km: 15000, ev_charge_home: "most", ev_day: false, has_wallbox: false, goal: "independence",
    },
    marks: (_, s) => (s.kind === "roof" && north(s) ? { cells: [] } : null),
  },
  {
    // A large household on oil that knows its use only as a range, with a sauna and an electric water heater. No heat pump wanted,
    // no car. Did not give the build year or living area: the census and the 3D model stand in. Cost first.
    ref: "R-3KD8W", hoursAgo: 2, state: "sent", // Sondermeierstraße 86, every part of the complex
    homes: [["694_5340", "DEBY_LOD2_5148543"], ["694_5340", "DEBY_LOD2_5148545"], ["694_5340", "DEBY_LOD2_5148544"], ["694_5340", "DEBY_LOD2_5148057"], ["694_5340", "DEBY_LOD2_5148542"]],
    answers: {
      use_source: "band", demand_kwh: 7000, has_solar: false, has_storage: false, big_users: ["sauna", "water"],
      heating: "Oil", oil_l: 3000, heat_kwh: 30000, wants_hp: false, ev: false, ev_planned: false, goal: "cost",
    },
    marks: () => null,
  },
  {
    // An owner who knew little: no idea of the use, so the household size (four); heating not sure; a car within a year; no priority.
    // Most facts reach the planner as assumptions.
    ref: "R-9PX4N", hoursAgo: 0.5, state: "sent", homes: [["694_5340", "DEBY_LOD2_5148019"]], // Am Blütenring 42
    answers: {
      use_source: "people", demand_kwh: 4500, has_solar: false, has_storage: false, living_m2: 180,
      heating: "unknown", ev: false, ev_planned: true, ev_when: "soon", ev_count: 1,
    },
    marks: () => null,
  },
];

export type Sent = Handoff & { ref: string; sentAt: number };

export const DEMO_COUNT = SEEDS.length;
// A service that is briefly away (the API restarting, a slow square) must not leave the demo without its requests: each is tried
// again after these pauses, about a minute and a half in all, and keeps its loading row meanwhile.
const RETRY_MS = [2000, 4000, 8000, 15000, 30000, 30000];

/** Loads the homes and builds what each homeowner sent, handing each over as soon as it is ready, so the list fills as it loads.
 *  An offered one gets the engine's design for it, as the planner sent it. `settled` runs once per request, ready or given up. */
export function loadDemo(ready: (h: Sent) => void, settled: () => void) {
  SEEDS.forEach(async (seed) => {
    for (let attempt = 0; ; attempt++) {
      const h = await build(seed);
      if (h) { ready(h); break; }
      if (attempt >= RETRY_MS.length) { console.warn(`Demo request ${seed.ref} could not be built; giving up`); break; }
      console.warn(`Demo request ${seed.ref} could not be built; trying again in ${RETRY_MS[attempt] / 1000} s`);
      await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
    }
    settled();
  });
}

async function build(seed: Seed): Promise<Sent | null> {
  try {
    const buildings = (await Promise.all(seed.homes.map(([square, home]) => loadHome(square, home)))).flat();
    if (!buildings.length || buildings.some((b) => !b.sun)) return null; // a home without its parts or sun is not a request yet
    const at = buildings[0].origin, area = await areaAt(at[1], at[0]).catch(() => null);
    const choice: Choice = { ...NO_CHOICE, cells: {}, panels: {} };
    for (const b of buildings) for (const s of b.sun?.surfaces ?? []) {
      const m = seed.marks(b, s);
      if (m?.cells) choice.cells[surfaceKey(b, s)] = m.cells;
      if (m?.panels) choice.panels[surfaceKey(b, s)] = m.panels;
    }
    const h: Sent = { buildings, answers: { ...NO_ANSWERS, ...seed.answers, area }, choice, ref: seed.ref, sentAt: Date.now() - seed.hoursAgo * 3600000 };
    if (seed.state === "opened") h.seed = { opened: true };
    if (seed.state === "offer") {
      const r = fromHomeowner(h), { d } = await design(r.inputs, r.overrides, roofOf(r.buildings, r.installed, r.priority, r.taken), r.off, r.existing, r.strict);
      h.seed = { opened: true, offer: offerOf(d, r) };
    }
    return h;
  } catch {
    return null;
  }
}
