import { useEffect, useState } from "react";
import { Request, START } from "./api";
import Homeowner from "./Homeowner";
import { Mark } from "./icons";
import Planner from "./Planner";
import { Segmented } from "./ui";

const KEY = "energy-desk-v2";

// Made-up example requests, so the planner's inbox is not empty.
const EXAMPLES: Request[] = [
  { id: "ex1", title: "Family home, gas heating", from: "homeowner", status: "draft", overrides: {},
    inputs: { ...START, demand_kwh: 5200, heating: "Gas", heat_kwh: 20000, area_m2: 60 } },
  { id: "ex2", title: "Couple, electric car", from: "homeowner", status: "draft", overrides: {},
    inputs: { ...START, demand_kwh: 3800, ev: true, ev_km: 12000 } },
];

type Saved = { requests: Request[]; mine: string | null };
const load = (): Saved => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "") as Saved; } catch { return { requests: EXAMPLES, mine: null }; }
};

export default function App() {
  const [view, setView] = useState<"planner" | "homeowner">("homeowner");
  const [saved, setSaved] = useState(load);
  const [openId, setOpenId] = useState<string | null>(null);
  const { requests, mine } = saved;

  useEffect(() => localStorage.setItem(KEY, JSON.stringify(saved)), [saved]);
  const add = (r: Request, isMine: boolean) => setSaved((s) => ({ requests: [r, ...s.requests], mine: isMine ? r.id : s.mine }));
  const update = (id: string, patch: Partial<Request>) =>
    setSaved((s) => ({ ...s, requests: s.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  const open = view === "planner";
  return (
    <div className="app">
      <header className={`topbar${open ? " solid" : ""}`}>
        <div className="logo"><Mark /><h1>Energy Design Desk</h1></div>
        <div className="topright">
          <Segmented label="Demo only: switch profile" variant="dev" value={view} onChange={setView} options={[{ value: "homeowner", label: "Homeowner" }, { value: "planner", label: "Planner" }]} />
        </div>
      </header>
      {view === "planner"
        ? <Planner requests={requests} openId={openId} setOpenId={setOpenId} add={(r) => add(r, false)} update={update} />
        : <Homeowner request={requests.find((r) => r.id === mine) ?? null} add={(r) => add(r, true)} update={update} />}
    </div>
  );
}
