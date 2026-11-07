// What each battery size this installer sells would do in this home. One column per size; the one in the design carries the accent.
import { Design } from "./plan";

type Row = { kwh: number; own_pct: number; saving_eur: number };
export const curveOf = (d: Design) => (d as Design & { battery_curve?: Row[] }).battery_curve ?? [];

export function BatteryCurve({ d, pick }: { d: Design; pick: (kwh: number) => void }) {
  const rows = curveOf(d);
  if (rows.length < 2) return null;
  const now = d.battery.kwh;
  return <figure className="bcurve">
    <figcaption><b>What each battery size does here</b><small>Share of the yearly need from own power, and the saving. Same home, roof and weather years. Click a size to use it.</small></figcaption>
    <div className="bcurve-cols" role="list">
      {rows.map((r, k) => {
        const gain = k ? r.own_pct - rows[k - 1].own_pct : 0;
        const label = `${r.kwh ? `${r.kwh} kWh` : "No battery"}: ${r.own_pct}% from own power, about €${r.saving_eur.toLocaleString("en")} a year${k ? `, ${gain >= 0 ? "+" : ""}${gain} points over ${rows[k - 1].kwh || "none"}` : ""}`;
        return <button type="button" role="listitem" key={r.kwh} className={`bcurve-col${r.kwh === now ? " on" : ""}`} title={label} aria-label={label} onClick={() => pick(r.kwh)}>
          <em>{r.own_pct}%</em>
          <i><b style={{ height: `${r.own_pct}%` }} /></i>
          <span>{r.kwh ? r.kwh : "none"}</span>
          <small>€{r.saving_eur.toLocaleString("en")}</small>
        </button>;
      })}
    </div>
    <p className="small muted">kWh of battery under each column, yearly saving below it. Estimates from real weather years, checked against HTW Berlin values.</p>
  </figure>;
}
