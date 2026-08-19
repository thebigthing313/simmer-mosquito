# Product

## Register

product

## Users

SIMMER is used by mosquito control agencies that coordinate surveillance,
field work, public engagement, control operations, GIS review, reporting, and
agency setup. Primary users include office operators, field staff, agency
managers, and SIMMER Operators who support onboarding, taxonomy, units, and
customer administration.

Users work inside operational contexts where geography, time, status, and
record history matter together. They inspect addresses, regions, traps,
habitats, service requests, missions, assignments, control work, public
contacts, weather summaries, and agency configuration. They need to understand
where work is happening, what requires attention, and what action is available
next without losing the spatial picture.

## Product purpose

SIMMER is a map-centric SaaS platform for mosquito surveillance and control
operations. It helps agencies coordinate field workflows, maintain operational
records, understand spatial patterns, and make decisions across adult
surveillance, larval surveillance, service requests, public engagement, control
operations, GIS, weather, assignments, routes, mission dispatch, and reporting.

The current product also includes a SIMMER Operator control plane for platform
setup: customer organizations, memberships, global taxonomy, measurement units,
and foundational agency data. That administrative surface should feel like the
same product system as the future agency app, not a separate back-office
afterthought.

Success means users can move from operational context to committed action
quickly: see the relevant work, inspect the right records, understand status and
history, and save updates with confidence.

## Brand personality

Professional, natural, focused.

SIMMER should feel competent and grounded, with enough connection to field work
and geography to avoid sterile enterprise software. It should be calm under
operational pressure, clear when records or locations require attention, and
confident without becoming decorative or theatrical.

Reference territory includes ArcGIS Online and Google Maps for spatial
orientation, but SIMMER should not feel like a clone of either. It should pair
map fluency with a distinct operational workflow language for mosquito control
agencies. For product ergonomics, references such as Linear, Stripe, and
Raycast are useful for density, hierarchy, and focused workflow surfaces, but
SIMMER should stay more grounded and field-aware than generic SaaS tooling.

## Anti-references

Avoid generic government portal design: boxy forms, weak hierarchy, dated
chrome, and screens that feel assembled from administrative leftovers.

Avoid becoming an enterprise GIS clone: dense toolbars, overwhelming layer
panels, crowded controls, and "ArcGIS but worse" interaction models.

Avoid dashboard theater: excessive metric cards, generic chart blocks, gradient
SaaS decoration, and analytics surfaces that exist because dashboards are
expected rather than because they clarify a decision.

Avoid consumer map mimicry: too casual, too search-first, and too shallow for
operational record keeping.

Avoid table-first data representation when spatial, temporal, status, or
relationship views would explain the work more directly.

Avoid treating the SIMMER Operator experience as a temporary admin page. It is
the first proof of the product system and should carry the same care as
agency-facing workflows.

## Design principles

Preserve the map as operational context. The interface should keep location and
workflow connected, so users do not have to choose between seeing the work and
acting on it.

Represent data visually before reaching for tables. Use maps, timelines, status
grouping, spatial overlays, compact summaries, and record relationships to make
operational patterns visible. Tables are appropriate when comparison or bulk
scanning is the task, not as the default data shape.

Minimize tool chrome. Controls should appear where they help the current task,
not accumulate as permanent toolbar density.

Favor focused workflows over dashboard sprawl. Each screen should make the next
useful action clear instead of competing for attention with unrelated metrics.

Treat setup as operations. Organization onboarding, taxonomy, units, lookups,
and foundational records are not generic CRUD; they are the configuration layer
that makes field work trustworthy.

Centralize design decisions. Durable visual choices belong in
`packages/design-tokens` and component variants, not repeated route-level class
strings.

## Accessibility and inclusion

SIMMER does not currently target formal WCAG 2.2 AA compliance as a stated
product requirement. The product should still follow practical accessibility
baselines: keyboard-accessible controls, visible focus states, readable
contrast, clear labels, reduced-motion respect, and status cues that do not rely
on color alone where operational meaning is important.
