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

import { Panel } from '@simmer-mosquito/ui-web/components/panel';
import { PanelRows } from '@simmer-mosquito/ui-web/components/panel-rows';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import type { useDashboard } from '../../hooks/dashboard/use-dashboard';
import { useProfileNames } from '../../hooks/queries/use-profile-names';
import { localTimeOfDay } from '../../lib/local-date';

const PeopleIcon = iconRegistry.entities.contact.icon;
type ServerRead = ReturnType<typeof useDashboard>;
const PEOPLE_UNAVAILABLE = 'Activity is unavailable right now.';

/**
 * Everyone who logged field work today, most records first, each name a link
 * to their day on the Activity Monitor. Names resolve off the eager `profiles`
 * collection the way every other surface resolves them.
 */
export function PeopleTodayPanel({
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
				unavailable={{ description: PEOPLE_UNAVAILABLE }}
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
