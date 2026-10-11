import {
	type MissionListing,
	type MissionProgressCounts,
	missionDisplayName,
	missionStatus,
} from '../../../hooks/queries/operations-view';
import { useOrganizationClock } from '../../../hooks/use-organization-clock';
import { MissionStatusBadge, stopSummary } from '../operations-display';

/**
 * The card floated over the Missions index map for the selected mission: its
 * name, who has it, how far through its stops it is, and its status. Takes the
 * mission, the assignee's name and the stop counts.
 */
export function SelectedMissionCard({
	mission,
	assigneeName,
	counts,
}: {
	readonly mission: MissionListing;
	readonly assigneeName: string | null;
	readonly counts: MissionProgressCounts | null;
}) {
	const clock = useOrganizationClock();
	return (
		<div className="pointer-events-none absolute inset-x-4 top-4 flex justify-center sm:justify-start">
			<div className="pointer-events-auto w-full max-w-sm rounded-lg border border-border/60 bg-card/95 p-3 shadow-lg backdrop-blur-sm">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h2 className="m-0 truncate font-semibold text-foreground text-sm leading-tight">
							{missionDisplayName(mission, clock)}
						</h2>
						<p className="m-0 text-muted-foreground text-xs">
							{assigneeName ?? 'Unassigned'} · {stopSummary(counts)}
						</p>
					</div>
					<MissionStatusBadge status={missionStatus(mission)} />
				</div>
			</div>
		</div>
	);
}
