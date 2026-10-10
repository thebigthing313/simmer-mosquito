import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { createLabel } from '../../../components/app-shell/navigation';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MissionFilterBar } from '../../../components/operations/missions/mission-filter-bar';
import { MissionResults } from '../../../components/operations/missions/mission-results';
import { SelectedMissionCard } from '../../../components/operations/missions/selected-mission-card';
import { missionStopFeatures } from '../../../components/operations/operations-display';
import { WorklistMap } from '../../../components/operations/worklist-map';
import { WriteOnly } from '../../../components/write-only';
import { useControlMethodNames } from '../../../hooks/explorer/use-control-method-names';
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
import {
	missionFilterCodecs,
	useMissionFilterState,
} from '../../../hooks/operations/use-mission-filter-state';
import { useMissionStopViews } from '../../../hooks/operations/use-mission-stop-views';
import { useWorklistIndex } from '../../../hooks/operations/use-worklist-index';
import { missionStatus } from '../../../hooks/queries/operations-view';
import { useMissionItemCounts } from '../../../hooks/queries/use-mission-item-counts';
import { useMissions } from '../../../hooks/queries/use-missions';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/operations/missions/')({
	component: MissionsRoute,
	validateSearch: searchValidator(missionFilterCodecs),
});

function MissionsRoute() {
	const binding = useMissionFilterState();
	const { filters } = binding;

	const { missions, isLoading } = useMissions(filters.from, filters.to);
	const personnel = usePersonnelOptions();
	const { nameById } = personnel;
	const methodNameById = useControlMethodNames();

	// Status derives from three nullable timestamps and control type is the
	// page's own filter, so both are matched over the loaded rows.
	const {
		visible,
		selectedId,
		selected,
		selectedStopId,
		setSelectedStopId,
		highlightId,
		setHighlightId,
		handleSelect,
		assigneeOptions,
		assigneeLabel,
	} = useWorklistIndex({
		rows: missions,
		statusOf: missionStatus,
		assigneeOf: (mission) => mission.assignedToProfileId,
		filters,
		matches: (mission) => filters.types.size === 0 || filters.types.has(mission.controlType),
		personnel,
	});

	const visibleIds = visible.map((mission) => mission.id);
	const { countsById } = useMissionItemCounts(visibleIds);

	// Missions carry no geometry of their own. The map draws the union of the
	// selected mission's stops, in dispatch order and as the shapes they were
	// drawn as.
	const { stops } = useMissionStopViews(selectedId);
	const features = missionStopFeatures(stops);

	// The empty state reads the set filters alone and not the window, because
	// its copy already names the date range; the chip bar counts both.
	const hasSetFilter =
		filters.statuses.size > 0 || filters.types.size > 0 || filters.people.size > 0;

	return (
		<MapSplitPage
			map={
				<WorklistMap
					features={features}
					fitKey={selectedId ?? undefined}
					highlightId={highlightId}
					recordType="mission"
					onHoverStop={setHighlightId}
					onSelectStop={setSelectedStopId}
					selectedId={selectedStopId}
					stopCount={stops.length}
				>
					{selected === null ? null : (
						<SelectedMissionCard
							assigneeName={
								selected.assignedToProfileId === null
									? null
									: (nameById.get(selected.assignedToProfileId) ?? null)
							}
							counts={countsById.get(selected.id) ?? null}
							mission={selected}
						/>
					)}
				</WorklistMap>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-baseline gap-2">
							<h1 className="m-0 font-semibold text-foreground text-lg leading-none">
								{recordNoun('mission').titleMany}
							</h1>
							<span className="text-muted-foreground text-sm">
								{visible.length === 1 ? '1 mission' : `${visible.length} missions`}
							</span>
						</div>
						<WriteOnly minimum="manager">
							<Button asChild size="sm">
								<Link to="/operations/missions/create">
									<PlusIcon aria-hidden="true" data-icon="inline-start" />
									{createLabel('mission')}
								</Link>
							</Button>
						</WriteOnly>
					</div>

					<MissionFilterBar
						assigneeLabel={assigneeLabel}
						assigneeOptions={assigneeOptions}
						binding={binding}
					/>
				</div>

				<MissionResults
					countsById={countsById}
					hasFilters={hasSetFilter}
					isLoading={isLoading}
					methodNameById={methodNameById}
					missions={visible}
					nameById={nameById}
					onSelect={handleSelect}
					selectedId={selectedId}
				/>
			</div>
		</MapSplitPage>
	);
}
