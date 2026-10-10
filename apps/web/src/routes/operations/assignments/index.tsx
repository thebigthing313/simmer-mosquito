import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { createLabel } from '../../../components/app-shell/navigation';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { StopSequenceMap } from '../../../components/map/stop-sequence-map';
import { AssignmentFilterBar } from '../../../components/operations/assignments/assignment-filter-bar';
import { AssignmentResults } from '../../../components/operations/assignments/assignment-results';
import { SelectedAssignmentCard } from '../../../components/operations/assignments/selected-assignment-card';
import { WriteOnly } from '../../../components/write-only';
import { useCatalogOptions } from '../../../hooks/explorer/use-catalog-options';
import {
	assignmentFilterCodecs,
	useAssignmentFilterState,
} from '../../../hooks/operations/use-assignment-filter-state';
import { useAssignmentStops } from '../../../hooks/operations/use-assignment-stops';
import { useWorklistIndex } from '../../../hooks/operations/use-worklist-index';
import { assignmentStatus } from '../../../hooks/queries/assignment-view';
import { catalogs } from '../../../hooks/queries/catalog-register';
import { useAssignmentItemCounts } from '../../../hooks/queries/use-assignment-item-counts';
import { useAssignments } from '../../../hooks/queries/use-assignments';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/operations/assignments/')({
	component: AssignmentsIndexRoute,
	validateSearch: searchValidator(assignmentFilterCodecs),
});

function AssignmentsIndexRoute() {
	const binding = useAssignmentFilterState();
	const { filters } = binding;

	const { assignments, isLoading } = useAssignments(filters.from, filters.to);
	const personnel = useCatalogOptions(catalogs.profiles);
	const { nameById } = personnel;

	// Status derives from three nullable timestamps, so it is matched over the loaded rows.
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
		rows: assignments,
		statusOf: assignmentStatus,
		assigneeOf: (assignment) => assignment.assignedToProfileId,
		filters,
		personnel,
	});

	const visibleIds = visible.map((assignment) => assignment.id);
	const { countsById } = useAssignmentItemCounts(visibleIds);
	const { features, counts, stops } = useAssignmentStops(selectedId);

	// The empty state reads the set filters alone and not the window, because
	// its copy already names the date range; the chip bar counts both.
	const hasSetFilter = filters.people.size > 0 || filters.statuses.size > 0;

	return (
		<MapSplitPage
			map={
				<StopSequenceMap
					features={features}
					fitKey={selectedId ?? undefined}
					highlightId={highlightId}
					recordType="assignment"
					onHoverStop={setHighlightId}
					onSelectStop={setSelectedStopId}
					selectedId={selectedStopId}
					stopCount={stops.length}
				>
					{selected === null ? null : (
						<SelectedAssignmentCard
							assignment={selected}
							assigneeName={
								selected.assignedToProfileId === null
									? null
									: (nameById.get(selected.assignedToProfileId) ?? null)
							}
							counts={counts}
						/>
					)}
				</StopSequenceMap>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-baseline gap-2">
							<h1 className="font-semibold text-foreground text-lg leading-none">
								{recordNoun('assignment').titleMany}
							</h1>
							<span className="text-muted-foreground text-sm">
								{visible.length === 1 ? '1 assignment' : `${visible.length} assignments`}
							</span>
						</div>
						<WriteOnly minimum="manager">
							<Button asChild size="sm">
								<Link to="/operations/assignments/create">
									<PlusIcon aria-hidden="true" />
									{createLabel('assignment')}
								</Link>
							</Button>
						</WriteOnly>
					</div>

					<AssignmentFilterBar
						assigneeLabel={assigneeLabel}
						assigneeOptions={assigneeOptions}
						binding={binding}
					/>
				</div>

				<AssignmentResults
					assignments={visible}
					countsById={countsById}
					hasFilters={hasSetFilter}
					isLoading={isLoading}
					nameById={nameById}
					onSelect={handleSelect}
					selectedId={selectedId}
				/>
			</div>
		</MapSplitPage>
	);
}
