# Users and flows

Scope is the two users in the brief (page 4) and its three use cases (page 5). The back office on port 5174 shows the same content.

## Users

| | Planner | Homeowner |
|---|---|---|
| Who | Mid-sized installer, several offers per day, knows the products, under time pressure | Owns a single-family home, has received an offer, must decide whether to sign |
| Wants | A solid first design right away that they can trust | To understand the offer and try variants |
| Needs | Control: override any part, keep the final say | Simplicity: plain language |
| Fears | A black box they cannot justify | Being oversold, or the wrong system |
| Priority | Minimum result | Stretch goal on the same engine |

**Tension:** the planner wants speed and full control. The homeowner wants transparency, but only within options the installer allows. The home's data stays fixed.

## Flows

| Flow | User | Need |
|---|---|---|
| Faster offers, including refinement and expert comparison | Planner | Minimum |
| Design validation | Planner | Stretch |
| Exploring the offer | Homeowner | Stretch |

Other roles considered and parked: field adviser, installer manager, install crew, upgrading customer.

## Product flow

1. The homeowner sends an installation request. A planner can also create one after a call.
2. AI prepares a draft before the planner opens it.
3. The planner does the engineering, sets what the homeowner may change, and sends the offer.
4. The homeowner reads the offer in plain language, tries allowed changes, and can ask for one.
5. The planner sees the change request and applies it.

## The real flow today

**Planner:** request arrives, gathers home facts, checks the home, sizes PV, decides on a battery, checks a heat pump, balances against budget, writes and sends the offer, handles questions and changes.

**Homeowner:** wants lower bills, contacts several installers, gives home facts, receives and tries to understand the offer, compares offers, asks for variants, signs or walks away.

The two flows meet at questions: each homeowner question returns to the planner as work. Fact gathering, the home check and the question loop are our inference; the rest is in the brief.

## Value

Our goal is to turn hours of decision work into minutes, while the planner keeps the final say.

We cannot yet claim win-rate gains (only won deals in the data), time saved (no baseline yet), or expert-level accuracy (first proposals only slightly beat simple methods).
