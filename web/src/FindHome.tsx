import { useEffect, useRef, useState } from "react";
import { Answers, NO_ANSWERS, Place, Poly, Real, Selected, View, measured, placeAt, searchPlace, chosenKeys, homeParts, homesIn, NO_CHOICE, Choice, sunOf, areaAt, markedOf, markedM2, paintChoice, panelsOf, panelsM2 } from "./api";
import { P2, P3, toLocal } from "./geometry";
import { Handoff, Mine } from "./plan";
import Requests from "./Requests";
import HomeMap, { Face, Picked, Step, Tool, letter } from "./HomeMap";
import { Close, Photo, Search, Undo } from "./icons";
import Review, { Stage } from "./Review";
import SunView from "./SunView";
import { Button, IconButton } from "./ui";

const PHOTO: View = { layer: "photo", moment: null }; // every page but the roof page shows the photo
const short = (label: string) => label.split(", ").slice(0, 2).join(", ");

function toReal(answer: Awaited<ReturnType<typeof measured>>, origin: P2): Real {
  const here = (r: P3[]) => r.map((p) => [...toLocal(origin, [p[0], p[1]]), p[2]] as P3);
  const polys = (list: Poly[]): Poly[] => list.map((p) => ({ ring: here(p.ring), holes: p.holes.map(here) }));
  return { roofs: polys(answer.roofs), walls: polys(answer.walls) };
}

const newRef = () => `R-${Math.random().toString(36).slice(2, 7).toUpperCase()}`; // a reference the homeowner can quote

export default function FindHome({ dark, onSend, requests }: { dark: boolean; onSend: (h: Handoff) => void; requests: Mine[] }) {
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<P2 | null>(null);
  const [buildings, setBuildings] = useState<Selected[]>([]);
  const [step, setStep] = useState<Step>("pick");
  const [move, setMove] = useState<"in" | "out" | null>(null); // while the map's edge sweeps between the steps: see .curtain
  const [waiting, setWaiting] = useState(false);
  const [aerial, setAerial] = useState(false);
  const [open, setOpen] = useState<string | null>(null); // the building shown in detail
  const [near, setNear] = useState<string | null>(null); // the building under the pointer in the list
  const [face, setFace] = useState<Face | null>(null); // the roof surface under the pointer, on the map or in the list
  const [look, setLook] = useState<{ id: string } | null>(null);
  const [stage, setStage] = useState<Stage>("roof");
  const [view, setView] = useState<View>(PHOTO); // what the roof page paints on the surfaces: photo or sunlight
  const [ref, setRef] = useState(newRef);
  useEffect(() => { if (stage === "sent") onSend({ buildings, answers, choice, ref }); }, [stage]); // what the homeowner produced goes to the planner
  const [answers, setAnswers] = useState<Answers>(NO_ANSWERS);
  const [choice, setChoice] = useState<Choice>(NO_CHOICE);
  const [tool, setTool] = useState<Tool | null>(null); // no tool: the mouse moves the map
  const [undo, setUndo] = useState<Choice[]>([]); // one step per stroke
  const now = useRef(choice);
  now.current = choice;
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
  const remove = (home: string) => { setNear(null); setBuildings((list) => list.filter((b) => b.home !== home)); };
  const chosen = chosenKeys(buildings, choice);
  const marked = markedOf(buildings, choice), taken = panelsOf(buildings, choice);
  const drawn = stage === "solar" ? "panels" : "cells"; // the solar page draws where panels already are, the roof page the homeowner's priority
  const paint = (cells: Record<string, number[]>, on: boolean, start: boolean) => {
    if (start) setUndo((u) => [...u.slice(-40), now.current]);
    setChoice((c) => paintChoice(buildings, c, cells, on, drawn));
  };
  const startOver = () => { setUndo((u) => [...u, choice]); setChoice({ ...choice, [drawn]: {} }); };
  const stepBack = () => { const last = undo[undo.length - 1]; if (!last) return; setUndo(undo.slice(0, -1)); setChoice(last); };
  const drawing = stage === "roof" || (stage === "solar" && !!answers.has_solar);
  useEffect(() => setTool(null), [stage]); // each page starts with the mouse moving the map
  useEffect(() => { if (answers.has_solar === false && Object.keys(choice.panels).length) setChoice((c) => ({ ...c, panels: {} })); }, [answers.has_solar]); // no solar: no panels on the roof
  const retrySun = () => buildings.filter((b) => b.sun === null).forEach((b) => { patch(b.id, { sun: undefined }); sunOf(b.square, b.id).then((sun) => patch(b.id, { sun })).catch(() => patch(b.id, { sun: null })); });

  /** A click selects a building, a second click lets it go. Its roof loads quietly for the next step. */
  const toggle = (hit: Picked) => {
    if (buildings.some((b) => b.home === hit.home)) { remove(hit.home); return; }
    const { home, square } = hit;
    const addPart = (id: string, origin: P2) => {
      setBuildings((list) => (list.some((b) => b.id === id) ? list : [...list, { id, home, square, label: list.find((b) => b.home === home)?.label ?? "Building", origin, real: null, measuring: true }]));
      sunOf(square, id).then((sun) => patch(id, { sun })).catch(() => patch(id, { sun: null }));
      measured(square, id).then((m) => patch(id, { measuring: false, real: toReal(m, origin) })).catch(() => patch(id, { measuring: false }));
    };
    addPart(hit.id, hit.at);
    homeParts(square, home).then((parts) => parts.filter((p) => p.id !== hit.id).forEach((p) => addPart(p.id, p.at))).catch(() => undefined);
    placeAt(hit.at[1], hit.at[0]).then((p) => setBuildings((list) => list.map((b) => (b.home === home ? { ...b, label: short(p.label) } : b)))).catch(() => undefined);
  };

  // Move on as soon as the measured models are in.
  const measuring = buildings.some((b) => b.measuring || b.sun === undefined);
  useEffect(() => {
    if (!waiting || measuring) return;
    setWaiting(false); setOpen(buildings[0]?.home ?? null); setStep("review"); setMove("in");
    // The census around the home, as hints for the house and heating questions. Quietly skipped if it fails.
    const at = buildings[0]?.origin;
    if (at) areaAt(at[1], at[0]).then((area) => setAnswers((x) => ({ ...x, area }))).catch(() => undefined);
  }, [waiting, measuring]);
  const goTo = (id: string) => { setOpen(id); setLook({ id }); };

  /** After sending: back to the map, ready for another home. The request stays in the list with its progress. */
  const newRequest = () => {
    setFace(null); setStep("pick"); setMove("out"); setStage("roof"); setTool(null); setUndo([]);
    setBuildings([]); setAnswers(NO_ANSWERS); setChoice(NO_CHOICE); setRef(newRef());
  };

  return (
    <main className={`stage ${step}`}>
      <HomeMap dark={dark} buildings={buildings} step={step} focus={focus} aerial={aerial} onPick={step === "pick" ? toggle : undefined}
        open={open} near={near} face={face} look={look} onFace={setFace} onOpen={goTo} view={step === "review" && stage === "roof" ? view : PHOTO} chosen={step === "review" ? chosen : []} onToggle={() => undefined} editing={drawing && !!tool} installed={[]}
        marked={step === "review" ? marked : undefined} taken={step === "review" ? taken : undefined} editsOn={drawn === "panels" ? taken : marked} tool={drawing ? tool ?? undefined : undefined} onPaint={drawing ? paint : undefined} />
      {step === "review" && drawing && !move && <div className="tools">
        <Button variant="glass" size="lg" aria-pressed={tool === "surface"} onClick={() => setTool(tool === "surface" ? null : "surface")}>Whole surface</Button>
        <Button variant="glass" size="lg" aria-pressed={tool === "draw"} onClick={() => setTool(tool === "draw" ? null : "draw")}>Draw</Button>
        <IconButton variant="glass" size="lg" label="Undo" disabled={!undo.length} onClick={stepBack}><Undo /></IconButton>
      </div>}
      {step === "review" && stage === "roof" && !move && <SunView view={view} setView={setView} buildings={buildings} />}
      {step === "pick" && <Button variant="glass" size="lg" className="map-aerial" aria-pressed={aerial} onClick={() => setAerial(!aerial)}><Photo />{aerial ? "Map" : "Aerial photo"}</Button>}
      {step === "pick" && !buildings.length && requests.length > 0 && !move && <Requests list={requests} />}
      {step === "pick" && !buildings.length && <div className="mapnote">Find your area, then click the buildings you want</div>}

      {(step === "pick" || move === "in") && <Curtain move={move} done={() => setMove(null)}>
      <div className="finder">
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
      </div>

      {buildings.length > 0 && <aside className={move === "in" ? "panel gone" : "panel"}>
        <h2>Selected buildings</h2>
        <ul className="picked">{homesIn(buildings).map((b, i) => <li key={b.home} onMouseEnter={() => setNear(b.home)} onMouseLeave={() => setNear(null)}>
          <button type="button" className="row" onClick={() => goTo(b.home)}><span className="tag">{letter(i)}</span><span className="name">{b.label}</span></button>
          <IconButton label={`Remove ${b.label}`} onClick={() => remove(b.home)}><Close /></IconButton>
        </li>)}</ul>
        <div className="panelfoot"><Button variant="solid" size="lg" wide disabled={waiting} onClick={() => setWaiting(true)}>{waiting ? "Preparing your building…" : "Continue"}</Button></div>
      </aside>}
      </Curtain>}

      {(step === "review" || move === "out") && <div className={move === "out" ? "curtain new back" : "curtain new"} onAnimationEnd={(e) => e.target === e.currentTarget && setMove(null)}><Review refId={ref} done={newRequest} stage={stage} setStage={setStage} answers={answers} setAnswers={setAnswers} buildings={buildings} setFace={setFace} m2={markedM2(buildings, choice)} changed={Object.keys(choice.cells).length > 0} reset={startOver} panelM2={panelsM2(buildings, choice)} retrySun={retrySun} back={() => { setFace(null); setStep("pick"); setMove("out"); }} /></div>}
    </main>
  );
}

/** The picking controls: while the map's edge sweeps, inside the wrapper it wipes or uncovers; otherwise nothing extra around them. */
function Curtain({ move, done, children }: { move: "in" | "out" | null; done: () => void; children: React.ReactNode }) {
  if (!move) return <>{children}</>;
  return <div className={move === "out" ? "curtain old back" : "curtain old"} inert={move === "in"} onAnimationEnd={(e) => e.target === e.currentTarget && done()}>{children}</div>;
}
