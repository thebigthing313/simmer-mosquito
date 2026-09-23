import { Panel } from '@simmer-mosquito/ui-web/components/panel';
import { PanelRows } from '@simmer-mosquito/ui-web/components/panel-rows';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { useDashboard } from '../../hooks/dashboard/use-dashboard';
import type { ElectricQueue } from '../../hooks/queries/shared';
import { useDueMissionsQueue } from '../../hooks/queries/use-due-missions-queue';
import { useInProgressAssignmentsQueue } from '../../hooks/queries/use-in-progress-assignments-queue';
import { useOpenServiceRequestsQueue } from '../../hooks/queries/use-open-service-requests-queue';
import { useProblemCollectionsQueue } from '../../hooks/queries/use-problem-collections-queue';
import { recordNoun } from '../../lib/record-nouns';
import { ageInDays, ageLabel, type QueueCount } from './dashboard-data';

const QueueIcon = iconRegistry.generic.history.icon;
type ServerRead = ReturnType<typeof useDashboard>;
const QUEUES_UNAVAILABLE = 'Pending work is unavailable right now.';

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
 * so the explorer shows the rows the count counted. Empty at zero.
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

export function SurveillanceBacklog({
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

export function OperationsBacklog({
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
 * is withheld until every hook it draws has answered.
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
