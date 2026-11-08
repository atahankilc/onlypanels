// The four technologies and the running prices, drawn like icons.tsx: one stroke on a 24 px grid.
const path = (d: string) => ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
export const SolarIcon = path("M4 9h16l-2 8H6zM9.3 9l-.7 8M14.7 9l.7 8M5 13h14M12 3v2M7.5 4.5l1 1.5M16.5 4.5l-1 1.5");
export const BatteryIcon = path("M7 6h10v15H7zM10 3h4v3M10 13.5l2-3v2.5h2l-2 3");
export const WallboxIcon = path("M6 3h9v18H6zM15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-2-2M9 8l-1 3h3l-1 3");
export const HeatIcon = path("M3 5h18v14H3zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 9v-.5M12 15.5V15M7 9v6M17 9v6");
export const RatesIcon = path("M4 20V10M10 20V4M16 20v-7M22 20H2");

export const TECH_ICON: Record<string, (p: { size?: number }) => React.ReactElement> = { solar: SolarIcon, battery: BatteryIcon, wallbox: WallboxIcon, heatpump: HeatIcon, rates: RatesIcon };
