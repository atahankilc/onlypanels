import { CSSProperties } from "react";
import { SunData, View } from "./api";

/** Colour of the light through the day. */
const tone = (el: number) => (el < 10 ? "#FF4A1C" : el < 25 ? "#FF8A1F" : el < 45 ? "#FFB627" : "#FFE27A");

/** The sun's light on the map's window. It depends on direction only, so moving the map changes nothing. */
export default function SunLight({ view, sun, bearing }: { view: View; sun: SunData | null; bearing: number }) {
  const at = sun?.suns.find((s) => s.month === view.moment?.month && s.hour === view.moment.hour);
  if (view.layer !== "sun" || !view.moment || !at) return null;
  const style = { "--sun": tone(at.el), "--power": 0.45 + at.el / 110, "--turn": `${at.az - bearing}deg` } as CSSProperties;
  return <div className="sunlight" style={style} aria-hidden="true" />;
}
