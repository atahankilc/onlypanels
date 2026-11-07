import { useEffect, useRef, useState } from "react";
import { Place, Poly, Real, RealAnswer, Selected, placeAt, realBuilding, searchPlace } from "./api";
import { P2, P3, centre, inside, toLocal } from "./geometry";
import HomeMap, { Picked } from "./HomeMap";
import { Close, Photo, Search } from "./icons";
import { Button, IconButton } from "./ui";

/** Bavaria's measured building in the home's metres, with the houses the map drew as one block with it. */
function toReal(answer: NonNullable<RealAnswer>, origin: P2, footprint: P2[]): Real {
  const here = (r: P3[]) => r.map((p) => [...toLocal(origin, [p[0], p[1]]), p[2]] as P3);
  const polys = (list: Poly[]): Poly[] => list.map((p) => ({ ring: here(p.ring), holes: p.holes.map(here) }));
  const flat = (b: NonNullable<RealAnswer>["main"]) => b.ground.map((g) => here(g.ring).map((p) => [p[0], p[1]] as P2));
  const inBlock = answer.near.filter((b) => { const c = flat(b)[0]; return inside(centre(c), footprint) || c.filter((p) => inside(p, footprint)).length * 2 >= c.length; });
  return { ground: [...flat(answer.main), ...inBlock.flatMap(flat)], roofs: polys(answer.main.roofs), walls: polys(answer.main.walls), others: inBlock.flatMap((b) => [...polys(b.roofs), ...polys(b.walls)]) };
}

export default function FindHome() {
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<{ at: P2; place: Place } | null>(null);
  const [home, setHome] = useState<Selected | null>(null);
  const [aerial, setAerial] = useState(false);
  const picked = useRef("");
  const asked = useRef("");

  // Suggestions as you type. A slow answer to an older text never replaces a newer one.
  useEffect(() => {
    const text = q.trim();
    asked.current = text;
    if (text.length < 3 || text === picked.current) { setPlaces(null); return; }
    const timer = setTimeout(() => {
      setBusy(true);
      searchPlace(text)
        .then((found) => { if (asked.current === text) { setPlaces(found); setActive(0); setError(""); } })
        .catch(() => { if (asked.current === text) setError("Address search is not reachable right now."); })
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const show = (text: string) => { picked.current = text; setQ(text); };
  const choose = (p: Place) => { show(p.label); setPlaces(null); setHome(null); setTarget({ at: [p.lon, p.lat], place: p }); };
  /** Back to picking: the next click or search starts fresh. */
  const close = () => { show(""); setPlaces(null); setTarget(null); setError(""); setHome(null); };

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setPlaces(null);
    if (!places?.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((active + 1) % places.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((active - 1 + places.length) % places.length); }
    if (e.key === "Enter") { e.preventDefault(); choose(places[active]); }
  };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && home) close(); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [home]);

  const pick = (hit: Picked) => {
    const origin = centre(hit.ring), ring = hit.ring.map((p) => toLocal(origin, p));
    const known = target?.place;
    const place = known ?? { label: "Selected building", lat: origin[1], lon: origin[0] };
    setHome({ place, origin, homeIds: hit.ids, ring, real: null, measuring: true });
    if (!known) placeAt(origin[1], origin[0]).then((p) => { setHome((now) => now && { ...now, place: p }); show(p.label.split(", ").slice(0, 3).join(", ")); }).catch(() => undefined);
    const reach = Math.max(...ring.map((p) => Math.hypot(p[0], p[1])));
    realBuilding(origin[1], origin[0], reach)
      .then((answer) => setHome((now) => (now?.origin === origin ? { ...now, measuring: false, real: answer ? toReal(answer, origin, ring) : null } : now)))
      .catch(() => setHome((now) => (now?.origin === origin ? { ...now, measuring: false } : now)));
  };

  return (
    <main className="stage">
      <HomeMap home={home} focus={target?.at ?? null} aerial={aerial} onPick={home ? undefined : pick} />
      <Button variant="glass" size="lg" className="map-aerial" aria-pressed={aerial} onClick={() => setAerial(!aerial)}><Photo />{aerial ? "Map" : "Aerial photo"}</Button>
      {!home && <div className="mapnote">Click your house on the map, or search for it</div>}

      <div className="finder">
        <div className="field-pill">
          <Search />
          <input id="where" role="combobox" aria-expanded={!!places?.length} aria-controls="places" aria-label="Where is your home?" autoComplete="off"
            value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={keys} placeholder="Find your home in Munich" />
          {q && <IconButton label="Clear" onClick={close}><Close /></IconButton>}
        </div>
        {(places || error) && <div className="suggest" id="places" role="listbox">
          {error && <p className="error">{error}</p>}
          {places?.length === 0 && !busy && <p className="muted">Nothing found in the Munich area.</p>}
          {places?.map((p, i) => {
            const [name, ...rest] = p.label.split(", ");
            return <button type="button" key={p.label} role="option" aria-selected={i === active} className={i === active ? "on" : ""} onMouseEnter={() => setActive(i)} onClick={() => choose(p)}><b>{name}</b><small>{rest.slice(0, 3).join(", ")}</small></button>;
          })}
        </div>}
      </div>

      {home && <aside className="panel">
        <header className="panelbar"><b>{home.place.label.split(", ").slice(0, 2).join(", ")}</b><IconButton label="Close this building" onClick={close}><Close /></IconButton></header>
        <p className="panelline muted">{home.measuring ? "Looking for the measured roof…" : home.real ? "Measured roof, from Bavaria's 3D building data." : "No measured model found for this building."}</p>
      </aside>}
    </main>
  );
}
