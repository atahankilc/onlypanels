import type { ReactNode } from "react";
import { Selected, View } from "./api";
import { SUN_HIGH, SUN_LOW } from "./HomeMap";
import { Field, Segmented, Slider } from "./ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** What the map paints on the surfaces: the photo, the year's sunlight, or one month and hour. Sits on the map, apart from the questions. */
export default function SunView({ view, setView, buildings, extra, below }: { view: View; setView: (v: View) => void; buildings: Selected[]; extra?: ReactNode; below?: ReactNode }) {
  const at = view.moment ?? { month: 6, hour: 12 };
  const suns = buildings.find((b) => b.sun)?.sun?.suns ?? [];
  const hoursIn = (month: number) => suns.filter((s) => s.month === month).map((s) => s.hour); // the hours the sun is up that month
  const hours = hoursIn(at.month);
  const setMoment = (month: number, hour: number) => {
    const list = hoursIn(month);
    setView({ layer: "sun", moment: { month, hour: list.length ? Math.min(Math.max(hour, list[0]), list[list.length - 1]) : hour } });
  };
  const mode = view.layer === "photo" ? "photo" : view.moment ? "moment" : "year";
  const show = (m: typeof mode) => setView({ layer: m === "photo" ? "photo" : "sun", moment: m === "moment" ? at : null });

  return (
    <div className={mode === "photo" ? "sunview" : "sunview open"}>
      <div className="sunpick"><Segmented variant="glass" wide label="Show on the map" value={mode} onChange={show} options={[{ value: "photo", label: "Photo" }, { value: "year", label: "Yearly sun" }, { value: "moment", label: "Sun by time" }]} />{extra}</div>
      {mode !== "photo" && <div className="sunbox">
        {mode === "moment" && hours.length > 0 && <div className="sunrow">
          <Field label="Month" value={MONTHS[at.month - 1]}><Slider min={1} max={12} value={at.month} onChange={(e) => setMoment(Number(e.target.value), at.hour)} /></Field>
          <Field label="Time" value={`${at.hour}:00`}><Slider min={hours[0]} max={hours[hours.length - 1]} value={at.hour} onChange={(e) => setMoment(at.month, Number(e.target.value))} /></Field>
        </div>}
        {mode === "year"
          ? <div className="legend" role="img" aria-label={`Sun on the surface from ${SUN_LOW} to ${SUN_HIGH} kWh per square metre a year`}><i /><span>{SUN_LOW} kWh/m²</span><span>{SUN_HIGH.toLocaleString("en")} kWh/m²</span></div>
          : <div className="legend" role="img" aria-label="Blue is no direct sun, red is full sun"><i /><span>No direct sun</span><span>Full sun</span></div>}
      </div>}
      {below}
    </div>
  );
}
