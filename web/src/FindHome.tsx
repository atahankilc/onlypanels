import { useEffect, useRef, useState } from "react";
import { Place, Poly, Real, Selected, View, measured, placeAt, searchPlace, suggested, sunOf } from "./api";
import { P2, P3, toLocal } from "./geometry";
import HomeMap, { Face, Picked, Step, letter } from "./HomeMap";
import { Close, Photo, Search } from "./icons";
import Review from "./Review";
import { Button, IconButton } from "./ui";

const short = (label: string) => label.split(", ").slice(0, 2).join(", ");

function toReal(answer: Awaited<ReturnType<typeof measured>>, origin: P2): Real {
  const here = (r: P3[]) => r.map((p) => [...toLocal(origin, [p[0], p[1]]), p[2]] as P3);
  const polys = (list: Poly[]): Poly[] => list.map((p) => ({ ring: here(p.ring), holes: p.holes.map(here) }));
  return { roofs: polys(answer.roofs), walls: polys(answer.walls) };
}

export default function FindHome() {
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<P2 | null>(null);
  const [buildings, setBuildings] = useState<Selected[]>([]);
  const [step, setStep] = useState<Step>("pick");
  const [waiting, setWaiting] = useState(false);
  const [aerial, setAerial] = useState(false);
  const [open, setOpen] = useState<string | null>(null); // the building shown in detail
  const [near, setNear] = useState<string | null>(null); // the building under the pointer in the list
  const [face, setFace] = useState<Face | null>(null); // the roof surface under the pointer, on the map or in the list
  const [look, setLook] = useState<{ id: string } | null>(null);
  const [view, setView] = useState<View>({ layer: "photo", moment: null });
  const [picks, setPicks] = useState<string[] | null>(null); // null: our suggestion, until the user changes something
  const typed = useRef("");
  const asked = useRef("");

  // Suggestions as you type. A slow answer to an older text never replaces a newer one.
  useEffect(() => {
    const text = q.trim();
    asked.current = text;
    if (text.length < 3 || text === typed.current) { setPlaces(null); return; }
    const timer = setTimeout(() => {
      setBusy(true);
      searchPlace(text)
        .then((found) => { if (asked.current === text) { setPlaces(found); setActive(0); setError(""); } })
        .catch(() => { if (asked.current === text) setError("Address search is not reachable right now."); })
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const show = (text: string) => { typed.current = text; setQ(text); };
  /** Search only takes you there. Which buildings count is the user's choice. */
  const choose = (p: Place) => { show(p.label); setPlaces(null); setFocus([p.lon, p.lat]); };
  const clear = () => { show(""); setPlaces(null); setError(""); setFocus(null); };

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setPlaces(null);
    if (!places?.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((active + 1) % places.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((active - 1 + places.length) % places.length); }
    if (e.key === "Enter") { e.preventDefault(); choose(places[active]); }
  };

  const patch = (id: string, change: Partial<Selected>) => setBuildings((list) => list.map((b) => (b.id === id ? { ...b, ...change } : b)));
  // The row under the pointer goes with it and never reports the pointer leaving, so its highlight is cleared here.
  const remove = (id: string) => { setNear(null); setBuildings((list) => list.filter((b) => b.id !== id)); };
  const chosen = picks ?? suggested(buildings);
  const toggleSurface = (key: string) => setPicks(chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key]);

  /** A click selects a building, a second click lets it go. Its roof loads quietly for the next step. */
  const toggle = (hit: Picked) => {
    if (buildings.some((b) => b.id === hit.id)) { remove(hit.id); return; }
    const { id, square, at: origin } = hit;
    setBuildings((list) => [...list, { id, square, label: "Building", origin, real: null, measuring: true }]);
    placeAt(origin[1], origin[0]).then((p) => patch(id, { label: short(p.label) })).catch(() => undefined);
    measured(square, id).then((m) => patch(id, { measuring: false, real: toReal(m, origin) })).catch(() => patch(id, { measuring: false }));
  };

  // Move on as soon as the measured models are in.
  const measuring = buildings.some((b) => b.measuring);
  useEffect(() => {
    if (!waiting || measuring) return;
    setWaiting(false); setOpen(buildings[0]?.id ?? null); setStep("review");
    // Sun data starts here: it needs the exact surfaces.
    buildings.filter((b) => b.sun === undefined).forEach((b) => sunOf(b.square, b.id).then((sun) => patch(b.id, { sun })).catch(() => patch(b.id, { sun: null })));
  }, [waiting, measuring]);
  const goTo = (id: string) => { setOpen(id); setLook({ id }); };

  return (
    <main className="stage">
      <HomeMap buildings={buildings} step={step} focus={focus} aerial={aerial} onPick={step === "pick" ? toggle : undefined}
        open={open} near={near} face={face} look={look} onFace={setFace} onOpen={goTo} view={view} chosen={step === "review" ? chosen : []} onToggle={toggleSurface} />
      {step === "pick" && <Button variant="glass" size="lg" className="map-aerial" aria-pressed={aerial} onClick={() => setAerial(!aerial)}><Photo />{aerial ? "Map" : "Aerial photo"}</Button>}
      {step === "pick" && !buildings.length && <div className="mapnote">Find your area, then click the buildings you want</div>}

      {step === "pick" && <div className="finder">
        <div className="field-pill">
          <Search />
          <input id="where" role="combobox" aria-expanded={!!places?.length} aria-controls="places" aria-label="Go to an address" autoComplete="off"
            value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={keys} placeholder="Go to an address in Munich" />
          {q && <IconButton label="Clear" onClick={clear}><Close /></IconButton>}
        </div>
        {(places || error) && <div className="suggest" id="places" role="listbox">
          {error && <p className="error">{error}</p>}
          {places?.length === 0 && !busy && <p className="muted">Nothing found in the Munich area.</p>}
          {places?.map((p, i) => {
            const [name, ...rest] = p.label.split(", ");
            return <button type="button" key={p.label} role="option" aria-selected={i === active} className={i === active ? "on" : ""} onMouseEnter={() => setActive(i)} onClick={() => choose(p)}><b>{name}</b><small>{rest.slice(0, 3).join(", ")}</small></button>;
          })}
        </div>}
      </div>}

      {step === "pick" && buildings.length > 0 && <aside className="panel">
        <h2>Selected buildings</h2>
        <ul className="picked">{buildings.map((b, i) => <li key={b.id} onMouseEnter={() => setNear(b.id)} onMouseLeave={() => setNear(null)}>
          <button type="button" className="row" onClick={() => goTo(b.id)}><span className="tag">{letter(i)}</span><span className="name">{b.label}</span></button>
          <IconButton label={`Remove ${b.label}`} onClick={() => remove(b.id)}><Close /></IconButton>
        </li>)}</ul>
        <div className="panelfoot"><Button variant="solid" size="lg" wide disabled={waiting} onClick={() => setWaiting(true)}>{waiting ? "Loading measured roofs…" : "Continue"}</Button></div>
      </aside>}

      {step === "review" && <Review buildings={buildings} goTo={goTo} face={face} setFace={setFace} view={view} setView={setView} chosen={chosen} toggle={toggleSurface} suggest={() => setPicks(null)} back={() => { setFace(null); setStep("pick"); }} />}
    </main>
  );
}
