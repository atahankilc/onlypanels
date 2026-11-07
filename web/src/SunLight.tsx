import { CSSProperties } from "react";
import { SunData, View } from "./api";

/** Colour of the light through the day. */
const tone = (el: number) => (el < 10 ? "#FF4A1C" : el < 25 ? "#FF8A1F" : el < 45 ? "#FFB627" : "#FFE27A");

/** The sun's light on the map's window. It depends on direction only, so moving the map changes nothing. */
export default function SunLight({ view, sun, bearing }: { view: View; sun: SunData | null; bearing: number }) {
  const at = sun?.suns.find((s) => s.month === view.moment?.month && s.hour === view.moment.hour);
  if (view.layer !== "sun" || !view.moment || !at) return null;
  const a = ((at.az - bearing) * Math.PI) / 180, sx = Math.sin(a), sy = -Math.cos(a), far = Math.max(Math.abs(sx), Math.abs(sy));
  const style = { "--x": `${50 + (50 * sx) / far}%`, "--y": `${50 + (50 * sy) / far}%`, "--sun": tone(at.el), "--power": 0.45 + at.el / 110, "--turn": `${at.az - bearing}deg` } as CSSProperties;
  if (view.style === "dial") return (
    <div className="sundial" style={style} role="img" aria-label={`Sun in the ${Math.round(at.az)} degree direction, ${Math.round(at.el)} degrees high`}>
      <i className="n">N</i><b style={{ translate: `${sx * (64 - at.el * 0.9)}px ${sy * (64 - at.el * 0.9)}px` }} />
      <small>{Math.round(at.el)}° high</small>
    </div>
  );
  return <div className={`sunlight ${view.style}`} style={style} aria-hidden="true" />;
}
