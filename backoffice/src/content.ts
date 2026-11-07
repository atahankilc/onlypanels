export type Status = "var" | "kismen" | "yok";
export const STATUS: Record<Status, string> = { var: "Done", kismen: "Partly", yok: "Missing" };

export const USERS = [
  {
    id: "planner", name: "Planner", role: "Designs systems and writes offers at an installer",
    focus: "The minimum result serves this user",
    who: "Works at a mid-sized installation company and creates several offers per day, often between site visits. Knows the products well, but is under constant time pressure.",
    wants: "A solid first design right away that they can trust and build an offer on.",
    needs: "Control: can override any part of the design and keeps the final say over the offer.",
    fears: "A black box that proposes something they cannot justify to the homeowner.",
  },
  {
    id: "homeowner", name: "Homeowner", role: "Receives the offer and decides whether to sign",
    focus: "Stretch goal, on top of the same engine",
    who: "Owns a single-family home and has received an offer for a solar system, possibly with a battery or heat pump. Now has to decide whether to sign.",
    wants: "To understand the offer, try variants such as a larger battery or no heat pump, and see what each change means for them.",
    needs: "Simplicity: plain language instead of technical data sheets.",
    fears: "Being oversold, or committing to the wrong system.",
  },
];

export const TENSION = [
  { label: "Planner wants", text: "Speed and full control over a technically and commercially sound offer." },
  { label: "Homeowner wants", text: "Transparency and room to explore, but only within the options the installer allows." },
  { label: "Boundary", text: "For example, switching a battery on or off or resizing a component. The home's data stays fixed." },
];

export type Step = { who: string; does: string; status: Status };
export const FLOWS: { name: string; who: string; need: string; goal: string; steps: Step[] }[] = [
  {
    name: "Faster offers", who: "Planner", need: "Minimum",
    goal: "Enters the basics of a new project and receives a complete design as the starting point for the offer.",
    steps: [
      { who: "Homeowner", does: "Sends an installation request, or the planner enters the basics after a call", status: "var" },
      { who: "System", does: "Prepares a draft before the planner opens it: PV, battery and heat pump as appropriate", status: "kismen" },
      { who: "System", does: "Shows a short explanation of why", status: "var" },
      { who: "Planner", does: "Changes an input or component, for example \"the family is buying an electric car next year\"", status: "var" },
      { who: "System", does: "Adapts the rest of the design as an expert would expect, and explains why", status: "var" },
      { who: "Planner", does: "Compares the proposal with the expert design for the same project, in the back office", status: "var" },
    ],
  },
  {
    name: "Design validation", who: "Planner", need: "Stretch",
    goal: "Before an offer goes out, their own design is compared with what experts delivered for similar homes.",
    steps: [
      { who: "Planner", does: "Enters their own design", status: "var" },
      { who: "System", does: "Compares it with what experts did for similar homes", status: "kismen" },
      { who: "System", does: "Flags unusual choices, such as an oversized battery", status: "yok" },
    ],
  },
  {
    name: "Exploring the offer", who: "Homeowner", need: "Stretch",
    goal: "Tries variants within the options the installer allows, and understands each change before signing.",
    steps: [
      { who: "Homeowner", does: "Sees the offer in plain language", status: "var" },
      { who: "Homeowner", does: "Tries the options the installer allows", status: "var" },
      { who: "System", does: "Explains what each change means, as an estimate", status: "var" },
    ],
  },
];

export const ASK = {
  core: "A system that takes a few facts about a home and decides the way an experienced planner would. The goal is not to calculate the ideal system, but to do what an expert actually does.",
  groups: [
    { title: "Three goals", items: ["Propose a complete system: PV, battery and heat pump as appropriate, with sizes", "Let the user refine it, with the rest adapting as an expert would expect", "Prove it decides like an expert on unseen projects"] },
    { title: "The demo", items: ["A home is described", "A complete system appears, with an explanation", "The design is refined, for example an electric car", "It is checked against the expert and across many projects"] },
    { title: "Deliverables", items: ["Working demo, with a recording as fallback", "Code and a short README", "Short pitch deck"] },
    { title: "Judging", items: ["Technical depth", "User fit", "Business impact", "Execution and demo"] },
  ],
};

export type Real = { step: string; pain: string; src: "Brief" | "Inferred" };
export const REAL: { who: string; intro: string; steps: Real[] }[] = [
  {
    who: "Planner", intro: "Walks this path from scratch for every home.",
    steps: [
      { step: "A request arrives", pain: "Many jobs run at the same time", src: "Brief" },
      { step: "Gathers home facts: use, heating, car, price, budget", pain: "Information is missing or approximate", src: "Inferred" },
      { step: "Checks the home or roof", pain: "Moves between office and site", src: "Inferred" },
      { step: "Sizes the PV system", pain: "Every home differs, so it starts from zero", src: "Brief" },
      { step: "Decides whether a battery pays off and how large", pain: "Depends on PV: change one and the other moves", src: "Brief" },
      { step: "Checks whether a heat pump makes sense", pain: "Changes consumption, which leads back to PV", src: "Brief" },
      { step: "Balances everything against the budget", pain: "The knowledge lives in people's heads and is applied inconsistently", src: "Brief" },
      { step: "Writes and sends the offer", pain: "Hours have passed and the customer may go elsewhere", src: "Brief" },
      { step: "Answers questions and makes changes", pain: "One change reopens the whole calculation", src: "Inferred" },
    ],
  },
  {
    who: "Homeowner", intro: "Lives the same process from the other side.",
    steps: [
      { step: "Wants lower bills and more independence", pain: "Does not know what they need", src: "Brief" },
      { step: "Contacts several installers", pain: "The first credible offer often wins", src: "Brief" },
      { step: "Gives the home's facts", pain: "May not know their exact consumption", src: "Inferred" },
      { step: "Receives the offer and tries to understand it", pain: "Data sheets, and no clear reason for the size", src: "Brief" },
      { step: "Compares offers", pain: "Fears being oversold", src: "Brief" },
      { step: "Asks the planner questions and requests variants", pain: "Has to wait for every answer", src: "Inferred" },
      { step: "Signs or walks away", pain: "Fears committing to the wrong system", src: "Brief" },
    ],
  },
];

export const VALUE = [
  { today: "Every design starts from scratch", ours: "A complete design from the basics", who: "Planner", gain: "Faster offers", state: "Working" },
  { today: "One change reopens the whole calculation", ours: "The rest adapts automatically", who: "Planner", gain: "Faster revisions", state: "Working" },
  { today: "\"Why this size?\" is hard to answer", ours: "A short reason and similar homes with every proposal", who: "Planner", gain: "A defensible offer", state: "Working" },
  { today: "Knowledge lives in experienced heads", ours: "Learns from past expert decisions", who: "Installer", gain: "New staff design consistently", state: "Limited, accuracy is low" },
  { today: "Mistakes surface after the offer goes out", ours: "Unusual choices are flagged first", who: "Installer", gain: "Fewer wrong offers", state: "Not built" },
  { today: "The homeowner waits on every question", ours: "Tries the allowed variants themselves", who: "Both", gain: "Fewer questions, safer decisions", state: "Working, without prices" },
];

export const CANNOT = [
  "Win rate cannot be measured, because the data only contains signed projects.",
  "We cannot state time saved yet. We need to learn from Reonic how long a design takes today.",
  "We cannot say \"as accurate as an expert\". First proposals only slightly beat simple methods.",
];
