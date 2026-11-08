// What leaves this browser when the homeowner presses Send, as a plain list.
// The list says what stays behind too, so switching something off visibly moves it there.
import type { Handoff } from "./plan";
import { m2Words } from "./share";
import "./share.css";

type Row = [string, string];

/** The home-related part of a request, row by row: what goes, and what the homeowner kept. */
function placeRows(full: Handoff, out: Handoff, markedM2: number): { sent: Row[]; kept: Row[] } {
  const sent: Row[] = [], kept: Row[] = [];
  const home = out.buildings.length > 0, hadHome = full.buildings.length > 0;
  const put = (has: boolean, had: boolean, row: Row) => (has ? sent.push(row) : had && kept.push(row));
  put(home, hadHome, ["Address", full.buildings[0]?.label ?? "Your home"]);
  put(home, hadHome, ["Building shape", `${full.buildings.length} measured ${full.buildings.length === 1 ? "part" : "parts"}, from Bavaria's open building models`]);
  const drew = Object.keys(full.choice.cells).length > 0;
  if (drew) put(Object.keys(out.choice.cells).length > 0, true, ["Areas you marked", `${Math.round(markedM2)} m² of roof`]);
  // Nothing drawn means the whole roof counts: say so, rather than leave the line out.
  else put(home, hadHome, ["Areas you marked", `Whole roof, ${Math.round(markedM2)} m². Nothing marked`]);
  put(!!out.answers.area, !!full.answers.area, ["Area around the home", "Census 2022: how old homes nearby are and how they heat"]);
  put(!!out.answers.address, !!full.answers.address, ["Address", full.answers.address ?? ""]);
  const roof = full.roof;
  if (roof && !hadHome) put(!!out.roof, true, ["Roof", `${m2Words(roof.m2)} · ${roof.facing === "flat" ? "flat" : roof.facing === "unknown" ? "direction not known" : `facing ${roof.facing}, about ${roof.tilt}°`}${roof.told ? ", as you described it" : ""}`]);
  if (roof && hadHome && !home) put(!!out.roof, true, ["Roof numbers", `${m2Words(roof.m2)} · ${roof.facing === "flat" ? "flat" : `facing ${roof.facing}, ${roof.tilt}°`}, rounded`]);
  put(!!out.answers.meter_photo, !!full.answers.meter_photo, ["Meter cabinet", "1 photo"]);
  return { sent, kept };
}

export default function SendView({ full, out, answers, markedM2 }: { full: Handoff; out: Handoff; answers: Row[]; markedM2: number }) {
  const { sent, kept } = placeRows(full, out, markedM2);
  return (
    <section className="sendview" aria-label="What leaves this browser">
      <header>
        <h2>What leaves this browser</h2>
      </header>
      <dl className="sv-list">
        {sent.map(([k, v]) => <div key={k + v}><dt>{k}</dt><dd>{v}</dd></div>)}
        {answers.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {kept.length > 0 && <>
        <h3>Stays with you</h3>
        <dl className="sv-list sv-kept">{kept.map(([k, v]) => <div key={k + v}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      </>}
    </section>
  );
}
