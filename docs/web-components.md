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

#### HabitatPicker (control-pickers)

A habitat the picker did not pick still has to say its name, through a subset
read, because habitats sync on demand. Without it the field drew its
placeholder over a value that was set, and the operator picked the habitat they
had just come from.

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

### gis

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
block of dots over the same streets, while the table shows 50 rows whatever
the reach. `regions` stays in the table's filter set uncounted so a link that
came from the map keeps its region selection through a trip to the table and
back. The sidebar cannot carry `search`, so the map/table pair carries its own
control, and both paths are literals because `tsc` checks a `to` and `search`
pair only where the path is one. The switch carries the shared filter keys and
drops the table's sort, and it takes the validated search so a filter at its
default stays off the address bar and each surface keeps its own opening
window.

#### InspectionFormPage

`inspectedByProfileId` is seeded with the acting profile because "Default to
me" said only that a default existed. The habitat picker passes
`includeRetired`, because an inspection is also how a retired site gets looked
at again; the control pickers exclude.

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

### map

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

`w-fit` on the block, because the shell draws the section at the `record`
measure (#1045) and the create panel ran to the frame on its own (#1054).

### operations

#### assignment-data

The writes moved to `hooks/mutations` once the endpoint read a named command:
the ordering rules that made a write dangerous (details and lifecycle never on
one PATCH, Complete never on a skipped stop) are enforced by the command's
name. `itemActionsFor`'s Unskip-before-Complete was a safety rule under the old
PATCH and is a display rule now. `canRecordWork` is wider than the progress
gate because sharing it made auto-start unreachable: the crew had to press
Start first, which is the tap auto-start exists to remove.

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

#### MissionFormPage

Neither surface touches a lifecycle timestamp, because the PATCH handler builds
both command families from one body and an edit that normalised `completedAt`
back to null would reopen a finished mission. `scheduledAt` is anchored to the
organization's zone because a dispatcher scheduling a 6am muster from another
zone was writing their own 6am.

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
map rather than stacking two long scrolls in a narrow column.

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
primitives. Today's form is an area rather than a bar, because 365 slots at a
600px plot width leave no bar the mark spec's 2px gap or 24px hit target.
Monthly's is a grouped bar, twelve groups of two, the response's flat 24-point
series split by the year in each point's `period`; a month the year has not
reached is no bar, and every bar in the period series wears the role at full
strength, the alternative of the picked bar at full strength and the rest a
step down not being taken. The period bar draws left of the comparison bar,
the order the legend reads in. A bar click reads the group back by the index
Recharts hands the handler, since the rectangle it hands is not the row.
Annual's is one bar per year over the whole history, the current year a
partial year drawn whole beside full years, which the reference line and the
table's caption are what say; the series never carries the cut, because
cutting every earlier period would turn Annual into a year-to-date chart.
Under three years the trend section is not drawn and the table stands alone,
since a one-bar or two-bar chart is on the `dataviz` skill's anti-pattern
list. The
marks read `var(--color-period)` through the chart's own `ChartConfig`, so
the two roles in `styles.css` are the only colours and `check:map-palette`
has no literal to refuse. The tooltip passes a `formatter`, because
`ChartTooltipContent`'s default calls `toLocaleString()` unpinned. A ratio
point over a zero denominator is `null` with `connectNulls` off, so a day
with no inspections is a gap and never `0%`. Clicking the plot opens the
period under the pointer through `periodDestination` and `navigate`; there is
no `Link` inside an SVG, so the destination is asserted on that function.

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

The family's one legend, a two-swatch row at the right of Monthly's trend
heading rather than inside each panel, because twelve panels would say it
twelve times. Today and Annual plot one series and carry none. The comparison
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

### registrations

#### RegistrationFields

The buffer unit select offers distance units only. The domain checks this
server-side too, but a select that offers gallons is a select somebody picks
gallons from, and the refusal blocks generation for every mission in the
organization.
