# The Dashboard

What `/` shows, where each number comes from, and what the server owes it. The
decisions were made on the wayfinder map [the Dashboard, a
state-of-the-Organization page](https://github.com/thebigthing313/simmer-mosquito/issues/977)
and its six tickets; this is what gets built. Where a decision has a reason
worth carrying, the reason is here and the ticket has the longer version.

Nothing here is built yet. `/` today is an `UpcomingPage` stub and the sidebar
entry carries `stub: true`. The prototype the layout was chosen on is branch
`prototype/dashboard-981`, static data, never merged; the build rewrites it.

## The page

The Dashboard is the state of the Organization: what is pending, what needs
attention, and what was logged this week, across every domain. It is one page
for every role, written for a Manager, and it carries no map, no chart and no
setting. Numbers, queue rows and one table of people.

Two horizons and no picker. Anything pending is "open now", the predicate at
read time. Activity is the rolling 7 days ending today in the Organization's
time zone, with the 7 days before it as the comparison. Today is
`todayInTimeZone` on the client and `localDateSql(now(), timeZone)` on the
server, both from the Organization's `timezone` setting, so the two halves of
the page agree on which day it is.

The roll-up rule separates this page from the five domain overviews: the
Dashboard shows a count and the age of the oldest and links to the list; an
overview shows the list. Nothing on the Dashboard is a list of records except
the people table.

Four sections, in this order, top to bottom:

1. Last 7 days, the activity strip. It leads because it is what a person
   opens the page for: what the Organization did this week, against last.
2. Pending queues, two panels side by side.
3. The untreated habitats banner.
4. In the field today, the people table.

The frame is what the overviews use: `pageContainer` at
`{ gap: 'overview', measure: 'record', padding: 'page' }`, so the page fills the
stage up to the 112rem cap, and a `PageHeader` with eyebrow `Organization`,
title `Dashboard`, the `generic.home` icon and the description "The state of the
Organization, for the person deciding what happens next." Below 1280px the two
queue panels stack.

Every name on the page is the one the prototype settled and is written here as
it appears on screen. The build does not rename.

## Pending queues

Two `Panel`s in a two-column grid. **Surveillance backlog** holds three rows and
**Operations backlog** holds four. Each panel's count pill is the sum of its
rows, and each opens with a muted header row reading `Queue`, `Oldest`, `Count`.

A queue row is one line: the queue's name as a `Link` on the left, the two-count
split in muted text where the row has one, the age of the oldest right-aligned
in a fixed column, and the count bold on the right. A row at zero stays on the
page, drawn in `text-muted-foreground`, with no age. The age reads `today`,
`1 day` or `N days`, days being calendar days in the Organization's zone between
the oldest row's date and today.

Every queue counts all time unless its row says otherwise. The link carries an
explicit `from` computed from the oldest row's date and `to` as today, so the
explorer shows the rows the count counted rather than its own default window.
The two exceptions are the rows whose explorers take no date.

| Queue | Pending when | Read | Oldest from | Link |
| --- | --- | --- | --- | --- |
| Samples awaiting identification | not `is_zero_larvae`, `unidentifiable_reason` null, no live `sample_species` row, parent inspection live | server | parent `inspection_date` | `/larval-surveillance/samples?status=awaiting&from=…&to=today` |
| Collections awaiting identification | dated, not `is_zero_result`, no live `collection_species` row | server | effective collection date | `/adult-surveillance/collections?awaiting=true&from=…&to=today` |
| Collections with a problem | `has_problem`, effective date in the last 14 days | Electric | effective collection date | `/adult-surveillance/collections?problems=true&from=…&to=today` |
| Open service requests | `closed_at` null; split into **new** and **in progress** | Electric | `request_date` | `/public-engagement/service-requests?status=open` |
| Requests for control not yet assigned | `resolved_at` null and no live `mission_items` row on a `scheduled` or `inProgress` mission names it | server | `requested_at` | `/operations/requests-for-control?status=open&unassigned=true&from=…&to=today` |
| Assignments started and not finished | `started_at` set, `completed_at` and `cancelled_at` null | Electric | `started_at` | `/operations/assignments?statuses=inProgress&from=…&to=today` |
| Missions due today or overdue | `started_at` null, no terminal, `scheduled_start_at` before the end of today in the Organization's zone | Electric | `scheduled_start_at`, reduced to the Organization's day | `/operations/missions?statuses=scheduled&from=…&to=today` |

The effective collection date is `coalesce(collected_at at the Organization's
zone, collection_date)`, the same expression every collection read uses. A
collection with neither, set and not yet emptied in exact-timestamps mode, is
undated and is not pending anywhere on this page.

Four rows carry a rule of their own.

The problem row is the one windowed queue, 14 days, because `has_problem` never
clears and an all-time count would only grow. The row's muted text says `last
14 days` so the window is on the page and not only in this document.

The service requests row is two counts on one line, `14 new · 44 in progress`,
and one link. A Service Request is **in progress** once a live
`assignment_items` row with `entity_type = 'service_request'` names it, on an
assignment in any state; a comment is not progress. **New** is every other open
request. Both terms are in `CONTEXT.md` (#989). The link carries no `from`,
because that explorer has no date filter and `status=open` is already the whole
count.

A Requested Control Action is **assigned** while a live mission item on a
`scheduled` or `inProgress` mission names it, so a stop on a cancelled or
completed mission leaves the request unassigned again and it comes back onto
this row. Also `CONTEXT.md` (#989).

The missions row has no lower bound: a mission scheduled for last month and
never started is overdue, and the oldest column reads how overdue. An
`inProgress` mission is on no queue, because someone is doing it.

Where the Dashboard disagrees with an overview it links from, the overview is a
fortnight's activity view and the Dashboard is the backlog. The samples and
collections awaiting rows will say a number the larval and adult overviews' 14
day panels do not, and that is the design: the clone's oldest awaiting
collection is from 2023-09-05 and a Manager wants to know that.

## The untreated habitats banner

One row under the queues, the whole row a link, in the warning
tone with the `actions.warning` icon. It reads `5 untreated habitats` with the
rule and the oldest age under it: "heavy in the last 7 days with no control
action since; oldest 6 days". At zero the same row draws in the neutral tone
with no link and reads `No untreated habitats`, so the Manager can see the
check ran.

An **untreated** Habitat is a derived state in `CONTEXT.md`'s relationship cues
(#991). The rule, from the flag ticket:

- The Habitat's most recent live inspection is dated within the rolling 7 days
  ending today and its density is `heavy` or `very_heavy`, the same two bands
  the larval overview's heavy panel reads. Ad Hoc Inspections have no Habitat
  and are out. Inactive Habitats are out; inaccessible ones stay in, because a
  heavy reading behind a locked gate is the one that needs a different plan.
- No Chemical Application, Source Reduction or Biocontrol Action dated on or
  after that inspection names the Habitat by `habitat_id` or names the
  inspection by `inspection_id`. Same day counts; the columns are dates.
  Applications and biocontrol carry both columns, source reductions carry
  `habitat_id` only. No spatial matching: an unlinked action nearby is a
  data-entry finding a Manager wants to see, not a treatment.
- No open Requested Control Action names the Habitat. That Habitat is already
  counted on the requests queue or is on a Mission, and one condition gets one
  count. Resolving the request clears nothing; only an action treats.

The window is 7 days and not the overview's 14 because egg to adult averages
about a week, so a heavy reading older than that has emerged and is no longer a
treatment the flag can prompt. The overview panel keeps its 14 days, being a
fortnight's review rather than a week's treatment prompt, and the two numbers
differ by design.

The read is the server, one query: latest live inspection per Habitat in the
window, filtered to heavy, anti-joined against the three action tables and the
open requests, returning the count and `min(inspection_date)`. The link is
`/larval-surveillance/habitats?untreated=true`, a filter that does not exist
yet; see "The three explorer filters".

## Last 7 days

One ruled strip, not a `Panel`: a section heading `Last 7 days` on the left,
and on the right the window's dates and the words "delta against the 7 before",
then one bordered row of eight cells, eight across on a wide screen, four at
`sm`, two below. Each cell is the count for the window, a delta chip beside it
and the type's label under it. The chip reads `+25`, `-13` or `same`, as an
outline `Badge` in `info`, `warning` or `neutral` tone.

The window is the 7 days ending today in the Organization's zone and the prior
window is the 7 before it. The client computes both from the same `today` the
rest of the page ages against, so the strip's title and its counts come from
one clock.

Eight types, each counted on the date its own overview and the Activity Monitor
count it on. The strip reads Electric rather than the server: `useActivityStrip`
opens one 14-day subset per table, `gte(<date>, priorWindow.from)`, and folds
the rows into the two counts, so a cell moves when a Collector's write syncs
rather than on the next five-minute tick. A `date` column arrives as
`YYYY-MM-DD` and is compared to the window's bounds as a string; `collected_at`
is reduced to the Organization's day with `localCalendarDay` first, and the
subset bounds it in its own type the way the problem queue does.

| Type | Label | Column |
| --- | --- | --- |
| Inspections | `Inspections` | `inspections.inspection_date` |
| Samples | `Samples` | the parent inspection's `inspection_date`; `samples` has no date of its own, so the inspections subset carries each parent's sample ids as a correlated `toArray` include |
| Collections | `Collections` | the effective collection date |
| Applications | `Applications` | `applications.application_date` |
| Source reductions | `Source reductions` | `source_reductions.source_reduction_date` |
| Releases | `Releases` | `biocontrol_actions.biocontrol_date` |
| Service requests received | `Service requests received` | `service_requests.request_date` |
| Outreach actions | `Outreach actions` | `outreach_actions.outreach_date` |

Every column is an operational date the person typed. Service requests were the
one type whose surfaces disagreed and `request_date` was decided over
`created_at` (#992): a call taken Friday and entered Monday belongs to Friday,
which is what the Activity Monitor already shows. The public engagement
overview's feed stays on `created_at`, because its `opened` event is one of
three instants beside `closed` and `commented`, and `request_date` has no time
of day to sort among them. A feed of events and a count of receipts are
different questions; this paragraph is here so the disagreement is not filed
again.

Every type is a cell, at `0` when there is nothing in either window. The strip
used to hide a type the Organization had never recorded, which needed an
existence check over the whole table and so put all eight types on the server;
a windowed client read cannot answer "ever", and a Manager in an Organization
that does no biocontrol reads `Releases 0` as true. The include over the
inspections subset is what the first build ruled out as `inArray` over 3,050
ids, and it is fine now because subset requests ride in a POST body
(`subsetMethod: 'POST'` in `packages/sync`), so the id list never meets a URL
limit.

## In the field today

A `Panel` titled `In the field today` with the `entities.contact` icon, its
count pill the number of rows, holding a `Table` of three columns: `Person`,
`Records` right-aligned, `Last record` right-aligned in muted text as `HH:MM`
in the Organization's zone. The person's name is a `Link` to
`/daily-work/$profileId?date=today`, the Activity Monitor's day. Rows are
ordered by records, most first. Empty, the panel draws `PanelMessage` reading
"Nothing logged yet today."

The read is the Activity Monitor's union in
`packages/db/src/domains/profile-activity.ts`, generalised from one Profile to
the Organization for one operational day and grouped by `profile_id`, count
and latest occurred-at. Same field attribution (`inspected_by_profile_id`,
`applicator_profile_id` and the rest, plus `additional_personnel`, and never
`created_by_profile_id`) and the same date rule, so the row's number is what
its link opens. `listProfileActivity` and this read share `activityBranches`;
the build makes the Profile predicate optional in that function rather than
copying seventeen branches.

## Reads

The rule from the read ticket: a panel whose predicate is one table's own
columns reads Electric; a panel that needs a second table to decide membership
reads the server. A count over a window reads Electric too, since the strip
moved off the server: a window is a subset, and a subset is what an on-demand
collection loads. The strip and four queues are Electric and everything else is
one server round-trip.

### The Electric hooks

Each is a hook under `apps/web/src/hooks/queries`, a `useLiveQuery` over a
subset with the oldest taken as `min` in the query, so the row moves the
instant a Collector saves and cannot disagree with the explorer it links to,
which reads the same collection.

- `useProblemCollectionsQueue`: `collections` where `has_problem` and the
  effective date is on or after 14 days ago, `or(gte(collected_at,
  sinceInstant), gte(collection_date, since))` the way `useCollectionsOverThreshold`
  already writes it.
- `useOpenServiceRequestsQueue`: `service_requests` where `closed_at` is null,
  plus `assignment_items` where `entity_type = 'service_request'`, joined on
  the client for the split. Two subsets rather than a joined query, because
  the count needs the requests that have no stop.
- `useInProgressAssignmentsQueue`: `assignments` where `started_at` is set and
  `completed_at` and `cancelled_at` are null.
- `useDueMissionsQueue`: `missions` where `started_at`, `completed_at` and
  `cancelled_at` are null and `scheduled_start_at` is before the end of today,
  the bound being `localDayStartAsInstant(tomorrow, timeZone)`.

- `useActivityStrip`, under `hooks/dashboard`: eight subsets, one per activity
  type, each `gte(<date>, priorWindow.from)`, folded into the window and prior
  counts in memory. The inspections subset carries each parent's sample ids as
  a correlated include, which is how samples are counted on their parent's
  date without a second query.

Each subset is pushed down, not filtered in memory, because the on-demand
collections should ask for the pending rows and not for every row the
Organization has ever written.

### `GET /dashboard`

One endpoint, registered from `apps/server/src/dashboard-reads.ts` beside
`larval-surveillance-reads.ts`, behind `authContextMiddleware` with no role
floor. Every role sees the page. It takes no query parameters: the Organization
is the session's and today is the server's, in the Organization's zone.

One reader, `packages/db/src/domains/dashboard.ts`, runs every server panel and
returns them as named sections. The samples predicate is the `awaitingCondition`
fragment in `larval-surveillance.ts`, lifted out of
`listSamplesAwaitingIdentification` so the overview's 14-day preview and the
Dashboard's all-time count cannot drift; the overview route keeps its `since`
and its list untouched. The collections predicate is the fragment the new map
filter reads (below). The flag predicate is the fragment the `untreated` map
filter reads.

```ts
interface DashboardResponse {
	readonly today: string; // YYYY-MM-DD in the Organization's zone
	readonly queues: {
		readonly samplesAwaiting: QueueCount;
		readonly collectionsAwaiting: QueueCount;
		readonly requestsUnassigned: QueueCount;
	};
	readonly untreatedHabitats: QueueCount;
	readonly peopleToday: readonly PersonToday[];
}

interface QueueCount {
	readonly count: number;
	/** The oldest pending row's date, YYYY-MM-DD; null when the count is 0. */
	readonly oldest: string | null;
}


interface PersonToday {
	readonly profileId: string;
	readonly records: number;
	/** ISO instant of the latest record. */
	readonly lastAt: string;
}
```

The Profile's name is not in the response; the client reads it off the eager
`profiles` collection the way every other surface does.

The response varies by the session's Organization and the URL carries no id, so
`/dashboard` joins `PRIVATE_READ_PREFIXES` in `cache-headers.ts` and gets a
`GET, OPTIONS` row in `cors-options.ts`. `cache-headers.test.ts` drives every
prefix at the registered routes and will refuse a prefix that matches nothing.
`/larval-surveillance/samples/awaiting` is not in that list today and has the
same shape; the build adds it in the same change.

### The client half

One `useQuery` in `apps/web/src/components/dashboard/dashboard-data.ts`, keyed
`['dashboard']`, with `refetchOnWindowFocus: true` and `refetchInterval` of
five minutes. The app's default is `refetchOnWindowFocus: false`, so the hook
sets it. No refresh control on the page: focus and the interval are the
cadence, and one query is one timer, which is why the five server panels are
one endpoint rather than five.

Mixed liveness is accepted, with nothing on the page saying so. The strip and
four queues move live and the rest are up to five minutes stale. No "last read" time, and
no refetch of the server half on an Electric change. One failing query fails
the whole server half, and that is the trade taken for one timer.

## Loading, empty and error states

Each panel answers for itself, the way the overviews do.

Loading: a queue panel draws `RowSkeleton` in place of its rows until every
hook it draws has answered, so the two panels can finish at different times
(Surveillance backlog waits on the server, Operations backlog on both). The
banner draws nothing until the server answers. The strip draws `RowSkeleton`
until its eight subsets are ready, and the people panel until the server
answers. A panel's count pill is withheld
while it loads, `count={undefined}`, the way the overview's awaiting panel
does.

Empty: a queue row at zero stays, muted, with no age. The banner at zero is the
neutral line. A strip cell at zero draws `0` with its chip. The people panel
draws its `PanelMessage`.

Error: an Electric hook reporting `isError` draws its rows as `PanelMessage`
reading "Pending work is unavailable right now." in that panel. The server
query failing draws the same message in every server section, "Untreated
habitats are unavailable right now." on the banner in the neutral tone, and the
people table replaced by "Activity is unavailable right now." The strip draws
the same words when one of its subsets fails. No retry control; the next focus or interval tick is the retry.
`ErrorReport` is for a route that cannot render, and this route can.

## Deep links and the three explorer filters

Every link on the page lands on a surface that shows the rows the count
counted. Three of the seven queues and the banner need a filter their explorer
does not have, and the read ticket assumed those would fetch ids from a sibling
endpoint and load rows over sync by `inArray`. That was written before reading
the explorers, and it is wrong for three of the four: the samples, collections
and habitats explorers read `/map/samples`, `/map/collections` and
`/map/habitats`, server reads with server-parsed filters, plus their tiles. A
new filter there is a new `defineFilters` entry and one `where` clause, the
shape `problem` already takes on collections, and the Dashboard reader shares
the fragment. There is no `GET /dashboard/queues/:queue/ids`.

- **Samples, `status=awaiting`**: exists. `parseSampleTileFilters` reads
  `status` as a `sampleStatus` and the surface resolves it. The link passes
  `from` as the oldest inspection date. No build work.
- **Collections, `awaiting=true`**: new. `awaiting` joins
  `parseCollectionMapFilters` as a `trueOnly` param beside `problem`, the
  surface adds `not exists (select 1 from collection_species …)` with
  `is_zero_result = false` and a non-null effective date, and the explorer's
  codecs gain `awaiting: flagParam` and a control in its filter bar. The
  fragment lives in `adult-surveillance.ts` and the Dashboard reader imports it.
- **Habitats, `untreated=true`**: new. `untreated` joins
  `parseHabitatTileFilters` as a `trueOnly` param, the surface applies the flag
  predicate as `exists (…)` on `h.id`, and the explorer's codecs gain
  `untreated: flagParam` and a control. One fragment in `habitats.ts`, read by
  the surface, the tiles and the Dashboard reader, so the banner's count and the
  explorer's rows are one predicate. The explorer's `status` filter defaults to
  active, which agrees with the rule.
- **Requests for control, `unassigned=true`**: new, and the one that stays on
  Electric, because that explorer reads `useRequestedControlActions` over a
  windowed subset. The filter joins `mission_items` where
  `requested_control_action_id` is not null to `missions` on the client, the
  join `useMissionsForRequest` already reads per request, and drops every
  request a live stop names. It is applied in memory after the date window, the
  way `status` is applied today, so the window stays pushed down to the
  on-demand subset. The Dashboard's own count stays on the server, because its
  window is all time.

The `from` on a link is the oldest row's date and `to` is today. The samples,
collections, assignments and missions explorers read `from` and `to` as
`dateParam` today; the requests-for-control explorer too. The service requests
explorer takes no date and gets none. Each link is asserted in
`apps/web/src/tests/unit/link-destinations.test.tsx`, by href, which is where
every `Link` destination in the app is asserted.

## Navigation

The `dashboard` item in `apps/web/src/components/app-shell/navigation.ts`
drops `stub: true`, which puts it in `shellSearchCandidates` and takes it off
the list of unbuilt destinations. The `'/'` entry in `upcoming-page.tsx` goes
with it, and `routes/index.tsx` mounts the page. The item keeps its label and
its icon.

## Build order

One build issue, one branch, one changeset: `Added:` on `apps/web`, since the
page is what a person can now do. The server half ships inside it rather than
carrying a changeset of its own, because `apps/server` is filed against the app
whose surface it changes.

The work sorts into an order because the page cannot link to a filter that does
not exist and the reader cannot share a fragment that has not been lifted.

1. Fragments. Lift `awaitingCondition` out of
   `listSamplesAwaitingIdentification`; write the collections awaiting fragment
   and the untreated fragment beside the surfaces that read them; make
   `activityBranches`' Profile predicate optional.
2. The three explorer filters and their codecs, each with a control in its
   filter bar so the URL state has a visible twin.
3. `packages/db/src/domains/dashboard.ts`, the reader, with an integration
   test under `packages/db/src/tests/integration` that seeds one Organization
   with a row in every state the predicates name and reads the counts back.
   The predicates have a second table each and a text-level test proves
   nothing about them.
4. `apps/server/src/dashboard-reads.ts`, the route, the two prefix lists.
5. The four Electric hooks, `-dashboard-data.ts`, the page, and the link cases.
6. The navigation change.

Two one-line fixes ride along, found while charting. The docblock on
`collectionTimingStamps` in `-collection-timing.ts` says duration mode "still
carries `collected_at`"; the `collections_timing_shape` CHECK and the server's
`collectionTiming` reader say it does not, and the reads are right. And
`/larval-surveillance/samples/awaiting` joins `PRIVATE_READ_PREFIXES`.

## Measurements and their caveats

Measured on the prod clone (Middlesex, three-year prune, last day 2026-08-24)
before the reads were placed. A fortnight in season is 3,050 inspections,
2,809 applications, 135 samples, 131 collections with 424 species rows, 130
service requests and 105 source reductions. The larval overview already pulls
14 days of inspections over Electric, so a window count of one table's own
column is affordable on sync. What is not affordable is an all-time anti-join:
168 collections await identification with the oldest at 2023-09-05, which on
Electric means every collection in history plus 15,995 species rows to find
them. That is the number behind the Electric-or-server rule.

The operations tables are empty on the clone, 0 missions, 0 requests for
control and 4 in-progress assignments, so the three operations queues are
placed by shape rather than by measurement. The `unassigned` client join is the
same: bounded by the explorer's window on the request side and by
`requested_control_action_id is not null` on the stop side, and unmeasured. If
a real Organization's stop table makes that subset large, the read ticket's ids
endpoint is the fallback, and it is a fallback rather than the plan because
`inArray` over a long id list is the fan-out shape that 503'd the samples
overview.

Production holds one Organization. Every number above is one program's season
and not a distribution.
