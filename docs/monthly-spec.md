# Monthly

What `/monthly` shows and where it departs from Today. It is the second of the
three period-in-review pages, and `docs/today-spec.md` carries what the three
share: the eight record types and the two ratios, the hidden-type rule, the
partial-period cut, the average column, the `GET /overview/:grain` contract,
the reader, the client half, and the loading, empty and error states. Nothing
in that document is restated here; this one is the month grain's columns,
picker, chart, links, URL and navigation change.

The decisions were made on the wayfinder map [the period-in-review pages,
Today, Monthly and Annual](https://github.com/thebigthing313/simmer-mosquito/issues/1195);
the prototype is branch `prototype/overview-1201`, never merged. `/monthly`
today is an `UpcomingPage` stub mounted by #1082.

## The page

The frame is Today's. The `PageHeader` carries no eyebrow, the
`generic.chart` icon, the title `Monthly`, the description "What was recorded
in one month, against the month before, the same month last year and the five
years before." and the picker in `actions`. The upward line under it reads
`September 2026 · 2026`, the month's long name in the foreground weight and the
year as a link to `/annual?year=2026`. It is the only way from a month to its
year.

Then the table panel, titled with the month's short name (`Sep 2026`), and the
trend section headed `2026 by month, beside 2025`, with one chart panel per
shown row in the three-column grid. The Monthly trend heading also carries the
family's one legend: a two-swatch row at the right of the heading, `2026` in
the period role and `2025` in the comparison role, not inside each panel.
Today and Annual carry none.

## The picker

Previous and next arrows either side of one `Select` over the reachable
months, newest first and grouped by year with a `SelectLabel` per year, the
trigger labelled `Month shown`. Not two selects for month and year, which lets
a person assemble a future or pre-earliest month. Next is disabled at the
current month and previous at `earliest`'s month, both read off the response.
A `This month` button appears only when the shown month is not the current
one. A month before `earliest` reached through the URL is listed as an extra
item at the bottom while it is the shown month, since a `Select` draws nothing
for a value it has no item for.

## The table

Five columns:

| Head | What it holds |
| --- | --- |
| `Record type` | the row's label |
| `Sep 2026` | the month, bold |
| `Aug 2026` | the previous month; January's is December of the year before |
| `Sep 2025` | the same month last year |
| `2021–2025 average` | the mean of that month over the qualifying prior years |

When the month is the current one it is partial, and every comparison column
is cut to the same day of its own month, clamped to that month's last day, as
`docs/today-spec.md` spells it: a read on Sep 21 compares against Aug 1 to 21,
Sep 1 to 21 of 2025, and Sep 1 to 21 of each averaged year, and a read on
Mar 31 compares against the whole of February. The caption in the panel's
`actions` slot reads `Each period through the 21st`, the day written as an
ordinal, and is absent on a complete month. The headers stay the plain names;
the `from` and `to` behind them come off the response's `columns`.

## The chart

A **grouped bar** in the emphasis form: the picked month's year as one series
in the period role, the year before as a second series in the comparison
role, twelve groups of two, 24 bars. The series is the response's 24-point
array split by the year in each point's `period`, and a month the year has not
reached is not a bar, so the current year's group runs through the current
month. Marks follow the `dataviz` mark spec: `maxBarSize` 24, a 4px radius on
the data end and a square baseline, `barGap` 2, no stroke. One y axis at clean
ticks, a `CartesianGrid` horizontal only, a three-letter month per x tick. The
tooltip reads both series at the hovered month, value first, through the
pinned `formatter`. The picked month is marked with a dashed `ReferenceLine`
in the foreground colour at its group; every bar in the period series wears
the period role at full strength, and the alternative, the picked bar at full
strength and the rest of its series a step down, is not taken.

The comparison role is `--chart-comparison`, `var(--simmer-green-300)`,
registered by Today's build. `green[200]` and `green[100]` were offered and
are too faint. Its contrast against the card is 2.05:1, under the 3:1 relief
rule, and the table above the charts is the relief. The de-emphasis grey the
stylesheet has, `--muted-foreground`, sits 10.6 from brand green under
full-colour vision, under the skill's hard floor, so it is not the comparison
colour.

A ratio chart plots the ratio per month for both years; a month whose
denominator is zero has no bar.

A bar opens its own month at this grain: a July 2025 bar opens
`/monthly?month=2025-07`, through `periodDestination` and `navigate` the way
Today's click does. There is no day bar on Monthly, so nothing on this page
opens Today; a person reaches a day through the sidebar or the Activity
Monitor.

## Links

A count in a real column opens the type's explorer with `from` and `to` at the
month's first and last day, `to` the last day even when the month is partial:
`/control-operations/chemical?from=2026-09-01&to=2026-09-30`. The explorer per
type is Today's table, and the service requests link writes `status=all`
beside the dates over the filter Today's build adds. A ratio cell and an
average cell are not links.

## The period in the URL

`/monthly?month=YYYY-MM`, one codec of `dateParam`'s shape over the value. The
current month leaves the search empty and an explicit current month is legal
and not rewritten; malformed (`?month=2026-13`) and future rewrite to the
current month with the address rewritten; a month before `earliest` reads as a
month of zeros and is left alone.

## Navigation

The `monthly` item in `navigation.ts` drops `stub: true`, the `'/monthly'`
entry leaves `upcoming-page.tsx`, and `routes/monthly.tsx` mounts the page with
`validateSearch` over the `month` codec. The item keeps its label and its icon.

## Build order

One build issue, blocked on Today's, one branch, one changeset: `Added:` on
`apps/web`. `GET /overview/month` answers once Today ships, with the month
grain's arithmetic and reader cases in the suites Today's build writes, so
this is a client build.

1. The grouped bar form in the family's chart component and its preview
   section, the legend row.
2. The picker, the caption, the page, the route, and the link cases.
3. The navigation change.
