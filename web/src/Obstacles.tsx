// The planner's look at the roof photo: found obstacles, each kept or switched off, and what that does to the modules.
import { useState } from "react";
import { KIND, Look, Obstacle, findObstacles } from "./roofObstacles";
import type { Selected } from "./api";
import { Button, Check } from "./ui";

type Props = { buildings: Selected[]; obstacles?: Obstacle[]; set: (o: Obstacle[], label: string) => void; hover?: (i: number | null) => void; auto?: string };

export default function Obstacles({ buildings, obstacles, set, hover, auto }: Props) {
  const [busy, setBusy] = useState(false), [said, setSaid] = useState("");
  const look = () => {
    setBusy(true); setSaid("");
    findObstacles(buildings).then((x: Look) => {
      if (x.source === "unavailable" || x.source === "failed") { setSaid(x.source === "unavailable" ? "The photo check is not set up on this server." : "The photo could not be checked just now. Try again."); return; }
      set(x.obstacles, x.obstacles.length ? `${x.obstacles.length} obstacles found on the photo` : "Photo checked: roof clear");
    }).catch(() => setSaid("The photo could not be checked just now. Try again.")).finally(() => setBusy(false));
  };
  const kept = (obstacles ?? []).filter((o) => o.on).length;
  return <section className="obstacles" aria-label="Obstacles on the roof">
    {!obstacles && auto === "looking" && !busy ? <p className="small muted"><span className="spinner" aria-hidden="true" />Looking for chimneys and roof windows on the aerial photo. The offer waits for it.</p>
    : !obstacles ? <>
      <p className="small muted">{auto === "failed" ? "The photo could not be checked by itself. Modules may sit on roof windows or chimneys until you check it." : auto === "off" ? "The photo check is not set up on this server, so roof windows and chimneys are not known. Look at the photo before you trust the layout." : "Chimneys, roof windows and vents are not in the 3D model. A vision model can look for them on the aerial photo; you confirm each one, and no module goes where you keep one."}</p>
      <Button onClick={look} disabled={busy}>{busy ? <><span className="spinner" aria-hidden="true" />Looking at the photo…</> : "Find obstacles on the photo"}</Button>
    </> : <>
      <p className="small muted">{obstacles.length ? `${obstacles.length} found on the photo, ${kept} kept. Modules keep 30 cm clear of each kept one. Switch off what is wrong.` : "Nothing found on the roofs. Still check the photo before you trust the layout."}</p>
      {obstacles.length > 0 && <ul className="tasks">{obstacles.map((o, i) => <li key={i} onMouseEnter={() => hover?.(i)} onMouseLeave={() => hover?.(null)}>
        <Check checked={o.on} onChange={(v) => set(obstacles.map((x, k) => (k === i ? { ...x, on: v } : x)), `${KIND[o.kind]} ${v ? "kept" : "switched off"}`)}>
          <b>{KIND[o.kind]}<em className={`sure ${o.sure}`}>{o.sure === "high" ? "clear" : o.sure === "medium" ? "likely" : "unsure"}</em></b><small>{o.note}</small>
        </Check>
      </li>)}</ul>}
      <button type="button" className="textlink" onClick={look} disabled={busy}>{busy ? "Looking again…" : "Look again"}</button>
    </>}
    {said && <p className="small error">{said}</p>}
  </section>;
}
