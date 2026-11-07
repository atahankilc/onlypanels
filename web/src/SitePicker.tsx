import { ReactNode, useState } from "react";
import { Building, Place, Site, SiteSurface, Sun, buildingFacts, placeAt, searchPlace, sunFor } from "./api";
import HomeMap, { Picked } from "./HomeMap";
import { Close, Down, Pen, Photo, Search, Turn, Up } from "./icons";
import { Face, P2, area, centre, flatFace, groundFace, inside, pitchedFaces, toLocal } from "./geometry";

const LARGE_M2 = 400; // assume a flat roof above this footprint until told otherwise
const DEFAULT_TILT = 35; // common German pitched roof; an assumption
const SHADE_DEG = 15, SHADE_REACH_M = 60;
const MONTHS = "JFMAMJJASOND".split("");
const key = (s: { tilt: number; azimuth: number }) => `${Math.round(s.tilt)}|${Math.round(s.azimuth)}`;

function surfacesOf(b: Building, old: SiteSurface[]): SiteSurface[] {
  const faces: Face[] = b.roof === "flat" ? [flatFace(b.ring, b.eave)] : pitchedFaces(b.ring, b.eave, b.tilt, b.flip);
  const label = b.main ? "Roof" : "Other building";
  return faces.map((f, i) => {
    const id = `${b.id}-${i}`;
    const before = old.find((s) => s.id === id);
    const same = before && key(before) === key(f);
    return { ...f, id, owner: b.id, kind: b.main ? "roof" : "carport", wanted: before?.wanted ?? true, sun: same ? before.sun : null,
      name: b.roof === "flat" ? `${label}, flat` : `${label}, ${f.side} side` };
  });
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
  const [error, setError] = useState("");
  const [aerial, setAerial] = useState(false);
  const [draft, setDraft] = useState<P2[] | null>(null);

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setError("");
    try {
      const found = await searchPlace(q);
      setPlaces(found);
      if (found.length === 1) choose(found[0]);
      if (!found.length) setError("Nothing found. Try street, house number and town.");
    } catch { setError("Address search is not reachable right now."); }
    setBusy(false);
  };
  const choose = (p: Place) => { setPlace(p); setTarget([p.lon, p.lat]); setPlaces(null); setAerial(false); setSite(() => null); };

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
      placeAt(here.lat, here.lon).then((p) => { setPlace(p); setSite((now) => now && { ...now, place: p }); setQ(p.label.split(", ").slice(0, 3).join(", ")); }).catch(() => undefined);
    }
    const origin = site?.origin ?? centre(hit.ring);
    const ring = hit.ring.map((p) => toLocal(origin, p));
    const clicked = site?.buildings.find((b) => inside(toLocal(origin, hit.at), b.ring));
    if (clicked) {
      // A second click takes an added building away again.
      if (!clicked.main && site) setSite(() => ({ ...site, buildings: site.buildings.filter((b) => b !== clicked), surfaces: site.surfaces.filter((x) => x.owner !== clicked.id) }));
      return;
    }
    const main = !site?.buildings.length;
    const b: Building = { id: crypto.randomUUID(), ring, eave: hit.height, roof: area(ring) > LARGE_M2 ? "flat" : "pitched", tilt: DEFAULT_TILT, flip: false, source: "Assumed", main };
    const base: Site = site ?? { place: here, origin, buildings: [], surfaces: [], noGarden: false, shade: null, trees: null, sorted: false };
    change({ ...base, buildings: [...base.buildings, b], surfaces: [...base.surfaces, ...surfacesOf(b, [])], shade: main ? shadeNote(b, origin, hit.neighbours) : base.shade });
    if (main) buildingFacts(hit.at[1], hit.at[0]).then((f) => {
      setSite((now) => {
        if (!now) return now;
        const known = f.roof ? now.buildings.map((x) => (x.id === b.id && x.source === "Assumed" ? { ...x, roof: f.roof as Building["roof"], tilt: f.tilt ?? x.tilt, source: "OpenStreetMap" } : x)) : now.buildings;
        const next = { ...now, trees: f.trees, buildings: known, surfaces: f.roof ? rebuilt(now, known) : now.surfaces };
        loadSun(next);
        return next;
      });
    }).catch(() => undefined);
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
  const remove = (s: SiteSurface) => site && setSite(() => ({ ...site, surfaces: site.surfaces.filter((x) => x.id !== s.id) }));

  const best = site?.surfaces.reduce<Sun | null>((a, x) => (x.sun && (!a || x.sun.kwh_per_kwp > a.kwh_per_kwp) ? x.sun : a), null) ?? null;
  const main = site?.buildings.find((b) => b.main);

  return (
    <main className="stage">
      <HomeMap locate={!site} site={site} placed={placed} focus={target} aerial={aerial} draft={draft ?? []} drawing={draft !== null}
        onBuilding={addBuilding} onPoint={(p) => setDraft((d) => [...(d ?? []), p])} />
      {place?.bavaria && <button type="button" className="mapbtn" aria-pressed={aerial} onClick={() => setAerial(!aerial)}><Photo />{aerial ? "Map" : "Aerial photo"}</button>}
      {draft !== null && <div className="maphint"><span>Click the corners of the area</span>{draft.length >= 3 && <button type="button" className="primary small" onClick={finishGarden}>Done</button>}<button type="button" className="ghost small" onClick={() => setDraft(null)}>Cancel</button></div>}
      {note && draft === null && <div className="mapnote">{note}</div>}

      <aside className="panel">
        <header className="panelhead">
          <h1>Your home</h1>
          <form className="finder" onSubmit={find}>
            <Search size={18} />
            <input id="where" aria-label="Where is your home?" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Street, house number, town" />
            <button className="primary small" disabled={busy}>{busy ? "Searching" : "Find"}</button>
          </form>
          {places && places.length > 1 && <ul className="places">{places.map((p) => <li key={p.label}><button type="button" onClick={() => choose(p)}>{p.label}</button></li>)}</ul>}
          {error && <p className="error">{error}</p>}
          {!site && !places && <p className="prompt">{place ? "We could not find the house at this address. Click it on the map." : "Click your house on the map, or type your address."}</p>}
        </header>

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
          <div className="switch" role="group" aria-label="Roof type">
            {(["pitched", "flat"] as const).map((r) => <button key={r} type="button" className={main.roof === r ? "on" : ""} aria-pressed={main.roof === r} onClick={() => editBuilding(main.id, { roof: r })}>{r === "flat" ? "Flat" : "Sloped"}</button>)}
          </div>
          {main.roof === "pitched" && <>
            <label className="field range"><span>Slope <b>{main.tilt}°</b></span><input type="range" min={15} max={55} step={5} value={main.tilt} onChange={(e) => editBuilding(main.id, { tilt: Number(e.target.value) })} /></label>
            <button type="button" className="ghost small" onClick={() => editBuilding(main.id, { flip: !main.flip })}><Turn size={14} />Turn the roof ridge</button>
          </>}
          <p className="small muted">{main.source === "OpenStreetMap" ? "From OpenStreetMap." : main.source === "You" ? "Set by you." : "Our guess from the building shape. Please correct it."}</p>
          <button type="button" className="ghost small" onClick={() => setSite(() => null)}>This is not my house</button>
        </section>}

        {site && <section>
          <h2>Where may panels go?</h2>
          <p className="small muted">Number 1 fills first. If it is full, the next one is used.</p>
          <ol className="surfaces">
            {site.surfaces.map((s, i) => (
              <li key={s.id} className={s.wanted ? "" : "off"}>
                <span className="rank">{s.wanted ? site.surfaces.filter((x) => x.wanted).indexOf(s) + 1 : "–"}</span>
                <div><b>{s.name}</b><small>{s.panels.length} panels fit{s.sun ? ` · ${s.sun.kwh_per_kwp.toLocaleString("en")} kWh per kW` : ""}</small></div>
                <span className="tools">
                  <button type="button" className="round" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><Up size={14} /></button>
                  <button type="button" className="round" aria-label={`Move ${s.name} down`} disabled={i === site.surfaces.length - 1} onClick={() => move(i, 1)}><Down size={14} /></button>
                  <button type="button" className="ghost small" onClick={() => patch(s.id, { wanted: !s.wanted })}>{s.wanted ? "Not here" : "Allow"}</button>
                  {s.kind === "ground" && <button type="button" className="round" aria-label="Delete garden area" onClick={() => remove(s)}><Close size={14} /></button>}
                </span>
              </li>
            ))}
          </ol>
          <p className="small muted">Garage or shed? Click it on the map to add it. Click it again to remove it.</p>
          <label className="check"><input type="checkbox" checked={site.noGarden} onChange={(e) => setSite(() => ({ ...site, noGarden: e.target.checked, surfaces: e.target.checked ? site.surfaces.filter((x) => x.kind !== "ground") : site.surfaces }))} />No panels in my garden</label>
          {!site.noGarden && <button type="button" className="ghost small" onClick={() => setDraft([])}><Pen size={14} />Draw a garden area</button>}
        </section>}

        {children}
      </aside>
    </main>
  );
}
