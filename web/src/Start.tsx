// The first thing a homeowner sees: how to start, over a quiet map. It asks for no location and sends nothing.
// One message carries it: the map fills most answers in, and nobody sees any of it until the homeowner sends.
import { useEffect, useRef } from "react";
import { Button } from "./ui";

export type Start = "map" | "form";

const PROMISES: [string, string][] = [
  ["We see nothing until you send.", "Your answers and the home you pick stay in this browser until you send. The map only loads public map pieces of the area. The voice helper is the one exception, and only if you turn it on: then what you say to it and your answers go to ElevenLabs and Anthropic in the USA, never your home or address."],
  ["No location needed.", "Type an address or move the map. We only ask for your location if you tap the locate button."],
  ["Only Bavarian and EU data.", "Roof, sun and address come only from Bavaria and the EU. The street map comes from OpenStreetMap."],
  ["You decide what goes.", "Before sending, leave out the address, the building or the roof shape."],
  ["Sending your home makes the offer closer.", "Your installer then also checks trees that shade the roof, monument rules and the city's heat plan, without asking you."],
];

export default function StartChoice({ onChoose }: { onChoose: (s: Start) => void }) {
  // The button below takes focus; on a short screen that would scroll the title away, so the dialog starts at its top.
  const box = useRef<HTMLElement>(null);
  useEffect(() => { requestAnimationFrame(() => box.current?.scrollTo(0, 0)); }, []);
  return (
    <div className="start-veil">
      <section ref={box} className="start" role="dialog" aria-modal="true" aria-labelledby="start-title">
        <h1 id="start-title">The map fills in most of it <em>for you.</em></h1>
        <p className="start-lead">Pick your building. We read its roof, sun and shade, so you type less and your offer is closer.</p>

        <ol className="start-promises">{PROMISES.map(([big, small]) => <li key={big}><b>{big}</b><span>{small}</span></li>)}</ol>

        <div className="start-go">
          <Button variant="solid" size="lg" wide autoFocus onClick={() => onChoose("map")}>Find my home on the map</Button>
          <button type="button" className="textlink start-form" onClick={() => onChoose("form")}>Only answer questions, without the map</button>
        </div>
        <p className="start-src">Bayerische Vermessungsverwaltung · Landesamt für Denkmalpflege · Landeshauptstadt München · Destatis · EU JRC PVGIS · Photon (komoot, Germany) · OpenFreeMap, © OpenStreetMap contributors</p>
      </section>
    </div>
  );
}
