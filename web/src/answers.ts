// The engine's last answers, kept in this browser by what was asked: the draft, the review and the price of a request.
// Opening the list or a request shows the last answer at once, and the API is asked again in the background, so a
// change of prices or of the engine still arrives. Nothing leaves the browser here (D102); only answers are kept.
const KEY = "op-answers-v1", MAX = 80;
type Entry = { at: number; v: unknown };

let store: Record<string, Entry> = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } })();
let timer = 0;
const save = () => {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    const keys = Object.keys(store);
    if (keys.length > MAX) keys.sort((a, b) => store[a].at - store[b].at).slice(0, keys.length - MAX).forEach((k) => delete store[k]);
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { store = {}; localStorage.removeItem(KEY); } // full: start over
  }, 300);
};

/** A short, stable key for what was asked (cyrb53 over the JSON). */
export const askKey = (kind: string, body: unknown) => {
  const s = JSON.stringify(body);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${kind}:${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
};
export const lastAnswer = <T,>(key: string): T | null => (store[key]?.v as T) ?? null;
export const keepAnswer = (key: string, v: unknown) => { store[key] = { at: Date.now(), v }; save(); };
