# Components

Every UI component in `apps/web` and `apps/admin` lives under that app's
`src/components` folder, in a kebab-case file, grouped by the surface it draws:
`components/larval-surveillance/habitats/`, `components/my-organization/`,
`components/auth/`, and so on beside the shared folders (`map/`, `explorer/`,
`record/`, `forms/`). `src/routes` holds route modules alone. The TanStack
Router hyphen prefix that used to mark a route-private module
(`routes/-habitat-form.tsx`, `routes/my-organization/-components/`) is not
used: a module the router should ignore moves out of `routes/` rather than being
renamed inside it.

A component's factored-out parts are separate files beside it. A form is a page
module plus a `*-form-values.ts` holding its value type, its defaults, its
field-path map and its validator, plus one file per section that stands on its
own (a picker, a timing section, a samples section). A page that draws several
cards is one file per card. The tests mirror the tree under
`src/tests/unit/components`.

A component's docblock says what it draws and what it takes. The reasons behind
its shape, the alternatives that were measured and the traps a caller can fall
into are recorded here instead, one heading per component, so the docblock
reads as documentation and this file reads as the decision record. A new
component that carries a decision adds a heading here.

## apps/web

### activity

#### ActivityFamilySection

There is no day heading over the families (#1003). The surface this page
replaced read a window of days and needed a fold past four hundred rows; Daily
Work reads one day and the stepper already names it, so the heading repeated
the header and the fold hid the whole log behind one click. The stepper is how
past days are scanned. A family still folds, because a day where one family did
forty things and the rest did two is common.

#### ActivityRow

The record's state is a pill rather than the row's dot, because Daily Work
paints nine record kinds on one map and spends the dot on which family the work
belongs to. Every explorer answers the other way, since it paints one kind.

### adult-surveillance

#### collectionDay

The instant becomes a day in the organization's zone, matching how the server
windows and orders these rows. Returning the raw timestamp let every caller take
its UTC prefix, so a trap emptied at 10:30pm read as the next day on screen
while the server filed it under the day the crew worked.

#### TrapPicker

The picker lists every trap it is handed, retired ones included, and the caller
chooses the set: the route editor and the assignment target picker pass
`useActiveTraps`, the collection form passes `useTrapOptions`. The picker used
to refuse retired traps itself, and the collection form, which seeds a retired
trap from a trap page, could not get it back after clearing the field.

#### collectionTimingStamps

Both stamps come off one clock. `operationalDayAsInstant` clamps a same-day
stamp to now, and the domain requires `collectedAt >= startedAt`, so two
separate calls for the same day landed milliseconds apart and a trap set and
collected on one morning could stamp the set after the collection and fail an
ordering nobody entered.

#### CollectionYears

The open year is component state rather than a search param. It belongs to the
trap in view, and a year that is meaningful for one trap need not exist for the
next, so the pane re-anchors on the first group whenever the trap changes.

#### SeasonPicker

A trap can carry fifteen or twenty seasons, and a tab per season made a strip
that scrolled sideways inside half the header with nothing saying more tabs
existed, and the open season could sit scrolled out of view (#1262). So the tabs
stop at the three most recent seasons and everything older is a menu under
Earlier Seasons, which keeps the row one width however much history there is.
The undated group stays a tab and does not count against the three, because it
is the unfinished work an operator came looking for. `splitSeasons` in
`trap-directory-data.ts` is that cut.

An older season is open with no tab selected, since the history's `Tabs` value
is a key no trigger carries. The menu trigger shows that season and its count
and draws the tab's underline, and the radio item under it is checked, so the
open season reads as selected in both places. Radix labels a panel by its tab's
id, which does not exist for an older season, so `CollectionYears` points the
panel at the menu trigger instead.

The shared `TabStrip` in `packages/ui-web` is unchanged. Every other strip in
the app has a fixed set of tabs, so the bound belongs to the one surface whose
length comes from years of data.

#### trapSummaryGroupings

The Traps summary, built the way `habitatSummaryGroupings` builds the Habitats
one (#1372). A collection method is added to `methods` and drawn top 5 and "n
more", and Active and Inactive set `status`, drawn Active first whichever
holds more. The map opens on `status=active`, so the server counts active
traps only, and the first summary a reader sees draws Active alone and
selected. Clicking it widens to `all`, and Inactive appears beside it. Every
trap carries a method, so there is no "No method" group to draw as text.

The filter card and its chips sit in `trap-filters.tsx` rather than in the
route, which is what lets the summary draw the chips above its groupings and
the Traps Table draw the same card. The Active and Inactive labels are
`TRAP_STATUS_LABELS` in `legend.ts`, read by the control, the chip, the map
key, the Table and the summary.

#### collectionSummaryGroupings

The Collections summary, built the way `trapSummaryGroupings` builds the Traps
one (#1373). Problem reported sets `problems`, Awaiting identification sets
`awaiting`, and a collection method is added to `methods`, drawn top 5 and "n
more". Each flag draws only its flagged side, since no filter selects the
opposite, and a flag no collection in view carries is not drawn at all.

Zero result and Collected are figures rather than groups, drawn as text under
Status, because the Collections filters have no status control for them to
write. The server counts them off the same status expression the row's dot
and the map read, so a figure cannot call a collection something its row does
not. Problem reported is the flag and not the status of that name: a trap
still out with a problem on it is flagged, and reads Trap out.

The filter card, its chips and the pieces a row draws (`collection-row-parts.ts`)
moved out of the route so the Collections Table could share them. The chips
are the route's as they were, so a moved date window still draws no chip.

#### trap-directory-data

Undated collections sort ahead of the years because work that is not finished
is what an operator is looking for. Duplicate species/sex/status rows in
`collection_species` (the table has no uniqueness constraint) are keyed off the
earliest row and the rest left alone rather than folded together.

### app-shell

#### WorkspaceChromeFallback

The pre-shell fallback restates `ui-web`'s chrome widths rather than importing
the chrome, because the real chrome needs the shell context, identity and
navigation model this surface is still waiting on. The one shared value is the
rail's collapse key, so an operator who works with a collapsed rail is not shown
an expanded one for a second.

### auth

#### AcceptInvitationPage

A blank token is invalid with nothing to ask the server, so that answer is
derived from the token and the effect fetches for the rest. Setting it from
inside the fetch effect was the one synchronous `setState` there, a
`set-state-in-effect` finding (#1185), and the `active` flag guards the
asynchronous half alone, which is all it ever guarded.

#### NewPasswordFields

The password is always confirmed and the requirement list answers live. Before
this the only signal that a password was too weak arrived after submitting, and
on the invitation page it did not arrive at all.

### control-operations

#### The form validators

Every record form (trap, biocontrol, application, source reduction, outreach,
address, region, contact, mission, service request) runs the domain builder as
its only validation channel. Each used to carry a second, hand-rolled pass in
`onSubmit` that threw a bare string into the page alert, which told an operator
a save had failed without saying where to look; the address form's copy had
also drifted from the builder, so the display-name cap and the postal and
region formats came back as a save that failed for no stated reason.

#### formatAmountValue

No thousands separator, unlike `formatAmount` in `lib/format-count`: a recipe
amount is a measurement somebody types back into a mix, and `1,000 mL` is a
comma in a number.

#### productUsage

`12 gal · 128 fl oz` is a true answer to a question nobody asked, so amounts
whose units convert are totalled into the organization's default unit for that
kind of quantity with the originals named, and amounts that do not convert (a
larvicide applied both as pouches and by weight) stay a list. The total is
rounded to six places because twelve gallons plus a hundred and twenty-eight
fluid ounces is 12.999999999999998 in doubles.

#### InsecticideDrawer

Deletion lives inside the edit drawer rather than as a per-row control, because
it is rare and destructive; reversible lifecycle changes are the row's
`CatalogLifecycleButton`.

#### ControlMethodsPage

The page needs two floors. `update*Method` is `MANAGER` while `create*`,
`deactivate*`, `reactivate*` and `delete*` are `ADMIN`, and gating all of it at
`canManage` was #65: a manager who may rename a method saw no Edit control.

#### biocontrolSummaryGroupings

The Biocontrol Actions summary, built the way
`sourceReductionSummaryGroupings` builds the Source Reductions one (#1376). A
method is added to `methods` and a technician to `people`, each drawn top 5
and "n more". A biocontrol action recorded with no technician is counted on
the server and not drawn, because no filter selects "none".

Linked to a Habitat sets `habitat`, and a second click clears it. The server
groups on `habitat_id is not null`, and only the linked side is drawn, since
no filter selects the unlinked side. Like Problem and Awaiting on the
Collections summary, the grouping is left out when no biocontrol action in
view is linked, because clicking it would empty the panel.

Amount Released is drawn as text, one line per unit, through the summary's
`breakdowns` keyed by `release_unit_id`. Fish counted and gallons poured do
not add up, so the server never sums across units. Each line is labelled with
the unit's name and reads the amount with the unit's abbreviation, through the
same `formatAmount` the rows use.

The filter card and its chips moved out of the route into
`biocontrol-filters.tsx` so the Biocontrol Actions Table could share them, and
the row type and the name lookups into `biocontrol-row-parts.ts`.

#### sourceReductionSummaryGroupings

The Source Reductions summary, built the way `applicationSummaryGroupings`
builds the Chemical Applications one (#1375). A method is added to `methods`
and a technician to `people`, each drawn top 5 and "n more". A source
reduction recorded with no technician is counted on the server and not drawn,
because no filter selects "none".

Sources Eliminated is drawn as text, one line per unit, through the summary's
`breakdowns` keyed by `sources_eliminated_unit_id`. A count of containers and
an area in acres do not add up, so the server never sums across units. Each
line is labelled with the unit's name and reads the amount with the unit's
abbreviation, through the same `formatAmount` the rows use.

The filter card and its chips moved out of the route into
`source-reduction-filters.tsx` so the Source Reductions Table could share
them, and the row type and the name lookups into
`source-reduction-row-parts.ts`.

#### applicationSummaryGroupings

The Chemical Applications summary, built the way `collectionSummaryGroupings`
builds the Collections one (#1374). An insecticide is added to `insecticides`,
an application method to `methods` and an applicator to `people`, each drawn
top 5 and "n more". An application recorded with no method or no applicator
is counted on the server and not drawn, because no filter selects "none".

Amount Applied is drawn as text, one line per insecticide and unit. An amount
only adds up within one unit, so the server sums it per insecticide and per
`application_unit_id` through the summary's `breakdowns`, and one insecticide
recorded in gallons and in fluid ounces is two lines. The lines run largest
record count first, so they are cut at 5 like every other section. The rail
does not convert between units: `usageTotal` can, for a set of units that
convert, but a total in one unit beside lines it was converted from is more
than the rail has room for.

The filter card and its chips moved out of the route into
`application-filters.tsx` so the Chemical Applications Table could share them,
and the row type, its normalizer and the name lookups into
`application-row-parts.ts`. The filter was labelled Product while the summary
section over the same field said Insecticide, so the filter, its chips and the
Table column now say Insecticide, which is the `CONTEXT.md` term.

#### HabitatPicker (control-pickers)

A habitat the picker did not pick still has to say its name, through a subset
read, because habitats sync on demand. Without it the field drew its
placeholder over a value that was set, and the operator picked the habitat they
had just come from.

`includeRetired` is the one difference between its callers. A control action
or a request is new work, and offering a retired habitat invites recording
against it, so those forms leave it off. The inspection form passes it, because
an inspection is how a retired habitat gets looked at again (#1468).

### daily-work

#### legend

The four family dots used to sit in the filter card beside a count apiece,
which read as a control and was not one. On the map they are what the pins
mean, and a family the day recorded nothing in draws no pin, so it is not in
the key.

### dashboard

Four queues read Electric through `hooks/queries`, so a row moves the instant a
Collector saves. Everything else is one server round-trip in
`dashboard-data.ts`, refreshed on focus and every five minutes, and nothing on
the page says which is which. One endpoint rather than five because one query
is one timer, and there is no refresh control for the same reason.
`docs/dashboard-spec.md` is the brief.

### explorer

#### ExplorerCanvas

The map half of every explorer built on `useExplorerResource`. All eleven
routes wrote the same `MapCanvas` props, the measure and readout controls,
`fitToData`, `rememberCamera`, and the panel's inset and search width, and the
same conditional card under it; Service Requests wrote them inside a component
of its own (#1423). What still varies is the create menu, the key, and which
card draws, so those are the three props a route passes beside the hook's
`canvas` bundle and the panel.

The card is a function of the selected id, the panel's inset and the close
handler, and a route spreads that object into its card. A card takes no map
and moves no camera. The hook's flight is the only one a selection makes, and
a card that has better coordinates than the row is a reason to fix the row.

Service Requests had its own canvas component, `ServiceRequestsMapCanvas`,
moved out of the route in #1382 because the clustering setting its legend reads
was the route's fourteenth hook, and fallow scores a component's hook count
into its cognitive complexity. The route reads that setting again now, which
the two `useState` calls the hook took over leave room for.

It imports `MapCanvas` through the `components/map` barrel rather than from
`map-canvas.tsx`. Every route suite replaces `MapCanvas` with a stand-in by
mocking the barrel, and a direct import would draw a real Mapbox map in jsdom.

#### ExplorerSummary

What an explorer rail draws in place of its rows over 100 in view (#1244).
Paging 50 at a time through 14,000 habitats was not how anyone found one: the
map fits every filtered record on first load, so the first viewport is the
whole Organization, and the rail opened on "Page 1 of 285". The summary says
what is in view and how to narrow it, and the rows come back once a filter or
a zoom takes the count to 100 or fewer.

It is generic and takes groupings already built, because every surface's
groupings name different filters and the ten surfaces filed after Habitats
(#1369 to #1378) each bring their own builder. A group is a button only where
a filter selects its value, so a habitat with no type is counted as text. A
button's accessible name carries its count, `Tire, 2,104 habitats`, and its
pressed state says whether the filter already holds it, which is also how a
reader widens back out without opening the filter card.

It draws no count, Filters control, create control or Map/Table switch of its
own. The frame's header already holds all four, and drops the pager so the
count moves into the header row.

A group can carry a `figure`, text drawn where its count would be, which is
how the Chemical Applications summary draws an amount with its unit (#1374).
A figure is not a count, so it is never a button: nothing filters by an
amount.

`ExplorerMapPage` takes it through `summary` on the row results rather than as
a third results shape. The caller still hands over its rows, because the page
request that counted them is the one that fetched them, and swapping the
summary out for the rows on a zoom is then one prop going undefined.

#### The record tables

Every `/table` route pages through the `/map/*` list endpoint its map surface
reads, over `WHOLE_WORLD_BBOX`, with `usePagedMapResource` and
`ExplorerPagination`: Postgres filters, orders and counts, and the browser
holds one page of 100. Each table has one fixed order, the endpoint's, and no
column sorts. Service Requests is the one table with a control over it,
newest or oldest first, under the `order` param the Map's rail already sent.

The Inspections and Service Requests tables were the last two to move, in
#1403. Each ran a TanStack DB live query over an on-demand collection,
sortable by column, and widened its `limit` under a Load more button. Three
things went wrong with that, and paging on the server takes all three away.
The Inspections table opens on every inspection, and the first window joined
four tables in the browser, so it could hang on load. A total would have meant
loading the whole set to count it, so neither table could say how many rows
matched. And each sortable column needed an index on the collection built with
the query's compare options, or the window loaded every row; from
`@tanstack/db` 0.11.0 such an index read `desc` returns the wrong rows for a
number, so sorting Inspections by most dips first dropped the top rows.

The sorts that went were by dips, larvae and wetness on Inspections and by
number and age on Service Requests. None answers a question the filters do not
answer better: the density and larvae-found filters narrow to the visits that
matter, and a request's age is its date. A column sort comes back only with an
endpoint that orders by it.

### forms

#### CustomFieldsSection

Five forms held a byte-identical copy of the metadata editor, description
string included, and two more held the manual editor. The three shapes are
parameters now: a schema chosen by a method field, the same with `allowExtra`,
and manual mode.

#### LocationBand and LocationAddressField

Every band used to destructure the `DrawLocation` controller back into ten
loose props for `GeometryControl`, in the same order, which undid the
consolidation `useDrawLocation` exists for. Selecting an address sets
`addressId`, clears the unplaced-location error and hands the address to the
controller; those three statements were copied into eight forms and the
habitat form's copy had lost the middle one, so picking an address there left
the refusal on screen under a location the form now had.

On a form opened off a mission stop the band draws `StopGeometryButton` in the
geometry control's own button row, ahead of any `extraActions`, so it sits
beside the refusal a cleared geometry earns (#1233). A failed read of the
stop's geometry is said on the band's error line, and a refusal takes that
line while it is up, since the refusal is the one the person has to act on
first.

#### RecordFormFrame

The 15 record forms each drew the same 20 to 30 lines around their fields:
the form context, `RecordFormPage`, Reset and Save, the submit handler, the
error alert, and on the 13 located forms a `MapCanvas` with a `DrawToolbar`.
They differed only in the toolbar's record kind and prompt, what the canvas
drew besides the record's own shape, and a legend on three forms (#871).

The form prop is typed as the two members the frame calls, `AppForm` and
`handleSubmit`, rather than as the kit's whole form type or `any`. Reset,
Save and the alert read the form from context, so the frame needs nothing
else. It passes `measure="record"` itself because that is `apps/web`'s
measure for every column form, and a split form ignores it.

A form whose fields want a shorter line caps them inside the frame, so the
Contact form's alert now spans the field column rather than its 640px cap.
A dialog a form opens, the geocoder or the dry-conditions confirmation, sits
beside the frame, outside the `<form>`, where it sat beside the page before.

#### StopGeometryButton

"Use stop geometry". It reads everything off the `DrawLocation` controller,
so a form wires the stop into `useDrawLocation` once and the band needs no
second prop. It renders nothing off a stop, is disabled while the stop's
geometry loads or a draw is running, and after a failed read it retries the
read instead of restoring, because there is nothing to restore and a second
button for the retry would be a second control for one question.

### gis

#### addressSummaryGroupings

The Address Book summary (#1378). Addresses filter on search and Region
alone, so nothing in it is a button: locality and postal code are drawn as
text, each top 5 and "n more", and no click sets a filter.

They are groupings drawn without a click target, the way Service Requests
draws intake type, rather than `breakdowns`. A grouping answers a count per
value, largest first, which is all either figure is. A breakdown answers a
count and a summed amount per combination of keys, and there is no amount to
sum here, so it would carry a `sum` column nothing reads.

The server trims each value and counts a blank one with the nulls, so
` Monroe Township ` and `Monroe Township` are one line and an address with no
locality is never split between null and the empty string. That count is not
drawn: "no locality" is not a place, and on an address book imported without
localities it would take a top 5 slot. Values are not case-folded, because
picking which spelling to show would be a guess.

The filter card, its chips and the row's lines (`address-row-parts.ts`) moved
out of the route so the Addresses Table could share them. The Table's title is
the Map's, `Address Book`, rather than the register's `Addresses`: CONTEXT.md
glosses an Address as an address book entry, so both views are the book, and
the two switch segments name one page in two forms (#985).

#### RegionBoundary (import-parse)

Read from the geometry register rather than a hand-written pair. The pair
agreed with the register by coincidence, and widening the policy would have let
`boundaryPositions` read a Point's `[lng, lat]` as a ring list with nothing
failing to compile.

#### region-tree

The two pure halves sat inline in the explorer route until #937, where the tree
rendering around them made a 917-line module that `fallow dupes` could never
flag, since it was one copy of everything.

#### Weather import

SheetJS is loaded with a dynamic `import()` so it stays out of the boot bundle,
and it comes from SheetJS's own registry rather than npm: the npm `xlsx`
package stopped at 0.18.5 and carries an unfixed prototype-pollution advisory
(CVE-2023-30533) that fires on reading an untrusted file. Values are taken as
canonical US units; a file in Celsius or millimetres needs a unit picker in the
review step rather than a guess. `toNumber` answers `undefined` rather than
`NaN` for an unreadable cell, because `NaN === NaN` is false and a sentinel
compared by `===` would let every unreadable cell through. Two decimal places
are rounded in the parser because a formula cell showing 1.25 can hold
1.2500000000000002, while the manual entry form lets the domain refuse.

The preview shows the first rows as SIMMER read them because counts alone say
the file parsed, not that it parsed correctly: a column mapped to the wrong
field produces a healthy "412 readable". Only the columns the file carried are
drawn.

#### WeatherSummariesCard

One year per tab, because a station logged daily for ten years is 3,650 rows in
one table. The tab follows a write because `weather_summaries` is on-demand and
a write into a subset the live query does not cover waits out a txid that never
arrives; `settleWrite` swallows that timeout, so it is a slow save over a row
the user cannot see, and moving the tab fixes both. The dialog is mounted on
the card for the same reason: the card is what keeps the station's subset
queried.

#### WeatherSummaryDialog

The end date follows the start until the user separates them, because most
entry is daily and the domain never emits an open end. Every metric is on
screen at once because an empty box on an edit clears the reading, and clearing
is the commoner correction.

#### WeatherStationForm

The builder is handed the stand-in geometry rather than `null`, because its
GeoJSON message pre-empts every other rule and the form's own guard never runs
to say where to fix it.

### landing

#### LandingPage

The banner sits in a wrapper outside the `lg:h-svh` split, for the reason
`OutletShell` grew a slot in #380: a strip added as a sibling row pushes the
page off the bottom of the window. A flex column and not a two-row grid,
because the banner renders `null` everywhere but staging, and an empty grid row
hands the rest of the window to the `1fr` row.

### larval-surveillance

#### HabitatDetail

Merging is reached from a habitat rather than from a list of proposals, because
two records for one catch basin agree about nothing except where they are. The
habitat somebody is already looking at is the one that survives, which is the
choice a cleanup page has to make with a radio and get wrong in silence.

#### habitatSummaryGroupings

The Habitats summary's four groupings. Status and Access draw in a fixed
order rather than by count, so Active is in the same place whichever side
holds more, and a side with no habitats in view is left out, since clicking
it would empty the panel. Untreated draws one side only, because there is no
filter for its opposite. `status` defaults to `active`, so the status grouping
opens on Active alone and pressed, which is correct.

#### habitat-geometry-cache

A small utility that eager code imports must not share a module with a heavy
component. `seedHabitatGeometryCache` inside the 1600-line detail module
dragged that module's whole dependency graph into the eager route graph,
including the only `recharts` import in the app, which put about 315 KB of
charting library in the boot payload to support a pie chart on one detail page.

#### HistoryTab

The five history tabs differ in their columns and their rows and in nothing
else, and before #865 each wrote the chrome around those out again.

#### route-data

Each dialog names its own intent rather than calling `habitatUpdatePlan`, which
reads a whole form against the row it started from; these change one field and
know which. The server refuses an intent whatever either side says.

#### Inspection filters and the surface switch

The map opens on the last 30 days and the table on every inspection, and that
is the surfaces rather than an oversight: a season of inspections is a solid
block of dots over the same streets, while the table shows 100 rows a page
whatever the reach. `regions` stays in the table's filter set uncounted so a link that
came from the map keeps its region selection through a trip to the table and
back. The endpoint takes `regionId` and the table sends none, because it has no
control that shows or clears a region. The sidebar cannot carry `search`, so the map/table pair carries its own
control, and both paths are literals because `tsc` checks a `to` and `search`
pair only where the path is one. The switch carries the shared filter keys, and
it takes the validated search so a filter at its default stays off the address
bar and each surface keeps its own opening window.

#### inspectionSummaryGroupings

The Inspections summary's five groupings, built the way
`habitatSummaryGroupings` builds the Habitats ones. Water draws Wet before Dry
whichever holds more, and the density bands draw in the scale's order, the
order the Density filter and the map key list them in, rather than by count.
A dry inspection has no density, so the bands are followed by "Not recorded"
as text, which no filter selects. Larvae found draws one side only, because
there is no filter for its opposite. A value with no inspections in view is
left out, since clicking it would empty the panel. Habitat Type and Inspector
need no such step, because each lists only the values the server grouped by,
and a grouped value has at least one inspection behind it. The count depends on the
date range, and the map opens on the last 30 days, so a season's worth of
inspections draws the summary only once somebody widens the window or zooms
out over a busy month.

#### InspectionFormPage

`inspectedByProfileId` is seeded with the acting profile because "Default to
me" said only that a default existed. The habitat field is the
control-operations `HabitatPicker` with `includeRetired` and `required`, and
the reason for the first is under that component. The form drew a picker of its
own until #1468, which held its picked label in its own state and so kept the
previous habitat's name over a value moved from outside.

Conditions opens with neither Wet nor Dry pressed on a new inspection. The
form used to open on Wet, so an inspection saved by somebody who never looked
at the toggle recorded standing water; the column's own default is `false`,
so neither default was a finding anybody made. The domain builder takes a
boolean and cannot say "not chosen", so `withConditionsChosen` lays the rule
over the builder's answer and puts `Choose Wet or Dry.` on the field, and the
findings stay hidden until a choice is made. An edit opens on the stored value.
`ConditionsField` and `DryNote` sit in the controls module so the page does
not carry the error wiring and a third branch of the findings ternary.

#### Key entry dialogs

The latest-value ref that kept the open-time rows out of the effect was written
during render, which the React Compiler refuses (#779, group A).

#### SpeciesResultList and DispositionSection

Split out of `samples/$id.tsx` in #1185, which was 995 lines against the
600-line limit, along the seam the route already had: the page owns the two
live queries and the commands, and hands the list its rows and three writes
and the section its four values and four writes. The two inline editors in
them, the count on a species row and the text fields under disposition, hold
their draft beside the stored value it was typed over, so a value that
changes out from under the input (a sync from another device) reads as the
new value with no reset. Each was an effect that set the draft one render
late, the frame in which the old draft drew over the new value.

`InlineEditField` under `stop-order` is the same idea with a mode: the draft
exists only while editing and the idle field shows `value` itself, so a
synced change lands without a reset. `TagEditorTableRow` holds its draft
beside the row it was edited from, and `ColorPicker` in `packages/ui-web`
holds the custom hex beside the selection it was typed over, keeping the
typed text when the selection is cleared, which is what its effect did.

#### sampleSummaryGroupings

The Samples summary's groupings, built the way `habitatSummaryGroupings`
builds the Habitats ones, plus one figure (#1370). Status draws in the order
the Status filter lists it rather than by count, and a click replaces the
status there, since the filter holds one.

The statuses are not exclusive in the data. A zero-larvae sample can also
carry an unidentifiable reason, and the Status filter tests each status with
its own clause rather than with the precedence the tile paints by. So the
server files a sample under every status whose clause keeps it, and the count
on a status is the page it narrows to. Grouping by the painted precedence was
the obvious read and is wrong here. The precedence paints that sample No
larvae, so the summary would say "Unidentifiable, 40" and the click would
land on 41. The statuses can then add up to more than the total, which is
also true of species, since a sample carrying two species is counted under
both. Both are `each` groupings on `summarizeByBounds`, which counts a record
once under every value in an array.

Non-mosquito material draws one side only, because no filter selects its
opposite, and takes the filter toggle's words rather than the brief's
"Non-mosquito". A status or the material side with no samples in view is
left out, since clicking it would empty the panel.

Larvae identified is a figure, a sum the server adds up over the box. It
draws as a text row under Totals, through the same section shape the
groupings use, because a value with no `onToggle` is text and
`ExplorerSummary` needed nothing new. It is labelled in full rather than as
"Identified" under a Larvae heading, since Identified is already a status on
the same panel. The count depends on the date range, and the map opens on
the last 30 days.

### map

#### ClusterControl

`MapCanvas` draws it when a listed tileset accepts clustering
(`tileLayerClusters`) and the map is not `minimal`, and there is no
`MapControlsConfig` flag for it: the switch would change nothing on a map with
no such tileset, and a map inside a form, a card or a detail page has no room
for another control (#1380). It heads the right-edge stack, above measure,
because it is about what the map draws rather than where it looks. The label is
the same in both states and the state is on `aria-pressed`, which is
`MapControlButton`'s `pressed` prop; a label that flipped between "group" and
"ungroup" would announce the action and the state at once and read as neither.

#### MapSearch

Two resets that were effects are read off the state they key on (#1183). The
arrow-key highlight is held beside the results it was chosen from, and an
index chosen against another set reads as none, so a new set of suggestions
starts unselected without a render in which Enter would fly the map to a
place the reader never saw. The four request states, results, loading, error
and the selection in flight, belong to `usePlaceSuggestions` since the
idle reset moved there, with the reasoning under that heading in
`docs/web-hooks.md`. The component decides whether there is a query to
answer and the hook owns the answer.

### my-organization

#### ControlAssetLookupList

Add vehicle is hidden rather than disabled, per `components/write-only.tsx`. A
collector on this page used to see a greyed-out control with nothing saying
why.

#### SaveErrorNote

A toast is the whole report for a surface that closed on submit, and it is not
enough for one that did not: the sheet stays open and nothing on it
distinguishes a write that landed from one that was refused (#219).

#### densityRangesOrNull

The branch lives outside the call site's try block because the React Compiler
bails on a whole component when a try block holds a branching expression
(#856). The same rule names the toast copy in `MissionNotificationsCard`.

#### SettingsSheet

Every My Organization settings section edits in this frame, and the frame
holds the one answer to a failed save. The People sheets are not settings
sections and keep their own. A value the conversion cannot read
stays in the open sheet as the form's error alert, which is `role="alert"`;
a valid save closes the sheet and starts the write, and a write the server
refuses afterwards arrives as a toast through `watchWrite`. Before #1431 the
sheets split on this. The label-keyed sheet that drew adult surveillance, batch
tracking and the service request context awaited the write and held the sheet
open with the refusal inline, while the organization details, unit defaults
and larval sheets converted first, closed, and toasted. Three sheets of four
already did the second, and once the client checks a value by the rule the domain
does, a server refusal is the rare case, so that is the one the frame keeps.

A sheet's conversion is its only rule, and no field in a settings sheet carries
a validator. Organization details and unit defaults used to refuse an empty
required value twice, once in a field validator that drew the message under
the field and once in the conversion, which never ran on it because the
validator stopped the submit first. Main contact's email check was the one
rule held only by a validator. All of them are in the conversion now, so every
refusal reads the same way, in the error alert with the sheet open (#1475).

The two gates are in two places. Save is disabled while the Organization row
is still loading, and the frame reads that from
`useOrganizationSettingsMutations` itself, so no caller can fill it
differently: before #1475 two callers passed `canWrite` and two passed it
anded with `canManage`. Who may open a sheet is `DomainSection`'s question,
which draws the Edit control only at the Admin floor, so no sheet takes a role
or disables its inputs on one. The server refuses the settings commands below
that floor either way.

The body is the caller's, handed the form, rather than a field list the frame
reads. Unit defaults draws one select per unit type read off its values and
the larval sheet lays its density bands out in fieldsets, and neither is a
list of inputs keyed by name.

#### SettingsSectionSheet

A section that is a list of inputs over its settings is a `SettingsSection`
descriptor in `settings-sections.tsx`, drawn here. Each field is named by a key
of the section's values and its label is display text only. The sheet it
replaced named every input by its label, and three callers read `FormData`
back by those strings, so renaming a label broke a save with nothing to say
so, and the generic sheet compared against `'Collection timing'` twice to
decide whether to draw the timing guide. The guide is now the adult section's
`preview`, and the frame names no setting.

A descriptor splits `convert` from `save` on purpose. The frame has to know a
value is bad before it closes, and an `async` save that both converts and
writes would hand a conversion error back as a rejection indistinguishable
from a refused write. `convert` is synchronous and throws; `save` only writes.

#### ReinviteControl

The redo is its own command, reached from the row it is about, because a second
`identity.invite` for the same address is a retry the server swallows and no
key could tell a retry from a deliberate redo. The dialog names the three
things that change so the destructive half, the old link dying, is not the half
nobody read.

#### RemoveMemberControl

Below the form rather than in it: saving a display name and revoking a login
are not the same act, and one submit button for both makes the revoke an
accident. The profile stays, as the field history every record this person
created points at.

#### TagSections

The block and the tables run the width of the card they sit in, so the Tags
tables line up with the cards above them. #1054 had drawn them at the sum of
their column widths, which kept the four columns from spreading across 1616px
and left the tables narrower than everything else on the page. The Description
column carries no width now, so `table-fixed` hands it all the slack and the
other columns keep theirs; the column sum is the floor where the table scrolls.

### operations

#### assignment-data

The writes moved to `hooks/mutations` once the endpoint read a named command:
the ordering rules that made a write dangerous (details and lifecycle never on
one PATCH, Complete never on a skipped stop) are enforced by the command's
name. `itemActionsFor`'s Unskip-before-Complete was a safety rule under the old
PATCH and is a display rule now. `canRecordWork` is wider than the progress
gate because sharing it made auto-start unreachable: the crew had to press
Start first, which is the tap auto-start exists to remove.

#### AssignmentDetailHeader

The assignment run page draws `DetailPageHeader` in the `panel` frame (#1269),
following every choice `MissionDetailHeader` makes: the lifecycle items come
from `worklistLifecycleActions`, the progress bar, the pending-stops hint and
the cancellation reason sit under the bar, and the hint shows to every role.
The page's own lifecycle rules stay where they were, `canStartAssignment` and
`canCompleteAssignment` deciding the two preconditions and the route's
`useCommandRunner` turning a refusal into a toast.

Two things differ from the mission. Reopen opens no dialog, because
`fieldWork.reopenAssignment` carries no reason, so choosing it is the write.
And Delete is new on this page: it was reachable only from the danger-zone card
on the plan edit page, which is left where it is. The route holds the
acknowledged-write dialog rather than the header, because the delete is
optimistic and the header unmounts the moment the row goes, which is also what
lands the page on Assignment Not Found.

#### AssignmentFormPage

A due time fills an empty due date once and never follows a later
`assignmentDate` change (#1005). Anchoring the pair to the browser's clock read
back through `formatDueAt`, which shows the organization's, as a time nobody
set; hydrating the time alone moved a deadline on another day onto the
assignment date at the next save. The route copy's default name is
`North loop, Sep 15, 2026` (#1007), a comma rather than a dash because
`check:copy-dashes` reads a field default as copy, and "untouched" is read off
the field (empty, or equal to the last generated string) rather than off a flag
set on every keystroke, which would answer "edited" to a field typed and
deleted back to empty.

#### AssignmentTargetPicker

A type switch over three pickers rather than one combined search, because each
catalog already searches the way it wants to: eager filter, live `ilike`
subset, open-requests list.

#### ControlTypeToggle

A plain controlled control rather than a `field.SelectField`, because picking a
type has to reset the polymorphic method beside it, and the shared select
field swallows change events it cannot tell apart from a Radix option-set
reset.

#### AddStopForm

`canSubmit` is the route's `canAttributeWrite`; #888 and #944 swept the
hand-written actor check out of sixteen routes. A refused save stays in the
form's `Alert` rather than the toast, per `DetailPageHeader`'s rule that a form
is something the person can fix and resubmit, so the form holds its own busy
flag instead of calling `useCommandRunner`, which reports through the toast
(#1100).

#### MissionStopRow

A stop's name is read through `missionStopName` rather than spelled here, so the
stored name, the Requested Control Action's display name, the Address label and
`Mapped stop` are in one order that a second surface cannot disagree with
(#1194). The request's link moves with the text: an unnamed stop draws the
request's own name as the link, and a named one draws the name as text with the
link on the subtitle below, so the request a stop answers stays one click away
whatever the stop is called.

A named stop keeps its address on the subtitle. The line above was drawing it
when nothing else named the stop, so guarding it on the request alone took the
address off the row of every stop somebody named at one.

Rename rides with the reorder controls, so it is offered while the plan is open
and to a Manager, which is `planEditable`. The server is wider on purpose:
`missionDispatch.renameMissionItem` asks no precondition, so a rename that
arrives from anywhere else needs no reopen.

#### RenameStopDialog

Mounted only while a stop is picked, the shape `RegionFolderDialog` uses, so the
box opens holding that stop's stored name rather than a draft left from the last
one. An empty box clears the name rather than storing an empty string, which is
what the command's nullable `name` is for, and the placeholder is
`missionStopName` with the stored name taken off, so it shows what clearing the
box leaves behind rather than the name being cleared.

#### MissionFormPage

Neither surface touches a lifecycle timestamp, because the PATCH handler builds
both command families from one body and an edit that normalised `completedAt`
back to null would reopen a finished mission. `scheduledAt` is anchored to the
organization's zone because a dispatcher scheduling a 6am muster from another
zone was writing their own 6am.

#### MissionDetailHeader

The mission page used to draw a bar of its own: a back link, the name with an
outlined Edit button, a row of lifecycle buttons, and a danger-zone card at the
foot of the rail. It draws `DetailPageHeader` in the `panel` frame now (#1267),
the same bar the service request page draws beside its map, and the lifecycle
commands and the delete are in the `...`.

The progress bar, the pending-stops hint and the cancellation reason sit under
the bar rather than in its subtitle, because the subtitle is capped at a line
measure and the progress bar is a control-width element. The hint is drawn to
everyone now rather than to writers only: it is a count of the mission's own
stops, and it is what a disabled Complete in the menu cannot say.

The page draws its map from the stops before the mission row arrives, so the
header skeleton is drawn at `panel` too, and the bar keeps its measure when the
mission lands. That is the jump `DetailHeaderFrame`'s docblock accepts for the
service request page, which cannot draw its split before its record.

#### worklistLifecycleActions and PendingStopsHint

One builder for the four lifecycle items a worklist's `...` holds, so the
mission page and the assignment page (#1269) offer the same items at the same
floors. Start and Complete are disabled rather than hidden when their
precondition fails: "why can't I finish this?" is a question about the work,
and the answer is the counts under the bar. Hiding them would leave a Collector
on a mission with pending stops looking at no menu at all. Each page maps its
own status onto `WorklistPhase`, because a mission says `scheduled` where an
assignment says `notStarted`.

#### MissionNotificationsCard

The list is on the card rather than in a toast because the generation's most
confusing answer is an empty one, and a second press that creates nothing
reads as "already done" only beside the list.

#### operations-data

The write half stays on the collections a page writes through, or the write's
txid lands on a stream nothing is watching and the save never settles.

#### describeAddStop

The instruction stands apart from the mission name because `missionDisplayName`
answers a phrase for a mission with no name, which read "Draw where the crew
has to go on Source Reduction on Aug 4" inside a sentence (#676).

#### WorklistTabs

The stop list and the comment thread take turns in the one column beside the
map rather than stacking two long scrolls in a narrow column. Each tab label
carries its count, so the one that is closed still says how much is behind
it; the Comments count is `useCommentCount`'s, for the reason that hook's
heading gives.

`extraTab` is the one option for a third tab, and only the mission page passes
it, for its notifications (#1268). They used to sit in a card under the tabs,
which took the bottom of the rail away from the stop list on every mission
whether anyone was reading them or not. The tab carries its own count the way
Comments does, `MissionNotificationCount`, so a mission with nobody on the list
reads as one before the click. The assignment page passes nothing and keeps
exactly Stops and Comments.

### overview

One page component at three grains, `OverviewPage`, drawn by `routes/today`,
`routes/monthly` and `routes/annual` with `grain` set, over one `useQuery`
keyed on the grain and the period. `docs/today-spec.md` is the brief and
carries what the three share; the pieces are the picker, the upward line, the
table and the chart, each its own module beside the page.

The period is the URL's and the current period leaves the search empty, so a
sidebar entry opened every morning is never a bookmark pinned to the day it
was made. That is the opposite of the Activity Monitor, which writes today
into the address, and the reason is what these pages are. A malformed or
future value is rewritten to the current period with the address rewritten,
the Monitor's rule; a period before `earliest` is left alone and reads as
zeros, because clamping would hide the typo rather than show it. A year
travels on the URL as a number, because the router's search serializer writes
the string `2026` as `%222026%22`, and `periodSearchCodec` reads either back.

#### OverviewChart

One component for the family, on `ChartContainer` and the Recharts
primitives. Today's form is one bar per day, weekends included, packed with no
gap: 365 slots at a 600px plot width leave no room for the mark spec's 2px gap,
and the area it replaced drew a line across quiet days. Today also leaves out a
measure whose series totals zero, through `drawsTrend`.
Monthly's is a grouped bar, twelve groups of three, the response's flat 24-point
series split by the year in each point's `period` with the row's
`seriesAverage` as the third bar; a month the year has not
reached is no bar, and every bar in the period series wears the role at full
strength, the alternative of the picked bar at full strength and the rest a
step down not being taken. The period bar draws left of the comparison bar,
the order the legend reads in, and the average bar draws last and takes no
click, since no single month is behind it. A bar click reads the group back by
the index Recharts hands the handler, since the rectangle it hands is not the
row.
Annual's is one bar per year over at most ten years, the current year a
partial year drawn whole beside full years, which the reference line and the
table's caption are what say; the series never carries the cut, because
cutting every earlier period would turn Annual into a year-to-date chart.
Its five-year average is a dashed horizontal `ReferenceLine` rather than a
second bar series, because one value per chart is a level to read the bars
against; `ifOverflow="extendDomain"` keeps it on the plot when it sits above
every bar, where Recharts would otherwise drop it.
Under three years the trend section is not drawn and the table stands alone,
since a one-bar or two-bar chart is on the `dataviz` skill's anti-pattern
list. The
marks read `var(--color-period)` through the chart's own `ChartConfig`, so
the three roles in `styles.css` are the only colours and `check:map-palette`
has no literal to refuse. The tooltip passes a `formatter`, because
`ChartTooltipContent`'s default calls `toLocaleString()` unpinned. A ratio
point over a zero denominator is `null` with `connectNulls` off, so a day
with no inspections is a gap and never `0%`. Clicking the plot opens the
period under the pointer through `periodDestination` and `navigate`; there is
no `Link` inside an SVG, so the destination is asserted on that function.
The plot height is the caller's, `height="panel"` for the fixed `h-52` every
trend panel draws at and `height="fill"` for the zoom overlay, which takes the
parent's height and drops `ChartContainer`'s `aspect-video`, since with only a
width set that class would size the plot off the overlay's width.
The value axis is `width="auto"`, which Recharts 3.8 implements by measuring
the drawn tick labels in a layout effect and resizing the axis to the widest,
from a 60px first guess. It replaced a fixed 44px that shaved the first digit
off `38,000` in the panel and cut it to a sliver in the overlay, whose ticks
are a size up (#1324). A width computed from the formatted ticks and a font
size per height was the fallback and was not needed; jsdom measures every
tick at zero, so the suite asserts the prop rather than a pixel.

#### OverviewChartZoom

The zoom button in each trend panel's `actions` slot and the overlay it opens,
one per panel, so the three pages get it through `TrendSection` with nothing
per grain. It is the shadcn `Dialog` stretched to the viewport less a 1rem
gutter (1.5rem from `sm`), and the gutter is deliberate: a dialog covering the
whole viewport leaves no backdrop to click, and a click on the backdrop is one
of the three ways out. Radix gives focus back to the trigger on every close,
including the one a bar click causes. That bar click closes the overlay and
then hands the period to the page's own `onOpenPeriod`, so the overlay and the
panel open one destination. The open state is the component's and never the
URL's, because a shared link should land on the page rather than on one chart
of it. The axis is the panel's: Today keeps one tick per month in the overlay,
drawn at `text-sm` rather than `text-xs`. The overlay on Monthly and Annual
carries its own `OverviewLegend`, because the one on the trend heading is
behind the backdrop.

#### OverviewTable

The headers come off the response's `columns`, so the client does no date
arithmetic; the cut caption in the panel's `actions` slot is the one sign the
period is partial, and Today never draws one. A count in a real column links
to the type's explorer over the column's whole period, `to` the last day even
when the period is partial, since a future date matches nothing and the link
copied tomorrow still names the month. The service requests link writes
`status=all` beside the dates, because that explorer defaults to open
requests and the count is every request received. An average cell is no link,
because no explorer lists a mean; a ratio cell never is. A zero denominator
draws the absence glyph with `0` beside it, because `0%` would say every
inspection was negative.

#### OverviewLegend

The family's one legend, at the right of the trend heading rather than inside
each panel, because twelve panels would say it twelve times. Monthly's is
three swatches, the two years and the average; Annual's is the average's
dashed line alone, since the axis names each bar's year; Today has no average
and carries none. The average's entry is left out when no chart it speaks for
draws one, so Annual then carries no legend at all. The comparison
role is `--chart-comparison`, `green[300]`: `green[200]` and `green[100]` were
offered and are too faint, and `--muted-foreground` sits 10.6 from brand green
under full-colour vision, under the `dataviz` skill's hard floor, so it is not
the comparison colour.

#### OverviewPicker

One `Select` over the reachable months on Monthly, newest first and grouped by
year, rather than two selects for month and year, which would let a person
assemble a future or pre-earliest month, and one over the reachable years on
Annual. A period before `earliest` reached through the URL is an extra item at
the bottom while it is shown, because a `Select` draws nothing for a value it
has no item for.

#### UpwardLine

The only way from a day to its month, because a bar opens its own period at
the page's grain and never a coarser one. Annual draws none.

### pickers

#### NewAddressForm

The geocoder dialog is closed before the map click is awaited, because its
modal overlay swallowed the click the await was waiting for, and "Use Manual
Coordinates" looked like a modal that would not go away over a map that would
not respond.

#### PickerFrame

It takes the bound field's `state.meta.errors` and draws them under the input,
and every picker built on it and `DateControl` pass them through.
`domainValidator` files a missing pick or a cleared date on the field it
names, and `FormErrorAlert` leaves field errors to the field, so a control that
drops them refuses the save with nothing on screen. Until #871 that was a habitat inspection with no habitat, a trap
collection with no trap and every required date, and the inspection's
`habitatError` fallback for the first could never run, because `onSubmit` only
runs once the validator has passed. A control the app draws inside a
`form.AppField` passes the field's errors, the way the kit's `field.*`
components read them for themselves.

Every caller fills its open, search, selected-label, anchor and handler props
from `useSearchPicker`, and none holds that state itself. Seven pickers used to
answer "what does the closed field say" seven ways, and the answers went stale
when the list arrived late or `value` moved from outside (#1434). The rule is
under that hook in `docs/web-hooks.md`.

`required` draws the required mark after the label. The inspection's habitat
field passes it, since its label carried the mark before it moved onto this
frame (#1468).

#### OptionRow

Secondary text that is blank after trimming draws no second line, the same as
`null`. Habitat and trap descriptions and service request details reach the
row as written, and nothing trims them on write, so a description of spaces
drew an empty muted line and left that result taller than its neighbours
(#1484). The rule sits in the row so no caller has to trim first.

### public-engagement

#### contact-fields

The contact page and the inline intake path carried different subsets of the
record; both read one shape now. The three preference switches are on the
field-path list because the builder refuses each without its channel, and a
map that stopped at `email` sent those three to the page alert.

#### ServiceRequestDetailHeader

The page took `DetailPageHeader` in the `panel` frame in #1088, replacing a bar
of its own and a Danger zone card. The reason dialog is not a confirmation: it
is where the close or reopen comment's text comes from, and an empty box falls
back to the plain fact, the bargain the mission cancel dialog strikes.

#### RequestLocation

The form used to carry a second, thinner set of address fields beside the
picker that neither geocoded nor placed a point, so which one an intake taker
reached for decided whether the address came out geocoded.

#### service-request-nearby

The page asks for its eight categories rather than `publicEngagement` whole,
because the endpoint's cap ran before the page dropped outreach and dense
outreach cut a nearer request (#1114). All four families, because Details and
Comments draw the other requests around this one (#1090). The window clause
exists because the caption drew a six-week range under a setting that says 14
(#1109), once the window ran on to the close or to today (#1084), and the cap
sentence exists because a radius denser than the cap drew a map that looked
complete (#1141).

#### ServiceRequestNearbyRows

The placeholders, the empty state and the failed state are `ResultList`'s,
because the page's own failed sentence told the reader to try again shortly
with nothing to try. The rows are the rail's virtualised list now that a family
tab owns the column's height.

#### outreachSummaryGroupings

The Outreach Actions summary, built the way `biocontrolSummaryGroupings`
builds the Biocontrol Actions one (#1377). A method is added to `methods` and
a technician to `people`, each drawn top 5 and "n more". An outreach action
recorded with no technician is counted on the server and not drawn, because
no filter selects "none". There is no habitat grouping, because outreach
carries no habitat link.

Total reach is a plain sum figure, the way the larvae identified are on the
Samples summary, and draws as text through the same `formatReach` the rows
use. `reach` is `not null` and checked above zero, so every outreach action in
view adds to it and no null is skipped. Over no outreach actions the sum is
zero rather than absent, which is the shared reader's rule for a sum.

The filter card and its chips moved out of the route into
`outreach-filters.tsx` so the Outreach Actions Table could share them, and the
row type and the name lookups into `outreach-row-parts.ts`. These sit under
`components/public-engagement/outreach`, beside the route they serve, though
Outreach writes through `controlOperations.*` commands.

#### serviceRequestSummaryGroupings

The Service Requests summary, built the way `sampleSummaryGroupings` builds
the Samples one (#1371). Open draws before Closed whichever holds more, and a
click replaces the status there, since the filter holds one. A Tag is an
`each` grouping, so a request carrying two Tags counts under both and the Tags
can add up to more than the total. The server reads the same `tag_items` rows
the Tag filter matches, so a Tag's count is the page its button narrows to.

Intake type has no filter behind it, so it draws as text. It is a grouping on
the server rather than four summed figures, because a figure per intake type
would write the type's values out a second time beside `COLUMN_VOCABULARIES`,
and a grouping counts whatever values the column holds.

The days the oldest open request has waited is a `max` figure. The server
counts each open request's age from its request date to the Organization's
today, the way the age slot on a row does, and answers the largest. A sum or a
zero would both be wrong when no open request is in view, so the figure is
left out then, and the Waiting section with it. The rail's Oldest order does
not reach the summary: the summary request carries `oldest` because it sends
the page's params, and the reader leaves it unread.

The filter card and its chips moved out of the route into
`service-request-filters.tsx`, so the summary can draw the chips above its
groupings the way `SampleFilterChips` is drawn on Samples. The summary itself
is `ServiceRequestSummaryPanel` rather than an inline `ExplorerSummary`, because
the two ternaries it needs took the route component over `fallow:health`'s
cognitive complexity threshold.

### record

#### record-badges

The two surfaces had drifted: an inspection read as a density pill in the Daily
Work log and as a life-stage strip on its own map page. A row takes
`recordBadges` as a function rather than an element (#1107), because
`ExplorerRow` lays its badge container out on the prop being there and an
element is there whatever it draws. A collected collection with no bycatch
gets no state pill because the log's verb already says it. Detail badges take
a line of their own because an inspection's density plus its six-cell strip is
175px, which in a 380px panel left the record no room for its name.

#### LinkedTableRow

The four table views opened a record from a 16px chevron and nothing else.
The row is not made a link, because a `<tr>` cannot hold an anchor around its
cells and a row with `role="link"` and a tab stop would sit beside the chevron
as a second way in. The chevron stays the one focusable element and the row's
click clicks it, so a router `Link` navigates the way it does from the
keyboard. A stretched `::after` over the row was the other shape, and it needs
`position: relative` on a `<tr>`, which browsers have not agreed on. A click on
a control inside the row, a Tag chip link or a button, is that control's, and a
click that ends a text selection is a selection, not a navigation.

#### ClampedTextCell

`max-w` on a `<td>` does nothing in an auto-layout table, so a Description
column given `max-w-[22rem] truncate` ran 87 to 91 characters to a line. The
measure goes on a block inside the cell, clamped to two lines, with the whole
text in the tooltip and on the detail page.

#### RecordTableEmpty

The eleven record tables each declared a `NoRows` in the route module with the
same four branches and a hand-spelled plural in both titles (#1405). The titles
now read `titleMany` from the register, and the one part of the unfiltered
title a surface decides is `scope`: `active`, `yet`, `lastDays` or `thisYear`.
A union and not a free-text title, because a title prop is where a surface
would spell the plural again, which `check:record-nouns` reads as a finding.
Every title the eleven tables rendered before reads the same through the
register. The two descriptions stay props, since each is a sentence about that
surface's list rather than a name for its records. It draws nothing on a
failed read because `RecordTableUnavailable` already sits above it, and a
second failure message under the first said the same thing twice.

#### RecordTableUnavailable

Drawn above the table rather than in place of it, so a retry that fails while
a page of rows is showing keeps those rows on screen under the strip. The
sentence is the register's `many` with its first letter raised, which gives
`Chemical applications could not be loaded.` where the tables had spelled each
plural by hand.

### registrations

#### RegistrationFields

The buffer unit select offers distance units only. The domain checks this
server-side too, but a select that offers gallons is a select somebody picks
gallons from, and the refusal blocks generation for every mission in the
organization.

#### RecordTags

One row for all six taggable record types, drawn by `DetailPageHeader`, which
is what `habitat-detail.tsx` and `service-request-detail-header.tsx` reach
through too. A Tag assignable on four of the six is not a rule anybody would
state.

It draws chips and nothing else since #1266. The picker opens from `Edit tags`
in the header's `...`, after the page's own actions and above Delete, and
`RecordTagPicker` beside the chips is what the header mounts for it. The counted
`Tags` button it replaced sat a thousand pixels from the record's name on a wide
screen, and the header already has one place for what can be done to the
record. The item carries no count, since the chips beside it show the Tags.

The picker is mounted beside the menu, not inside the item, because a dialog in
a menu item is unmounted by the click that opens it. That is the reason Delete
was already a sibling, and `DetailAction` now has a `dialog` shape so the next
menu item needing one takes the same path rather than a third hand-written
flag.

The read is keyed on the record id alone, because `tag_items.entity_id` is
globally unique. The write needs the record type as well, which is why the
header's `tags` prop carries it, and the picker's `For habitats` heading reads
the same key off `RECORD_NOUNS`.

Every control is behind the Collector floor: the menu item, the checkboxes and
the chip's `x`. A Viewer sees the chips and, on a page with nothing else in the
menu, no `...` at all. The `x` appears on hover and the dialog does the same job
without a pointer, so nothing is reachable by hover alone.

#### TagPickerDialog

A modal over the whole catalog, not a popover checklist, and there is no control
that widens the list: both sections are on screen from the start, so relevance
orders the catalog rather than filtering it and an assigned Tag is never out of
view. A third `On this record` group would put one Tag in two places depending
on a state that changes as you click.

It closes rather than saves. A checkbox writes on the click, so `Done` is a way
out rather than a commit, and the header chip's `x` is the same call: batching
on `Done` would give one idea two write timings and a `Cancel` that has to mean
"undo what you ticked".

Which Tag draws in which section is `tagPickerSections` in `lib/tag-relevance.ts`
rather than a body here, because every rule in it is a decision: an empty
relevance set counts as relevant, an inactive Tag is listed only where it is
assigned and always in the second section, and a search matches a substring of
the name or the description.

The empty `For habitats` section keeps its heading over one line of prose while
the search box is empty, because that line is what says the catalog has nothing
set up for this record type. With text in the box the line does not apply, so an
empty section drops out, and when both drop out one line says nothing matches.

`docs/tag-relevance-spec.md` is the rest.

## packages/ui-web

Shared parts both apps draw. These live outside `components/ui`, which the
shadcn registry regenerates.

### scrolling

#### ScrollBody

A vertical scroll region with a height rule, and the part to reach for before a
bare `ScrollArea`. The scrollbar series (#1254 to #1261) moved every scroller
onto `ScrollArea` and wrote the same three class strings at about thirty sites.
This part owns them (#1283).

The cap goes on the viewport, never on the root. Radix scrolls an inner
viewport whose `h-full` resolves against the root, and a root with only a
`max-height` has no definite height to resolve against. So a capped root clips
its content and nothing scrolls. `height={{ cap }}` writes the cap to
`--scroll-body-cap` on the root and points the viewport's `max-height` at it. It
is a custom property rather than a class so a caller can pass any CSS length,
`55vh` and `calc(90vh - 13rem)` among them, without a class string Tailwind has
to find in the source.

`height="shrink"` is for a body whose parent caps the height with `max-h`, such
as a dialog, a drawer or the map card. There is no definite height anywhere in
that chain, so the root and the viewport are flex items with `min-h-0`, and the
flex column hands the viewport what the header and footer leave. #1282 checked
this in Chrome against a copy of the dialog capped at 300px holding 1000px of
content: with the chain the viewport came out at 249px and scrolled, and
without it the viewport grew to 1000px and never scrolled. The part leaves
`flex-1` to the caller, because a drawer or a map card without it keeps its
actions right under a short body.

`height="fill"` is `SplitPage`'s column. The root already has a height, and
most callers put a full-height flex column inside it that scrolls a region of
its own, so Radix's content wrapper is held to the viewport height. Without
that the caller's column grows to its content.

The bar draws over the content rather than beside it, so the viewport takes
`pr-3` by default. `gutter={false}` is for content whose own right padding is
at least the bar's width, such as a form with `px-4`. Every site that wrote
`pr-3` by hand in #1282 and #1284 now gets it from the default.

A pane with a definite height of its own, a `min-h-0 flex-1` list in a split
page, needs no height rule and still scrolls in a bare `ScrollArea`. So does a
table that scrolls sideways, through `orientation="horizontal"`.
