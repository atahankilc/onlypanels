// The chosen home's parts, surfaces and sun, worked out in a worker in this page. Our server hands out only whole squares.
import type { SiteAsk, SiteReply } from "./site.worker";

let worker: Worker | null = null;
let next = 0;
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function ask<T>(op: SiteAsk["op"], square: string, key: string): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL("./site.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<SiteReply>) => {
      const w = waiting.get(data.id);
      waiting.delete(data.id);
      if (!w) return;
      if (!data.ok) w.reject(new Error(data.error));
      else if (data.value === null) w.reject(new Error("No such building"));
      else w.resolve(data.value);
    };
  }
  const id = next++;
  return new Promise<T>((resolve, reject) => {
    waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker!.postMessage({ id, op, square, key } satisfies SiteAsk);
  });
}

export const localParts = <T,>(square: string, home: string) => ask<T>("parts", square, home);
export const localBuilding = <T,>(square: string, id: string) => ask<T>("building", square, id);
export const localSun = <T,>(square: string, id: string) => ask<T>("sun", square, id);
