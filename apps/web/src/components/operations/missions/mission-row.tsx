import { ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import {
	controlTypeLabel,
	formatScheduledStart,
	type MissionListing,
	type MissionProgressCounts,
	missionDisplayName,
	missionStatus,
} from '../../../hooks/queries/operations-view';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { MissionStatusBadge, stopSummary } from '../operations-display';

/**
 * One mission in the Missions index list: its name and status, the control
 * type, planned method and scheduled start, and who has it with how far
 * through its stops it is. The whole card selects the mission on the map and
 * the chevron opens it. Takes the mission, the assignee's and method's names,
 * the stop counts, whether it is selected, and the select callback.
 */
export function MissionRow({
	mission,
	assigneeName,
	counts,
	methodName,
	isSelected,
	onSelect,
}: {
	readonly mission: MissionListing;
	readonly assigneeName: string | null;
	readonly counts: MissionProgressCounts | null;
	readonly methodName: string | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const timeZone = useOrganizationTimeZone();
	const name = missionDisplayName(mission, timeZone);

	return (
		<li
			className={cn(
				'relative rounded-lg border bg-card transition-colors',
				isSelected ? 'border-primary/60 bg-primary/5' : 'border-border/60 hover:border-border',
			)}
		>
			{/* Full-card target selects on the map; the chevron opens the record. */}
			<button
				aria-label={`Show ${name} on the map`}
				className="absolute inset-0 z-0 cursor-pointer rounded-lg"
				onClick={() => onSelect(mission.id)}
				type="button"
			/>
			<div className="pointer-events-none relative z-10 flex items-start gap-3 p-3">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-foreground text-sm">{name}</span>
						<MissionStatusBadge status={missionStatus(mission)} />
					</div>
					<p className="m-0 mt-1 text-muted-foreground text-xs">
						{controlTypeLabel(mission.controlType)}
						{methodName === null ? '' : ` · ${methodName}`}
						{` · ${formatScheduledStart(mission.scheduledStartAt, timeZone)}`}
					</p>
					<p className="m-0 mt-1 text-muted-foreground text-xs">
						{assigneeName ?? 'Unassigned'} · {stopSummary(counts)}
					</p>
				</div>
				<Link
					aria-label="Open mission"
					className="pointer-events-auto z-20 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					params={{ id: mission.id }}
					to="/operations/missions/$id"
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Link>
			</div>
		</li>
	);
}
