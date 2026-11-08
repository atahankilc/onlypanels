// The first thing a homeowner sees: how to start, over a quiet map. It asks for no location and sends nothing.
// One message carries it: the map fills most answers in, and nobody sees any of it until the homeowner sends.
import { Button } from "./ui";

export type Start = "map" | "form";

const PROMISES: [string, string][] = [
  ["We see nothing until you send.", "Your home is worked out here, in your browser."],
  ["No location needed.", "Every piece of data about your home comes from Bavaria and the EU."],
  ["You decide what goes.", "After picking your home, leave out its address, building or roof shape."],
];

export default function StartChoice({ onChoose }: { onChoose: (s: Start) => void }) {
  return (
    <div className="start-veil">
      <section className="start" role="dialog" aria-modal="true" aria-labelledby="start-title">
        <h1 id="start-title">The map fills in most of it <em>for you.</em></h1>
        <p className="start-lead">Pick your building. We read its roof, sun and shade, so you type less and your offer is closer.</p>

        <ol className="start-promises">{PROMISES.map(([big, small]) => <li key={big}><b>{big}</b><span>{small}</span></li>)}</ol>

        <div className="start-go">
          <Button variant="solid" size="lg" wide autoFocus onClick={() => onChoose("map")}>Find my home on the map</Button>
          <button type="button" className="textlink start-form" onClick={() => onChoose("form")}>Only answer questions, without the map</button>
        </div>
        <p className="start-src">Bayerische Vermessungsverwaltung · Landesamt für Denkmalpflege · Landeshauptstadt München · Destatis · EU JRC PVGIS · Photon (komoot, Germany)</p>
      </section>
    </div>
  );
}
