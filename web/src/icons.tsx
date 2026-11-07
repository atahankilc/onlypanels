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
export const Photo = path("M4 6h16v12H4zM4 15l5-4 4 3 3-2 4 3");
export const Mark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="16" cy="9" r="4" fill="currentColor" stroke="none" /><path d="M3 26L16 16l13 10M9 26h14" />
  </svg>
);
