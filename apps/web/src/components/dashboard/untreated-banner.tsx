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

import { ChevronRightIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import type { useDashboard } from '../../hooks/dashboard/use-dashboard';
import { recordNoun } from '../../lib/record-nouns';
import { ageInDays, ageLabel } from './dashboard-data';

const FlagIcon = iconRegistry.actions.warning.icon;
type ServerRead = ReturnType<typeof useDashboard>;

/**
 * One row, the whole row a link in the warning tone while the count is above
 * zero. At zero the same row draws in the neutral tone with no link, so the
 * Manager can see the check ran.
 */
export function UntreatedBanner({
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
