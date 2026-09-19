/**
 * The Dashboard: the state of the Organization, for the person deciding what
 * happens next.
 *
 * Four sections, top to bottom: the two backlog panels, the untreated habitats
 * banner, the last-7-days strip, and the people in the field today. Nothing
 * here is a list of records except the people table; a queue shows a count
 * and the age of the oldest and links to the explorer that lists them, with
 * the explorer's filters set so it shows the rows the count counted.
 *
 * Every number has one of two sources. Four queues read Electric through the
 * hooks under `hooks/queries`, so the row moves the instant a Collector saves.
 * Everything else is one server round-trip in `-dashboard-data.ts`, up to five
 * minutes stale, and nothing on the page says which is which. Each panel
 * answers for its own loading and error states, the way the overviews do.
 * `docs/dashboard-spec.md` is the brief; the names on screen are the ones the
 * prototype settled, except that every record noun reads `recordNoun`.
 */

import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Panel, PanelMessage, RowSkeleton } from '@simmer-mosquito/ui-web/components/panel';
import { PanelRows } from '@simmer-mosquito/ui-web/components/panel-rows';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { ChevronRightIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link, type LinkProps } from '@tanstack/react-router';
import { useDashboard } from '../../hooks/dashboard/use-dashboard';
import type { ElectricQueue } from '../../hooks/queries/shared';
import { useDueMissionsQueue } from '../../hooks/queries/use-due-missions-queue';
import { useInProgressAssignmentsQueue } from '../../hooks/queries/use-in-progress-assignments-queue';
import { useOpenServiceRequestsQueue } from '../../hooks/queries/use-open-service-requests-queue';
import { useProblemCollectionsQueue } from '../../hooks/queries/use-problem-collections-queue';
import { useProfileNames } from '../../hooks/queries/use-profile-names';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { formatMonthDay, localTimeOfDay, todayInTimeZone } from '../../lib/local-date';
import { recordNoun } from '../../lib/record-nouns';
import {
	ACTIVITY_TYPE_KEYS,
	type ActivityTypeKey,
	ageInDays,
	ageLabel,
	deltaLabel,
	type QueueCount,
} from './dashboard-data';

const HomeIcon = iconRegistry.generic.home.icon;
const QueueIcon = iconRegistry.generic.history.icon;
const FlagIcon = iconRegistry.actions.warning.icon;
const PeopleIcon = iconRegistry.entities.contact.icon;

/** The server half, as every section reads it. */
type ServerRead = ReturnType<typeof useDashboard>;

const QUEUES_UNAVAILABLE = 'Pending work is unavailable right now.';
const ACTIVITY_UNAVAILABLE = 'Activity is unavailable right now.';

export function DashboardPage() {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const server = useDashboard();

	return (
		<div className={pageContainer({ gap: 'overview', measure: 'record', padding: 'page' })}>
			<PageHeader
				description="The state of the Organization, for the person deciding what happens next."
				eyebrow="Organization"
				icon={HomeIcon}
				title="Dashboard"
			/>
			<div className="grid gap-5 xl:grid-cols-2">
				<SurveillanceBacklog server={server} timeZone={timeZone} today={today} />
				<OperationsBacklog server={server} timeZone={timeZone} today={today} />
			</div>
			<UntreatedBanner server={server} today={today} />
			<ActivityStrip server={server} />
			<PeopleTodayPanel server={server} timeZone={timeZone} today={today} />
		</div>
	);
}

// --- pending queues ----------------------------------------------------------

/** One line of a backlog panel, as the row component draws it. */
interface QueueRowModel {
	readonly key: string;
	readonly label: string;
	readonly count: number;
	/** `YYYY-MM-DD` of the oldest pending row; null at zero. */
	readonly oldest: string | null;
	/** The two-count split, `14 new · 44 in progress`, where the row has one. */
	readonly split?: string;
	/** The row's own rule, `last 14 days`, where it has one the page should say. */
	readonly note?: string;
	readonly link: LinkProps;
}

/**
 * The explorer window a queue links with: from the oldest row's date to today,
 * so the explorer shows the rows the count counted rather than its own default
 * window. Empty at zero, where the explorer's default is as good as any.
 */
function windowSearch(
	oldest: string | null,
	today: string,
): { readonly from?: string; readonly to?: string } {
	return oldest === null ? {} : { from: oldest, to: today };
}

function queueRow(
	key: string,
	label: string,
	queue: QueueCount,
	link: LinkProps,
	extra: { readonly split?: string; readonly note?: string } = {},
): QueueRowModel {
	return { key, label, count: queue.count, oldest: queue.oldest, link, ...extra };
}

function SurveillanceBacklog({
	server,
	timeZone,
	today,
}: {
	readonly server: ServerRead;
	readonly timeZone: string;
	readonly today: string;
}) {
	const problems = useProblemCollectionsQueue(today, timeZone);
	const queues = server.data?.queues;

	const rows: readonly QueueRowModel[] | undefined =
		queues === undefined
			? undefined
			: [
					queueRow(
						'samples-awaiting',
						`${recordNoun('sample').titleMany} awaiting identification`,
						queues.samplesAwaiting,
						{
							to: '/larval-surveillance/samples',
							search: { status: 'awaiting', ...windowSearch(queues.samplesAwaiting.oldest, today) },
						},
					),
					queueRow(
						'collections-awaiting',
						`${recordNoun('collection').titleMany} awaiting identification`,
						queues.collectionsAwaiting,
						{
							to: '/adult-surveillance/collections',
							search: {
								awaiting: true,
								...windowSearch(queues.collectionsAwaiting.oldest, today),
							},
						},
					),
					queueRow(
						'collections-problem',
						`${recordNoun('collection').titleMany} with a problem`,
						problems,
						{
							to: '/adult-surveillance/collections',
							search: { problems: true, ...windowSearch(problems.oldest, today) },
						},
						{ note: 'last 14 days' },
					),
				];

	return (
		<QueuePanel
			electric={[problems]}
			rows={rows}
			server={server}
			title="Surveillance backlog"
			today={today}
		/>
	);
}

function OperationsBacklog({
	server,
	timeZone,
	today,
}: {
	readonly server: ServerRead;
	readonly timeZone: string;
	readonly today: string;
}) {
	const serviceRequests = useOpenServiceRequestsQueue();
	const assignments = useInProgressAssignmentsQueue(timeZone);
	const missions = useDueMissionsQueue(today, timeZone);
	const queues = server.data?.queues;

	const rows: readonly QueueRowModel[] | undefined =
		queues === undefined
			? undefined
			: [
					queueRow(
						'service-requests-open',
						`Open ${recordNoun('serviceRequest').many}`,
						serviceRequests,
						// No window: that explorer has no date filter, and `status=open`
						// is already the whole count.
						{ to: '/public-engagement/service-requests', search: { status: 'open' } },
						{
							split: `${serviceRequests.newCount} new · ${serviceRequests.inProgressCount} in progress`,
						},
					),
					queueRow(
						'requests-unassigned',
						`${recordNoun('requestedControlAction').titleMany} not yet assigned`,
						queues.requestsUnassigned,
						{
							to: '/operations/requests-for-control',
							search: {
								status: 'open',
								unassigned: true,
								...windowSearch(queues.requestsUnassigned.oldest, today),
							},
						},
					),
					queueRow(
						'assignments-in-progress',
						`${recordNoun('assignment').titleMany} started and not finished`,
						assignments,
						{
							to: '/operations/assignments',
							search: { statuses: ['inProgress'], ...windowSearch(assignments.oldest, today) },
						},
					),
					queueRow(
						'missions-due',
						`${recordNoun('mission').titleMany} due today or overdue`,
						missions,
						{
							to: '/operations/missions',
							search: { statuses: ['scheduled'], ...windowSearch(missions.oldest, today) },
						},
					),
				];

	return (
		<QueuePanel
			electric={[serviceRequests, assignments, missions]}
			rows={rows}
			server={server}
			title="Operations backlog"
			today={today}
		/>
	);
}

/**
 * One backlog panel: a muted header row, then a line per queue. The count pill
 * is withheld until every hook it draws has answered, so the two panels can
 * finish at different times.
 */
function QueuePanel({
	title,
	rows,
	server,
	electric,
	today,
}: {
	readonly title: string;
	/** Undefined while the server half is still loading. */
	readonly rows: readonly QueueRowModel[] | undefined;
	readonly server: ServerRead;
	readonly electric: readonly ElectricQueue[];
	readonly today: string;
}) {
	const isError = server.isError || electric.some((queue) => queue.isError);
	const isReady = rows !== undefined && electric.every((queue) => queue.isReady);
	const total = rows?.reduce((sum, row) => sum + row.count, 0);

	return (
		<Panel
			count={isReady && !isError ? total : undefined}
			icon={<QueueIcon className="size-4" />}
			title={title}
		>
			{/* No `empty`: a queue at zero is a row on the page, not an empty panel. */}
			<PanelRows
				icon={<QueueIcon aria-hidden="true" />}
				inset
				reading={{ isError, isReady, rows: rows ?? [] }}
				unavailable={{ description: QUEUES_UNAVAILABLE }}
				wrap="none"
			>
				{(lines) => (
					<>
						<div className="flex items-center gap-3 px-4 py-1.5 text-muted-foreground text-xs">
							<span className="flex-1">Queue</span>
							<span className="w-20 text-right">Oldest</span>
							<span className="w-10 text-right">Count</span>
						</div>
						<ul className="m-0 list-none divide-y divide-border/60 p-0">
							{lines.map((row) => (
								<QueueLine key={row.key} row={row} today={today} />
							))}
						</ul>
					</>
				)}
			</PanelRows>
		</Panel>
	);
}

/**
 * A queue as one line: the name as a link, the split or the rule in muted
 * text, the age of the oldest in a fixed column, the count bold on the right.
 * A row at zero stays on the page, muted, with no age.
 */
function QueueLine({ row, today }: { readonly row: QueueRowModel; readonly today: string }) {
	const empty = row.count === 0;
	const aside = row.split ?? row.note;
	return (
		<li className={cn('flex items-center gap-3 px-4 py-2', empty && 'text-muted-foreground')}>
			<Link {...row.link} className="min-w-0 flex-1 truncate text-sm hover:underline">
				{row.label}
			</Link>
			{aside === undefined ? null : (
				<span className="shrink-0 text-muted-foreground text-xs tabular-nums">{aside}</span>
			)}
			<span className="w-20 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
				{empty || row.oldest === null ? '' : ageLabel(ageInDays(row.oldest, today))}
			</span>
			<span className="w-10 shrink-0 text-right font-semibold text-base tabular-nums">
				{row.count}
			</span>
		</li>
	);
}

// --- the untreated habitats banner ------------------------------------------

/**
 * One row, the whole row a link in the warning tone while the count is above
 * zero. At zero the same row draws in the neutral tone with no link, so the
 * Manager can see the check ran.
 */
function UntreatedBanner({
	server,
	today,
}: {
	readonly server: ServerRead;
	readonly today: string;
}) {
	const untreated = server.data?.untreatedHabitats;
	if (server.isError) {
		return (
			<NeutralBanner>
				{`Untreated ${recordNoun('habitat').many} are unavailable right now.`}
			</NeutralBanner>
		);
	}
	// Nothing until the server answers.
	if (untreated === undefined) {
		return null;
	}
	if (untreated.count === 0) {
		return <NeutralBanner>{`No untreated ${recordNoun('habitat').many}`}</NeutralBanner>;
	}
	const oldest =
		untreated.oldest === null ? '' : `; oldest ${ageLabel(ageInDays(untreated.oldest, today))}`;
	return (
		<Link
			className="flex items-center gap-3 rounded-md border border-warning/40 bg-warning-bg px-4 py-3 text-foreground hover:bg-warning-bg/70"
			search={{ untreated: true }}
			to="/larval-surveillance/habitats"
		>
			<FlagIcon aria-hidden="true" className="size-5 shrink-0 text-warning" />
			<span className="min-w-0 flex-1">
				<span className="font-medium text-sm">
					{`${untreated.count} untreated ${recordNoun('habitat').many}`}
				</span>
				<span className="block truncate text-muted-foreground text-xs">
					{`heavy in the last 7 days with no control action since${oldest}`}
				</span>
			</span>
			<ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
		</Link>
	);
}

function NeutralBanner({ children }: { readonly children: string }) {
	return (
		<div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/40 px-4 py-3">
			<FlagIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
			<span className="font-medium text-muted-foreground text-sm">{children}</span>
		</div>
	);
}

// --- last 7 days -------------------------------------------------------------

/** What each strip cell is called, by the type the server counts it as. */
const ACTIVITY_LABELS: Readonly<Record<ActivityTypeKey, string>> = {
	inspections: recordNoun('inspection').titleMany,
	samples: recordNoun('sample').titleMany,
	collections: recordNoun('collection').titleMany,
	applications: recordNoun('application').titleMany,
	sourceReductions: recordNoun('sourceReduction').titleMany,
	releases: recordNoun('biocontrolAction').titleMany,
	serviceRequests: `${recordNoun('serviceRequest').titleMany} received`,
	outreachActions: recordNoun('outreachAction').titleMany,
};

/**
 * One ruled strip rather than a `Panel`: a heading, the window's dates, and a
 * bordered row of cells, seven across on a wide screen, four at `sm`, two
 * below. A type the Organization has never recorded is not a cell.
 */
function ActivityStrip({ server }: { readonly server: ServerRead }) {
	const activity = server.data?.activity;
	return (
		<section className="grid gap-2">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h2 className="m-0 font-semibold text-foreground text-sm">Last 7 days</h2>
				{activity === undefined ? null : (
					<span className="text-muted-foreground text-xs">
						{`${formatMonthDay(activity.window.from)} to ${formatMonthDay(activity.window.to)}, delta against the 7 before`}
					</span>
				)}
			</div>
			{/*
			 * Not `PanelRows`: this is one row of cells rather than rows, and its
			 * two-row placeholder would stand in for a strip a single row tall.
			 */}
			{server.isError ? (
				<div className="rounded-md border border-border/60">
					<PanelMessage>{ACTIVITY_UNAVAILABLE}</PanelMessage>
				</div>
			) : activity === undefined ? (
				<div className="rounded-md border border-border/60">
					<RowSkeleton count={1} />
				</div>
			) : (
				<div className="grid grid-cols-2 divide-x divide-border/60 overflow-hidden rounded-md border border-border/60 sm:grid-cols-4 xl:grid-cols-7">
					{ACTIVITY_TYPE_KEYS.flatMap((key) => {
						const cell = activity.types[key];
						return cell === null ? [] : [<ActivityCell cell={cell} key={key} type={key} />];
					})}
				</div>
			)}
		</section>
	);
}

function ActivityCell({
	type,
	cell,
}: {
	readonly type: ActivityTypeKey;
	readonly cell: { readonly count: number; readonly prior: number };
}) {
	const delta = cell.count - cell.prior;
	return (
		<div className="grid gap-0.5 px-3 py-2.5">
			<span className="flex items-baseline gap-1.5">
				<span className="font-semibold text-xl tabular-nums leading-none">{cell.count}</span>
				<Badge tone={delta === 0 ? 'neutral' : delta > 0 ? 'info' : 'warning'} variant="outline">
					{deltaLabel(cell.count, cell.prior)}
				</Badge>
			</span>
			<span className="truncate text-muted-foreground text-xs">{ACTIVITY_LABELS[type]}</span>
		</div>
	);
}

// --- in the field today -------------------------------------------------------

/**
 * Everyone who logged field work today, most records first, each name a link
 * to their day on the Activity Monitor. Names resolve off the eager `profiles`
 * collection the way every other surface resolves them.
 */
function PeopleTodayPanel({
	server,
	timeZone,
	today,
}: {
	readonly server: ServerRead;
	readonly timeZone: string;
	readonly today: string;
}) {
	const nameById = useProfileNames();
	const people = server.data?.peopleToday;

	return (
		<Panel
			count={people === undefined || server.isError ? undefined : people.length}
			icon={<PeopleIcon className="size-4" />}
			title="In the field today"
		>
			<PanelRows
				empty={{ description: 'Nothing logged yet today.' }}
				icon={<PeopleIcon aria-hidden="true" />}
				inset
				reading={{ isError: server.isError, isReady: people !== undefined, rows: people ?? [] }}
				unavailable={{ description: ACTIVITY_UNAVAILABLE }}
				wrap="none"
			>
				{(rows) => (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Person</TableHead>
								<TableHead className="text-right">Records</TableHead>
								<TableHead className="text-right">Last record</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((person) => (
								<TableRow key={person.profileId}>
									<TableCell>
										<Link
											className={cn(recordLink({ size: 'sm' }), 'truncate')}
											params={{ profileId: person.profileId }}
											search={{ date: today }}
											to="/daily-work/$profileId"
										>
											{nameById.get(person.profileId) ?? 'Unknown profile'}
										</Link>
									</TableCell>
									<TableCell className="text-right tabular-nums">{person.records}</TableCell>
									<TableCell className="text-right text-muted-foreground tabular-nums">
										{localTimeOfDay(person.lastAt, timeZone)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</PanelRows>
		</Panel>
	);
}
