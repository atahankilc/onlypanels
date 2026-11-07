// One stroke, one weight, drawn on a 24 px grid.
const path = (d: string) => ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
export const Up = path("M12 19V5M6 11l6-6 6 6");
export const Down = path("M12 5v14M6 13l6 6 6-6");
export const Close = path("M6 6l12 12M18 6L6 18");
export const Search = path("M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4");
export const Undo = path("M4 9h11a5 5 0 0 1 0 10H9M4 9l4-4M4 9l4 4");
export const Home = path("M4 11l8-7 8 7M6 10v9h12v-9");
export const Back = path("M15 6l-6 6 6 6");
export const Pen = path("M4 20l1-4L16 5l3 3L8 19zM13 8l3 3");
export const Photo = path("M4 6h16v12H4zM4 15l5-4 4 3 3-2 4 3");
export const Turn = path("M4 12a8 8 0 0 1 14-5l2 2M20 4v5h-5M20 12a8 8 0 0 1-14 5l-2-2M4 20v-5h5");
export const Mark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="16" cy="9" r="4" fill="currentColor" stroke="none" /><path d="M3 26L16 16l13 10M9 26h14" />
  </svg>
);
