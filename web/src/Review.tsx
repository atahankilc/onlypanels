import { Selected, View, meanSun, polyOf, surfaceKey, surfaceName } from "./api";
import { Face, letter } from "./HomeMap";
import { Back } from "./icons";
import { Button, Check, Field, IconButton, Segmented, Slider } from "./ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type Props = {
  buildings: Selected[]; goTo: (id: string) => void; face: Face | null; setFace: (f: Face | null) => void;
  view: View; setView: (v: View) => void; chosen: string[]; toggle: (key: string) => void; reset: () => void; back: () => void;
};

export default function Review({ buildings, goTo, face, setFace, view, setView, chosen, toggle, reset, back }: Props) {
  const all = buildings.flatMap((b) => (b.sun?.surfaces ?? []).map((s) => ({ b, s, key: surfaceKey(b, s) })));
  const picked = all.filter((x) => chosen.includes(x.key));
  const sum = (kind: string) => picked.filter((x) => x.s.kind === kind).reduce((a, x) => a + x.s.m2, 0);
  const roofs = sum("roof"), walls = sum("wall");
  const loading = buildings.some((b) => b.sun === undefined), failed = buildings.some((b) => b.sun === null);
  const at = view.moment ?? { month: 6, hour: 12 };
  const suns = buildings.find((b) => b.sun)?.sun?.suns ?? [];
  const hoursIn = (month: number) => suns.filter((s) => s.month === month).map((s) => s.hour);
  const hours = hoursIn(at.month);
  const setMoment = (month: number, hour: number) => {
    const list = hoursIn(month);
    setView({ ...view, moment: { month, hour: list.length ? Math.min(Math.max(hour, list[0]), list[list.length - 1]) : hour } });
  };

  const mode = view.layer === "photo" ? "photo" : view.moment ? "moment" : "year";
  const show = (m: typeof mode) => setView({ layer: m === "photo" ? "photo" : "sun", moment: m === "moment" ? at : null });

  return (
    <aside className="panel tall">
      <header className="panelbar"><IconButton label="Back to selecting" onClick={back}><Back /></IconButton><b>Where should panels go?</b></header>
      <div className="sum">
        {loading ? <p className="muted">Working out the sun on your buildings…</p> : <>
          <p className="bignum">{Math.round(roofs)} m²<small>of roof chosen</small></p>
          <p className="small muted">The whole measured roof, not the usable area. Windows, chimneys and edges are not known yet.</p>
          {walls > 0 && <p className="small request">Plus {Math.round(walls)} m² of wall as a request.</p>}
        </>}
        {failed && <p className="error small">Sun data could not be loaded for every building.</p>}
      </div>
      <div className="sunbar">
        <Segmented wide label="Show on the map" value={mode} onChange={show} options={[{ value: "photo", label: "Photo" }, { value: "year", label: "Yearly sun" }, { value: "moment", label: "Sun by time" }]} />
        {view.moment && view.layer === "sun" && <div className="sunrow">
          <Field label="Month" value={MONTHS[at.month - 1]}><Slider min={1} max={12} value={at.month} onChange={(e) => setMoment(Number(e.target.value), at.hour)} /></Field>
          <Field label="Time" value={`${at.hour}:00`}><Slider min={hours[0] ?? 8} max={hours[hours.length - 1] ?? 16} value={at.hour} onChange={(e) => setMoment(at.month, Number(e.target.value))} /></Field>
        </div>}
        {view.layer === "sun" && <div className="legend" role="img" aria-label="Blue is least sun, red is most"><i /><span>Less sun</span><span>More sun</span></div>}
      </div>
      <p className="hint">All roofs are in. <b>Click a surface to take it out or add it.</b> Walls are only a request: your installer decides if they work.</p>
      {buildings.map((b, i) => {
        const mine = all.filter((x) => x.b === b).sort((x, y) => meanSun(y.s) - meanSun(x.s));
        const row = ({ s, key }: (typeof mine)[number]) => {
          const me = { building: b.id, poly: polyOf(b, s) };
          return <li key={key} className={face?.building === b.id && face.poly === me.poly ? "on" : ""} onMouseEnter={() => setFace(me)} onMouseLeave={() => setFace(null)}>
            <Check checked={chosen.includes(key)} onChange={() => toggle(key)}><b>{surfaceName(s)}</b><small>{Math.round(s.m2)} m² · {Math.round(meanSun(s)).toLocaleString("en")} kWh/m² sun a year</small></Check>
          </li>;
        };
        const wallList = mine.filter((x) => x.s.kind === "wall");
        return <section key={b.id}>
          <button type="button" className="row" onClick={() => goTo(b.id)}><span className="tag">{letter(i)}</span><span className="name">{b.label}</span></button>
          <ul className="chosen">{mine.filter((x) => x.s.kind === "roof").map(row)}</ul>
          {wallList.length > 0 && <details><summary>Ask about walls ({wallList.length})</summary><ul className="chosen">{wallList.map(row)}</ul></details>}
        </section>;
      })}
      <div className="panelfoot"><Button wide onClick={reset}>Back to all roofs</Button></div>
      <p className="source small muted">Buildings and aerial photo: Bayerische Vermessungsverwaltung. Yearly sunlight: PVGIS, European Commission. Sun position and shadows are calculated from these, without trees.</p>
    </aside>
  );
}
