import { useEffect, useState } from "react";
import FindHome from "./FindHome";
import { Mark } from "./icons";
import { Handoff } from "./plan";
import Planner from "./Planner";
import { Button, Segmented } from "./ui";

export default function App() {
  const [view, setView] = useState<"homeowner" | "planner">("homeowner");
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [dark, setDark] = useState(localStorage.getItem("theme") !== "light");
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; localStorage.setItem("theme", dark ? "dark" : "light"); }, [dark]);
  return (
    <div className="app">
      <header className="topbar">
        <div className="logo"><Mark /><h1>Energy Design Desk</h1></div>
        <div className="dev" role="group" aria-label="Demo tools">
          <span>DEV</span>
          <Segmented label="Demo only: switch profile" variant="dev" value={view} onChange={setView} options={[{ value: "homeowner", label: "Homeowner" }, { value: "planner", label: "Planner" }]} />
          <Button variant="dev" aria-label="Demo only: switch theme" onClick={() => setDark(!dark)}>{dark ? "Dark" : "Light"}</Button>
        </div>
      </header>
      <FindHome dark={dark} onSend={setHandoff} />
      {view === "planner" && <Planner dark={dark} handoff={handoff} />}
    </div>
  );
}
