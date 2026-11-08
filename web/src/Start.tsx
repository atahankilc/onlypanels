// The first thing a homeowner sees: how to start, over a quiet map. It asks for no location and sends nothing.
// The map is the way we recommend, because a picked home answers what most people cannot: roof size, slope, sun and shade.
import { Button } from "./ui";

export type Start = "map" | "form";

const FROM_HOME: [string, string][] = [
  ["Roof", "size, slope and direction of every surface"],
  ["Sun", "over the year, with the shade of the buildings around"],
  ["Area", "how old homes nearby are and how they heat"],
  ["Listing", "whether the building is a protected monument"],
];

export default function StartChoice({ onChoose }: { onChoose: (s: Start) => void }) {
  return (
    <div className="start-veil">
      <section className="start" role="dialog" aria-modal="true" aria-labelledby="start-title">
        <p className="eyebrow">New request</p>
        <h1 id="start-title">Show us your home, and we fill in the rest</h1>
        <p className="muted">Pick your building on the map. We read from it what most people would have to look up or guess:</p>
        <ul className="start-reads">{FROM_HOME.map(([k, v]) => <li key={k}><b>{k}</b><span>{v}</span></li>)}</ul>

        <div className="start-safe">
          <h2>Nothing leaves before you send</h2>
          <ul>
            <li>No location access. Type an address or move the map yourself.</li>
            <li>Your home is worked out in this browser, from public data of Bavaria and the EU.</li>
            <li>Before sending you choose what goes: address, building shape, marked areas, or only your answers.</li>
          </ul>
        </div>

        <div className="start-go">
          <Button variant="solid" size="lg" wide autoFocus onClick={() => onChoose("map")}>Find my home on the map</Button>
          <Button size="lg" wide onClick={() => onChoose("form")}>Only answer questions</Button>
        </div>
        <p className="small muted start-foot">Without the map, the installer estimates your roof and may need to ask more before an offer.</p>
        <p className="small muted start-src">Bayerische Vermessungsverwaltung · Landesamt für Denkmalpflege · Destatis Zensus 2022 · EU JRC PVGIS · OpenStreetMap</p>
      </section>
    </div>
  );
}
