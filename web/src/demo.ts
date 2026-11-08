// Three homeowner requests on real Munich buildings, as if sent through the homeowner flow, so the desk opens with real work.
// Each shows a different case. Every answer is one the homeowner screens can give; the roofs, sun and census are the real ones.
import { Answers, Choice, NO_ANSWERS, NO_CHOICE, Selected, SunSurface, areaAt, surfaceKey } from "./api";
import { Handoff, loadHome } from "./plan";

type Seed = {
  ref: string; daysAgo: number; square: string; home: string; answers: Partial<Answers>;
  marks: (b: Selected, s: SunSurface) => { cells?: number[]; panels?: number[] } | null; // what the homeowner drew on each surface
};
const all = (s: SunSurface) => s.year.map((_, n) => n);
const firstHalf = (s: SunSurface) => all(s).slice(0, Math.ceil(s.year.length / 2));
const facing = (s: SunSurface, from: number, to: number) => s.azimuth >= from && s.azimuth < to;

const SEEDS: Seed[] = [
  {
    // Young family, gas heating, wants a heat pump and drives electric. Knows the bill, took the north roof out.
    ref: "R-4K7QD", daysAgo: 2, square: "682_5336", home: "DEBY_LOD2_4476596",
    answers: {
      use_source: "exact", demand_kwh: 4800, price_ct_kwh: 34, price_known: true, has_solar: false, has_storage: false,
      built: "1991to2000", living_m2: 140, heating: "Gas", heat_kwh: 18000, wants_hp: true,
      ev: true, ev_planned: false, ev_count: 1, ev_km: 15000, ev_charge_home: "most", ev_day: false, has_wallbox: false, goal: "independence",
    },
    marks: (_, s) => (s.kind === "roof" && facing(s, 315, 360) ? { cells: [] } : null),
  },
  {
    // Old solar on half the south roof since 2006: its feed-in tariff has run out. Oil heating, no interest in a heat pump.
    // Only knows a range, has a sauna, adds the sunny south wall. Cost comes first.
    ref: "R-9TB2M", daysAgo: 1, square: "698_5332", home: "DEBY_LOD2_5276159",
    answers: {
      use_source: "band", demand_kwh: 6000, has_solar: true, solar_kwp: 4.5, solar_year: 2006, has_storage: false, big_users: ["sauna"],
      heating: "Oil", oil_l: 2500, heat_kwh: 25000, wants_hp: false, ev: false, ev_planned: false, goal: "cost",
    },
    marks: (_, s) => (s.kind === "roof" && facing(s, 135, 225) ? { panels: firstHalf(s) } : s.kind === "wall" && s.m2 > 50 && facing(s, 135, 225) ? { cells: all(s) } : null),
  },
  {
    // 1970s house that already runs a heat pump, two electric cars coming within a year, home office in the day.
    // Knows only the monthly payment. Has an energy certificate and a pool. The environment comes first.
    ref: "R-2XW8P", daysAgo: 0, square: "686_5326", home: "DEBY_LOD2_4769466",
    answers: {
      use_source: "payment", monthly_eur: 140, has_solar: false, has_storage: false, big_users: ["pool"],
      built: "before1979", living_m2: 180, cert_kwh_m2: 120, heating: "Heatpump", hp_kwh: 5500,
      ev: true, ev_planned: true, ev_when: "soon", ev_count: 2, ev_km: 25000, ev_charge_home: "half", ev_day: true, has_wallbox: false, goal: "environment",
    },
    marks: (_, s) => (s.kind === "roof" && facing(s, 315, 360) ? { cells: [] } : null),
  },
];

/** Loads the three homes and builds what each homeowner sent. A home that fails to load is left out. */
export type Sent = Handoff & { ref: string; sentAt: number };
export async function loadDemo(): Promise<Sent[]> {
  const out = await Promise.all(SEEDS.map(async (seed): Promise<Sent | null> => {
    try {
      const buildings = await loadHome(seed.square, seed.home);
      const at = buildings[0].origin, area = await areaAt(at[1], at[0]).catch(() => null);
      const choice: Choice = { ...NO_CHOICE, cells: {}, panels: {} };
      for (const b of buildings) for (const s of b.sun?.surfaces ?? []) {
        const m = seed.marks(b, s);
        if (m?.cells) choice.cells[surfaceKey(b, s)] = m.cells;
        if (m?.panels) choice.panels[surfaceKey(b, s)] = m.panels;
      }
      const answers: Answers = { ...NO_ANSWERS, ...seed.answers, area };
      return { buildings, answers, choice, ref: seed.ref, sentAt: Date.now() - seed.daysAgo * 86400000 };
    } catch {
      return null;
    }
  }));
  return out.filter((x): x is Sent => !!x);
}
