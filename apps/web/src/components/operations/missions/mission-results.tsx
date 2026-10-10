import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry, PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import type { MissionListing, MissionProgressCounts } from '../../../hooks/queries/operations-view';
import { createLabel } from '../../app-shell/navigation';
import { RESULT_SKELETON_KEYS } from '../../explorer';
import { WriteOnly } from '../../write-only';
import { MissionRow } from './mission-row';

const MissionIcon = iconRegistry.entities.route.icon;

/**
 * The Missions index list: skeleton rows while the window loads, an empty
 * state when nothing is in it, and a `MissionRow` per mission otherwise. The
 * empty state reads `hasFilters`, which is the set filters alone and not the
 * window, because its copy already names the date range. Takes the visible
 * missions, their stop counts, the method and profile names, the loading flag,
 * the selected id and the select callback.
 */
export function MissionResults({
	missions,
	countsById,
	hasFilters,
	isLoading,
	methodNameById,
	nameById,
	onSelect,
	selectedId,
}: {
	readonly missions: readonly MissionListing[];
	readonly countsById: ReadonlyMap<string, MissionProgressCounts>;
	readonly hasFilters: boolean;
	readonly isLoading: boolean;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly nameById: ReadonlyMap<string, string>;
	readonly onSelect: (id: string) => void;
	readonly selectedId: string | null;
}) {
	if (isLoading) {
		return (
			<div className="grid gap-2 p-4">
				{RESULT_SKELETON_KEYS.map((key) => (
					<Skeleton className="h-[72px] rounded-lg" key={key} />
				))}
			</div>
		);
	}

	if (missions.length === 0) {
		return (
			<div className="p-4">
				<Empty className="min-h-[240px] border border-border/40 bg-muted/30">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<MissionIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>{hasFilters ? 'No Matching Missions' : 'No Missions Scheduled'}</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? 'No mission in this date range matches the current filters.'
								: 'Missions scheduled to start in this range will appear here.'}
						</EmptyDescription>
					</EmptyHeader>
					{hasFilters ? null : (
						<EmptyContent>
							<WriteOnly minimum="manager">
								<Button asChild size="sm">
									<Link to="/operations/missions/create">
										<PlusIcon aria-hidden="true" />
										{createLabel('mission')}
									</Link>
								</Button>
							</WriteOnly>
						</EmptyContent>
					)}
				</Empty>
			</div>
		);
	}

	return (
		<ScrollArea className="min-h-0 flex-1" type="auto">
			<ul className="m-0 list-none space-y-2 p-4">
				{missions.map((mission) => (
					<MissionRow
						assigneeName={
							mission.assignedToProfileId === null
								? null
								: (nameById.get(mission.assignedToProfileId) ?? null)
						}
						counts={countsById.get(mission.id) ?? null}
						isSelected={mission.id === selectedId}
						key={mission.id}
						methodName={
							mission.plannedMethodId === null
								? null
								: (methodNameById.get(mission.plannedMethodId) ?? null)
						}
						mission={mission}
						onSelect={onSelect}
					/>
				))}
			</ul>
		</ScrollArea>
	);
}
