import FindHome from "./FindHome";
import { Mark } from "./icons";

export default function App() {
  return (
    <div className="app">
      <header className="topbar"><div className="logo"><Mark /><h1>Energy Design Desk</h1></div></header>
      <FindHome />
    </div>
  );
}
