# Annual

What `/annual` shows and where it departs from Today. It is the third of the
three period-in-review pages, and `docs/today-spec.md` carries what the three
share: the eight record types and the two ratios, the hidden-type rule, the
partial-period cut, the average column, the `GET /overview/:grain` contract,
the reader, the client half, and the loading, empty and error states. Nothing
in that document is restated here; this one is the year grain's columns,
picker, chart, links, URL and navigation change.

The decisions were made on the wayfinder map [the period-in-review pages,
Today, Monthly and Annual](https://github.com/thebigthing313/simmer-mosquito/issues/1195);
the prototype is branch `prototype/overview-1201`, never merged. `/annual`
today is an `UpcomingPage` stub mounted by #1082, whose copy promises weather
beside the counts and a season; neither is on this page. Weather is out of the
map's scope, a different reader over a different table, and a season with a
start month the Organization sets is the map's fog, so the period is the
calendar year.

## The page

The frame is Today's. The `PageHeader` carries no eyebrow, the
`generic.chart` icon, the title `Annual`, the description "What was recorded
in one year, against the year before and the five years before." and the
picker in `actions`. There is no upward line, because there is no coarser
grain.

Then the table panel, titled with the year (`2026`), and the trend section
headed `By year`, with one chart panel per shown row in the three-column grid
and no legend, the series being one.

## The picker

Previous and next arrows either side of one `Select` over the reachable years,
newest first, the trigger labelled `Year shown`. Next is disabled at the
current year and previous at `earliest`'s year, both read off the response. A
`This year` button appears only when the shown year is not the current one. A
year before `earliest` reached through the URL is listed as an extra item at
the bottom while it is the shown year.

The select spans the history: on staging that is 1990 to 2026 on service
requests against 2011 on inspections, 37 items. Once the `1900-01-01` floor
on `validateLocalDate` lands and #1214 is fixed, nothing older than 1990 is
in it; until then `earliest` reads 1826 off that one row, which is the
reason the floor ships in Today's build ahead of this page.

## The table

Four columns, one fewer than the other grains:

| Head | What it holds |
| --- | --- |
| `Record type` | the row's label |
| `2026` | the year, bold |
| `2025` | the previous year |
| `2021–2025 average` | the mean over the qualifying prior years |

"Same period last year" is the previous period at this grain, and a
year-before-last column would be the one column in the family with no
counterpart on the other two pages; the average already holds that year.

When the year is the current one it is partial, and both comparison columns
are cut to the same calendar date within their own year, as
`docs/today-spec.md` spells it: a read on Sep 21 compares 2026 through Sep 21
against 2025 through Sep 21 and each averaged year through Sep 21, and a read
on Feb 29 compares against Feb 28 in a common year. The caption in the panel's
`actions` slot reads `Each period through Sep 21` and is absent on a complete
year. The headers stay the plain years; the `from` and `to` behind them come
off the response's `columns`.

## The chart

A **single-series bar**, one hue, every year from `earliest`'s year to the
current year, the whole history, so the picked year sits inside it and 37
bars for service requests is fine at the mark spec's 24px cap. Marks as on
Monthly: `maxBarSize` 24, a 4px radius on the data end and a square baseline,
a 2px gap, no stroke, one y axis at clean ticks, a `CartesianGrid` horizontal
only, the year per x tick thinned by Recharts as the width demands. The
tooltip reads the year and the value through the pinned `formatter`. The
picked year is marked with a dashed `ReferenceLine` in the foreground colour;
every bar wears the period role at full strength. The current year, when it is
in the series, is a partial year drawn whole beside full years, and the
reference line on it plus the table's caption are what say so; the series
never carries the cut.

A ratio chart plots the ratio per year; a year whose denominator is zero has
no bar.

When the series holds fewer than three years, an Organization in its first or
second year of records, the trend section is not drawn and the table stands
alone: a one-bar or two-bar chart is on the `dataviz` skill's anti-pattern
list, and the table already carries that case.

A bar opens its own year: a 2023 bar opens `/annual?year=2023`, through
`periodDestination` and `navigate`. There is no month bar on Annual, so
nothing on this page opens Monthly.

## Links

A count in a real column opens the type's explorer with `from` and `to` at
the year's first and last day, `to` being Dec 31 even when the year is partial:
`/adult-surveillance/collections?from=2026-01-01&to=2026-12-31`. The explorer
per type is Today's table, and the service requests link writes `status=all`
beside the dates over the filter Today's build adds. A ratio cell and an
average cell are not links. A year of inspections is 30,000 to 40,000 rows on
staging, and the explorer's rail lists the viewport since #920, so the link
lands on a map of the year rather than a list of it; that is the explorers'
rule.

## The period in the URL

`/annual?year=YYYY`, one codec of `dateParam`'s shape over the value. The
current year leaves the search empty and an explicit current year is legal and
not rewritten; malformed (`?year=26`) and future (`?year=2031`) rewrite to the
current year with the address rewritten; a year before `earliest` reads as a
year of zeros and is left alone.

## Navigation

The `annual` item in `navigation.ts` drops `stub: true`, the `'/annual'` entry
leaves `upcoming-page.tsx`, and `routes/annual.tsx` mounts the page with
`validateSearch` over the `year` codec. The item keeps its label and its icon.
This is the last of the three, so the comment over the Overview group that
names the stubs comes out with it. Nothing writes how many stubs there are;
the suites read them off the register through `stubItems` (#1097), so no
count moves.

## Build order

One build issue, blocked on Today's, one branch, one changeset: `Added:` on
`apps/web`. `GET /overview/year` answers once Today ships, with the year
grain's arithmetic and reader cases in the suites Today's build writes, so
this is a client build.

1. The single-series bar form in the family's chart component and its preview
   section, and the under-three-years rule.
2. The picker, the caption, the page, the route, and the link cases.
3. The navigation change.
