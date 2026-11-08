// Four homeowner requests on real Munich buildings, as if sent through the homeowner flow, so both sides open with real work.
// Each is a different case and uses the homeowner screens fully: drawn priority areas with cut-outs, an added wall, existing
// panels on part of a roof, a garage picked with the house, a flat roof, answers known exactly, as a range, as a payment or not at all.
// They arrive at different points: one waiting, one a planner has opened, one with the offer already sent.
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

const SEEDS: Seed[] = [
  {
    // A family on gas who want a heat pump and already drive electric. They know their bill and their car's charging from its app.
    // North roof out, a skylight cut out of the south roof. Independence first. The planner has already sent the offer.
    ref: "R-4K7QD", hoursAgo: 75, state: "offer", homes: [["682_5336", "DEBY_LOD2_4476596"]],
    answers: {
      use_source: "exact", demand_kwh: 4800, price_ct_kwh: 34, price_known: true, has_solar: false, has_storage: false,
      built: "1991to2000", living_m2: 140, heating: "Gas", heat_kwh: 18000, wants_hp: true,
      ev: true, ev_planned: false, ev_count: 1, ev_kwh_month: 220, ev_km: 15000, ev_charge_home: "most", ev_day: false, has_wallbox: false, goal: "independence",
    },
    marks: (_, s) => (s.kind !== "roof" ? null : north(s) ? { cells: [] } : south(s) ? { cells: withHole(s) } : null),
  },
  {
    // 4.5 kWp from 2006 on the western half of the south roof, its feed-in tariff now over, and a 5 kWh battery added in 2019.
    // Oil heating, no heat pump wanted. Knows the use only as a range; a sauna and an electric water heater. Adds the big south wall.
    // Did not give the build year or living area: the census and the 3D model stand in. Cost first. A planner has opened it.
    ref: "R-9TB2M", hoursAgo: 26, state: "opened", homes: [["698_5332", "DEBY_LOD2_5276159"]],
    answers: {
      use_source: "band", demand_kwh: 6000, has_solar: true, solar_kwp: 4.5, solar_year: 2006, has_storage: true, battery_kwh: 5,
      big_users: ["sauna", "water"], heating: "Oil", oil_l: 2500, heat_kwh: 25000, wants_hp: false, ev: false, ev_planned: false, goal: "cost",
    },
    marks: (_, s) => (s.kind === "roof" && south(s) ? { panels: side(s, 0.5, "near") } : s.kind === "wall" && s.m2 > 50 && south(s) ? { cells: all(s) } : null),
  },
  {
    // A 1970s house that already heats with a heat pump, on its own meter. Two electric cars within a year, home office, so the cars
    // stand at home in the day. Knows only the monthly payment. Energy certificate and a pool. Picked the garage with the house.
    // North roof out. The environment first. Just sent.
    ref: "R-2XW8P", hoursAgo: 3, state: "sent", homes: [["686_5326", "DEBY_LOD2_4769466"], ["686_5326", "DEBY_LOD2_104584034"]],
    answers: {
      use_source: "payment", monthly_eur: 140, has_solar: false, has_storage: false, big_users: ["pool"],
      built: "before1979", living_m2: 180, cert_kwh_m2: 120, heating: "Heatpump", hp_kwh: 5500,
      ev: true, ev_planned: true, ev_when: "soon", ev_count: 2, ev_km: 25000, ev_charge_home: "half", ev_day: true, has_wallbox: false, goal: "environment",
    },
    marks: (b, s) => (b.id === "DEBY_LOD2_4769466" && s.kind === "roof" && north(s) ? { cells: [] } : null),
  },
  {
    // A flat-roofed house where the owner knew little: no idea of the use, so the household size (two); heating not sure; no priority.
    // A roof terrace drawn out of the flat roof, air conditioning ticked. Most facts reach the planner as assumptions. Just sent.
    ref: "R-6HN3F", hoursAgo: 1, state: "sent", homes: [["698_5332", "DEBY_LOD2_66053"]],
    answers: {
      use_source: "people", demand_kwh: 2700, has_solar: false, has_storage: false, big_users: ["ac"], living_m2: 125,
      heating: "unknown", ev: false, ev_planned: false,
    },
    marks: (_, s) => (s.kind === "roof" ? { cells: side(s, 0.25, "far") } : null),
  },
];

export type Sent = Handoff & { ref: string; sentAt: number };

/** Loads the homes and builds what each homeowner sent. An offered one gets the engine's design for it, as the planner sent it. */
export async function loadDemo(): Promise<Sent[]> {
  const out = await Promise.all(SEEDS.map(async (seed): Promise<Sent | null> => {
    try {
      const buildings = (await Promise.all(seed.homes.map(([square, home]) => loadHome(square, home)))).flat();
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
        const r = fromHomeowner(h), { d } = await design(r.inputs, r.overrides, roofOf(r.buildings, r.installed), r.off, r.existing);
        h.seed = { opened: true, offer: offerOf(d) };
      }
      return h;
    } catch {
      return null;
    }
  }));
  return out.filter((x): x is Sent => !!x);
}
