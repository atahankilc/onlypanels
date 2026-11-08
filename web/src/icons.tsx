// One stroke, one weight, drawn on a 24 px grid.
const path = (d: string) => ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
export const Close = path("M6 6l12 12M18 6L6 18");
export const Search = path("M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4");
export const Plus = path("M12 5v14M5 12h14");
export const Minus = path("M5 12h14");
export const Locate = path("M20 4L4 11l7 2 2 7z");
export const Info = path("M12 11v6M12 7.5v.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z");
export const Needle = path("M12 3l4 9h-8zM8 12l4 9 4-9");
export const Back = path("M15 6l-6 6 6 6");
export const Undo = path("M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3");
export const Photo = path("M4 6h16v12H4zM4 15l5-4 4 3 3-2 4 3");
/** OnlyPanels: a ring with a solar panel locked into its upper right, in the brand blue (set by .logo). */
export const Mark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <mask id="op-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
      <rect width="32" height="32" fill="#fff" />
      <path d="M17.00 2.50L30.00 2.50L27.50 11.50L14.50 11.50z" fill="#000" stroke="#000" strokeWidth="3.2" strokeLinejoin="round" />
    </mask>
    <circle cx="12.5" cy="19" r="8.5" stroke="currentColor" strokeWidth="5.5" mask="url(#op-cut)" />
    <path d="M17.00 2.50L20.81 2.50L19.74 6.37L15.93 6.37zM21.85 2.50L25.15 2.50L24.07 6.37L20.78 6.37zM26.19 2.50L30.00 2.50L28.93 6.37L25.11 6.37zM15.57 7.63L19.39 7.63L18.31 11.50L14.50 11.50zM20.43 7.63L23.72 7.63L22.65 11.50L19.35 11.50zM24.76 7.63L28.57 7.63L27.50 11.50L23.69 11.50z" fill="currentColor" />
  </svg>
);
export const Mic = path("M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3");
export const Stop = path("M7 7h10v10H7z");
export const Skip = path("M5 6l7 6-7 6M13 6l7 6-7 6");
export const Spark = path("M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6");
export const Lock = path("M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3");
export const Tick = path("M5 12.5l4.5 4.5L19 7.5");
export const Bolt = path("M13 3L5 13.5h6L10 21l8-10.5h-6z");
export const Drop = path("M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5z");
export const SunIcon = path("M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4");
export const Layers = path("M3 8l9-4.5L21 8l-9 4.5zM3 13l9 4.5 9-4.5");
export const Pencil = path("M4 20l4.2-1L19 8.2 15.8 5 5 15.8zM13.8 7l3.2 3.2");
