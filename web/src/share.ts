// What a request carries to the installer, as the homeowner chose before sending. The homeowner keeps the full version.
// Sun is never sent: it follows from the building, so the installer works it out again when the home is shared.
import { Answers, NO_CHOICE, Selected } from "./api";
import type { Handoff } from "./plan";

/** home: the address and the building's shape, together, since Bavaria's open building models give one away from the other.
 *  marked: the areas drawn on the roof, which need the home. roof: only a few roof numbers, when the home stays here. */
export type Shared = { home: boolean; marked: boolean; roof: boolean; photo: boolean; address: boolean };
export const SHARE_ALL: Shared = { home: true, marked: true, roof: true, photo: true, address: true };
/** A roof in three numbers: they fit thousands of Munich roofs, so they cannot be traced back to one address. */
export type RoofNumbers = { m2: number | null; facing: string; tilt: number; told?: boolean }; // m2 null: described without a size // told: from the homeowner's words, not measured. facing "unknown" when not sure

// Questions only: the homeowner's words as roof numbers. Sizes are the quartiles of measured roof area of Munich homes
// (scripts/roof_size_bands.py: 81, 109, 162 m²); slopes are our assumption for gentle, steep and not sure.
export const TOLD_M2 = { small: 80, medium: 110, large: 160 } as const;
export const TOLD_TILT = { gentle: 25, steep: 45, unsure: 35 } as const;
/** A roof's area in words: "110 m²", or "size not known" when it was described without one. */
export const m2Words = (m2: number | null) => (m2 ? `${m2} m²` : "size not known");
export function toldRoof(a: Answers): RoofNumbers | null {
  const m2 = a.roof_size === "known" ? a.roof_m2 : a.roof_size ? TOLD_M2[a.roof_size] : null;
  // A size without a direction still limits the system; the direction then counts as not known (a typical yield).
  // A direction without a size still gives its sun yield, with no roof limit. Neither: nothing to send.
  const facing = !a.roof_facing || a.roof_facing === "unsure" ? null : a.roof_facing;
  if (!m2 && !facing) return null;
  const flat = a.roof_facing === "flat";
  return { m2: m2 || null, facing: facing ?? "unknown", tilt: flat ? 0 : TOLD_TILT[a.roof_slope ?? "unsure"], told: true };
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

export function roofNumbers(buildings: Selected[]): RoofNumbers | null {
  const roofs = buildings.flatMap((b) => b.sun?.surfaces ?? []).filter((s) => s.kind === "roof");
  if (!roofs.length) return null;
  // The side panels would go on first: the most sunlight over its whole area, not just the biggest.
  const worth = (s: (typeof roofs)[number]) => s.m2 * (s.year.reduce((t, v) => t + v, 0) / Math.max(1, s.year.length));
  const main = roofs.reduce((m, s) => (worth(s) > worth(m) ? s : m));
  const flat = main.tilt < 8;
  // Rounded on purpose: 5 m² and 5 degrees are enough to plan with and too coarse to find a house by.
  return { m2: Math.round(roofs.reduce((t, s) => t + s.m2, 0) / 5) * 5, facing: flat ? "flat" : COMPASS[Math.round(main.azimuth / 45) % 8], tilt: flat ? 0 : Math.round(main.tilt / 5) * 5 };
}

/** The request as the installer receives it. */
export function forInstaller(h: Handoff, shared: Shared): Handoff {
  const home = shared.home && h.buildings.length > 0;
  return {
    ...h,
    buildings: home ? h.buildings.map(({ sun: _sun, ...b }) => b) : [],
    choice: home && shared.marked ? h.choice : NO_CHOICE,
    // The census picture belongs to a place: it goes with the home or not at all.
    answers: { ...h.answers, area: home ? h.answers.area : null, meter_photo: shared.photo ? h.answers.meter_photo : null, address: shared.address ? h.answers.address : null },
    shared: { ...shared, home, marked: home && shared.marked, roof: !home && shared.roof && !!h.roof },
    roof: !home && shared.roof ? h.roof ?? null : null,
  };
}

/** The request as the homeowner may read it: long lists cut short, the photo named, questions left open left out. */
export function readable(value: unknown, depth = 0): unknown {
  if (value && typeof value === "object" && !Array.isArray(value))
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length > 0 && v.every((x) => x === null))).map(([k, v]) => [k, readable(v, depth + 1)]));
  if (typeof value === "string" && value.startsWith("data:image")) return `[photo, ${Math.round((value.length * 0.75) / 1024)} KB]`;
  if (Array.isArray(value)) {
    const keep = depth > 2 ? 2 : 6;
    const shown = value.slice(0, keep).map((v) => readable(v, depth + 1));
    return value.length > keep ? [...shown, `… ${value.length - keep} more`] : shown;
  }
  return value;
}
