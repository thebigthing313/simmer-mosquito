# Today

What `/today` shows, where each number comes from, and what the server owes it.
It is the first of three period-in-review pages, and this document also carries
what the three share: the record types and ratios, the comparison arithmetic,
the `GET /overview/:grain` contract, the reader, and the states. Monthly
(`docs/monthly-spec.md`) and Annual (`docs/annual-spec.md`) carry only what
differs at their grain and point here for the rest, so a rule stated once is
stated here.

The decisions were made on the wayfinder map [the period-in-review pages,
Today, Monthly and Annual](https://github.com/thebigthing313/simmer-mosquito/issues/1195)
and its seven tickets; this is what gets built. Where a decision has a reason
worth carrying, the reason is here and the ticket has the longer version.

Nothing here is built yet. `/today` is an `UpcomingPage` stub mounted by #1082
and the sidebar entry carries `stub: true`. The prototype the layout was chosen
on is branch `prototype/overview-1201`, static data, never merged; the build
rewrites it.

## The family

Today, Monthly and Annual are one page shape at three grains: the day, the
calendar month and the calendar year. Each aggregates the Organization's
tracked records at its grain and reads the period against the periods before
it. One page for every role, written for a Manager, with no role variation, no
map and no setting. Today is an aggregation page, not a feed: a person's day is
the Activity Monitor and the Organization's pending work is the Dashboard.

The grain names are `day`, `month` and `year`. The page names are `Today`,
`Monthly` and `Annual`, and `today` is a period, not a grain, which is why the
endpoint below is `/overview/day` and not `/overview/today`.

### What is counted

The eight record types the Dashboard's Last 7 days strip counts, each on the
date #980 and #992 settled, in this order. The label reads the record-nouns
register the way `activity-strip.tsx` reads it, `recordNoun(…).titleMany`, so
`check:record-nouns` has nothing to refuse; the two that are not a bare
`titleMany` are written the way the strip writes them.

| Type | Key | Label | Counted on | Explorer |
| --- | --- | --- | --- | --- |
| Inspections | `inspections` | `Inspections` | `inspections.inspection_date` | `/larval-surveillance/inspections` |
| Samples | `samples` | `Samples` | the parent inspection's `inspection_date` | `/larval-surveillance/samples` |
| Collections | `collections` | `Collections` | `coalesce(collected_at at the Organization's zone, collection_date)` | `/adult-surveillance/collections` |
| Applications | `applications` | `Applications` | `applications.application_date` | `/control-operations/chemical` |
| Source reductions | `sourceReductions` | `Source reductions` | `source_reductions.source_reduction_date` | `/control-operations/source-reduction` |
| Releases | `releases` | `Releases` | `biocontrol_actions.biocontrol_date` | `/control-operations/biocontrol` |
| Service requests | `serviceRequests` | `Service requests received` | `service_requests.request_date` | `/public-engagement/service-requests` |
| Outreach actions | `outreachActions` | `Outreach actions` | `outreach_actions.outreach_date` | `/public-engagement/outreach` |

Live rows only, `deleted_at is null`. A collection with neither timestamp nor
date is undated and is counted nowhere, as on the Dashboard. The keys are the
strip's `ACTIVITY_TYPE_KEYS` and become `OVERVIEW_RECORD_TYPES`, a register the
domain owns in `packages/domain/src/overview/`; whether the strip then reads
the domain's list is the map's open fog item and not this build's.

Two ratios sit under the eight, each drawn as a share or a rate with a count
beside it. Both are a ratio of sums per column, never a mean of ratios.

**Positive inspections.** A Positive Inspection is a wet Inspection indicating
breeding: `is_wet and (density <> 'none' or larvae_count > 0)`, the larval
doc's own breeding rule, which holds under all three density policies where
"any band above none" misses a `count_and_dips_required` Organization that
stores no density. The denominator is every live inspection in the period, dry
included, so the count beside the share is checkable against the Inspections
row above it and a dry check is a real check that found nothing. The row reads
`Positive inspections`; the cell reads a whole-number percentage with the
positive count beside it, `34% (120)`.

**Mosquitoes per collection.** A collection counts when it is live, dated,
`has_problem = false`, and either `is_zero_result` or carries at least one live
`collection_species` row. Problem collections are out of both numerator and
denominator, because a problem collection with species rows is a partial catch
from a trap that failed; awaiting collections are neither a zero nor a divisor.
The numerator is the sum of `count` over the live species rows of the counted
collections, both sexes and every physiological status, dated on the
collection's effective date and never on `identified_date`; bycatch has no rows
and never counts. The row reads `Mosquitoes per collection`; the cell reads one
decimal with the total mosquitoes beside it, `12.4 (3,210)`. The denominator
differs from the Collections row after the exclusions and stays in this
document rather than on screen.

A zero denominator draws the absence glyph (`AbsentValue`) for the ratio with
`0` beside it, in a period with no inspections or no counted collections and in
the average column when no prior year qualifies. `0%` would say every
inspection was negative.

### The hidden-type rule

A type the Organization has never recorded is not a row and has no chart. A
type with records and none in the period is a row reading `0`. Derived from the
data, no setting: the response carries `recordedEver` per type and the client
hides on it, so the rule lives in one place and the response shape never
varies. This was the Dashboard's rule when the map was charted and the
Dashboard dropped it in #1211, because a windowed client read cannot answer
"ever"; this read is on the server with a five-year window already, the
existence check is eight cheap index reads, and five years of `Releases 0` for
an Organization that does no biocontrol is noise a Manager reads every day.

### Partial periods and the cut

A period is **partial** when today falls inside it, and only the current period
is ever partial: a past period picked in the picker is complete and compares
whole against whole. Today is `todayInTimeZone` on the client and
`localDateSql(now(), timeZone)` on the server, both from the Organization's
`timezone` setting, the Dashboard's rule, so the two halves agree on which day
it is.

When the period is partial, every comparison column is cut to the **same
calendar date within its own period**, never to the same day-of-year, which
would slide every comparison after Feb 29 of a leap year by one day. A partial
Sep 2026 read on the 21st compares against Aug 1 to 21, Sep 1 to 21 of 2025 and
Sep 1 to 21 of each averaged year; a partial 2026 compares against Jan 1 to
Sep 21 of each earlier year. Two edge rules: the cut date clamps to the
comparison period's last day, so a partial March read on the 31st compares
against the whole of February and Feb 29 compares against Feb 28 in a common
year; and a day is never cut, so Today compares its whole day against the
whole day before it, the columns being dates with a collection's time of day
reduced to the Organization's day before it is counted.

On screen the cut is one caption in the table panel's `actions` slot,
`Each period through the 21st` on Monthly and `Each period through Sep 21` on
Annual, and nothing on a complete period, so its absence is the signal that the
comparison is whole. Today never draws one. Column headers stay the period's
plain name.

### The average column

The five calendar years before the period's own year. A year **qualifies** for
a type when it holds any record of that type anywhere in the calendar year, so
a year the Organization ran inspections and recorded none in September
contributes a zero September rather than dropping out. A year with no record of
the type is skipped and the next older year is not pulled in: "up to five"
means the divisor is the number of qualifying years among those five. A type
with records and no qualifying prior year, first recorded this year, draws the
absence glyph in the average column; the hidden-type rule hides only a type
with no record at all.

The rule on real data, from #1199: staging's source reductions hold one row in
2014 and one in 2017 before the series begins in 2018, so a five-year average
of source reductions read in 2019 counts 2014 and 2017 at one row each. That
is what the rule does and it is settled.

A ratio's average is pooled: the sum of the numerators across the qualifying
years over the sum of the denominators, the count beside the share being the
pooled count, which a person can check. The qualifying years for a ratio are
the years qualifying for its denominator type. The mean of each year's ratio
was the alternative and gives each year one vote regardless of its size.

## The page

The frame is the overviews' and the Dashboard's: `pageContainer` at
`{ gap: 'overview', measure: 'record', padding: 'page' }`, and a `PageHeader`
with eyebrow `Organization`, the `generic.chart` icon, the title `Today`, the
description "What was recorded on one day, against the day before, with the
year so far under it." and the period picker in `actions`.

Under the heading sits the **upward line**: the day's long name in the
foreground weight, then each coarser period as a link, separated by a middle
dot, `Monday, September 21, 2026 · September 2026 · 2026`. `September 2026`
opens `/monthly?month=2026-09` and `2026` opens `/annual?year=2026`, both
explicit. It is the only way from a day to its month, because a bar opens its
own period at the page's grain (below) and never a coarser one.

Two sections below it, in order:

1. The table, one `Panel` titled with the day's short name (`Sep 21, 2026`),
   the `generic.chart` icon, and nothing else in it.
2. The trend, a section headed `2026 by day` (the picked day's year), and under
   it a three-column grid of `Panel`s (two at `md`, one below), one per shown
   row of the table, each titled with the row's label and holding one chart.

That is variant B from the prototype: the numbers are read first and the
trends second, and a chart has room for its axis. The ledger (a compact chart
as a column of the table) and the focus layout (one large chart for a selected
row) were built and are not taken.

Every name on the page is the one the prototype settled and is written here as
it appears on screen. The build does not rename. Every date and number on the
page is formatted `en-US` through the helpers in `lib/local-date.ts` and
`Intl.NumberFormat('en-US')`, the display-formatters convention.

## The picker

In the header's `actions`: a previous arrow, `DatePicker` bounded to
`[earliest, today]`, a next arrow, and a `Today` button that appears only when
the shown day is not today. Next is disabled at today and previous at
`earliest`, both read off the response. The arrows carry `aria-label`
`Previous day` and `Next day`. A period the picker reaches is written to the
URL as the section below says; stepping back onto today clears the param.

## The table

A `table` inside the panel, `overflow-x-auto`, column heads in muted small
text. Three columns, two fewer than the other grains:

| Head | What it holds |
| --- | --- |
| `Record type` | the row's label, a row header |
| `Sep 21, 2026` | the day, in the bold period column |
| `Sep 20, 2026` | the previous calendar day |

The previous column is one previous calendar day for the whole table, named in
its header; a quiet Sunday before a Monday is a true answer. There is no
same-date-last-year column and no average on this grain, which is where Today
departs from Monthly and Annual: the same calendar date a year earlier falls
on another weekday, so a Monday would read against a Sunday, and a mean of
that date over five years averages five different weekdays. Neither says
anything a Manager can act on. The chart under the table carries the year's
trend, and the month and the year a day sits in are one click up the upward
line, where the year-back columns compare like with like.

The header text comes off the response's `columns`: each real column carries
its `from` and `to` and the average column its `years`, so the client does no
date arithmetic. A count cell in a real column is a `Link` to the type's
explorer (below); an average cell is a number and no link, because no explorer
lists a mean. A `0` is drawn as `0`. The two ratio rows sit under a heavier
rule (`border-t-2`) below the eight, their cells as the ratio section above
spells them, and a ratio cell is never a link.

## The charts

One chart per shown row, each in its own `Panel`, each drawn with
`ChartContainer` from `packages/ui-web/src/components/ui/chart.tsx` and the
Recharts 3.8.0 primitives imported beside it, in one component for the family
under `apps/web/src/components/overview/`. The chart owes its own padding,
`px-3 pt-3 pb-2`, because `Panel`'s body has none.

At the day grain the series is the picked day's calendar year, every day of it
through today when that is the current year, which is 365 slots at a 600px
plot width, 1.6px each. No bar can carry the mark spec's 2px gap or 24px hit
target at that width, so **Today's chart is an area**: one series in the period
role, a fill at about 10% opacity over a 2px line, `CartesianGrid` horizontal
only, a month-per-tick x axis, one y axis at clean thousands-comma'd ticks, a
crosshair tooltip that snaps to the nearest day and reads the date and the
value, and no legend, because the panel title names the series. The picked day
is marked with a dashed `ReferenceLine` in the foreground colour at its date.
Animation is off, the way the habitat donut has it.

A ratio chart plots the ratio itself, the share or the rate, per day, off the
numerator and denominator the series carries. A day whose denominator is zero
is a gap: the point is `null` and `connectNulls` stays off, so a day with no
inspections draws nothing rather than `0%`.

Two colour roles join `packages/ui-web/src/styles.css`, declared in `:root`
and registered under `@theme inline`, the Registered Token Rule: `--chart-period:
var(--simmer-green)` and `--chart-comparison: var(--simmer-green-300)`,
registered as `--color-chart-period` and `--color-chart-comparison`. The
`ChartConfig` names them as `var()` and `ChartStyle` scopes them to the chart,
so `fill="var(--color-period)"` is what the marks read and `check:map-palette`
has no literal to refuse. Today's chart uses the period role alone; the
comparison role is Monthly's, and it is registered once for the family.
Measured against the card surface (`#f9fdfb`), `green[600]` and `green[300]`
separate at a CVD Delta E of 22.3 and a normal-vision 22.8, and `green[300]`
sits at 2.05:1, under the skill's 3:1 relief rule; the table above the charts
is the relief, and this paragraph is the validator run the skill asks to be
committed with the pair.

The tooltip passes a `formatter`, because `ChartTooltipContent`'s default calls
`toLocaleString()` unpinned; the tick formatter pins `en-US` too.

Clicking the area opens that day: the chart's `onClick` reads the active
label, a pure `periodDestination(grain, period)` in the family's module turns
it into `{ to: '/today', search: { date } }`, and the handler passes that to
the router's `navigate`. There is no `Link` inside an SVG, so
`link-destinations.test.tsx` cannot assert the destination and the unit suite
asserts `periodDestination` instead.

## Links

A count in a real column opens the type's explorer with `from` and `to` at the
period's first and last day, which on Today are the same date:
`/larval-surveillance/inspections?from=2026-09-21&to=2026-09-21`. The last day
rather than today even when the period is partial (Monthly and Annual), since a
future date matches nothing in the explorer and the link copied tomorrow still
names the month; this departs from the Dashboard's `to=today` for that reason.
The explorer column of the table above is the destination for each type.

Seven of the eight explorers read `from` and `to` as `dateParam` today. The
service requests explorer does not: its filters are status, search, Tag and
Region, and #920 decided a date default there is not a substitute for the
viewport. A date filter with no default is a different thing, and a link that
lands on rows the count did not count is what every link on the Dashboard was
written to avoid, so **the build adds `from` and `to` over `request_date` to
`parseServiceRequestMapFilters`** as the `dateFields` its neighbours already
carry, with `from: dateParam` and `to: dateParam` codecs on the route, no
default, and a `DateRangeFilter` control in its filter bar so the URL state has
a visible twin. The count link writes `status=all` beside the dates, because
the explorer's default is open requests and the count is every request
received. The explorer's rail is the viewport's since #920, so no link on this
page lists exactly the rows counted; that is the explorers' rule and not this
page's.

The upward line's links and the chart click are above. Every `Link` on the
page is asserted by href in `apps/web/src/tests/unit/link-destinations.test.tsx`.

## The period in the URL

`/today?date=YYYY-MM-DD`, validated by a codec of `dateParam`'s shape: a regex
over the value, anything else reads as no value, so `/today?date=` matches the
Activity Monitor link the Dashboard already writes.

The current period leaves the search empty. `/today` opened on Tuesday is
Tuesday's read, the opposite of the Activity Monitor, which writes today back
into the address; the reason is what these pages are, sidebar entries a person
opens every morning, where a bookmark that pins itself to the day it was made
is the wrong bookmark. An explicit param naming today is legal and is not
rewritten, so `/today` and `/today?date=2026-09-21` open the same read, which
is what lets every bar link and upward link write an explicit period without
special-casing the current one.

A malformed value (`?date=2026-13-40`) and a future one rewrite to the current
period and the address is rewritten with them, the Monitor's rule, so a link
never names a period it does not show. A date earlier than `earliest` is left
alone and reads as a day of zeros: it is a real period, the read is cheap, and
clamping would hide the typo rather than show it. The `DatePicker` shows it as
its value while it is the shown day.

## `GET /overview/:grain`

One endpoint for the three pages, registered from
`apps/server/src/overview-reads.ts` beside `dashboard-reads.ts`, behind
`authContextMiddleware` with no role floor. `/overview/*` joins
`PRIVATE_READ_PREFIXES` in `cache-headers.ts` and gets a `GET, OPTIONS` row in
`cors-options.ts`, because the response varies by the session's Organization
and the URL carries no id. The Organization is the session's, the zone is its
`timezone` setting, and `today` is `now()` in that zone; `readServerEnv` owes
the route nothing.

### The request

`GET /overview/day?date=YYYY-MM-DD`, `GET /overview/month?month=YYYY-MM` and
`GET /overview/year?year=YYYY`. The grain is in the path and the param name
matches the page's own. A missing param is the current period. Malformed and
future answer 400 `overview_period_invalid`, since the client rewrites both
before asking; a period before `earliest` is legal and answers zeros; an
unknown grain 404s.

### The response

One shape for the three grains, filled differently by grain and the same for
every Organization:

```ts
interface OverviewResponse {
	readonly grain: 'day' | 'month' | 'year';
	/** As the page's picker spells it: YYYY-MM-DD, YYYY-MM or YYYY. */
	readonly period: string;
	/** YYYY-MM-DD in the Organization's zone. */
	readonly today: string;
	/** The cut date when the period is partial, else null. Never set on `day`. */
	readonly cutThrough: string | null;
	/** The earliest dated record across the eight types; null when nothing is recorded. */
	readonly earliest: string | null;
	/** Two on `day`, four on `month`, three on `year`. */
	readonly columns: readonly Column[];
	/** All eight, in register order. */
	readonly types: readonly TypeRow[];
	readonly ratios: readonly RatioRow[];
}

type Column =
	/** A real column, at the cut, for its header. */
	| { readonly key: 'period' | 'previous' | 'lastYear'; readonly from: string; readonly to: string }
	/** Header only, no link. */
	| { readonly key: 'average'; readonly years: { readonly from: number; readonly to: number } };

interface TypeRow {
	readonly type: OverviewRecordType;
	readonly recordedEver: boolean;
	/** Positional against `columns`; null only in the average column. */
	readonly values: readonly (number | null)[];
	/** Qualifying years behind the average; 0 draws the absence glyph. */
	readonly averageYears: number;
	readonly series: readonly { readonly period: string; readonly value: number }[];
}

interface RatioRow {
	readonly ratio: 'positiveInspections' | 'mosquitoesPerCollection';
	/** Positional; the average column is the pooled sum. */
	readonly numerators: readonly number[];
	readonly denominators: readonly number[];
	readonly averageYears: number;
	readonly series: readonly {
		readonly period: string;
		readonly numerator: number;
		readonly denominator: number;
	}[];
}
```

- Every type is present and the client hides a row on `recordedEver: false`.
- The server computes the mean; `averageYears` sits beside it so the glyph and
  the divisor are checkable. A ratio's average column is the pooled numerator
  and denominator and needs nothing more.
- `columns` carries each real column's `from` and `to` at the cut, which is
  where the headers come from. The count link is written from the period's
  whole span, not from the cut.
- A series point's `period` is spelled as the page's own picker spells it,
  which is what the chart click writes. A ratio's point carries numerator and
  denominator and the client plots the ratio.

### The chart series carries whole periods

The table cuts and the chart does not. Cutting every earlier period in the
series through the same date turns Annual into a year-to-date chart for the
whole history and cuts Sep 2025 on Monthly while leaving Oct to Dec 2025 whole
beside nothing; carrying both a whole and a to-date value per point is a
second number the prototype has no drawing for. So the series is whole periods,
the partial current period is its last point, the dashed reference line marks
it, and the table under the partial caption is where like compares with like.

The series never holds a future period. Its span per grain: on `day`, every
day of the picked day's calendar year, through today when that is the current
year; on `month`, the twelve months of the picked month's year and the twelve
of the year before, one flat ordered array of up to 24 points, the client
splitting by year off the period string; on `year`, every year from
`earliest`'s year to the current year, the whole history, so the picked year
sits inside it.

### The reader

`packages/db/src/domains/overview.ts` is SQL plus a call. One statement per
type, run in `Promise.all` the way `/dashboard` runs its three, each an
index-backed scan of the type's partial
`(organization_id, <date> desc, created_at desc) where deleted_at is null`
index returning **rows grouped by calendar day** in the Organization's zone.
The daily row is one shape, `{ day, count, ratioNumerator?, ratioDenominator? }`:
inspections return `positive` beside `count` with `count` as the denominator,
collections return `counted` (problem-free, dated, zero-or-species) and
`mosquitoes`, so a ratio row is derived from the same rows as the count row
beside it and the two cannot disagree. Samples have no date of their own and
join their inspection; collections' effective date is a `coalesce` no index
serves, and the table is 31k rows.

The scan's lower bound on `month` is Jan 1 five years before the picked
month's year, and on `day` it is Jan 1 of the picked day's year, since a day
has no year-back columns and the series is the year; the upper bound is the
series' end, which covers the qualifying-year test, every column and the
series in one pass, about 2,500 daily rows per type at most. On `year` there is no lower bound, because the
series is the whole history, and 517k inspections group to about 5,800 daily
rows. `earliest` and `recordedEver` come from a separate `min(date)` per type,
eight index reads in the same `Promise.all`: `recordedEver` is that type's min
being non-null and `earliest` is the least of the eight. A union over the eight
types was not taken, because each has its own predicate and join.

The columns and the series are computed from those daily rows by one pure
function, `aggregateOverview({ grain, period, today, rows })` in
`packages/domain/src/overview/`. The cut arithmetic is where the bugs will be,
and a pure function over daily rows takes a table-driven suite with no
database: Feb 29 against Feb 28, a March 31 read against a whole February,
January's previous month, a year qualifying on one stray row, the zero divisor,
Jan 1 against the last day of the year before. Doing the
cut in SQL with a `filter` clause per column was the alternative, eight
predicates per statement with the leap-year rule where nothing unit-tests it.

### What bounds `earliest`

Nothing in the reader. Staging's earliest dated record of any type is a
collection dated 1826-03-16, a mistyped year written on 2026-06-04, and an
Annual select from it offers two hundred years, one of them holding one row.
The data is bounded instead: `validateLocalDate` in
`packages/domain/src/command-validation.ts` gains a floor of `1900-01-01`,
floor only, because the same validator reads scheduled dates on missions and a
ceiling there is wrong. No CHECK constraint, since the domain is the validation
boundary and the one row would block the migration until fixed. The row itself
is [#1214](https://github.com/thebigthing313/simmer-mosquito/issues/1214),
fixed through the form once the floor exists. The reader then reads `earliest`
unbounded and the Annual series starts at its year.

## The client half

One `useQuery` in `apps/web/src/components/overview/overview-data.ts`, keyed
`['overview', grain, period]`, with `refetchOnWindowFocus: true` and
`refetchInterval` of five minutes; the app's default is
`refetchOnWindowFocus: false`, so the hook sets it. No refresh control: focus
and the interval are the cadence, one query is one timer. No Electric half,
because actions and collections are on-demand and date-bounded and a five-year
window cannot come off the sync path.

The zone for `todayInTimeZone` comes from `useOrganizationTimeZone`, and the
response's `today` is what the picker's upper bound and the partial test read,
so a client whose clock disagrees with the server draws the server's day.

## Loading, empty and error states

The table panel and the trend section answer together, because they are one
query.

Loading, first time: the table panel draws `RowSkeleton` in place of its rows
and each chart panel a `Skeleton` at the chart's aspect; the panel title and
the picker draw at once, because the period is known before the read is. The
chart grid cannot know how many rows will be shown before the response says,
so it draws one skeleton panel per type and settles to the shown rows on
arrival.

Refetching: the previous render stays and dims to reduced opacity on
`isFetching`, no skeleton and no layout jump, the `dataviz` skill's refetch
rule. Stepping to another period is a new key and a first load for it, so the
skeletons come back; keeping the previous period's numbers on screen while the
next loads would show a table whose header names one period and whose cells
hold another.

Empty: a period where every shown type is zero draws the table of zeros and its
charts, and no empty state. The one empty state is `earliest: null`, an
Organization with nothing recorded at all, which draws a `PanelMessage`
reading "Nothing has been recorded yet." in place of the table and the trend
section. The picker stays, bounded to today alone.

Error: the query failing draws a `PanelMessage` reading "This period is
unavailable right now." in the table panel and no trend section. No retry
control; the next focus or interval tick is the retry. `ErrorReport` is for a
route that cannot render, and this route can.

## Navigation

The `today` item in `apps/web/src/components/app-shell/navigation.ts` drops
`stub: true`, which puts it in `shellSearchCandidates` and takes it off the
list of unbuilt destinations. The `'/today'` entry in `upcoming-page.tsx` goes
with it, and `routes/today.tsx` mounts the page with `validateSearch` over the
`date` codec. The item keeps its label and its icon, and the comment over the
group naming three stubs is rewritten for the two that remain until their
builds land.

## Build order

One build issue, one branch, one changeset: `Added:` on `apps/web`, since the
page is what a person can now do. The server, domain and `packages/db` halves
ship inside it rather than carrying a changeset of their own, because those
packages are filed against the app whose surface they change. Today builds
first and carries everything the family shares, **the endpoint, the reader and
`aggregateOverview` at all three grains included**: the arithmetic is one pure
function whose branches share the qualifying-year test and the cut, and the
scan differs by grain only in its bounds, so splitting it across three
branches would ship a third of a suite three times. Monthly and Annual are
blocked on it and each is a client build, a route, a picker, a column set and
a chart form over a read that already answers.

1. The domain: `OVERVIEW_RECORD_TYPES`, the `OverviewResponse` types,
   `aggregateOverview` at all three grains and its table-driven suite under
   `packages/domain/src/tests/unit/overview/` (Feb 29 against Feb 28, a
   March 31 read against a whole February, January's previous month, a year
   qualifying on one stray row, the zero divisor, the 24-point month series
   and the whole-history year series), and the `1900-01-01` floor on
   `validateLocalDate` with a case in its suite.
2. The reader, `packages/db/src/domains/overview.ts`, at all three grains,
   with an integration test under `packages/db/src/tests/integration` that
   seeds one Organization with rows on both sides of a period boundary, a
   problem collection, an awaiting collection, a dry inspection and a stray
   prior-year row, and reads the columns and `earliest` back at each grain.
   The predicates have a second table each and a text-level test proves
   nothing about them.
3. `apps/server/src/overview-reads.ts`, the route at all three grains, the two
   prefix lists, the 400 and the 404.
4. The two colour roles in `styles.css`, the family's chart component and
   `periodDestination`, with a preview section in `apps/preview` that also
   takes `chart.tsx` out of the `check:preview-coverage` backlog and moves
   `UNCOVERED_MODULES` down by one.
5. The service requests explorer's `from` and `to`: the `dateFields` entry in
   `parseServiceRequestMapFilters`, the two codecs, the control, and a case in
   the map surface execution suite.
6. `overview-data.ts`, the picker, the table, the page, the route, and the
   link cases in `link-destinations.test.tsx`.
7. The navigation change.

One one-line fix rides along, found while researching: the empty copy in
`habitat-inspection-stats.tsx` reads `No inspections() recorded for this
habitat yet.`, a stray pair of parentheses on screen, and the branch that adds
the family's chart component beside it fixes the string.

## Measurements and their caveats

Read off staging's full-history clone of production on 2026-09-21 (#1199), live
rows only, on the dates above. Inspections, samples and applications run from
2011, source reductions from 2014, collections from 2002, service requests from
1990, and releases and outreach are 2026-only with 3 and 1 rows. Rows dated
2022-01-01 onward, the five-year window as of that read: 174,701 inspections,
85,583 applications, 7,303 collections with 25,097 species rows, 3,188 samples,
2,045 service requests and 1,636 source reductions, about 300,000 rows in all,
260,000 of them inspections and applications. Day-level volume in 2025:
inspections peak at 455 on one day with a median active day of 238 over 160
active days, applications at 335 and 122 over 157, collections at 26 and 17
over 113, service requests at 62 and 3 over 102. The 2025 whole-year ratios,
for a sanity check of the build: 8,112 of 37,314 inspections positive, 21.7%,
and 73,665 mosquitoes over 1,596 problem-free collections, 46.2 per collection.

Every live collection on staging is in `collection_date_duration` mode, zero
carry a `collected_at`, so the `coalesce` over the zone is exercised by nothing
there and stays because a new collection can take exact mode. Ten years of
collections with no inspections beside them (2002 to 2010) means the
mosquitoes-per-collection ratio has a history the positive-inspection ratio
does not, and an Annual page opened on the earliest year lands on a year where
six of the eight rows are zero; that is the data and not a defect.

Production holds one Organization. Every number above is one program's history
and not a distribution.
