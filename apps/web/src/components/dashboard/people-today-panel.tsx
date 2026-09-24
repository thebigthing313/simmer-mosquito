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
import { usePeopleToday } from '../../hooks/dashboard/use-people-today';
import { useProfileNames } from '../../hooks/queries/use-profile-names';
import { formatActivityTime } from '../activity/activity-data';

const PeopleIcon = iconRegistry.entities.contact.icon;
const PEOPLE_UNAVAILABLE = 'Activity is unavailable right now.';

/**
 * Everyone who logged field work today, most records first, each row a link
 * to their day on the Activity Monitor. Reads the same day of synced rows the
 * Monitor reads, so the row's number is what its link opens. The name is the
 * one anchor and it is stretched over the row with a pseudo-element, so the
 * whole row is a target for a pointer and one link for a screen reader; the
 * time reads on the same clock and in the same shape as the Monitor's rows.
 */
export function PeopleTodayPanel({
	timeZone,
	today,
}: {
	readonly timeZone: string;
	readonly today: string;
}) {
	const nameById = useProfileNames();
	const { people, isReady, isError } = usePeopleToday(today, timeZone);

	return (
		<Panel
			count={!isReady || isError ? undefined : people.length}
			icon={<PeopleIcon className="size-4" />}
			title="In the Field Today"
		>
			<PanelRows
				empty={{ description: 'Nothing logged yet today.' }}
				icon={<PeopleIcon aria-hidden="true" />}
				inset
				reading={{ isError, isReady, rows: people }}
				unavailable={{ description: PEOPLE_UNAVAILABLE }}
				wrap="none"
			>
				{(rows) => (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Person</TableHead>
								<TableHead className="text-right">Records</TableHead>
								<TableHead className="text-right">Last Record</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((person) => (
								<TableRow className="relative hover:bg-muted/50" key={person.profileId}>
									<TableCell>
										<Link
											className={cn(
												recordLink({ size: 'sm' }),
												'truncate after:absolute after:inset-0 after:content-[""]',
											)}
											params={{ profileId: person.profileId }}
											search={{ date: today }}
											to="/daily-work/$profileId"
										>
											{nameById.get(person.profileId) ?? 'Unknown profile'}
										</Link>
									</TableCell>
									<TableCell className="text-right tabular-nums">{person.records}</TableCell>
									<TableCell className="text-right text-muted-foreground tabular-nums">
										{formatActivityTime(person.lastAt, timeZone)}
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
