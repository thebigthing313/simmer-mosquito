# The chart primitive a period-in-review page starts from

Status: Research for issue #1200, part of the map in #1195. Nothing here is
built and no product code changed. Every claim is read off the source at the
path it names, on `origin/develop` at `4e14fb3b`, or off the `dataviz` skill's
reference files. Where a number was measured it says how.

## What exists

### `chart.tsx` is the shadcn chart wrapper over Recharts 3.8.0

`packages/ui-web/src/components/ui/chart.tsx` is the generated shadcn chart
module and is excluded from Biome with the rest of `components/ui`. It wraps
`recharts@3.8.0`, pinned exactly in `packages/ui-web/package.json:80` and
`apps/web/package.json:30`, and resolved once in the lockfile
(`pnpm-lock.yaml:5881`). The module exports six names (`chart.tsx:331-338`):

- `ChartConfig` (`chart.tsx:12-21`) is a `Record<string, { label?, icon?,
  color? | theme? }>`. A key is a series or a category name. `color` is any
  CSS colour string, and a `theme` is a `{ light, dark }` pair keyed by the
  `THEMES` table on line 7.
- `ChartContainer` (`chart.tsx:39-75`) puts the config in a React context,
  gives the wrapper `div` a `data-chart` id, applies a class list that recolours
  Recharts' own defaults (axis tick text to `fill-muted-foreground`, gridlines
  drawn with `stroke='#ccc'` to `stroke-border/50`, the tooltip cursor
  rectangle to `fill-muted`) and mounts a `ResponsiveContainer`. Its default
  class is `aspect-video`, so a container with no class of its own is 16:9 and
  sizes to its width. `initialDimension` is 320 by 200 (`chart.tsx:9`), which is
  what the first server-less render measures before the resize observer runs.
- `ChartStyle` (`chart.tsx:77-104`) is how colour flows. It writes a `<style>`
  element scoped to `[data-chart=<id>]` declaring `--color-<key>: <value>` for
  every config key that carries a `color` or a `theme`, one block per theme.
  So a config `{ current: { color: 'var(--chart-1)' } }` makes
  `var(--color-current)` resolvable inside that chart and nowhere else, and a
  Recharts `fill="var(--color-current)"` reads it. A key with a label and no
  colour emits nothing.
- `ChartTooltip` is `RechartsPrimitive.Tooltip` re-exported (`chart.tsx:106`),
  and `ChartTooltipContent` (`chart.tsx:108-246`) is the content component: it
  reads the label off the config by key, draws a 2.5 by 2.5 indicator square in
  the series colour (`indicator="dot"`), or a 1-wide line, or a dashed border,
  and prints the value in `font-mono tabular-nums`. A `formatter` prop replaces
  the whole row. Without one the value goes through `toLocaleString()` with no
  locale tag (`chart.tsx:233`), which is one of the four unpinned formatters the
  display-formatters convention in `CLAUDE.md` says `components/ui` carries. A
  page that wants the wording it asserts passes a `formatter`.
- `ChartLegend` is `RechartsPrimitive.Legend` re-exported (`chart.tsx:248`),
  and `ChartLegendContent` (`chart.tsx:250-303`) draws a centred row of 2 by 2
  swatches in `item.color` beside the config label.

Nothing in the module knows about bars, axes or grids. Those come from
`recharts` directly, imported beside the wrapper, which is what the one live
chart does (`habitat-inspection-stats.tsx:17` imports `Cell`, `Pie` and
`PieChart` from `recharts`).

The module compiles under the React Compiler with the rest of
`packages/ui-web/src`, and it is in the `check:preview-coverage` backlog rather
than on `NO_PREVIEW` (`scripts/check-preview-coverage.mjs:107-110`): a preview
section for it is "a config object and a few rows of data", and none exists.

### The one live chart is a donut on the habitat detail page

`apps/web/src/components/larval-surveillance/habitats/habitat-inspection-stats.tsx`
is the only module under `apps/web/src` importing from `components/ui/chart`.
It draws `HabitatInspectionStats`, a three-segment donut of a habitat's
inspections (dry, wet with no breeding, wet with breeding), mounted from
`habitat-detail.tsx:131`.

- Data shape: a `useLiveQuery` over the on-demand `inspections()` collection
  filtered by `habitat_id` (lines 124-142), projected to the ten fields that
  decide a segment, then folded by `computeSegments` (lines 76-119) into
  `{ total, segments: [{ key, label, color, count, percent }] }`. The `Pie`
  takes `segments` as `data` with `dataKey="count"` and `nameKey="key"`, and a
  `Cell` per segment carries the fill (lines 173-186). Animation is off.
- States: the branch at lines 156-164 is error first, then not ready, then
  empty, then the chart. Error draws a one-line muted paragraph; not ready
  draws `StatsSkeleton` (lines 224-235), a round `Skeleton` the donut's size
  over three row skeletons; empty draws a bordered muted box with a sentence.
  The empty sentence reads `No inspections() recorded for this habitat yet.`
  (line 162), which is a stray pair of parentheses in copy on screen and is a
  one-line fix for whichever branch touches the file next.
- Colours: `chartConfig` (lines 69-74) names `var(--muted-foreground)`,
  `var(--chart-2)` and `var(--chart-5)`. Those are `var()` references, not
  literals, so `check:map-palette` has nothing to refuse: the gate reads hex and
  the four functional notations `rgb()`, `rgba()`, `hsl()` and `hsla()`
  (`scripts/check-map-palette.mjs`, "What a colour is here, since #712"), and
  neither `var(--x)` nor `oklch()` is on that list. A period chart that names
  `var(--chart-n)` or `var(--color-<key>)` passes the gate the same way. The
  legend below the donut is hand-written (`<dl>`, lines 201-216) with a
  `backgroundColor: segment.color` swatch rather than `ChartLegendContent`.
- The tooltip is `ChartTooltipContent` with `hideLabel` and `nameKey="key"`
  (line 170), so the row reads the config label and the count.
- Bundle: `docs/web-components.md:270-274` records that this is the only
  `recharts` import in the app and that it once put about 315 KB into the boot
  payload through an eager import chain. It sits in the habitat detail route
  chunk now. A period page that imports `recharts` in a route module pulls the
  same 315 KB into that route's chunk, which is fine for a page whose job is the
  chart and is the trap if any of it is imported by an eager module.

### The stylesheet carries five `--chart-n` slots and nothing categorical

`packages/design-tokens/src` has no chart or series role. `grep -i chart`
over `color.ts`, `colors.ts`, `map-palette.ts`, `tag-palette.ts` and
`tokens.css` finds nothing. The only chart roles are shadcn's five slots in
`packages/ui-web/src/styles.css:69-73`, registered under `@theme inline` at
lines 155-159 so `fill-chart-1` and `var(--chart-1)` both work:

| slot | value in `styles.css` | what it is | hex (via `oklchToRgb` in `packages/design-tokens/src/color.ts`) |
|---|---|---|---|
| `--chart-1` | `var(--simmer-green)` | brand green, `green[600]` | `#1b7e53` |
| `--chart-2` | `oklch(44.83% 0.1791 268.37)` | the value of `--simmer-blue` (`tokens.css:36`), restated | `#2d46b6` |
| `--chart-3` | `oklch(49.37% 0.1424 325.97)` | the value of `--simmer-purple` (`tokens.css:34`), restated | `#893f8c` |
| `--chart-4` | `var(--simmer-yellow)` | brand yellow, `yellow[100]` | `#f5f6ce` |
| `--chart-5` | `oklch(61.56% 0.2307 16.37)` | the value of `--simmer-red` (`tokens.css:35`), restated | `#ef2352` |

Two of the five are also status roles: `--info: var(--chart-2)` and
`--catalog: var(--chart-3)` (`styles.css:109,111`). So slot 2 paints the info
badge and slot 3 paints the catalog badge, and a series in either would wear a
status colour, which the `dataviz` skill's collision rule refuses ("Status is
fixed", `references/color-formula.md`). Slots 2, 3 and 5 restate a brand value
the same file could alias with `var(--simmer-blue)` and its neighbours, the way
slots 1 and 4 already do; no gate reads a restated `oklch()` value.

Run through the skill's validator as a categorical palette against the card
surface (`--card: oklch(99% 0.004 165)`, `#f9fdfb`), the five slots fail: slot
4 is outside the lightness band (L 0.96), below the chroma floor (C 0.05) and at
1.08:1 contrast, and the slot 2 to slot 3 pair sits in the CVD warn band at
Delta E 7.4 under protanopia.

```
node scripts/validate_palette.js "#1b7e53,#2d46b6,#893f8c,#f5f6ce,#ef2352" --mode light --surface "#f9fdfb"
```

That is the measurement behind the sentence above. The five slots were never
designed as a series palette; they are shadcn's defaults with the brand colours
dropped in. Slot 1 alone, and slots 1 and 2 as a pair, pass every check
(green to blue: CVD Delta E 22.6 deutan, 8.8 tritan; normal-vision 25.3; both
above 3:1).

### The Registered Token Rule for a new colour role

`DESIGN.md:215-245` and `pnpm check:registered-tokens`. A new role goes in
`packages/ui-web/src/styles.css` twice: declared in `:root`, and referenced
from an `@theme inline` entry under `--color-*`, which is what makes Tailwind
emit `fill-<role>` and `bg-<role>`. The gate fails a `:root` role no `@theme`
entry names and a class reaching for one. Two traps in the same paragraph: a
colour cannot be named `caption`, `small`, `body`, `title` or `heading`,
because `--text-*` and `--color-*` share the `text-` prefix; and a name
Tailwind already ships overrides the built-in silently. `--chart-6` would be
free of both.

For a Recharts chart the class form matters less than the `var()` form: a
`fill` attribute takes `var(--chart-1)` directly, and `ChartStyle` takes the
same string in a config `color`. Registration still matters for the legend
swatch and any HTML beside the chart.

### `Panel` takes any children

`packages/ui-web/src/components/panel.tsx:19-80`. `Panel` takes `icon`,
`title`, an optional `count`, `actions` and `footer`, and `children: ReactNode`
rendered inside a `div` with `min-w-0` (line 74). With `scrollBody` off, the
default, the body has no height cap. A `ChartContainer` inside it works with no
change to `Panel`; the body has no padding of its own, so the chart owes its
own, the way `PanelMessage` carries `px-4 py-8`. `PanelMessage` (line 83) is the
empty and unavailable sentence and `RowSkeleton` (line 90) the placeholder rows,
and the Dashboard's `activity-strip.tsx:44-52` is the precedent for ordering
them: `isError` first, then `data === undefined`, then the content.

## What the `dataviz` skill requires

Read off the skill's `SKILL.md` and `references/` (`choosing-a-form.md`,
`color-formula.md`, `marks-and-anatomy.md`, `interaction.md`, `palette.md`,
`anti-patterns.md`).

### The form heuristic and the 365-day series

The job table (`choosing-a-form.md`, "The job -> the type") gives: trend over
time is a line, or an area for a single series; distinct series to tell apart is
a grouped or stacked bar with categorical colour; one series that is the point
with the rest as context is **emphasis**, one hue with the rest in a
de-emphasis grey. The heuristic names no point count. What decides the 365-day
case is the mark spec: a bar is at most 24px thick, square at the baseline,
with a 2px surface gap between neighbours (`marks-and-anatomy.md`, "Mark specs"
and "The two spacers"), and on bars the mark is the hit target with a hit area
of at least about 24px (`interaction.md`). At a plot width of 600px, 365 slots
are 1.6px each, under the gap alone, so no bar can meet the spec and no bar can
be hovered. A year of days is an area with a crosshair tooltip that snaps to
the nearest date, and today is the end marker: a filled dot of at least 8px
with a 2px surface ring. The single series takes no legend box, since the panel
title names it.

The same arithmetic keeps the twelve-month and the year grains as bars. Twelve
months with last year beside them is 24 bars plus gaps, and five to ten years is
well under the cap.

### Grouped bar with one comparison series and one highlighted bar

- Colour job. Two series, the period and last year, where the period is the
  point and last year is context: that is emphasis, not categorical. The period
  wears one hue, the comparison wears the de-emphasis grey, and the highlighted
  bar (today, this month) is the same hue read against the rest. The skill's
  emphasis form does not spend a second categorical slot on the comparison.
- Series colour follows the entity, never its rank. Last year is always the
  grey whether or not the current period column is showing.
- Marks: 24px cap, 4px rounded data end and square baseline (`Bar radius`
  takes a four-corner array in Recharts 3.8, `types/cartesian/Bar.d.ts:167`),
  a 2px surface gap between the period bar and the comparison bar (`barGap`),
  `maxBarSize` (`Bar.d.ts:110`) for the cap, and no stroke around a bar.
- Axis: one y axis, never two; ticks at clean thousands-comma'd numbers; a
  hairline solid one-step-off-surface gridline; axis text in the muted text
  token, which `ChartContainer` already does for tick text.
- Labels: a legend is present for two series; direct labels are selective, so
  the highlighted bar carries its value and the rest do not; a value never wears
  the series colour.
- Tooltip: per-bar hover on bars, every series at that category in one readout,
  value first and series name second, keyed by a short line of the series
  colour; the hovered bar lifts (`activeBar`, `Bar.d.ts:145`). Every value is
  also reachable without hovering, which the #1195 table beside each chart
  satisfies. `ChartTooltipContent` draws the indicator before the label and the
  value last, the opposite order to "values lead"; a `formatter` can reorder it.
- Loading: refetch holds the previous render at reduced opacity, no skeleton
  and no layout jump. First load is where a skeleton belongs. The Dashboard's
  reader refetches on focus and every five minutes, so the period page has both
  cases.
- A stat tile, not a chart, when the data is one number. The Annual page over
  an Organization with two years of records is two bars, and the skill's
  anti-pattern list names the one-bar bar chart; the table already carries that
  case and the chart can be withheld under a bar count.

### How the palette maps onto the token system

The skill's palette is a parameter set: ramps, a categorical order, a
sequential hue, a diverging pair, a status palette, surfaces
(`SKILL.md`, "Plugging in a design system"). SIMMER supplies the green and
yellow ramps in `packages/design-tokens/src/colors.ts:21-46` (steps 50 to 900),
three single brand colours (purple, red, blue, `colors.ts:52-59`), and a status
palette already in `styles.css` (`--success`, `--warning`, `--info`, `--danger`,
`--attention`). What it does not supply is a categorical order or a named
de-emphasis grey, and the validator says the five `--chart-n` slots are not
that order.

For emphasis, measured against the card surface:

| pair | CVD Delta E (worst) | normal-vision Delta E | contrast |
|---|---|---|---|
| `green[600]` `#1b7e53` and `--muted-foreground` `#4b6265` | 6.9 deutan | 10.6, below the 15 floor | both above 3:1 |
| `green[600]` and `green[300]` `#7bc296` | 22.3 | 22.8 | `green[300]` at 2.05:1, relief required |
| `green[700]` `#0c5331` and `green[300]` | 36.3 | 36.3 | `green[300]` at 2.05:1, relief required |
| `green[600]` and `--simmer-blue` `#2d46b6` | 8.8 tritan, 22.6 deutan | 25.3 | both above 3:1 |

The grey the stylesheet has, `--muted-foreground`, is a dark teal-grey that
sits 10.6 from brand green under full-colour vision, under the skill's hard
floor, so it is not the comparison colour. A light step of the green ramp
separates cleanly and reads as "the same thing, faded", which is the emphasis
idea, at the cost of the relief rule: the comparison bar is under 3:1 against
the card, so its value has to be readable elsewhere, and the table beside the
chart is that. The skill also names this shape directly under before-and-after
per item: "1 hue, 2 shades". The validator's chroma-floor failure on a grey is
by design; it validates categorical palettes and says so in its footer.

## What a bar-per-type period chart needs that does not exist

1. A bar chart. The wrapper has no bar, axis, grid or reference-line
   component and the live chart is a pie. `BarChart`, `Bar`, `XAxis`, `YAxis`,
   `CartesianGrid` and `ReferenceLine` come from `recharts` and would be
   imported beside the wrapper, in one component under `apps/web/src/components`
   for the page family.
2. Two colour roles. A `period` role for the current period's bars and the
   area fill, and a `comparison` role for last year's bar. Neither exists as a
   token. `--chart-1` is the period role by value already; the comparison
   candidate is a light step of the green ramp, `green[300]` or `green[200]`,
   and it has to be declared in `:root` and registered under `--color-*` to
   satisfy `check:registered-tokens`, then named as `var(--<role>)` in a
   `ChartConfig`. Naming a step by hand in `apps/web` as `oklch()` would pass
   `check:map-palette` today and is still a private colour; the register is the
   stylesheet.
3. A highlighted bar. Recharts gives a `Cell` per bar with its own `fill`
   (the donut already uses it), so today's or this month's bar takes the period
   role at full strength while the rest of the same series take a step down, or
   the rest take the period role and today takes a `ReferenceLine`. The skill
   prefers one hue and a marked bar over a third colour.
4. A per-bar link. `Bar` takes `onClick` (`Bar.d.ts:241`) with the bar's
   payload, which is where a month bar in Annual opens Monthly. There is no
   `Link` inside an SVG, so the handler navigates with the router's `navigate`
   and the destination cannot be asserted through `link-destinations.test.tsx`
   the way an anchor is.
5. A refetch state. Nothing in the workspace holds a chart at reduced opacity
   while its reader refetches; the Dashboard strip draws the previous data with
   no dimming because `server.data` stays populated across a refetch. The
   period page decides whether to dim on `isFetching`.
6. A `formatter` for the tooltip value and a locale-pinned tick formatter,
   because `ChartTooltipContent`'s default calls `toLocaleString()` unpinned.
7. A preview section, which would also take `chart.tsx` out of the
   `check:preview-coverage` backlog and move `UNCOVERED_MODULES` down by one.
8. A validator run on the final pair against the card surface, committed in the
   spec, since the skill's rule is to compute the colour and not to eyeball it.

## Recommendation by grain

- Today, the year's days to date: an area, not bars. One series in the
  period role at about 10% opacity fill over a 2px line, a crosshair tooltip
  snapping to the nearest day, today as the end marker with a surface ring, no
  legend. 365 slots cannot carry a 2px gap or a 24px hit target. The comparison
  columns (yesterday, this day last year, the five-year average) stay in the
  table; a second area for last year is the case to argue for in the prototype,
  since two overlapping washes are the shape the skill's overlap rules are
  about.
- Monthly, twelve months with last year beside them: a grouped bar in the
  emphasis form. The period series in the period role, last year in the
  comparison role, this month marked, 24px cap, 2px gap, one y axis, legend
  present, the value labelled on the marked bar only. Twelve groups of two is
  24 bars, comfortably under the cap at any panel width the Dashboard grid
  gives.
- Annual, the years: a single-series bar, one hue, the current year marked,
  no legend. Under three years the chart is a one-bar or two-bar chart, which
  the skill's anti-patterns name, and the panel draws the table alone.

Every one of the three is one `ChartContainer` inside one `Panel`, with the
`ChartConfig` naming the two roles by `var()` and the `Cell` or `ReferenceLine`
doing the marking. What the prototype ticket has to settle is the comparison
role's value and whether the marked bar is a stronger step or a reference line.
