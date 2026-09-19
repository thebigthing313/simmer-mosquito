import { PanelMessage, RowSkeleton } from '@simmer-mosquito/ui-web/components/panel';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import type { useDashboard } from '../../hooks/dashboard/use-dashboard';
import { formatMonthDay } from '../../lib/local-date';
import { recordNoun } from '../../lib/record-nouns';
import { ACTIVITY_TYPE_KEYS, type ActivityTypeKey, deltaLabel } from './dashboard-data';

type ServerRead = ReturnType<typeof useDashboard>;
const ACTIVITY_UNAVAILABLE = 'Activity is unavailable right now.';

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
 * One ruled strip: a heading, the window's dates, and a bordered row of cells,
 * seven across on a wide screen, four at `sm`, two below. A type the
 * Organization has never recorded is not a cell.
 */
export function ActivityStrip({ server }: { readonly server: ServerRead }) {
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
