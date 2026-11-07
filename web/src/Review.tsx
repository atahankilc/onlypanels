import { Selected, SunStyle, View, meanSun, polyOf, surfaceKey, surfaceName } from "./api";
import { Face, letter } from "./HomeMap";
import { Back } from "./icons";
import { Button, Check, Field, IconButton, Segmented, Slider } from "./ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const sunWord = (kwh: number, best: number) => (kwh >= best * 0.85 ? "Very sunny" : kwh >= best * 0.6 ? "Sunny" : "Little sun");

type Props = {
  buildings: Selected[]; goTo: (id: string) => void; face: Face | null; setFace: (f: Face | null) => void;
  view: View; setView: (v: View) => void; chosen: string[]; toggle: (key: string) => void; suggest: () => void; back: () => void;
};

export default function Review({ buildings, goTo, face, setFace, view, setView, chosen, toggle, suggest, back }: Props) {
  const all = buildings.flatMap((b) => (b.sun?.surfaces ?? []).map((s) => ({ b, s, key: surfaceKey(b, s) })));
  const picked = all.filter((x) => chosen.includes(x.key));
  const area = picked.reduce((sum, x) => sum + x.s.m2, 0);
  const best = Math.max(1, ...all.map((x) => meanSun(x.s)));
  const loading = buildings.some((b) => b.sun === undefined), failed = buildings.some((b) => b.sun === null);
  const at = view.moment ?? { month: 6, hour: 12 };
  const suns = buildings.find((b) => b.sun)?.sun?.suns ?? [];
  const hoursIn = (month: number) => suns.filter((s) => s.month === month).map((s) => s.hour);
  const hours = hoursIn(at.month);
  const setMoment = (month: number, hour: number) => {
    const list = hoursIn(month);
    setView({ ...view, moment: { month, hour: list.length ? Math.min(Math.max(hour, list[0]), list[list.length - 1]) : hour } });
  };

  return (
    <>
      <aside className="panel tall">
        <header className="panelbar"><IconButton label="Back to selecting" onClick={back}><Back /></IconButton><b>Where should panels go?</b></header>
        <div className="sum">
          {loading ? <p className="muted">Working out the sun on your buildings…</p> : <>
            <p className="bignum">{Math.round(area)} m²<small>on {picked.length === 1 ? "1 surface" : `${picked.length} surfaces`}</small></p>
            <p className="small muted">Measured surface. Windows, chimneys and edges are not taken off yet.</p>
          </>}
          {failed && <p className="error small">Sun data could not be loaded for every building.</p>}
        </div>
        <p className="hint">Click a surface on the building to add or remove it. <b>A bright edge means it is chosen.</b></p>
        {buildings.map((b, i) => {
          const mine = all.filter((x) => x.b === b).sort((x, y) => Number(y.s.kind === "roof") - Number(x.s.kind === "roof") || meanSun(y.s) - meanSun(x.s));
          return <section key={b.id}>
            <button type="button" className="row" onClick={() => goTo(b.id)}><span className="tag">{letter(i)}</span><span className="name">{b.label}</span></button>
            <ul className="chosen">{mine.map(({ s, key }) => {
              const me = { building: b.id, poly: polyOf(b, s) };
              return <li key={key} className={face?.building === b.id && face.poly === me.poly ? "on" : ""} onMouseEnter={() => setFace(me)} onMouseLeave={() => setFace(null)}>
                <Check checked={chosen.includes(key)} onChange={() => toggle(key)}><b>{surfaceName(s)}</b><small>{Math.round(s.m2)} m² · {sunWord(meanSun(s), best)}</small></Check>
              </li>;
            })}</ul>
          </section>;
        })}
        <div className="panelfoot"><Button wide onClick={suggest}>Use our suggestion again</Button></div>
        <p className="source small muted">Buildings and aerial photo: Bayerische Vermessungsverwaltung. Yearly sunlight: PVGIS, European Commission. Sun position and shadows are calculated from these, without trees.</p>
      </aside>

      <div className={`sunbar${view.layer === "sun" ? " open" : ""}`}>
        <div className="sunrow">
          <Segmented label="Show" value={view.layer} onChange={(layer) => setView({ ...view, layer })} options={[{ value: "photo", label: "Photo" }, { value: "sun", label: "Sunlight" }]} />
          {view.layer === "sun" && <Segmented label="Period" value={view.moment ? "moment" : "year"} onChange={(v) => setView({ ...view, moment: v === "year" ? null : at })} options={[{ value: "year", label: "Whole year" }, { value: "moment", label: "Pick a time" }]} />}
          {view.layer === "sun" && view.moment && <div className="trial"><span>Try</span><Segmented label="Sun style" value={view.style} onChange={(style: SunStyle) => setView({ ...view, style })} options={[{ value: "glow", label: "Glow" }, { value: "beams", label: "Beams" }, { value: "sky", label: "Sky" }, { value: "dial", label: "Dial" }]} /></div>}
        </div>
        {view.layer === "sun" && <div className="sunrow">
          {view.moment && <>
            <Field label="Month" value={MONTHS[at.month - 1]}><Slider min={1} max={12} value={at.month} onChange={(e) => setMoment(Number(e.target.value), at.hour)} /></Field>
            <Field label="Time" value={`${at.hour}:00`}><Slider min={hours[0] ?? 8} max={hours[hours.length - 1] ?? 16} value={at.hour} onChange={(e) => setMoment(at.month, Number(e.target.value))} /></Field>
          </>}
          <div className="legend" role="img" aria-label="Blue is least sun, red is most"><i /><span>Less sun</span><span>More sun</span></div>
        </div>}
      </div>
    </>
  );
}
