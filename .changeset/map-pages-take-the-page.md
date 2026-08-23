---
'@simmer-mosquito/web': minor
---

Changed: Every map page now gives the map the whole stage, with what matched floating over it in a panel that collapses out of the way. Habitats, Traps, Collections, Inspections, Samples, Chemical, Source Reduction, Biocontrol, Outreach, Service Requests, Requests for Control, Addresses, Weather Stations, Regions and the Activity Monitor all move off the half-and-half split. A record you click opens beside the map rather than under the panel, and one picked from the list flies into the part of the map the panel is not covering.

Changed: The filters moved out of the column above the results and into a card beside them, opened from a control in the panel's header that carries the number of filters set, so a narrowed list still says so while the card is away. The results rail runs the full height under the place search at 400px wide, which is roughly twice the records in view on a laptop screen.

Changed: Result rows fit what that width can hold. A dated record stacks its year under its day, and a record's badges sit on their own line under whoever did the work rather than beside them. They used to share a line and wrap only when they had to, so a short inspector name left the life-stage strip inline and a long one pushed it down, moving the strip from row to row down the rail.

Changed: The result list on every explorer scrolls with the same styled scrollbar the rest of the app uses, and shows it whenever there are more rows than fit.
