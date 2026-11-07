import { ReactNode, useEffect, useRef, useState } from "react";
import { Building, Place, Poly, Real, RealAnswer, Site, SiteSurface, Sun, buildingFacts, placeAt, realBuilding, searchPlace, sunFor, usedSurfaces } from "./api";
import HomeMap, { Picked } from "./HomeMap";
import { Close, Down, Pen, Photo, Search, Turn, Up } from "./icons";
import { Face, P2, P3, area, centre, flatFace, groundFace, inside, measuredFace, pitchedFaces, plainShape, toLocal } from "./geometry";

const MIN_ROOF_FACE_M2 = 6, MAX_ROOF_FACES = 6, MAX_ROOF_TILT = 70; // dormers and fragments are drawn, not offered
const DEFAULT_TILT = 35; // common German pitched roof; an assumption
const SHADE_DEG = 15, SHADE_REACH_M = 60;
const MONTHS = "JFMAMJJASOND".split("");
const key = (s: { tilt: number; azimuth: number }) => `${Math.round(s.tilt)}|${Math.round(s.azimuth)}`;

function surfacesOf(b: Building, old: SiteSurface[]): SiteSurface[] {
  const faces: Face[] = b.real ? b.real.faces : b.roof === "flat" ? [flatFace(b.ring, b.eave, b.holes)] : pitchedFaces(b.ring, b.eave, b.tilt, b.flip);
  const label = b.main ? "Roof" : "Other building";
  const sides = new Map<string, number>();
  return faces.map((f, i) => {
    const id = `${b.id}-${i}`;
    const before = old.find((s) => s.id === id);
    const same = before && key(before) === key(f);
    const n = (sides.get(f.side) ?? 0) + 1;
    sides.set(f.side, n);
    const flat = f.side === "flat" || (!b.real && b.roof === "flat");
    return { ...f, id, owner: b.id, kind: b.main ? "roof" : "carport", wanted: before?.wanted ?? true, sun: same ? before.sun : null,
      name: `${label}, ${flat ? "flat" : `${f.side} side`}${n > 1 ? ` ${n}` : ""}` };
  });
}

/** Bavaria's measured building in the site's metres. Big roof polygons become surfaces, the rest is only drawn. */
function toReal(answer: NonNullable<RealAnswer>, origin: P2, footprint: P2[]): Real {
  const here = (r: P3[]) => r.map((p) => [...toLocal(origin, [p[0], p[1]]), p[2]] as P3);
  const polys = (list: { ring: P3[]; holes: P3[][] }[]): Poly[] => list.map((p) => ({ ring: here(p.ring), holes: p.holes.map(here) }));
  const roofs = polys(answer.main.roofs).map((p) => ({ p, f: measuredFace(p.ring, p.holes) }));
  const good = roofs.filter((r) => r.f.m2 >= MIN_ROOF_FACE_M2 && r.f.tilt <= MAX_ROOF_TILT && r.f.panels.length > 0).sort((a, b) => b.f.m2 - a.f.m2).slice(0, MAX_ROOF_FACES);
  // Houses the map drew as one block with this one: they keep their place, as measured.
  const inBlock = answer.near.filter((b) => { const c = here(b.ground[0].ring).map((p) => [p[0], p[1]] as P2); return inside(centre(c), footprint) || c.filter((p) => inside(p, footprint)).length * 2 >= c.length; });
  const flat = (b: NonNullable<RealAnswer>["main"]) => b.ground.map((g) => here(g.ring).map((p) => [p[0], p[1]] as P2));
  return { ground: [...flat(answer.main), ...inBlock.flatMap(flat)], faces: good.map((r) => r.f), rest: roofs.filter((r) => !good.includes(r)).map((r) => r.p), walls: polys(answer.main.walls),
    others: inBlock.flatMap((b) => [...polys(b.roofs), ...polys(b.walls)]) };
}

function shadeNote(b: Building, origin: P2, near: Picked["neighbours"]) {
  const mid = centre(b.ring);
  for (const n of near) {
    const p = toLocal(origin, n.at), dx = p[0] - mid[0], dy = p[1] - mid[1], dist = Math.hypot(dx, dy);
    const dir = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    const rise = Math.atan2(n.height - b.eave, dist) * 180 / Math.PI;
    if (dist < SHADE_REACH_M && dir > 110 && dir < 250 && rise > SHADE_DEG) return `A taller building about ${Math.round(dist)} m to the south may shade this home.`;
  }
  return null;
}

function SunBars({ sun }: { sun: Sun }) {
  const top = Math.max(...sun.monthly);
  return (
    <div className="sunbars" role="img" aria-label={`Monthly output per kW of panels, from ${Math.min(...sun.monthly)} to ${top} kWh`}>
      {sun.monthly.map((v, i) => (
        <div key={i} title={`${new Date(2026, i).toLocaleString("en", { month: "long" })}: ${v} kWh per kW of panels`}>
          <i style={{ height: `${(v / top) * 100}%` }} /><span>{MONTHS[i]}</span>
        </div>
      ))}
    </div>
  );
}

type Props = { site: Site | null; setSite: (f: (s: Site | null) => Site | null) => void; placed: number[] | null; note?: ReactNode; children?: ReactNode };

export default function SitePicker({ site, setSite, placed, note, children }: Props) {
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [place, setPlace] = useState<Place | null>(site?.place ?? null);
  const [target, setTarget] = useState<P2 | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const picked = useRef("");
  const [error, setError] = useState("");
  const [aerial, setAerial] = useState(false);
  const [draft, setDraft] = useState<P2[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [measuring, setMeasuring] = useState(false);

  // Suggestions as you type. A slow answer to an older text never replaces a newer one.
  const asked = useRef("");
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

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setPlaces(null);
    if (!places?.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((active + 1) % places.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((active - 1 + places.length) % places.length); }
    if (e.key === "Enter") { e.preventDefault(); choose(places[active]); }
  };
  const choose = (p: Place) => { picked.current = p.label; setQ(p.label); setPlace(p); setTarget([p.lon, p.lat]); setPlaces(null); setAerial(false); setSite(() => null); };

  /** Adds sun figures to surfaces that lack them, then ranks by sun until the homeowner reorders. */
  const loadSun = (s: Site) => {
    const missing = s.surfaces.filter((x) => !x.sun);
    if (!missing.length) return;
    const unique = [...new Map(missing.map((x) => [key(x), x])).values()];
    sunFor(s.place.lat, s.place.lon, unique.map((x) => ({ tilt: x.tilt, azimuth: x.azimuth }))).then((res) => {
      const byKey = new Map(unique.map((x, i) => [key(x), res[i]]));
      setSite((now) => {
        if (!now) return now;
        const surfaces = now.surfaces.map((x) => (x.sun ? x : { ...x, sun: byKey.get(key(x)) ?? null }));
        // Roofs come before the garden by default: ground systems take space and need permits.
        if (!now.sorted) surfaces.sort((a, b) => Number(a.kind === "ground") - Number(b.kind === "ground") || (b.sun?.kwh_per_kwp ?? 0) - (a.sun?.kwh_per_kwp ?? 0));
        return { ...now, surfaces };
      });
    }).catch(() => setError("Sun data is not reachable right now. We use a typical value for now."));
  };

  const change = (next: Site) => { setSite(() => next); loadSun(next); };

  const addBuilding = (hit: Picked) => {
    // A click works without a search: the address follows from the point.
    const here = place ?? { label: "Your home", lat: hit.at[1], lon: hit.at[0], country: "Germany", bavaria: false };
    if (!place) {
      setPlace(here);
      placeAt(here.lat, here.lon).then((p) => { setPlace(p); setSite((now) => now && { ...now, place: p }); const short = p.label.split(", ").slice(0, 3).join(", "); picked.current = short; setQ(short); }).catch(() => undefined);
    }
    const origin = site?.origin ?? centre(hit.ring);
    const ring = hit.ring.map((p) => toLocal(origin, p));
    if (site?.buildings.some((b) => b.homeIds.some((id) => hit.ids.includes(id)))) { setAdding(false); return; }
    const main = !site?.buildings.length;
    const b: Building = { id: crypto.randomUUID(), ring, holes: hit.holes.map((h) => h.map((p) => toLocal(origin, p))), eave: hit.height, roof: plainShape(ring) ? "pitched" : "flat", tilt: DEFAULT_TILT, flip: false, source: "Assumed", main, homeIds: hit.ids };
    const base: Site = site ?? { place: here, origin, buildings: [], surfaces: [], noGarden: false, shade: null, trees: null, sorted: false };
    setAdding(false);
    change({ ...base, buildings: [...base.buildings, b], surfaces: [...base.surfaces, ...surfacesOf(b, [])], shade: main ? shadeNote(b, origin, hit.neighbours) : base.shade });
    // Bavaria publishes every building measured, roof included. Elsewhere the guess above stands.
    const mid = centre(hit.ring), reach = Math.max(...ring.map((p) => Math.hypot(p[0] - centre(ring)[0], p[1] - centre(ring)[1])));
    setMeasuring(true);
    realBuilding(mid[1], mid[0], reach).then((answer) => {
      if (answer) setSite((now) => {
        if (!now?.buildings.some((x) => x.id === b.id)) return now;
        const buildings = now.buildings.map((x) => (x.id === b.id ? { ...x, real: toReal(answer, now.origin, ring), source: "Measured" } : x));
        const next = { ...now, buildings, surfaces: rebuilt({ ...now, surfaces: now.surfaces.filter((x) => x.owner !== b.id) }, buildings) };
        loadSun(next);
        return next;
      });
      else if (main) buildingFacts(mid[1], mid[0]).then((f) => {
        setSite((now) => {
          if (!now) return now;
          const known = f.roof ? now.buildings.map((x) => (x.id === b.id && x.source === "Assumed" && (f.roof === "flat" || plainShape(x.ring)) ? { ...x, roof: f.roof as Building["roof"], tilt: f.tilt ?? x.tilt, source: "OpenStreetMap" } : x)) : now.buildings;
          const next = { ...now, trees: f.trees, buildings: known, surfaces: f.roof ? rebuilt(now, known) : now.surfaces };
          loadSun(next);
          return next;
        });
      }).catch(() => undefined);
    }).catch(() => undefined).finally(() => setMeasuring(false));
  };

  const rebuilt = (s: Site, buildings: Building[]) => {
    const fresh = buildings.flatMap((b) => surfacesOf(b, s.surfaces));
    const keep = s.surfaces.filter((x) => x.kind === "ground");
    const order = s.surfaces.map((x) => x.id);
    return [...fresh, ...keep].sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
  };
  const editBuilding = (id: string, patch: Partial<Building>) => {
    if (!site) return;
    const buildings = site.buildings.map((b) => (b.id === id ? { ...b, ...patch, source: "You" } : b));
    change({ ...site, buildings, surfaces: rebuilt(site, buildings) });
  };
  const finishGarden = () => {
    if (!site || !draft || draft.length < 3) { setDraft(null); return; }
    const ring = draft.map((p) => toLocal(site.origin, p));
    const s: SiteSurface = { ...groundFace(ring), id: crypto.randomUUID(), owner: "garden", kind: "ground", name: "Garden", wanted: true, sun: null };
    setDraft(null);
    change({ ...site, surfaces: [...site.surfaces, s] });
  };
  const move = (i: number, by: number) => {
    if (!site) return;
    const list = [...site.surfaces], [x] = list.splice(i, 1);
    list.splice(i + by, 0, x);
    setSite(() => ({ ...site, surfaces: list, sorted: true }));
  };
  const patch = (id: string, p: Partial<SiteSurface>) => site && setSite(() => ({ ...site, surfaces: site.surfaces.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const remove = (s: SiteSurface) => site && setSite(() => ({ ...site, surfaces: site.surfaces.filter((x) => x.owner === "garden" ? x.id !== s.id : x.owner !== s.owner), buildings: site.buildings.filter((b) => b.id !== s.owner) }));

  const best = site?.surfaces.reduce<Sun | null>((a, x) => (x.sun && (!a || x.sun.kwh_per_kwp > a.kwh_per_kwp) ? x.sun : a), null) ?? null;
  const main = site?.buildings.find((b) => b.main);

  return (
    <main className="stage">
      <HomeMap locate={!site} site={site} placed={placed} focus={target} aerial={aerial} draft={draft ?? []} drawing={draft !== null}
        onBuilding={!site || adding ? addBuilding : undefined} onPoint={(p) => setDraft((d) => [...(d ?? []), p])} />
      {place?.bavaria && <button type="button" className="mapbtn" aria-pressed={aerial} onClick={() => setAerial(!aerial)}><Photo />{aerial ? "Map" : "Aerial photo"}</button>}
      {adding && <div className="maphint"><span>Click the garage or shed</span><button type="button" className="ghost" onClick={() => setAdding(false)}>Cancel</button></div>}
      {draft !== null && <div className="maphint"><span>Click the corners of the area</span>{draft.length >= 3 && <button type="button" className="primary small" onClick={finishGarden}>Done</button>}<button type="button" className="ghost" onClick={() => setDraft(null)}>Cancel</button></div>}
      {note && draft === null && !adding && <div className="mapnote">{note}</div>}

      <div className="finder">
        <div className="field-pill">
          <Search size={18} />
          <input id="where" role="combobox" aria-expanded={!!places?.length} aria-controls="places" aria-label="Where is your home?" autoComplete="off"
            value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={keys} placeholder="Find your home" />
          {q && <button type="button" className="round" aria-label="Clear" onClick={() => { setQ(""); setPlaces(null); }}><Close size={14} /></button>}
        </div>
        {(places || error) && <div className="suggest" id="places" role="listbox">
          {error && <p className="error">{error}</p>}
          {places?.length === 0 && !busy && <p className="muted">Nothing found. Try street, house number and town.</p>}
          {places?.map((p, i) => {
            const [name, ...rest] = p.label.split(", ");
            return <button type="button" key={p.label} role="option" aria-selected={i === active} className={i === active ? "on" : ""} onMouseEnter={() => setActive(i)} onClick={() => choose(p)}><b>{name}</b><small>{rest.slice(0, 3).join(", ")}</small></button>;
          })}
        </div>}
      </div>

      {(site || children) && <aside className="panel">
        {best && <section>
          <h2>Sun at your home</h2>
          <p className="bignum">{best.sun_kwh_m2.toLocaleString("en")}<small>kWh of sunlight per m² a year</small></p>
          <SunBars sun={best} />
          <p className="small muted">Best surface: about {best.kwh_per_kwp.toLocaleString("en")} kWh a year per kW of panels. Source: PVGIS, including hills on the horizon.</p>
          {site?.shade && <p className="small warn">{site.shade}</p>}
          {!!site?.trees && <p className="small warn">{site.trees} mapped {site.trees === 1 ? "tree" : "trees"} close by may cast shade.</p>}
        </section>}

        {main && site && <section>
          <h2>Your roof</h2>
          {main.real ? <p>Measured roof, from Bavaria's 3D building data.</p> : <>
            {measuring && <p className="small muted">Looking for the measured roof…</p>}
            <div className="switch" role="group" aria-label="Roof type">
              {(["pitched", "flat"] as const).map((r) => <button key={r} type="button" disabled={r === "pitched" && !plainShape(main.ring)} className={main.roof === r ? "on" : ""} aria-pressed={main.roof === r} onClick={() => editBuilding(main.id, { roof: r })}>{r === "flat" ? "Flat" : "Sloped"}</button>)}
            </div>
            {main.roof === "pitched" && <>
              <label className="field range"><span>Slope <b>{main.tilt}°</b></span><input type="range" min={15} max={55} step={5} value={main.tilt} onChange={(e) => editBuilding(main.id, { tilt: Number(e.target.value) })} /></label>
              <button type="button" className="ghost" onClick={() => editBuilding(main.id, { flip: !main.flip })}><Turn size={14} />Turn the roof ridge</button>
            </>}
            <p className="small muted">{main.source === "OpenStreetMap" ? "From OpenStreetMap." : main.source === "You" ? "Set by you." : "Our guess from the building shape. Please correct it."}</p>
          </>}
          <button type="button" className="ghost" onClick={() => setSite(() => null)}>This is not my house</button>
        </section>}

        {site && <section>
          <h2>Where may panels go?</h2>
          <p className="small muted">Number 1 fills first. If it is full, the next one is used.</p>
          <ol className="surfaces">
            {site.surfaces.map((s, i) => (
              <li key={s.id} className={s.wanted ? "" : "off"}>
                <span className="rank">{usedSurfaces(site).indexOf(s) + 1 || "–"}</span>
                <div><b>{s.name}</b><small>{s.panels.length} panels{s.sun ? ` · ${s.sun.kwh_per_kwp.toLocaleString("en")} kWh/kW` : ""}</small></div>
                <span className="tools">
                  <button type="button" className="round" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><Up size={14} /></button>
                  <button type="button" className="round" aria-label={`Move ${s.name} down`} disabled={i === site.surfaces.length - 1} onClick={() => move(i, 1)}><Down size={14} /></button>
                  <button type="button" className="ghost" onClick={() => patch(s.id, { wanted: !s.wanted })}>{s.wanted ? "Not here" : "Allow"}</button>
                  {(s.kind === "ground" || s.kind === "carport") && <button type="button" className="round" aria-label={`Remove ${s.name}`} onClick={() => remove(s)}><Close size={14} /></button>}
                </span>
              </li>
            ))}
          </ol>
          <button type="button" className="ghost" onClick={() => setAdding(true)}>Add a garage or shed</button>
          <label className="check"><input type="checkbox" checked={site.noGarden} onChange={(e) => setSite(() => ({ ...site, noGarden: e.target.checked, surfaces: e.target.checked ? site.surfaces.filter((x) => x.kind !== "ground") : site.surfaces }))} />No panels in my garden</label>
          {!site.noGarden && <button type="button" className="ghost" onClick={() => setDraft([])}><Pen size={14} />Draw a garden area</button>}
        </section>}

        {children}
      </aside>}
    </main>
  );
}
