// The homeowner's questions: each answer list, as value and label. Review asks them, Known says what each answer does.
export const BANDS = [["Under 3,000", 2500], ["3,000 – 4,000", 3500], ["4,000 – 5,000", 4500], ["5,000 – 7,000", 6000], ["Over 7,000", 8500]] as const;
// The last resort when the use is not known at all. Stromspiegel 2025, single-family house, from secondary sources; one person is our own guess. Shown to the planner as assumed.
export const BY_PEOPLE = [["1", 2000], ["2", 2700], ["3", 3500], ["4", 3800], ["5+", 4500]] as const;
// Past projects hold almost only heat pump, gas and oil (scripts/profile_heating.py); anything else the engine treats as unknown.
// What the customer can tell us beyond that is asked, never required: a heat pump's own meter, the gas or oil a year.
// District and electric heating are what the census can name as common here, so they can be picked too. Electric heating can take a heat pump;
// district heating gets none (the planner is told why).
export const HEATING = [["Heatpump", "Heat pump"], ["Gas", "Gas"], ["Oil", "Oil"], ["District", "District heating"], ["Electric", "Electric heating"], ["OtherRenewable", "Wood or pellets"], ["unknown", "Something else or not sure"]] as const;
export const SOLAR_KIND = [["pv", "Electricity"], ["thermal", "Hot water"], ["both", "Both"]] as const;
export const BOILER_AGE = [["under10", "Under 10 years"], ["10to20", "10 – 20 years"], ["over20", "Over 20 years"]] as const;
export const HEAT_DIST = [["floor", "Underfloor"], ["radiators", "Radiators"], ["both", "Both"]] as const;
export const HOME_DAY = [["most", "Mostly"], ["some", "Sometimes"], ["rarely", "Rarely"]] as const;
export const OWNER = [["sole", "Only me or my family"], ["shared", "Shared with other owners"], ["tenant", "I rent it"]] as const;
export const BIG_USERS = [["pool", "Pool"], ["sauna", "Sauna"], ["ac", "Air conditioning"], ["water", "Electric water heater"]] as const;
export const BUILT = [["before1979", "Before 1979"], ["1979to1990", "1979 – 1990"], ["1991to2000", "1991 – 2000"], ["2001to2010", "2001 – 2010"], ["since2011", "2011 or later"]] as const;
export const GOALS = [["cost", "Low cost", "A smaller system, a lower price"], ["independence", "Independence", "As much of my own power as I can"], ["environment", "The environment", "As much clean power as the roof gives"]] as const;
export const KWH_PER_LITRE_OIL = 10; // heating oil, about 10 kWh of heat per litre
export const FOSSIL = ["Gas", "Oil", "OtherNonRenewable"];
export const REPLACEABLE = [...FOSSIL, "Electric"]; // heating a heat pump can replace
export const number = (v: string) => (v === "" ? null : Number(v));

export const FACING = [["south", "South"], ["south-east", "South-east"], ["south-west", "South-west"], ["east", "East"], ["west", "West"], ["north", "North"], ["flat", "Flat roof"], ["unsure", "Not sure"]] as const;
export const SLOPE = [["gentle", "Gentle", "Easy to walk on, under about 30°"], ["steep", "Steep", "A usual pitched roof"], ["unsure", "Not sure", ""]] as const;
export const SIZE = [["small", "Small house", "Terraced or semi-detached"], ["medium", "Detached house", "One family"], ["large", "Large house", "Two families or more, or a big footprint"], ["known", "I know the roof area", ""]] as const;

// The engine's stand-ins, mirrored so each page can say what a skipped answer becomes. The engine keeps the real values
// (api/main.py, engine/src/reonic_engine/design.py); tests/test_stand_ins.py fails when the two drift apart. Sources: docs/assumptions.md.
export const TYPICAL_USE_KWH = 4000; // api/main.py TYPICAL_USE_KWH
export const BASE_FEE_EUR_YEAR = 150; // design.py BASE_FEE_EUR_YEAR
export const BIG_USERS_KWH: Record<string, number> = { pool: 1500, sauna: 1000, ac: 600, water: 2000 }; // design.py BIG_USERS_KWH
export const HEAT_KWH_PER_M2: Record<string, number> = { before1979: 180, "1979to1990": 140, "1991to2000": 120, "2001to2010": 90, since2011: 60 }; // design.py HEAT_KWH_PER_M2
export const TYPICAL_HEAT_KWH = 15000; // design.py `heat_mwh or 15.0`
export const EV_KWH_PER_KM = 0.18; // design.py EV_KWH_PER_KM
export const HOME_SHARE: Record<string, number> = { most: 0.9, half: 0.5, little: 0.2 }; // design.py HOME_SHARE
export const KWP_PER_M2 = 0.2; // design.py KWP_PER_M2
export const FEED_IN_YEARS = 20; // design.py FEED_IN_YEARS
export const TYPICAL_KM = 11300; // a car's km a year when none is given (plan.ts)
