# Hooks

Every React hook in the frontend apps lives under that app's `src/hooks`
folder, one hook per file, in a kebab-case file named `use-<hook>.ts`. A
component, route or form module defines no hook of its own; it imports one.
`apps/web/src/hooks` groups its files by the surface they serve (`map/`,
`explorer/`, `search/`, `operations/`, and so on) beside `queries/` and
`mutations/`, which follow the same rule.

A hook's docblock says what the hook does, what it takes and what it returns.
The reasons behind a hook's shape, the alternatives that were measured and the
traps a caller can fall into are recorded here instead, one heading per hook,
so the docblock reads as documentation and this file reads as the decision
record. A new hook that carries a decision adds a heading here.

## apps/web

### explorer

#### useExplorerPanel

The collapse flag is component state rather than a search param on purpose.
The URL already carries the filter set, which is the thing a reader hands to a
colleague, and a link that also carried "I had the panel shut" would open on a
map with no results on it.

The route calls this rather than the explorer frame, because a route reads the
inset to place its own chrome, such as a focus card, over the same map. One
value, one owner, and no explorer computes it for itself.

The filters start shut. They are a card that stands beside the results rather
than a block stacked above them, so leaving them open would cover a second
column of map before the reader has asked for anything. The control that opens
them carries the active count, so a filtered list never looks unfiltered while
they are away.

The narrow breakpoint is measured against the map stage rather than the window,
because the workspace shell takes several hundred pixels of the window before
the stage begins. A window query says "wide" at sizes where the side column
would leave a sliver of map, and it also lets the fit margin in
`useMapExtentFit` exceed the canvas width, which is a frame Mapbox cannot
compute at all. The docked sheet's height is a share of the stage rather than a
fixed number, because an explorer stacks as many filter controls as its records
need and a fixed peek is right for one of them.

#### useMeasuredBox

The measurement is `null` until the first observation rather than zero, because
a layout chosen from an unmeasured box would flash the wrong one on every first
paint. The element is read once with `getBoundingClientRect` before the
observer's first delivery, because `ResizeObserver` reports after layout and
before paint, so a document that has not painted yet, such as a background tab
or a hidden pane, never hears from it.

#### The control method option hooks

`useApplicationMethodOptions`, `useSourceReductionMethodOptions`,
`useBiocontrolMethodOptions` and `useOutreachMethodOptions` are one question
asked of four tables: how was this done, and with what. Each control explorer
reaches for the pair, the multi-select above the list and the name on every
row, and the rows themselves come from `/map/*`, which sends ids rather than
names.

Retired methods stay in the lists, for the reason they do in
`useHabitatTypeOptions`: an explorer looks backwards, and a season's work done
with a method the organization has since dropped is exactly what somebody
filtering by it is asking for. The pickers on the forms are the surfaces that
offer only what is current.

The catalogs are eager and small, so these suspend rather than drawing a
pending state; they are loaded before an explorer can be reached.

`useControlMethodNames` is built from the four hooks rather than from four more
queries, so a page that shows both a filter and a name pays for one read of
each catalog. Ids are uuids and so globally unique, which is what lets one map
serve all four catalogs.

`useInsecticideOptions` is its own hook rather than a call to `useNamedCatalog`
because the column is `trade_name` rather than `name`. `shorthand` is an
organization's internal abbreviation for data entry, not a name a reader should
have to read.

#### usePagedMapResource

Eight explorers held the same three pieces: the `useQuery` that keeps the
previous page on screen while the next one loads, the page count, and the two
resets, to the first page when the filters change and back to the last page
when it empties out. Owning `page` in the hook is what lets the first reset
key on the request rather than on whatever the caller happened to memoize.

Both were effects until #1184, and each committed one render with the wrong
page before the one with the right page: the old page's offset went out
against the new filter set, and a delete on the last page drew an empty page
before the clamp. The page is held beside the request key it was turned
under now, so a page turned under another request reads as the first with no
reset at all. The clamp cannot be that kind of derivation, because the page is
part of the query key and the total that clamps it arrives on the query it
keys, so it is a conditional `setState` during render: React re-renders
before committing, and the empty page is never drawn. The same two live in
the Contacts index over an in-memory list, where the clamp is a `Math.min` on
read because nothing there is keyed on the page.

`recordType` was a free-text `label` until #940, and four of the nine explorers
were spelling their own: `Applications`, `Biocontrol`, `Outreach` and `Source
reductions`, beside five that read `titleMany` out of the register.
`pnpm check:record-nouns` lists this hook as a register consumer.

`mapQueryParams` exists because every explorer wrote the presence rule out as
a wall of `if (x !== undefined && x.length > 0)`.

#### useSelectedMapRecord

A selection can come from the tiles, which draw every match rather than the
fifty in the rail, so the row may be nowhere in `rows`. Eight explorers
resolved that with the same pair: read the page first, fall back to fetching
the one record by id.

The rule for the fallback, which every surface selecting by id follows: a
record is asked for by id once the page has settled and does not hold it.
Settled means answered, with rows or with an error, and not fetching; it does
not mean non-empty. A page holding nothing is an answer, and the selection is
not on it, so the by-id request goes out, which is what keeps a deep link into
an empty viewport from drawing no rail. A page that failed is an answer too, so
the rail can draw when the list cannot.

Before #934 the gate was `rows` alone, and `rows` is empty until the page
lands, so on every deep link the by-id request went out on the first render
beside the page request and, when the row was on that page, brought back a row
the page was about to deliver. The price of the gate is that a deep link whose
row is off the page asks for it one page request later than it did, and a row
that is on the page draws when the page does rather than a moment before it.

#### The catalog option hooks

`useCollectionMethodOptions`, `useHabitatTypeOptions`, `usePersonnelOptions`,
`useRegionOptions`, `useSpeciesOptions` and `useTagOptions` each answer one
filter question an explorer gets asked: how a trap catches, what kind of place
a Habitat is, who did the work, which district, which species, which tag. Each
labels its rows with the same lookup the filter reads.

Retired catalog rows stay in every list. An explorer looks backwards, and a
season's inspections filtered by a type the organization has since stopped
using is exactly what the person asking means. The pickers on the forms are the
surfaces that offer only what is current.

The eager catalogs suspend rather than drawing a pending state, because they
are loaded before an explorer can be reached. `useRegionOptions` is the one
that cannot: `regions` is on-demand, and the suspense hook hangs when a route
unmounts over an on-demand collection, so it uses plain `useLiveQuery` and
holds the subset for thirty seconds past unmount, because regions are picked,
unpicked and re-picked while somebody narrows a map.

`usePersonnelOptions` sorts in the query rather than in the hook, because
`orderBy` is part of the compiled pipeline and the rows arrive ordered. That
drops `localeCompare`, which differs on accented names: Ángela sorts before
Alan rather than between Alan and Beth. It is the same ordering the other
picker lists use, and it is the price of a sort that happens once when a row
arrives instead of on every render.

`useSpeciesOptions` reads two sets on purpose. The options are the species the
organization has adopted, since a New Jersey program records perhaps thirty of
the taxonomy's thousands and offering the rest would bury the ones it finds.
The names are the whole taxonomy, because a sample identified years ago may
name a species the organization has since dropped. When nothing is adopted the
options fall back to the full catalog, since an empty filter is worse than a
long one. The two queries run beside each other because neither needs what the
other returns.

`useTagOptions` hands back the whole Tag rather than its name, because a
removable filter chip is tinted with the tag's own colour, and a chip that
lost the colour would read as a different thing from the chips on the rows.

#### useEntityTags

The query is scoped to the ids on screen rather than the whole window, because
`tag_items` is an on-demand subset and a request naming every record in a wide
date range exceeds the URL limit and fails. The catalog is joined in the one
query, so what is left in the hook is the grouping by record, which a query
cannot return. The subset is held for thirty seconds past unmount so paging
back and forth does not refetch it. A record can carry a tag once, but an
optimistic row and its synced twin are two assignments of it while the write
is in flight, so the grouping drops the duplicate rather than drawing two
chips.

#### useDateRangeFilters

Eight explorers wrote the four pieces out by hand, including the rule that
matters: editing one bound past the other drags the other along, so the range
never inverts into a window that can hold nothing.

#### useFlyToSelection

Ten explorers carried this effect. Half of them keyed it on the selected
object, which re-flies whenever a refetch hands back a new object for the same
record; keying on the coordinates is the version that does not. Nothing in the
hook says where on the canvas the record lands, because a page with chrome
floating over its map declares that once as the canvas's viewport padding.

#### useExplorerResource

Nine explorer routes each ran the same four hooks in the same order and spent
eighty lines doing it. What varies between them is the endpoint, the two keys
its body answers under, the noun a failure reads by, and the filters.

Every one of them lists what the map is looking at. The rail is the map's
list, so the box goes on the wire ahead of the surface's own filters and
nothing is asked for until the camera has said where it is; six surfaces used
to page the whole Organization behind a map drawing one viewport, and the
`viewport` flag that told them apart went with the last of the six (#920).

The empty reason is read off the extent the map fetched to frame the same
filters. A box means matches exist somewhere, so the viewport is what to
change. No box means nothing matched anywhere, and then the query string says
whether a filter did it: the extent URL carries the surface's filters and
nothing else, no `bbox`, no paging, so an empty query is a request for
everything the Organization has. A failed request reads as the viewport, which
is the copy the rail gave before it could tell.

#### useMapBoundsParam

The three viewport-driven explorers each held a copy of this, its clamping,
and its listener teardown. It hands back the formatted string rather than the
box because that is all any caller wanted: the same value keys the query and
goes on the URL, so an equivalent viewport cannot key two requests.

It reads the canvas corners rather than `getBounds`, which subtracts the map's
viewport padding. A page with a results panel floating over its map sets that
padding, so `getBounds` would hand back only the strip beside the panel and
the list would drop every record behind it, measured at 215 records against
129 on one Habitat viewport. Opening and closing a panel is not a change of
viewport, and must not be a change of result set.

The box is held beside the map it was read from, and a box read from another
GL instance reads as none. The effect used to clear it when the map went
away, which is a `set-state-in-effect` finding (#1185) and one render drawing
the old box against no map; `useMapReadout` holds its reading the same way.

### map

#### useMapExtentFit

Vector tiles only carry what the viewport already framed, so a filtered set
whose records sit off-screen is invisible until someone finds it. The extent
endpoint answers "where is this filter's data" in one round-trip, from the
same filter predicates that build the tiles.

A refit off an extent URL is skipped when the whole extent already sits inside
the part of the canvas the reader can see, which `getBounds` answers net of
the map's padding. Every match is on screen, so the camera has nothing to
find, and the move it would have made is what re-keys the explorer rail's
page: the rail lists the viewport, so a fit that landed inside the old box
cost a third request for the rows the first one already held (#957). The
load-time fit is never skipped, since a fresh camera has framed nothing yet,
and a locally-computed box is fitted as it always was: those canvases have no
rail paging behind the move, so there is no request to spare.

The fit key carries the source as well as the box. Re-running the same filter
set is a pan-and-forget, but picking a different filter that happens to cover
the same ground is a new decision, and pulls the camera back onto it when the
reader has panned away.

`isInView` compares longitude under a shift of a whole turn either way as well
as none, because Mapbox reports a camera past the antimeridian unwrapped, west
170 to east 190, while the server writes the same ground at -170. The failure
it leaves open runs the safe way, a fit that was not needed rather than a set
left off screen. It does not share `normalizeBounds` in `useMapBoundsParam`,
which reads the same unwrapped camera and answers a different question: that
one sends the whole world for a view across the line, because the endpoint
takes one box, and a whole-world view here would hold every extent and skip a
fit that was owed (#933).

The effect depends on the four padding numbers rather than the padding object
or a string key built from it. `insetPadding` returns a fresh object every
render, so the object in the list re-runs the effect on every render, and the
key in its place leaves the object read inside the effect and off the list,
which is the `exhaustive-deps` finding the compiler refused (#1182). Wrapping
the object in `useMemo` is not the way out, since `check:manual-memo` refuses
one on a compiled path. So the effect takes the numbers and builds the object
itself, and `useMapPadding` does the same.

#### useMapExtent

Two readers share it: the camera fit in `useMapExtentFit`, and the explorer
rail, which reads a null extent as "nothing matches anywhere" rather than
"nothing in view" (#958). Both observe the same query key, so a surface framing
its data and branching its empty state on it sends one request, not two.

#### useMapMeasure

There is no polygon tool on purpose: the draw flow already has one for
geometry that gets saved, and a measurement is a question, not a record.
Nothing is persisted, by design (#47): the shapes exist for as long as the
session does and go when it ends. That is what lets the interaction stay this
direct, with no save, no confirmation and no name to give a rectangle whose
only purpose was to answer "roughly how many acres is that field".

The cursor moves every frame and a re-render of the map subtree that often is
visible, which is why the cursor is a ref. Anything derived from it is in the
same bind: computing it during render means it only refreshes when something
else re-renders, and a mousemove is not that. So the draft is published as a
`LiveValue` and the one component that wants the number subscribes to it.

#### useMeasureDraft

Call it from the readout rather than reading the value through the controller.
The point of `LiveValue` is that a mousemove re-renders the panel that shows
the number and leaves the map alone. The panel is a handful of nodes, so a
render per move costs nothing worth throttling.

### search

#### useRouteTypeIndex

The one place the `routes` collection is read for a route type. Both result
surfaces call this rather than each building their own lookup, so the
readiness rule exists once. Readiness comes from the live query's own status:
an empty collection and a collection still loading are different things, and
reading the row count cannot tell them apart.

#### useSearchResultOpen

The results page has nothing else on its list, so it takes this rather than
the two halves. The palette matches pages and actions against the shell's own
navigation as well, and resolves those before this map is reached, so it wires
`useRouteTypeIndex` and `useDeferredOpen` itself.

#### useDeferredOpen

A route comment selected before the `routes` collection lands has no
destination to navigate to. Dropping the click would read as broken, so the
row is held and opened as soon as the lookup answers. A row that resolves to
nothing once the lookup has answered clears the wait, because there is nothing
left to wait for.

`open` is a fresh closure on every render and navigates, so the effect calls it
through `useEffectEvent` and depends on the held resolution alone. With `open`
in the list the effect re-ran on every render; off the list it was the
`exhaustive-deps` finding the compiler refuses (#1182). `useGrowOnVisible`
takes its `grow` callback the same way, and the palette's option scroll in
`MapSearch` its `optionId`.

The wait ends in the render that reads the answer, and the answer is its own
state. The effect used to clear the wait beside the `open` call, which is a
`set-state-in-effect` finding (#1183), and the two cannot simply part: a
wait cleared during render leaves the effect nothing to key on, since the
render that commits has no held row. So the render that sees a `ready`
answer clears the wait and stores the destination, and the effect opens
whatever destination it is handed, once per answer because each answer is a
fresh object. The stored answer is never cleared, on purpose: clearing it
would be the effect setting state again, and a stale answer is harmless
because the effect only runs when it changes.

#### useMapDraw

The algebra behind the draw moved to `components/map/draw-parts` so it could
be asked a question without a map (#630). The hook is still the door the
forms, the toolbar and the part list know, so it re-exports the vocabulary
rather than teaching them a second path to the same types.

The hook is one file with six hooks under it, each in its own file since the
hooks sweep. `useDrawSession` holds the five buttons that open, close and
take back a draw, and the point request, because every one of them ends the
same way, by putting the control somewhere new and leaving nothing of the last
draw behind, so they share one `clear`. What a finished draw does with the
committed parts is `applyParts`'s and stays in `useDrawPartActions`.
`useDrawVertexActions` is its own hook because all of its gestures write the
edit mode and nothing else in the controller does; the ones that change the
rings land through `changeRings`, so a gesture costs exactly one Undo step and
none of them can forget to record one. `useDrawPartActions` is its own because
its four actions share one piece of state, the highlighted index.
`useDrawMapEvents` is its own because an idle map should carry no extra click,
move or key listener, and because the cursor and the double-click zoom it
takes over have to be handed back on every exit, including the one where the
map has already been removed. `useDrawEditEvents` is live only while a part is
open for editing, because none of it belongs on a map that is drawing or idle;
what each gesture does to the rings is the controller's, and it only says
which ring and which vertex was meant.

Frequently-changing render inputs live in refs so the rubber band can be
repainted on mousemove without a React re-render per frame. The ref writes
are an effect rather than render-phase assignments, which is what the React
Compiler permits.

The draft paint reads the shared selection colours from
`packages/design-tokens`, not a private amber: the thing being drawn is the
selected spatial context, and it has to match the selection halo the tile
layers paint so the two never disagree on screen. A hovered part is picked out
by weight rather than by a second colour, since a part is not a different kind
of thing from the shape it belongs to. Refusal is the only state that gets a
colour of its own.

`HIT_TOLERANCE` is 8px because a 5px circle is a small thing to hit with a
mouse and a smaller one with a thumb.

#### useActivityLayer

Selection is keyed on the entry's own id rather than the record's. A
collection set on Monday and collected on Thursday is two entries sharing one
record id, so keying selection on the record would light up both pins and
open the wrong day; the card resolves `recordId` for itself.

#### useAddressPoint

Picking an address seeds a point only when the form has no geometry yet, so a
required location starts somewhere sane. Geometry already drawn is never
replaced, because the address is reference data, and moving the record onto
it stays an explicit act. The caller owns the geometry state, so
`onPlacePoint` is where a form applies its own bookkeeping: geometry type,
dirty flag, map preview.

#### useContextGeoJsonLayer

Detail maps show one record, but a record performed against a habitat is only
legible in that habitat's outline: a treated stretch inside a ditch means
nothing floating on a basemap, and an action that copied its habitat's shape
still needs the habitat named. The layer is dashed, unfilled and
non-interactive, so it reads as context rather than as a second record
competing for attention, and it uses the neutral context colours rather than
the overlay's. Points are omitted on purpose: a context point and a record
point at the same place are indistinguishable, and the record's marker is the
one that matters.

#### useDrawLocation

The map instance, the shape being drawn, which tool is drawing it, an outline
shown behind it for context, whether the shape has been redrawn, and the "you
have not placed this yet" error are one piece of state wearing six
`useState`s. Twelve forms had each written their own copy, and the copies had
drifted: the habitat form tracked no redraw flag at all and its route
recovered one by comparing two JSON serialisations, so a description edit
named `updateHabitatLocation` and was refused for a collector (#427). The
registration form's tool selector left the old shape in place, so a point
could be saved under `Polygon`.

It does not know about the form on purpose: `addressId` and `habitatId` stay
form fields, and their `onSelect` handlers call in for the map's half of the
reaction. What lives in the hook is only what a map draws.

A form with nothing drawn opens on Polygon wherever the record can store one.
Opening on the first shape the register lists put every work record on Point,
so drawing the area a Habitat or an Application is about started with a tool
change.

#### useGeoJsonLayer

The overlay is what record detail maps use to draw one feature's geometry
without the vector-tile machinery the explorer needs, and what the adult
surveillance explorers use to draw many owned points with click-to-select
wiring. The source lifecycle is `useGeoJsonSource`'s; what stays here is the
layer specs and the highlight that follows the selected feature without the
layers being re-added underneath it.

#### useGeoJsonSource

Six hooks wrote the same sequence out longhand, the same five steps in the
same order with the same guards: add the source or `setData` on it; add each
layer the style lacks; do both again on `style.load`, because a basemap
switch drops them; push later data through `setData`; tear down layer by
layer then source, each behind an existence check, the whole thing behind a
`try` because the map may already be gone.

Step three is the one a careless extraction breaks, because nothing looks
wrong until somebody switches basemap. Step five's `try` is not defensive
noise: `useMapboxMap`'s create-effect cleanup calls `map.remove()` and, on
unmount, runs before this hook's cleanup, so touching the style afterwards
throws. The `isMapLive` guard on the way in is the same hazard from the other
side, a map that was destroyed while this subtree was hidden, handed straight
back to the setup that follows.

What stays with the caller is everything that makes a layer worth having, its
specs, its colour expressions, its feature model, and any effect that
re-scopes a layer without re-adding it, like a selection filter. The two
editing sessions, `useMapDraw` and `useMapMeasure`, keep their own state on
top of this. Their live cursor never enters `data`, because it moves every
frame and would cost a render per frame, so they repaint it imperatively and
pass that same repaint as `onEnsure`, which is what puts a half-drawn shape
back after a restyle.

`removeAddedLayers` is module level rather than inline in the cleanup,
because that loop sits inside a try block and the React Compiler cannot lower
a `for` there: one such loop bails the whole hook, which compiles nothing
(#856).

#### useMapPadding

Mapbox padding is map state, not an argument to one camera call: `setPadding`
is documented as equivalent to `jumpTo({padding})`, and a `padding` passed to
`flyTo` stays on the map afterwards. So padding cannot be applied by whichever
camera call happens to run next. Do that and a page that flies to a record,
drops the selection, then collapses its panel leaves the map framed around a
panel that is no longer there, and every later zoom or locate is off by half
the panel's width. One writer instead: the canvas knows what is over it, so
the canvas owns the padding.

#### useMapboxMap

Keeping creation, load state, resize and basemap switching behind one
interface is what lets callers compose controls without touching the
imperative GL API. The `transformRequest` carries a
`session-credential-ignore` marker because Mapbox GL's tile worker fetches
the authenticated MVT tiles itself and defaults a cross-origin request to
`same-origin`, so without `credentials: 'include'` every tile 401s;
`pnpm check:session-credentials` reads that marker.

#### useNearbyLayer

It renders a role-discriminated feature set the generic overlay cannot
express, which is why it is its own hook rather than a `useGeoJsonLayer`
call; the source lifecycle underneath it is `useGeoJsonSource`'s.

#### useRouteLayer

Selection and cursor emphasis go through feature-state so the list and the
map stay in sync without rebuilding the source. The stop feature is
framework-free geometry so the hook stays decoupled from the route domain
rows that produce it.

#### useTileLayer

Eleven explorers did this identically, in eleven copies of the same 150
lines: habitats, regions, traps, collections, inspections, samples,
addresses, chemical applications, source reduction, biocontrol, outreach.
What varied was the tileset name and which module built the URL and the
layers; everything about the lifecycle was the same, which is exactly the
kind of thing that survives in one copy and rots in the others.

#### useGlobalSearch

Three behaviours the palette needs are properties of the hook rather than
things it builds. Dimming the previous list under a live query is
`placeholderData`. A superseded response lands in a cache entry nothing
renders, because a new query string is a new key, so races need no other
machinery and the abort is cleanup rather than correctness. Closing the
palette resets the field but does not abort the request in flight; it
finishes into the cache, so reopening on the same query inside `staleTime`
renders instantly.

#### usePaletteContent

Split out of the component because the component was one 290-line function
that both derived this and rendered it, which `pnpm fallow:health` fails on.
The split is along a real seam: nothing in the hook is about layout, and
nothing in the component is about what the four groups hold.

The selection is held beside the joined row set it was picked from, and a
pick made against another set is not read: the value is the first row until
the reader moves it. That is the reset to the first row on every result swap
that the docblock in the module argues for, without the effect that used to
make it (#1183). The effect committed one render with the old selection
against the new rows, and the compiler refuses the function for it.

### stop-order

#### useStopOrder

The server owns `position` and reindexes on every move, so a reordered list
would otherwise sit still until the shape stream caught up, long enough to
read as a dropped click. `move` rethrows on failure after rolling the overlay
back, because consumers already own a single error banner covering their
other writes, and a second error channel would mean a second banner saying
the same kind of thing. `commit` is handed the whole plan rather than just
the moved id and the placement, because a caller that writes the new order
into its collection, which the route and assignment planners do so the rows
and the overlay agree, needs `order`, and it is the same list the hook is
already displaying.

The overlay is dropped in the render that sees the synced order agree with
it, as a conditional `setState` during render rather than an effect one
render later (#1185). It is a write and not a derivation on purpose: an
overlay left in place once matched would re-sort the next order sync sends,
which is another device's move. The suite under `hooks/stop-order` holds
both halves.

### catalog

#### useCatalogSearch

`matches` is never asked about an empty query, so a catalog that searches
name and description writes only that. `apps/admin/src/components/catalog.tsx`
declares the same search threshold as a deliberate second copy: the two apps
share no catalog component, and this hook is built around an active-versus-
inactive split the global catalogs have no concept of.

### registrations

#### useRegistrationRoster

Filtered from the organization-wide directory rather than read per contact,
because that directory is already what the sync layer holds and a per-contact
read would be a second shape over the same rows. An organization's
registrations number in the hundreds, not the millions. Inactive ones are
hidden by default and offered behind a filter: a retired registration still
appears on missions already generated, so it is not gone, and a list that
dropped it silently would leave somebody looking for a record they know
exists.

### key-entry

#### useKeyEntryTally

Commit produces target counts rather than increments so that auto-save, which
flushes routinely, can never double-count.

### app-wide

#### useAcknowledgedWrite

An acknowledgeable refusal is a condition the server can only discover once
it has the rows in front of it: how many inspections a habitat delete would
unlink, how many summaries a station rename would relabel. Asking up front
would put a checkbox on every form for a case that usually does not arise, so
the write goes out with the flags withheld and the refusal is what raises the
question.

`ask` is the opt-in, and it is the whole issue. With `ask: false`, the
default, the first attempt sends no flags and the server treats every one of
them as already confirmed. That is what every surface did before #319 and
what mobile and any script still do, which is why flipping `acknowledged()`
was rejected. A surface opts in with `ask: true`, which seeds every flag in
`askable` as `false` so the guards run, and owes a test asserting its first
attempt does so. Without that test the form passes every guard silently.

The askable map is an argument because a refusal names its flag, and a page
must only offer answers to questions it can pose. Sharing one map across
surfaces would offer a technician a "delete the summaries" answer to a
question about a mission stop, which the endpoint would ignore, and the
dialog would still have asked. The maps live in `lib/acknowledgement-copy.ts`
beside the words.

`run` resolving does not mean the write succeeded. A refusal that a flag can
answer is a question, not a failure, so it is swallowed and turned into the
dialog. Anything that should happen only once the write lands, a navigation
most of all, belongs inside `write` rather than after the call; put it after
and the page leaves before the question can be asked, which reads as a save
that worked.

A delete is optimistic, so the record leaves its collection the moment the
button is pressed and the card holding the button unmounts before the refusal
lands. The hook therefore lives in whatever survives that, and the button
gets `AskAcknowledged`.

#### useResetOnOpen

Opening is the only moment the defaults are right: a dialog mounted by a row
menu keeps its form instance across every row it edits, so the form is
refilled on open and again when the row changes under an open dialog.

### cleanup

#### useMergeSearch

Its own hook so the component stays about what it shows. The radius is held
in the organization's units and converted once, in the hook, because the
buttons say feet and `st_dwithin` over geography takes metres, and a page
that converted at the call site would be one refactor away from sending 250
metres. The conversion goes through the domain's table rather than a factor
written in the hook: `record-merge-reads.ts` and `coverage-features.ts`
already convert that way, and a second copy of 0.3048 is a second place for
the two to disagree.

#### useHabitatSelection

The set is rebuilt rather than mutated, because a `Set` changed in place is
the same object and React would keep the previous render.

#### useFitToGeometry

It refits only when the geometry's serialised form changes, not on every
render, so the reader's manual pans are not yanked back.

#### useMapReadout

The scale is measured off the map rather than derived from the zoom:
unprojecting two points on the centre row is the ground distance the reader
is looking at, whatever the latitude and whatever the camera is doing. It
re-reads on every move so the numbers track the drag rather than settle
after it.

#### useMapBearing

It listens on `move`, not `rotate`. Every camera change fires `move`, while
`rotate` fires only for the paths Mapbox counts as a rotation, so a bearing
that arrives through a fit or a jump can land without one and leave the
arrow describing a camera the map no longer has.

#### usePlaceSuggestions

The debounced suggest request and the four states it drives, results,
loading, error and the selection in flight, came out of `MapSearch` when the
idle reset moved into render (#1183) and pushed the component over fallow's
complexity threshold. Going idle drops all four in the render that notices: a
`wasSearching` state holds the last condition, and a change to idle sets all
four, which React re-renders before committing. A derivation was measured for
those four and rejected, because it brings the old rows back the moment the
same condition holds again, and a query typed back up to the minimum would
draw the previous query's places for the debounce window. The retrieve step
stays in the component, since it is what flies the map, and reaches the
selection state through `beginSelect`, `failSelect` and `endSelect` rather
than through the setters.

#### useRegionFolderNames

Region names repeat across folders, since every district has a "Zone 1", so
the folder is what tells two same-named results apart. Folders sync eagerly
and are few, so the whole list is read once and matched in memory; a
non-suspense query keeps the popover from suspending the page around it.

### pickers

#### useSelectedRowLabel

An edit form arrives holding only the id, so the row is read back by id
while nothing has been picked this session. The query passes no `limit`,
because an id equality already yields at most one row and the query compiler
rejects LIMIT without an ORDER BY.

#### useRegistrationLocation

The canvas belongs to the page, which draws every registration this contact
already has whether or not one is being edited, so the map is handed in
rather than claimed: a controller that owned the map would mean a second map
beside the one already on screen.

### route-planning

#### useRouteSelection

Lifted out of `RoutesIndexPage` so each domain can call its own stops hook
with the id. The page used to take that hook as a prop and call it, which is
a hook reached through a value rather than a static reference, and the React
Compiler refuses it (`Hooks`, #823). Two callers share the fallback rule from
here rather than copying it.

#### useMissionStopExecution

The four control-action create pages differ only in what they record; every
mission concern is identical across them. Held in one hook so a change to how
a stop is executed is one edit rather than four, and so the three commands
that ship without a wire-body test cannot drift from the one that has one.

A mission stop already names the ground. The server defaults the action's
geometry from it, so requiring a draw would make the crew re-trace the place
they were sent and, for a line or polygon stop, trace it wrongly enough to
trip the coverage check. Subscribing to the stop's row also warms the
on-demand stream the page is about to write against, which is what keeps the
write's txid confirmation from timing out.

### forms

#### useRecordExtras

Two writes, always the same two, always in the same order: the crew rows and
the note the form's last box holds. Neither can go in the record's own
transaction, because both reference the record by id, so both run after it
settles and both are best-effort through `attachLinksBestEffort`.

It is one hook rather than two so a create route wires one thing to do one
thing. Routes used to hold `useAdditionalPersonnelMutations` and
`useCommentMutations` side by side and call them in sequence, which put the
order in six places and left each route carrying a hook it used once.

The comment is not a column. A record has no `notes` field. The thread on
its detail page is where notes live, so the box writes into that thread
rather than adding a second place to look. It is create-only: on an edit the
thread is already on screen with its own composer, and a box on the edit
form would silently append a new comment every time someone corrected a dip
count.

#### useSearchFilters

An explorer's filters are part of where the operator is, not only how the
page looks. Held in component state they are lost the moment anything
navigates: open a record, press Back, and the list they had narrowed to
comes back reset. They also cannot be handed to a colleague, or kept in a
bookmark, or reached again after a reload. So the state is the URL.

A filter change replaces the history entry rather than pushing one, so Back
still means "the page before this one" instead of walking backwards through
every checkbox the operator ticked. The navigation is cast because it moves
within whatever route mounted the hook, which the router's typed `to` cannot
express from a shared helper.

#### useDebouncedTextFilter

Committing per keystroke would put a navigation behind every letter, and the
list would re-query on each one. Back, forward or a filter reset changes the
URL from outside, and the hook adopts it unless the operator is mid-edit,
which would yank the text they are typing.

### activity

#### useProfileActivity

The person and the day are both in the query key, so without
`keepPreviousData` every change of the day drops a populated log back to
placeholder rows. The previous log stays until the new one lands, which is
what the rest of the explorers do when the map moves. A refusal is a
permanent answer. Retried, it spends the backoff looking like a slow load,
and the operator never learns the window was refused, so
`ActivityRequestError.refused` switches the retry off.

#### useActivitySelection

A row and a pin are two views of the same entry, so picking either has to
move the other: the map flies to what the list selected, and the list
highlights what the map was clicked on. Keeping that in one hook is what
stops the two halves drifting into separate selections, which is how a card
ends up describing a record the map is not looking at.

### auth

#### useAuthSuccess

The sign-in, sign-up and invitation pages share one handoff so the snapshot
refresh and the organization-required branch are written once.

### dashboard

#### useDashboard

One `useQuery` for `GET /dashboard`, which answers every panel the client
cannot read off a synced table: the two awaiting queues, the unassigned
requests, the untreated flag, the activity strip and the people in the field
today. One query is one timer, which is why five panels are one endpoint
rather than five, and why the page carries no refresh control: focus and the
five-minute interval are the cadence. The app's default is
`refetchOnWindowFocus: false`; this page is opened and left open, and the tab
coming back into focus is the moment a stale number matters.
`docs/dashboard-spec.md` is the rest.

### larval-surveillance

#### useSpeciesName

One id through the shared taxonomy read, because the catalog is eager and
small. The habitat detail and the inspection detail used to each define it.

### adult-surveillance

#### useTrapDirectory

A method only gets a tab if an active trap uses it. An organization that has
never run a gravid trap should not be offered an empty gravid tab, which is
why the tabs are built from the traps rather than from the catalog.

#### useTrapRoutes and useHabitatRoutes

The sort moved into the query, which drops `localeCompare`'s
`sensitivity: 'base'`. Route names in practice are codes and zone numbers,
so the trade costs nothing on screen.

#### useTrapRouteStops

One query, not two. This read the whole eager `traps` table into a `Map` and
looked each stop's trap up in it. The join does the same work without
materialising every trap the organization runs to name the twenty on this
route.

### daily-work

#### useDailyWorkDay

The day is held in the URL so one person's one day is a link. Clearing the
picker lands on today rather than on no day at all, because the page has to
be showing something and today is what it opens on. There is no filter
counting, since the page has no filter card to report a count to; the day is
what the page is rather than a way of narrowing it. A stale or hand-typed
future day is drawn as today, so the address has to say today as well. Left
alone, the link is one that names a day it does not show, and it stays wrong
every time it is opened or copied.

### gis

#### useAddressGeometry

The synced row carries the centroid but not the geojson, which stays
server-only, so views needing the drawable geometry read it over HTTP the
same way habitats and regions do. `seedAddressGeometryCache` beside it puts
a shape the client just wrote into the cache so the detail page draws it
before the request answers.

#### useAddressSearch

Clearing has to reach both the field the operator is looking at and the
committed term on the URL, or the box empties and the list stays narrowed.

#### useRegionDnd

The drop clears `draggingId` itself rather than waiting for `dragend`: a
drop onto another folder re-parents the row, so React unmounts the element
the drag started from and its `dragend` never fires. Left to that handler
alone, the moved region would keep rendering in its dragging style until the
next full re-render.

#### useRegionRename

Committing closes the field before the write is awaited, so the row goes
back to reading its name from the collection immediately: the optimistic
update is what shows the new name, and a failed write reverts to the synced
one. Waiting would leave an open text box over a name that had already
changed.

#### useRegionEdits

Both writes are guarded on the current row rather than sent blindly.
Renaming a region to the name it already has is a command with nothing to
change, which the domain refuses, and a drag that lands a region back in its
own folder is the same. The `null` folder means unfiled, which is why the
move guard compares the value rather than asking whether one arrived.

The rows arrive as a value rather than through a ref. The ref existed to
keep these two handlers stable while still reading the latest rows, and
writing it during render is what the compiler refuses (`Refs`, #823). Naming
`regions` in the dependency lists is the honest form: the handlers read the
rows, so they change when the rows do, and nothing downstream depends on them
not changing.

#### useSummaryForm

A form's state machine, kept out of the component that draws it. Six pieces
of state and a save that has to know about all of them is the whole of what
the dialog is; leaving them inline made the render unreadable and the rules
hard to find among the JSX. The rules themselves and the metric inputs live
in `components/gis/weather/weather-summary-form.ts`, shared with the dialog.

`onWriteYear` is called before the write, not after. The card lists one year
at a time, and a write into a year its live query does not cover waits out a
txid that never arrives on that subset: `settleWrite` swallows the
five-second timeout, so the dialog closes late over a row the user cannot
see.

#### useActiveYear

The station rides along with the chosen year because the router keeps the
card mounted across a move from one station to another, and 2019 chosen on
one station is not a year the next one has.

#### useWeatherUpload

The page's whole state machine, kept out of the component that draws it: six
pieces of state, an assessment that has to be computed once rather than per
render, and a commit that answers a refusal with a dialog. The assessment is
computed once when the file is parsed, because the ids it mints are the ones
the commit sends, and re-minting them would make a retry insert under
different ids. It reads every reading the station holds, not the year the
detail page was showing, because the assessment answers insert, update, no
change or fail per row against what is already stored, and a narrower window
would report a row overwriting a 2019 reading as an insert.

Only the rows the review did not fail are sent. The server assesses again
and can still refuse one, but it is not asked to write a line the user has
already been shown as unwritable. Both acknowledgements go out withheld,
which `ask: true` sends as `false` so the guards run at all. What the file
would overwrite is the server's to answer against stored rows, and it
answers by refusing once and naming what it found, which is a better
question than one asked from the client's own estimate.

#### useStationFilters

The filter state is on the URL so a shared link and Back out of a station
both land on the list the operator had narrowed to. The status defaults to
active, matching Traps: a retired station keeps its readings and stays
reportable, so it is history rather than work, and a map that opens on every
station an organization ever ran is a map nobody can read. Clearing the
search reaches both the field and the committed term, for the reason
`useAddressSearch` records.

#### useInspectionFilterDefaults

The map's window is a fixed number of days back rather than a calendar
month, so it opens on the same amount of work whenever it is opened. `today`
is separate from the window because the date control needs it either way:
it is the upper bound on both pickers and what a preset counts back from.

The map and the table open on different windows, and the difference is the
surfaces rather than an oversight. The map draws every matching record at
once, so a season of inspections is a solid block of dots over the same
streets and it opens on the last 30 days. The table shows 50 rows whatever
the reach, and its header says it holds every inspection the crews have
recorded, so it opens on all of them. Once a reader sets a date, both
surfaces read it out of the same two params and answer the same window.

#### useInspectionFilterState

A deep link from an overview panel, a shared link, and Back out of a record
all land on the same view, so the state cannot live in a component. What a
component wants back is a plain value and a setter per filter, and building
those out of one patch function is the bulk of what either route would
otherwise do before it renders anything.

#### useSpeciesComposition and useSamplesAwaiting

The two live-data reads no other domain has, once the larval overview's
date helpers moved to `lib/local-date` (#906). Inspection queries stay flat,
a single on-demand subset keyed on `inspection_date`, rather than nesting
sample and species includes: a nested include fans out an Electric subset
request over every inspection id in the window, whose URL exceeds request
limits and fails. Sample-derived panels read from a server endpoint instead,
which is `useSamplesAwaiting`: the awaiting set spans every habitat in the
window, which a nested on-demand include cannot gather in one bounded
request. Both use the status-gated `useLiveQuery` rather than the suspense
variant, because the suspense hook hangs after a navigation unmount over
on-demand collections. A row with no larvae counted contributes nothing to
the composition, so an inspection that found a species and recorded no
number does not read as a zero-count species.

#### useHabitatRouteStops

One query, not three. This read the route's items, then the habitats those
items named, then the addresses those habitats linked, each waiting on the
render before it, and the last two re-running whenever the id set moved. It
is one join now. The planner collects the join keys each side produces and
asks the on-demand collections for exactly those rows, which is the same
three subsets minus two round trips through React.

#### useHabitatRouteStopCounts

Reads the organization-scoped `route_items` shape, the same on-demand
collection the map preview subscribes to, so counting all routes adds no
extra round-trip. It is named apart from `useRouteStopCounts` in
`hooks/queries/use-routes.ts`, which counts every route kind.

#### useRouteHabitatSearch

Named apart from `useHabitatSearch` in `hooks/queries`, which filters the
synced habitats client-side; this one asks the server, because the route
picker searches by name and address over every habitat the organization
holds.

#### useInspectionDetail

The `/map/inspections/:id` display projection is the single source for the
detail page's header, map, findings and context. An inspection is not
editable in v1, so a one-shot fetch, which also bundles the geometry Electric
omits (ADR 0009), is simpler than reassembling the record from synced
collections.

#### useHabitatLabel

One id through the shared lookup rather than its own `findOne`: the naming
rule, that a Habitat with no name reads out its coordinates, lives in one
place, and a form that already has the site in view pays nothing to ask
again.

#### useNewInspectionDraft

The id is minted up front so the samples, crew and comment can be written
the moment the inspection lands, and so their streams are live before the
save fires: a write against a cold stream times out waiting for its txid
confirmation.

#### useHeldRows

The live query is rebuilt when the limit changes, so it starts empty and
reports not-ready until the collection has answered. Rendering that as it
comes would take the table away from under the reader at the moment they
asked for more of it. What is already shown stays correct: the wider window
is the same order with more of it on the end.

A new sort or a new filter is the case where it is not. The same rows in the
old order under a header that now says something else reads as a sort that
did nothing, and rows that do not match the filter just set read as a filter
that did nothing. So what is held is kept against the window key it was read
under and only handed back while that still matches. Under a new one the
reader waits on a skeleton instead.

The cache is state since #1184. It was a ref written and read during render,
which the compiler refuses, and the hook carried `"use no memo"` to say so;
the directive never removed the bail-out, it only changed what
`check:compiler-bailouts` logged. The last ready rows are written into state
in the render that reads them ready, which React re-renders before
committing, and the not-ready read is a comparison against the held window
key. The write compares the rows by identity, which is safe because the live
query hands back the same array until the collection changes; a caller that
rebuilt the array every render would loop.

#### useSampleGeoContext

The `/map/samples/:id` projection is the single source for the sample
page's header, map and context; the editable result fields, species counts
and disposition flags, are read back from the synced collections so
optimistic edits reflect live.

### operations

#### useCommandRunner

The two worklists and the request page send lifecycle commands that the
server refuses on their preconditions, and a refusal arrives as prose worth
showing rather than a fault: "Some stops are still pending" is an answer,
not an error. So every write goes through one busy flag and one report.

The report is a toast, the way `RecordDeleteDialog` and the record header
menu report a refusal (#1100). It used to be a string the page drew in a
destructive `Alert`, and those three pages were the only record pages
reporting a refused start, complete, cancel or reopen anywhere else. A form
keeps its refusal in-page, because a form is something the person can fix
and resubmit; `DetailPageHeader`'s docblock carries the rule, and
`AddMissionStopForm` is the caller that left this hook over it.

#### useMissionItemShapes

The Electric shape streams only the centroid (ADR 0009), so a stop that is a
ditch run or a treated block arrives as a dot. The drawn shapes come from
the mission's own display endpoint instead, one request for the whole
mission, because both surfaces that draw stops draw all of a mission's at
once. The cache key carries every item's `updatedAt`, so redrawing a stop,
adding one, or removing one refetches; nothing else does.

#### useMissionStopViews

The joins are in `hooks/queries/use-mission-stops.ts`. What is composed here
is what a page adds to them: the shape each stop was drawn as, which comes
from a `/map/*` endpoint rather than a collection, and the ordinal, which is
a fact about the list rather than about any row in it. A stop owns its
geometry outright, unlike an assignment stop, which is a pointer at a trap or
a habitat, so it always has a place on the map even when nothing it links to
has loaded. What the joins add is a name: the request it came from, or
failing that the address it sits at.

#### useMethodsForControlType

`recommendedMethodId` and `plannedMethodId` are both polymorphic by control
type, the id pointing at a different table for each, so a form that lets the
type change has to re-source its options from here rather than hold one
list.

#### The assignment read hooks

`useAssignment`, `useAssignmentItems`, `useAssignmentTargets`,
`usePendingTrapCollections`, `useAssignmentStops`, `useAssigneeOptions`,
`useOpenServiceRequests` and `useRouteSnapshotItems` were one module beside
the assignment pages. The writes used to live there too; they are in
`hooks/mutations` now, because they no longer depend on anything the reads
know: the endpoint reads a named command rather than inferring one from
which timestamp moved. What is left is composition, the stops joined to the
records they send a crew to, which is a page's question rather than a
table's.

`useAssignment` is also the warm-stream anchor on pages that write before
reading. `useAssignmentItems` is unfiltered by `entityType` on purpose:
unlike a route, an assignment mixes traps, habitats and service requests in
one worklist by design.

`useAssignmentTargets` reads one bounded subset per entity type and merges
them. Every query mounts unconditionally with an unmatchable-id fallback,
because a worklist made only of traps would otherwise change the hook count
between renders. The three are still separate reads rather than one join,
and that is what the polymorphism costs: `entity_id` points at a different
table depending on `entity_type`, so there is no column to join on.

`usePendingTrapCollections` exists because a trap stop means one of two
visits, set the trap or come back and empty it, and only the data says
which. The subset is keyed on the stops' own trap ids rather than reading
every collection, and the live query doubles as the thing that keeps the
on-demand collections stream warm: the Collect write lands on this page, and
a write to a cold stream times out waiting for its txid.

`useAssigneeOptions` puts "Unassigned" first because planning drafts may
carry nobody, and Radix Select forbids an empty-string item value, so
"nobody" needs a name (`NO_ASSIGNEE`).

`useOpenServiceRequests` carries no `organization_id` predicate: the shape
is authorized and scoped server-side, so a client-side organization filter
is redundant, and on a collection whose rows carry the column but whose
subset request does not accept it, it empties the page instead.

`useRouteSnapshotItems` returns the whole row rather than only the ids,
because the create page draws the new assignment's stops optimistically and
a stop that does not know what it points at cannot be drawn. The server
still reads each target out of the Route; what travels on the wire is only
the id pairing.

#### useRequestAddresses

A request has no name of its own, so the target picker is unusable until
these resolve. Addresses sync on demand (`docs/sync.md`), so this is a
bounded subset over exactly the request set, the same second-level join the
stop list does.

#### useMissionRun

A mission page is two jobs at once, working the stops and planning them, and
between them they need a dozen pieces of state that only ever change
together: which stop the map has selected, which one a dialog is asking
about, and whether a write is in flight. Left inline they put more than
twenty hooks in the route component and buried the rendering. So the page
holds one hook, composed of `useMissionLabels`, `useMissionSelection` and
`useMissionActions`.

`planEditable` folds the manager floor in, because the controls it gates,
adding, reordering and removing stops, sit inside the stop list rather than
behind a `WriteOnly` wrapper of their own. Progress is left ungated: it
belongs to the assigned collector, which is a fact about the mission the
server checks, not one the browser can settle.

`useMissionLabels` resolves `plannedMethodId` through the combined method
map rather than the one catalog the mission's type names, because the id is
polymorphic by control type, and an id that no longer matches its type
still labels itself.

#### useRecommendedMethodName

The id is polymorphic by control type, pointing at a different catalog for
each, so all four are searched rather than the one the type names, which
keeps the row honest if the type is edited afterwards.

#### useSearchResultList

Slices are accumulated in state rather than recomputed, because each one is
its own query key: without this the list would hold the first slice and the
current one, and every slice in between would vanish as the next arrived.
Infinite scroll rather than page numbers, and the cost is real and
accepted: there is no page to return to, so a result opened and backed out
of lands at the top of the list again.

`hasMore` is four conditions, and three of them are stops rather than the
obvious one. `rows.length < total` alone is not enough, because the sentinel
effect re-registers every time `next.isFetching` drops and `observe` fires
immediately for an element already in view. So a slice that never lands, a
failed request or an offset past the endpoint's own cap, leaves
`rows.length` short of `total` forever and the sentinel walks the offset
upward one request at a time with nothing to show for it. A short page is
the honest end of the list even when `total` disagrees, which it can:
`total` is counted when the first slice ran, and a record can be deleted
underneath a scroll.

The slice count is held beside the query it was grown for, and a count grown
for another query reads as one. That is the reset an effect used to make one
render late (#1183), and the late render was not free: it ran the two
queries with the old query's offset against the new query's text, one
request the list never showed.

#### useAccumulatedPages

Both halves of the echo are checked, not just the query: `offset` is on the
wire for exactly this, and it is what tells the second slice's answer apart
from the first's.

The rows are the two live slices overlaid on the remembered ones, and the
memory is keyed by the list it belongs to. It used to be a store the effects
copied each slice into as it landed, with a third effect emptying it on a new
query, three `set-state-in-effect` findings (#1183). A slice is now written
into the memory during the render it lands in, which React re-renders before
committing, and the memory for another query reads as empty rather than
being emptied. The write compares each landed slice to the remembered one by
identity, which is safe because TanStack Query hands back the same `results`
array until the answer changes; a hook that rebuilt the array every render
would write every render.

#### useEditableQuery

The URL is the shareable state and the field is what is being typed, so a
link opened cold and a query typed here reach the same request. The
navigation replaces rather than pushes, or Back would walk one keystroke at
a time.

The draft is held beside the URL query it was typed against, and a draft for
another URL query reads as that query. That is the reset an effect used to
make one render late (#1183), the frame in which the field drew the old draft
against the new URL. What this does not fix is older than the rewrite: the
debounced value lags the URL by one window, so a URL query that changes under
the field, by Back for one, is replaced with the debounced draft before the
window elapses. The suite covers the render order and not that.

### queries and mutations

The two older folders were split to one hook per file in the same sweep.
The types and pure helpers a family of hooks shared moved to a `*-view.ts`
module beside the queries and a `*-fields.ts` module beside the mutations,
which is the shape `hooks/queries` already used for its row views.

#### The catalog roster hooks

`useHabitatTypeRoster`, `useCollectionMethodRoster`, the four control method
rosters, `useCollectionLureRoster` and `useNotificationTypeRoster` are one
question asked of eight tables: what may this field be set to. The explorers
ask a narrower one through `useNamedCatalog`, which returns filter options
and an id to name lookup and drops everything else. A form needs two things
those drop. `isActive`, because a retired catalog row stays selectable: these
forms are where past seasons get keyed in, and a method the organization
dropped last year is exactly what a record from last year was worked with,
so `lifecycleOptions` marks the row and sorts it behind everything still in
service. `customSchema`, because a catalog row can carry extra fields the
organization defined, and picking the method is what decides which of them
the form renders; `collection_lures` and `notification_types` are the
catalogs without that column, which is why the roster comes in two shapes,
`usePlainCatalogRoster` and `useSchemaCatalogRoster`. Every catalog here is
eager, so the reads suspend: the rows are there before a form can be
reached.

The generic is a helper each named hook calls once, rather than one hook
taking a collection: a caller passing a different collection between renders
would change which query runs under the same hook slot, and naming them
keeps the call sites reading as what they fetch.

#### The catalog record hooks

The wider read behind the rosters. A roster answers "what may this field be
set to" and returns three columns; the management pages are where the
catalog is maintained, so they need every column the dialog edits and both
halves of the lifecycle split, active rows and retired ones, each already in
name order. Two queries rather than one list the page partitions:
`is_active` is a pushed-down predicate, and the split is what the page frame
is built around. It is also what keeps the retired half from re-rendering
when an active row is renamed. The eight catalogs are four shapes, so there
are four half hooks, `useCollectionMethodHalf`, `useHabitatTypeHalf`,
`useDescribedHalf` and `useControlMethodHalf`, and eight hooks in front of
them, each fixing its own collection for the reason the rosters record.

#### The chemical roster hooks

`useInsecticideRoster`, `useVehicleRoster`, `useEquipmentRoster`,
`useFormulationRoster` and `useFormulationComponentRoster` are separate
from the catalog rosters because these are not the same question. Those
seven tables are all one shape, an id, a name, a lifecycle flag and a custom
schema. These five are each their own shape: a product carries the unit it
is measured in, a formulation carries a batch size, a component carries how
much of what. Flattening them into one listing would mean a picker reading
fields its catalog does not have. All five are eager, so the reads suspend.
Field names stay camelCase, as everywhere in `hooks/queries`: the columns
are snake_case and this is the seam that turns them over.

#### useInsecticideRecords and useInsecticideBatches

Two reads with different sync modes behind them. Products are eager, since
every application form picks one, so the list is one query over the whole
table. Batches are on-demand, so they are read one product at a time, and
through the status-gated `useLiveQuery` rather than the suspense variant,
which sticks after a navigation unmount over an on-demand collection. The
list is one query rather than the two halves the lookup catalogs use: the
page renders retired products inline under a disclosure rather than as a
second table, and the order, active first then by trade name, is what puts
them there.

#### useFormulationRecords and useFormulationComponents

Both tables sync eagerly, since a formulation is picked on every mixed
application, so this is two whole-table reads rather than a per-recipe
subset like the insecticide batches. They are not joined. The page renders
the components under the recipe row that was expanded, so what it needs is
every component grouped by formulation, and a join would hand back one row
per component with the recipe repeated on each. The grouping is a `Map`,
which is the one thing a query cannot return.

#### useVehicleRecords and useEquipmentRecords

Two tables the organization owns that are not quite catalogs: an
application names a vehicle and a piece of equipment, but neither carries a
custom schema and both carry a free-form `metadata` bag instead. They
differ from each other in two columns, the name column's spelling and a
serial number equipment has and a vehicle does not. That difference is
resolved in `control-asset-record-view.ts` rather than in the page. The old
code carried a `VehicleRow | EquipmentRow` union all the way to the table
cell and asked `isEquipmentRow(asset)` to decide what to render, which meant
every consumer had to know both spellings. One record shape with
`serialNumber: null` on a vehicle says the same thing once.

#### useControlCatalogCounts

The overview's catalog tiles used to read every row of five eager tables and
count the active ones in JavaScript. Five `count()` aggregates instead,
through `useActiveCount`. The aggregate is computed in the query pipeline,
so a catalog that gains a row emits one changed number rather than a new
array of every row in the table, and the filter is a predicate, so an
organization's retired methods are never materialized at all.
`useActiveCount` is called five times from one hook with five different
collections; that is a fixed list in fixed order, so the rules of hooks
hold.

#### useRecentSourceReductions and useRecentBiocontrolActions

The two right-hand panels of the control-operations overview, which read
the same window and differ only in which table they read. Both are windowed
on a `date` column, so the bound is a plain `YYYY-MM-DD` string, no zone
and no instant. See `use-recent-collections.ts` for the adult case, where it
is neither.

#### usePeopleDirectory

A Profile is who work is attributed to; a Membership is the access that
links a login to it. The two are separate records on purpose, since a
Profile outlives the access, which is what lets an organization end
somebody's login without detaching every inspection they ever recorded, so
this is a left join and the membership half is optional. The groups are
what the section shows, not a filter a caller passes: active linked, a
login still working; inactive linked, a login no longer working, whose
records stay attributed; historical, no login at all, somebody the
organization records work against who never signed in or left before
SIMMER, active ones first because an inactive historical Profile is the
deepest end of the list. Each group is its own query through
`usePersonGroup` rather than one query grouped in JavaScript, because the
predicates and the sort differ and both push down.

#### useTagCatalog

`useTagOptions` is the other read and answers a different question: which
Tags a filter may offer, in one flat list including retired ones. This is
where the catalog is defined, so it carries the colour and the description
the dialog edits, and it splits the lifecycle the way the page is laid out.
Two queries through `useTagHalf` rather than one list the page partitions,
for the reason the catalog records record. No organization predicate: the
shape is scoped to the organization server-side, so filtering by
`organization_id` here re-states server-side authorization as a client-side
filter, and a stale column spelling in one empties the list rather than
narrowing it.

#### useRegistration and useRegistrationSubscriptions

Two queries rather than one join, because the subscriptions are a list and
a join would repeat the registration once per row. The detail page and the
edit form both want the pair, and both want the list separately from the
record. The record reads through `useRecordById`, which holds the on-demand
rule. The subscriptions do not: they are read by the registration's foreign
key rather than by id, so that hook states the rule itself, status-gated
`useLiveQuery` and never the suspense variant.

#### useRouteCatalog and useRouteStopCounts

The two planning surfaces read their own kind, `useHabitatRoutes` and
`useTrapRoutes` each filtering on `route_type`, because a habitat route and
a trap route are different screens with different stop pickers.
`useRouteCatalog` is for the one caller that wants both: snapshotting a
Route into an Assignment, which mixes trap, habitat and service-request
stops by design. `useRouteStopCounts` is unfiltered by `entity_type` for
the same caller: a picker that offers both kinds of route and reports zero
stops for half of them is worse than one that reports none at all.

#### The weather summary hooks

A summary is one station's one reporting period and an organization
accumulates them faster than any other weather record, so the table is
on-demand: nothing wants the whole table, and one station's detail page is
exactly the subset the mode exists for. `useLiveQuery` rather than the
suspense variant, because the suspense hook sticks after a navigation
unmounts it on an on-demand collection.

Two reads, and they are not interchangeable. The detail card shows one year
at a time, because a station logged daily for ten years is 3,650 rows in
one table. The import page compares a parsed file against everything the
station holds, because a year bound there would report a row that
overwrites a 2019 reading as an insert. So the year is a parameter of
`useWeatherSummaries`, and `useAllWeatherSummaries` is the import page's,
named so that reaching for the whole set is a decision. Both are
`useStationSummaries` with a different window. `useWeatherSummaryYears`
reads two columns rather than eleven, because it fills a row of tabs and
nothing on screen reads a metric off it; it is still the station's whole
set, since which years have readings cannot be answered from one year's
rows. A `null` year matches nothing: an empty card has no year to show, and
reading a station's whole history to fill one is what the bound exists to
avoid.

The dates are strings and stay strings. `start_date` and `end_date` are
Postgres `date` columns, which the row schema keeps as `YYYY-MM-DD` rather
than parsing. A `Date` built from a bare date string is midnight UTC, and
rendering that in a western timezone shows the day before, which is why
`summaryYear` reads the parts directly.

#### useDuplicateCandidates and useNearbyHabitats

Both are live data behind an irreversible merge, so both refetch on focus,
for the same reason `useDeleteImpact` does: a cleanup page left open over
lunch would otherwise offer a merge over a set a colleague has already dealt
with. The merge command re-checks every id inside its transaction regardless
and refuses ids that are gone; the read is what lets the page stop proposing
them rather than fail at the button. Two records for one catch basin agree
about nothing except where they are, so a shared-value search finds neither
and the nearby read is the only evidence a habitat merge has. The radius is
the caller's because how far apart the two records landed depends on how
each was filed: a GPS fix under tree cover and a point dropped on an aerial
can be tens of metres apart for one ditch.

#### useHabitatGeometry and useHabitatLocationContext

Habitat geometry is not part of the Electric shape (ADR 0009), the synced
row carrying only a centroid, so any surface that needs the real polygon
reads it from `/map/habitats/:id`. The habitat detail page needs it to draw
itself; the control-action detail pages need it to draw the habitat behind
the action. Keyed on habitat id alone and not `updatedAt`, so an unrelated
field edit does not refetch geometry and the create and edit flows can seed
the exact key through `seedHabitatGeometryCache`. The context hook returns
`undefined` rather than an empty context when there is no geometry, so the
card falls back to its plain single-record behaviour instead of drawing an
empty legend.

#### The catalog mutation hooks

Eight tables asked the same four questions: add one, edit one, retire or
restore one, delete one. What differs between them is three columns and
five command names, so that is all each hook states; the writes themselves
are in `catalog-writes.ts` and the shared types in `catalog-fields.ts`. The
eight are the three organization lookups, the four control method catalogs
through `useControlMethodMutations`, and `notification_types`. `tags`,
`units`, `insecticides` and `formulations` are catalogs too and are not
here: each has a shape of its own, a colour and an assignment, a conversion
factor, a chemical, a mixture, and folding them in would mean a fields type
that is mostly absent members.

Each hook writes its own row literal under `satisfies`, which is what makes
a wrong column name a compile error rather than a body the server quietly
drops. It is the reason these are short hooks rather than one generic taking
a column descriptor: the descriptor would have to be cast into a row, and
the cast is exactly what let camelCase rows through in silence. The four
control method catalogs have identical columns, a name and a custom schema,
so one row literal covers them and the collection is a parameter of
`useControlMethodMutations`; the catalog is fixed per call site, so which
query and which commands a given hook slot runs never changes between
renders. Every catalog write reads the organization and the actor through
`useWriterIdentity`, which was three identical private hooks before the
split.

#### useInsecticideMutations and useInsecticideBatchMutations

Two tables with the five catalog commands each, so the writes come from
`catalog-writes.ts` and only the columns are here. What makes them not
quite catalogs is that a product carries nine editable columns and a batch
belongs to one: the batch is the tin on the shelf, the product is what is in
it. The lifecycle is a command on both; the old PATCH read `is_active` and
worked out the direction. `inventory_unit_id` and `conversion_factor` are
columns the form does not offer, so a create leaves them null and a save
never names them. They exist for an organization that buys in one unit and
applies in another, and nothing in the app sets them yet.

#### useVehicleMutations and useEquipmentMutations

The same five commands the lookup catalogs answer to, so the writes come
from `catalog-writes.ts`; only the columns differ, in
`control-asset-fields.ts`. A vehicle is a name and a metadata bag, equipment
adds a serial number. These sit at the `MANAGER` floor, unlike the lookup
catalogs, every one of `controlOperations.createVehicle` through
`deleteEquipment`: vehicles and equipment are part of running the work
rather than configuring the organization.

## apps/admin

#### useInsideOrganization

ADR 0011: an operator does not write an organization's records from outside
it. They hold a membership in that organization and act through the ordinary
organization routes, which means holding an ordinary organization session,
and a session belongs to one organization at a time. So a page that writes
organization records asks first whether this session is in this
organization; if it is not, every write on the page would land in whichever
organization the session is in, and the gate is the page.

#### useEnterOrganization

The switch goes through `exchange`, not straight at the endpoint. Re-sealing
the session against another organization spends the same single-use refresh
token a renewal spends, and a shape stream that met an expired access token
at this moment would be renewing through `/auth/me`. Spending it twice is
what WorkOS reads as reuse, and it ends the session (#301), so the two take
turns. The switch alone goes inside the exchange, because `refresh` takes
the same browser-wide lock, which is not reentrant.

`run` takes the busy flag off in a `.finally()` rather than a `finally`
block, because the React Compiler cannot lower a try statement with a
finalizer, and one bails the whole hook (#856). A refusal is not a
malfunction, and the two want different words: the refusal has a fix,
somebody grants the membership, and saying so is the point of the gate; the
reason WorkOS returns for it is a code like `invalid_grant`, which is not
that. Everything already fetched was fetched as somebody else, in another
organization, so the whole query cache is invalidated after the switch.

#### useOrganizationFoundations and useCreateFoundation

Standing a new organization up: its regions and addresses, the method, lure
and habitat lookups its forms read from, the species it sees locally, and
its first traps.

The read is an operator read. One `GET /admin/organizations/:id/foundations`
returns all of it at once, which is why this is a single query rather than
eight, and it answers for an organization the operator is merely looking at.
It lives in `api.ts` with every other `/admin/*` call, so a refusal arrives
carrying the server's code.

The writes are organization writes (ADR 0011). They go to `/foundation/*`
and `/adult-surveillance/traps` as a member of the organization, through the
same domain command builders and the same writers `apps/web` reaches on
`/commands/{table}`, so a region created here and a region created there are
validated by one set of rules and attributed to a real person. They require
the session to be inside the organization; `OrganizationSessionGate` is what
puts it there. No path names the organization, because an organization
endpoint takes it from the session, which is the whole point of entering the
organization first.

These six creates are the whole of the older per-domain write surface now.
`apps/server/src/organization-seed-routes.ts` is the module that answers
them, and it holds nothing else (#634). A seventh write from this console
goes on `/commands/{table}` like every other write in the product. Commands
carry client-generated ids, so every create mints one here rather than
reading one back.

#### useOrganizations, useOrganizationMemberships and useInvalidateOrganizations

Organizations and memberships come from plain `/admin/*` JSON endpoints
rather than an Electric shape. They are operator-scoped, not
organization-scoped, so there is no organization to authorize a shape
against and nothing to stream. That makes them the same case `apps/web`
uses `useQuery` for: fetch, cache, invalidate on write. The keys are shared
from `hooks/queries/organization-keys.ts` so a create or an invite
invalidates the exact lists that just went stale, rather than each page
inventing its own key and quietly showing yesterday's data.

#### useOrganizationIdentity

Read rather than fetched: the operator arrived through the directory list,
so it is already warm. The WorkOS id is what entering the organization
switches the session to.

## apps/preview

#### useCssTokens

The design-token screen's one read: what the stylesheet resolved each custom
property to, which is what a person opens the screen to look up.

Read in a lazy `useState` initializer rather than an effect, because the
value never changes after mount and the effect drew one render with no tokens
(#1185). A caller that hands in a different list is re-read in the render
that does, compared by content so a list written inline does not loop.

## apps/mobile

#### useAuth

The session has three states rather than two. "We have not asked yet" and
"we asked and the answer was no" look identical in a nullable session and
are completely different to render: the first is a splash, the second is the
sign-in screen. Collapsing them is how an app comes to flash its login form
at an already signed-in user on every cold start. `AuthProvider` in
`auth/auth-context.tsx` fills the context; the hook only reads it.
