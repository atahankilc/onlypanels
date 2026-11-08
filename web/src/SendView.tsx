// What leaves this browser when the homeowner presses Send: as a plain list, and as the very object that goes.
// The list says what stays behind too, so switching something off visibly moves it there.
import { useState } from "react";
import type { Handoff } from "./plan";
import { m2Words, readable } from "./share";
import { Segmented } from "./ui";
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

/** JSON with keys, strings and numbers told apart, for reading, not for copying. */
function colored(json: string) {
  const parts: React.ReactNode[] = [];
  const token = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = token.exec(json))) {
    parts.push(json.slice(last, m.index));
    const cls = m[1] ? (m[2] ? "k" : "s") : m[3] ? "b" : "n";
    parts.push(<span key={k++} className={`sv-${cls}`}>{m[1] ?? m[0]}</span>);
    if (m[2]) parts.push(m[2]);
    last = token.lastIndex;
  }
  parts.push(json.slice(last));
  return parts;
}

const sizeOf = (bytes: number) => (bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`);

export default function SendView({ full, out, answers, markedM2 }: { full: Handoff; out: Handoff; answers: Row[]; markedM2: number }) {
  const [as, setAs] = useState<"list" | "object">("list");
  const { sent, kept } = placeRows(full, out, markedM2);
  const text = JSON.stringify(out);
  const save = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `request-${out.ref ?? "draft"}.json` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="sendview" aria-label="What leaves this browser">
      <header>
        <h2>What leaves this browser</h2>
        <Segmented label="Show as" value={as} onChange={setAs} options={[{ value: "list", label: "List" }, { value: "object", label: "Object" }]} />
      </header>
      {as === "list" ? <>
        <dl className="sv-list">
          {sent.map(([k, v]) => <div key={k + v}><dt>{k}</dt><dd>{v}</dd></div>)}
          {answers.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        {kept.length > 0 && <>
          <h3>Stays with you</h3>
          <dl className="sv-list sv-kept">{kept.map(([k, v]) => <div key={k + v}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </>}
      </> : <>
        <pre className="sv-object">{colored(JSON.stringify(readable(out), null, 2))}</pre>
        <p className="sv-foot">Long lists are cut short here and open questions left out. The file has everything, {sizeOf(new Blob([text]).size)}. <button type="button" className="textlink" onClick={save}>Save it</button></p>
      </>}
    </section>
  );
}
